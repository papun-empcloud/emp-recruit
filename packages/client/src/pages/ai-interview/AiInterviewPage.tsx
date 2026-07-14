import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Brain, Mic, MicOff, Volume2, Loader2, CheckCircle2, Send } from "lucide-react";
import axios from "axios";

const PUBLIC_API = "/api/v1/public/ai-interviews";

interface InterviewState {
  status: "pending" | "in_progress" | "completed";
  candidate_name: string;
  job_title: string | null;
  total: number;
  current_index: number;
  question: string | null;
  done: boolean;
}

// Web Speech API (not in standard TS lib types).
const SpeechRecognitionCtor: any =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* TTS is best-effort */
  }
}

export function AiInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<InterviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Load the interview state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await axios.get(`${PUBLIC_API}/${token}`);
        if (active) setState(data.data);
      } catch (e: any) {
        if (active) setError(e?.response?.data?.error?.message || "This interview link is invalid or expired.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [token]);

  // Speak each new question once the candidate has started.
  useEffect(() => {
    if (started && state && !state.done && state.question) {
      speak(state.question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_index, started, state?.done]);

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let finalChunk = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript + " ";
        }
        if (finalChunk) {
          setAnswer((prev) => `${prev} ${finalChunk}`.replace(/\s+/g, " ").trimStart());
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  async function submitAnswer() {
    if (!state) return;
    stopListening();
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${PUBLIC_API}/${token}/answer`, { answer });
      const next = data.data;
      setAnswer("");
      if (next.done) {
        await axios.post(`${PUBLIC_API}/${token}/complete`);
        setState((s) => (s ? { ...s, done: true, status: "completed", question: null, current_index: next.current_index } : s));
      } else {
        setState((s) =>
          s ? { ...s, current_index: next.current_index, question: next.question, status: "in_progress" } : s,
        );
      }
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || "Something went wrong submitting your answer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </Shell>
    );
  }

  if (error || !state) {
    return (
      <Shell>
        <p className="text-center text-sm text-red-600">{error || "Interview not found."}</p>
      </Shell>
    );
  }

  // Already completed (either now or on a prior visit).
  if (state.done || state.status === "completed") {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Interview complete</h1>
          <p className="mt-2 text-sm text-gray-500">
            Thank you, {state.candidate_name}. Your responses have been recorded and shared with the hiring team.
          </p>
        </div>
      </Shell>
    );
  }

  // Intro screen — a user gesture is required before the browser will speak.
  if (!started) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100">
            <Brain className="h-9 w-9 text-purple-600" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-gray-900">AI Interview</h1>
          {state.job_title && <p className="mt-1 text-sm font-medium text-brand-600">{state.job_title}</p>}
          <p className="mt-4 text-sm text-gray-600">
            Hi {state.candidate_name}, I'm your AI interviewer. I'll ask you {state.total} questions tailored to
            your background. You can answer by <strong>speaking</strong> (tap the mic) or by <strong>typing</strong>.
            Take your time.
          </p>
          <button
            onClick={() => {
              setStarted(true);
              if (state.question) speak(state.question);
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Start interview
          </button>
          {!SpeechRecognitionCtor && (
            <p className="mt-3 text-xs text-gray-400">
              Voice input isn't supported in this browser — you can type your answers.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // Active question.
  return (
    <Shell wide>
      <div className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Question {state.current_index + 1} of {state.total}
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${((state.current_index) / state.total) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-purple-100">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <p className="text-base font-medium text-gray-900">{state.question}</p>
          </div>
          <button
            onClick={() => state.question && speak(state.question)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Volume2 className="h-4 w-4" /> Replay question
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Your answer</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            placeholder="Speak using the mic, or type your answer here…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {SpeechRecognitionCtor ? (
            <button
              onClick={() => (listening ? stopListening() : startListening())}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
                listening
                  ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {listening ? "Stop recording" : "Answer by voice"}
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={submitAnswer}
            disabled={submitting || !answer.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {state.current_index + 1 >= state.total ? "Finish interview" : "Submit & next"}
          </button>
        </div>
        {listening && (
          <p className="mt-2 text-center text-xs text-red-500">● Listening… speak your answer, then tap “Stop recording”.</p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div
        className={`flex w-full ${wide ? "max-w-2xl" : "max-w-md"} flex-col items-center rounded-2xl border border-gray-200 bg-white p-8 shadow-sm`}
      >
        {children}
      </div>
    </div>
  );
}

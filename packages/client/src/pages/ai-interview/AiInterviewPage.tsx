import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Brain, Mic, MicOff, Volume2, Loader2, CheckCircle2, Send, PhoneOff } from "lucide-react";
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
  voice_enabled?: boolean;
  ready?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Does the candidate's reply count as "yes, I can hear you"? Deliberately
// conservative so a negation ("no, I can't") doesn't slip through.
const AFFIRMATIVE = /\b(yes|yeah|yep|yup|sure|okay|ok|ready|go ahead)\b/i;
const isAffirmative = (text: string) => AFFIRMATIVE.test(text.trim());

// Web Speech API (not in standard TS lib types).
const SpeechRecognitionCtor: any =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export function AiInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<InterviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(false);
  const [soundChecked, setSoundChecked] = useState(false);
  const recognitionRef = useRef<any>(null);
  const soundCheckStopRef = useRef(false);
  const soundCheckTimerRef = useRef<number | null>(null);

  function quit() {
    if (!window.confirm("Leave the interview? You won't be able to resume it.")) return;
    stopSoundCheck();
    try {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setLeft(true);
  }

  // Repeat the sound-check prompt on a loop until the candidate confirms. Each
  // time the utterance ends we pause briefly, then say it again — unless the
  // sound check has been stopped (candidate confirmed, left, or unmounted).
  function speakSoundCheck() {
    if (soundCheckStopRef.current || !("speechSynthesis" in window)) return;
    const name = state?.candidate_name || "there";
    const sentence = `Hi ${name}! Please make sure your sound is on. Can you hear me okay? Say "yes" when you're ready.`;
    const scheduleNext = () => {
      setAiSpeaking(false);
      if (!soundCheckStopRef.current) {
        soundCheckTimerRef.current = window.setTimeout(speakSoundCheck, 2500);
      }
    };
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sentence);
      u.onstart = () => setAiSpeaking(true);
      u.onend = scheduleNext;
      u.onerror = scheduleNext;
      window.speechSynthesis.speak(u);
    } catch {
      scheduleNext();
    }
  }

  function stopSoundCheck() {
    soundCheckStopRef.current = true;
    if (soundCheckTimerRef.current != null) {
      clearTimeout(soundCheckTimerRef.current);
      soundCheckTimerRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setAiSpeaking(false);
  }

  // Speak a question and track when the AI is talking (to highlight its side).
  function say(text: string) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.onstart = () => setAiSpeaking(true);
      u.onend = () => setAiSpeaking(false);
      u.onerror = () => setAiSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      setAiSpeaking(false);
    }
  }

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
      soundCheckStopRef.current = true;
      if (soundCheckTimerRef.current != null) clearTimeout(soundCheckTimerRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [token]);

  // Speak each new question — but only after the sound check has passed.
  useEffect(() => {
    if (started && soundChecked && state && !state.done && state.question) {
      say(state.question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_index, started, soundChecked, state?.done]);

  // Advance past the sound check as soon as the candidate confirms — by voice
  // (the mic fills the box) or by typing "yes".
  useEffect(() => {
    if (started && !soundChecked && isAffirmative(answer)) {
      proceedToQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, started, soundChecked]);

  // Confirm the sound check and move on to the first question.
  function proceedToQuestions() {
    stopSoundCheck();
    stopListening();
    setAnswer("");
    setSoundChecked(true);
  }

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

  // Candidate left the interview.
  if (left) {
    return (
      <Shell>
        <div className="text-center">
          <PhoneOff className="mx-auto h-12 w-12 text-gray-400" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">You left the interview</h1>
          <p className="mt-2 text-sm text-gray-500">
            No problem, {state.candidate_name}. You can reopen the link to try again if it's still active.
          </p>
        </div>
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

  // Not approved by the recruiter yet.
  if (state.ready === false) {
    return (
      <Shell>
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 text-brand-400" />
          <h1 className="mt-4 text-lg font-bold text-gray-900">Your interview is being prepared</h1>
          <p className="mt-2 text-sm text-gray-500">
            Hang tight, {state.candidate_name} — the recruiter is finalizing your questions. Please check back
            shortly.
          </p>
        </div>
      </Shell>
    );
  }

  // Real-time voice interview (Retell) when it's configured — a live spoken
  // conversation instead of the typed/turn-based flow below.
  if (state.voice_enabled) {
    return <VoiceInterview token={token!} candidateName={state.candidate_name} jobTitle={state.job_title} />;
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
            Hi {state.candidate_name}, I'm your AI interviewer. First we'll do a quick sound check, then I'll ask
            you {state.total} questions tailored to your background. You can answer by <strong>speaking</strong>{" "}
            (tap the mic) or by <strong>typing</strong>. Take your time.
          </p>
          <button
            onClick={() => {
              setStarted(true);
              soundCheckStopRef.current = false;
              speakSoundCheck();
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

  // Active call — Google Meet-style layout. Before the first question we run a
  // quick sound check: the AI asks "can you hear me?" and only advances to the
  // questions once the candidate confirms (says or types "yes").
  const inSoundCheck = !soundChecked;
  const isLast = state.current_index + 1 >= state.total;
  const caption = inSoundCheck
    ? `Hi ${state.candidate_name}! Please make sure your sound is on. Can you hear me okay? Say "yes" or type it below to begin.`
    : state.question;
  return (
    <div className="flex min-h-screen flex-col bg-[#202124] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm font-medium text-gray-200">{state.job_title || "AI Interview"}</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300">
          {inSoundCheck ? "Sound check" : `Question ${state.current_index + 1} of ${state.total}`}
        </span>
      </div>

      {/* Participant tiles */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
          <MeetTile label="Interviewer" speaking={aiSpeaking} status={aiSpeaking ? "Speaking" : "Ready"} icon={Brain} accent="purple" />
          <MeetTile
            label="You"
            speaking={listening}
            status={listening ? "Listening" : inSoundCheck ? "Say 'yes'" : "Your turn"}
            icon={Mic}
            accent="blue"
            muted={!listening}
          />
        </div>
      </div>

      {/* Live caption — sound-check prompt, then the current question */}
      <div className="px-4 pb-3">
        <div className="mx-auto flex max-w-3xl items-start justify-center gap-2 rounded-xl bg-black/40 px-4 py-3">
          <p className="text-center text-sm text-gray-100 sm:text-base">{caption}</p>
          {!inSoundCheck && (
            <button
              onClick={() => caption && say(caption)}
              title="Replay question"
              className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-white"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Answer / confirm bar */}
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="flex items-end gap-2 rounded-2xl bg-[#3c4043] p-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            placeholder={inSoundCheck ? "Say or type “yes” to begin…" : "Type your answer, or use the mic…"}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-gray-400 focus:outline-none"
          />
          {inSoundCheck ? (
            <button
              onClick={proceedToQuestions}
              className="flex h-10 flex-shrink-0 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4" /> I can hear you
            </button>
          ) : (
            <button
              onClick={submitAnswer}
              disabled={submitting || !answer.trim()}
              className="flex h-10 flex-shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isLast ? "Finish" : "Send"}
            </button>
          )}
        </div>
      </div>

      {/* Call control bar */}
      <div className="flex items-center justify-center gap-4 py-5">
        {SpeechRecognitionCtor && (
          <button
            onClick={() => (listening ? stopListening() : startListening())}
            title={listening ? "Stop recording" : "Answer by voice"}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              listening ? "bg-white text-gray-900" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {listening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
        )}
        <button
          onClick={quit}
          title="Leave interview"
          className="flex h-12 w-16 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// Real-time voice interview via Retell. The candidate has a live spoken
// conversation; the transcript + score are finalized server-side via webhook.
function VoiceInterview({
  token,
  candidateName,
  jobTitle,
}: {
  token: string;
  candidateName: string;
  jobTitle: string | null;
}) {
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "finishing" | "done">("idle");
  const [agentTalking, setAgentTalking] = useState(false);
  const [agentText, setAgentText] = useState("");
  const [userText, setUserText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      try {
        clientRef.current?.stopCall?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  async function finish() {
    setPhase("finishing");
    // Retell's webhook finalizes + scores the session server-side; poll until done.
    for (let i = 0; i < 20; i++) {
      try {
        const { data } = await axios.get(`${PUBLIC_API}/${token}`);
        if (data.data.status === "completed") break;
      } catch {
        /* ignore */
      }
      await sleep(3000);
    }
    setPhase("done");
  }

  async function start() {
    setError(null);
    setPhase("connecting");
    try {
      const { data } = await axios.post(`${PUBLIC_API}/${token}/voice-call`);
      const accessToken = data.data.accessToken as string;
      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setPhase("live"));
      client.on("agent_start_talking", () => setAgentTalking(true));
      client.on("agent_stop_talking", () => setAgentTalking(false));
      client.on("update", (u: any) => {
        const turns: Array<{ role: string; content: string }> = u?.transcript || [];
        const lastAgent = [...turns].reverse().find((t) => t.role === "agent");
        const lastUser = [...turns].reverse().find((t) => t.role === "user");
        if (lastAgent) setAgentText(lastAgent.content);
        if (lastUser) setUserText(lastUser.content);
      });
      client.on("call_ended", () => finish());
      client.on("error", () => {
        setError("The call ran into a problem.");
        try {
          client.stopCall();
        } catch {
          /* ignore */
        }
        finish();
      });
      await client.startCall({ accessToken });
    } catch (e: any) {
      setError(
        e?.response?.data?.error?.message ||
          "Couldn't start the voice interview. Check your microphone permission and try again.",
      );
      setPhase("idle");
    }
  }

  function endCall() {
    try {
      clientRef.current?.stopCall?.();
    } catch {
      /* ignore */
    }
    finish();
  }

  if (phase === "done") {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Interview complete</h1>
          <p className="mt-2 text-sm text-gray-500">
            Thank you, {candidateName}. Your interview has been recorded and shared with the hiring team.
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === "live" || phase === "finishing") {
    // Google Meet-style call: two participant tiles that light up for whoever's
    // speaking, live captions along the bottom, and a call control bar.
    const userSpeaking = !agentTalking && phase === "live";
    return (
      <div className="flex min-h-screen flex-col bg-[#202124] text-white">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-gray-200">{jobTitle || "AI Interview"}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300">
            <span className={`h-2 w-2 rounded-full ${phase === "finishing" ? "bg-yellow-400" : "animate-pulse bg-red-500"}`} />
            {phase === "finishing" ? "Wrapping up…" : "Live"}
          </span>
        </div>

        {/* Participant tiles */}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
            <MeetTile
              label="Interviewer"
              speaking={agentTalking}
              status={agentTalking ? "Speaking" : "Listening"}
              icon={Brain}
              accent="purple"
              caption={agentText}
            />
            <MeetTile
              label="You"
              speaking={userSpeaking}
              status={userSpeaking ? "Speaking" : "Muted"}
              icon={Mic}
              accent="blue"
              muted={!userSpeaking}
              caption={userText}
            />
          </div>
        </div>

        {/* Call control bar */}
        <div className="flex items-center justify-center gap-4 py-5">
          {phase === "live" ? (
            <button
              onClick={() => {
                if (window.confirm("End the interview? This will finish and submit the call.")) endCall();
              }}
              title="Leave interview"
              className="flex h-12 w-16 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin" /> Wrapping up…
            </div>
          )}
        </div>
      </div>
    );
  }

  // idle / connecting
  return (
    <Shell>
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100">
          <Brain className="h-9 w-9 text-purple-600" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-900">AI Voice Interview</h1>
        {jobTitle && <p className="mt-1 text-sm font-medium text-brand-600">{jobTitle}</p>}
        <p className="mt-4 text-sm text-gray-600">
          Hi {candidateName}. You'll have a short spoken conversation with our AI interviewer — it asks questions and
          you answer out loud, just like a real interview. Please allow microphone access when prompted.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "connecting"}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {phase === "connecting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" /> Start voice interview
            </>
          )}
        </button>
      </div>
    </Shell>
  );
}

// A Google Meet-style participant tile. Glows and shows an animated ring while
// that participant is speaking; renders their live caption when provided.
function MeetTile({
  label,
  speaking,
  status,
  icon: Icon,
  accent,
  muted = false,
  caption,
}: {
  label: string;
  speaking: boolean;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "purple" | "blue";
  muted?: boolean;
  caption?: string;
}) {
  const ring = accent === "purple" ? "ring-purple-500" : "ring-blue-500";
  const avatar = accent === "purple" ? "bg-purple-600" : "bg-blue-600";
  return (
    <div
      className={`relative flex aspect-video flex-col items-center justify-center rounded-2xl bg-[#3c4043] transition-all ${
        speaking ? `ring-4 ${ring}` : "ring-1 ring-white/5"
      }`}
    >
      {/* Avatar with speaking pulse */}
      <div className="relative">
        {speaking && <span className={`absolute inset-0 animate-ping rounded-full ${avatar} opacity-40`} />}
        <div className={`relative flex h-20 w-20 items-center justify-center rounded-full ${avatar}`}>
          <Icon className="h-10 w-10 text-white" />
        </div>
      </div>

      {/* Live caption */}
      {caption && (
        <p className="mt-4 line-clamp-2 max-w-[90%] text-center text-sm text-gray-200">{caption}</p>
      )}

      {/* Name chip */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white">
        {muted && <MicOff className="h-3 w-3 text-red-400" />}
        {label}
      </div>

      {/* Status chip */}
      <div className="absolute bottom-3 right-3 rounded-md bg-black/40 px-2 py-1 text-xs text-gray-300">
        {status}
      </div>

      {/* Speaking equalizer */}
      {speaking && (
        <div className="absolute right-3 top-3 flex items-end gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 animate-pulse rounded-full bg-white"
              style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}
    </div>
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

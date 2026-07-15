import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Brain, Mic, MicOff, Volume2, Loader2, CheckCircle2, ChevronRight, PhoneOff } from "lucide-react";
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
  seconds_per_question?: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// mm:ss for the countdown badge.
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
  const [answer, setAnswer] = useState(""); // finalized speech transcript (submitted)
  const [interim, setInterim] = useState(""); // in-progress words, for the live subtitle
  const [listening, setListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(false);
  const [soundChecked, setSoundChecked] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const soundCheckStopRef = useRef(false);
  const soundCheckTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  function quit() {
    if (!window.confirm("Leave the interview? You won't be able to resume it.")) return;
    stopSoundCheck();
    clearTimer();
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
  // onDone fires when the AI finishes reading — we use it to start listening +
  // the countdown only after the question has been spoken (so the mic doesn't
  // capture the AI's own voice).
  function say(text: string, onDone?: () => void) {
    try {
      if (!("speechSynthesis" in window)) {
        onDone?.();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.onstart = () => setAiSpeaking(true);
      u.onend = () => {
        setAiSpeaking(false);
        onDone?.();
      };
      u.onerror = () => {
        setAiSpeaking(false);
        onDone?.();
      };
      window.speechSynthesis.speak(u);
    } catch {
      setAiSpeaking(false);
      onDone?.();
    }
  }

  function clearTimer() {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Start the per-question countdown (if the recruiter set one). Reaching 0
  // auto-submits via the timeLeft effect below.
  function startTimer() {
    clearTimer();
    const limit = state?.seconds_per_question;
    if (!limit || limit <= 0) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(limit);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => (t == null ? t : t <= 1 ? 0 : t - 1));
    }, 1000);
  }

  // Begin the answer phase for a question: listen for the spoken answer and run
  // the countdown. Called once the AI has finished reading the question.
  function beginAnswerPhase() {
    startListening();
    startTimer();
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
      if (timerRef.current != null) clearInterval(timerRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [token]);

  // Speak each new question — but only after the sound check has passed. Once
  // the AI finishes reading, start listening + the countdown.
  useEffect(() => {
    if (started && soundChecked && state && !state.done && state.question) {
      say(state.question, beginAnswerPhase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_index, started, soundChecked, state?.done]);

  // During the sound check, listen only in the gaps between the AI's repeats —
  // so the mic catches the candidate's "yes" but not the AI saying the word.
  useEffect(() => {
    if (!started || soundChecked || !SpeechRecognitionCtor) return;
    if (aiSpeaking) stopListening();
    else startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSpeaking, started, soundChecked]);

  // Advance past the sound check as soon as the candidate confirms (says "yes").
  useEffect(() => {
    if (started && !soundChecked && isAffirmative(answer)) {
      proceedToQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, started, soundChecked]);

  // Time's up on a question — auto-submit whatever was captured and move on.
  useEffect(() => {
    if (timeLeft === 0 && started && soundChecked && state && !state.done) {
      clearTimer();
      submitAnswer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

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
    setInterim("");
    setListening(false);
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    // Tear down any previous recognition so start() doesn't throw "already started".
    try {
      recognitionRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let finalChunk = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalChunk += r[0].transcript + " ";
          else interimText += r[0].transcript;
        }
        if (finalChunk) {
          setAnswer((prev) => `${prev} ${finalChunk}`.replace(/\s+/g, " ").trimStart());
        }
        setInterim(interimText);
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
    if (!state || submitting) return;
    clearTimer();
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
            you {state.total} questions tailored to your background. Just <strong>answer out loud</strong> — I'll
            listen, and you tap <strong>Next question</strong> when you're done with each one.
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
            <p className="mt-3 text-xs text-amber-600">
              Heads up: your browser doesn't support voice input. Please use Chrome for the best experience.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // Active call — Google Meet-style layout. Before the first question we run a
  // quick sound check (the AI asks "can you hear me?" until the candidate says
  // "yes"). Then each question is spoken; the candidate answers OUT LOUD (shown
  // as a live subtitle) and taps "Next question" — or the timer auto-advances.
  const inSoundCheck = !soundChecked;
  const isLast = state.current_index + 1 >= state.total;
  const caption = inSoundCheck
    ? `Hi ${state.candidate_name}! Please make sure your sound is on. Can you hear me okay? Say "yes" to begin.`
    : state.question;
  const liveTranscript = `${answer} ${interim}`.trim();
  return (
    <div className="flex min-h-screen flex-col bg-[#202124] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm font-medium text-gray-200">{state.job_title || "AI Interview"}</span>
        <div className="flex items-center gap-2">
          {!inSoundCheck && timeLeft != null && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
                timeLeft <= 10 ? "animate-pulse bg-red-500/20 text-red-300" : "bg-white/10 text-gray-200"
              }`}
            >
              {fmtTime(timeLeft)}
            </span>
          )}
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300">
            {inSoundCheck ? "Sound check" : `Question ${state.current_index + 1} of ${state.total}`}
          </span>
        </div>
      </div>

      {/* Participant tiles */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
          <MeetTile label="Interviewer" speaking={aiSpeaking} status={aiSpeaking ? "Speaking" : "Asked"} icon={Brain} accent="purple" />
          <MeetTile
            label="You"
            speaking={listening}
            status={listening ? "Listening" : inSoundCheck ? "Say 'yes'" : "Muted"}
            icon={Mic}
            accent="blue"
            muted={!listening}
          />
        </div>
      </div>

      {/* Question caption (AI subtitle) */}
      <div className="px-4 pb-2">
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

      {/* Candidate subtitle — a live transcript of what they're saying */}
      {!inSoundCheck && (
        <div className="px-4 pb-4">
          <div className="mx-auto min-h-[3rem] max-w-3xl rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-center">
            {liveTranscript ? (
              <p className="text-sm text-gray-100">
                {answer} <span className="text-gray-400">{interim}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                {listening ? "Listening… start speaking your answer." : "Tap the mic to answer out loud."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Call control bar */}
      <div className="flex items-center justify-center gap-4 py-5">
        {inSoundCheck ? (
          <button
            onClick={proceedToQuestions}
            className="flex h-12 items-center gap-2 rounded-full bg-green-600 px-6 text-sm font-semibold text-white hover:bg-green-700"
          >
            <CheckCircle2 className="h-5 w-5" /> I can hear you
          </button>
        ) : (
          <>
            {SpeechRecognitionCtor && (
              <button
                onClick={() => (listening ? stopListening() : startListening())}
                title={listening ? "Mute" : "Unmute"}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                  listening ? "bg-white text-gray-900" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {listening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={submitAnswer}
              disabled={submitting}
              title={isLast ? "Finish interview" : "Next question"}
              className="flex h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isLast ? "Finish interview" : "Next question"}
              {!submitting && <ChevronRight className="h-5 w-5" />}
            </button>
          </>
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

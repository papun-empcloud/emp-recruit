import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
  // Text finalized before the CURRENT recognition run started (preserved across
  // mute/unmute and Chrome's auto-restarts) so we can rebuild the answer from the
  // current run's results without double-appending. (#3)
  const committedRef = useRef("");
  // Always-current answer, so startListening() can read it without stale closures.
  const answerRef = useRef("");
  // Preserve the latest interim segment: Chrome may not emit a final result
  // before the candidate clicks Next or the question timer expires.
  const interimRef = useRef("");
  // True when WE stopped recognition (mute / next question) — tells onend not to
  // auto-restart. (#4/#5)
  const manualStopRef = useRef(false);
  // Force-finish the current TTS utterance (used when the candidate taps the mic
  // while the AI is still speaking, and as a safety net if onend never fires).
  const ttsFinishRef = useRef<(() => void) | null>(null);
  const soundCheckStopRef = useRef(false);
  const soundCheckTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [micLevel, setMicLevel] = useState(0); // 0..1 live input level
  const [micReady, setMicReady] = useState(false); // heard real audio at least once
  const [micError, setMicError] = useState<string | null>(null);

  function quit() {
    if (!window.confirm(t("aiInterview.session.leaveConfirm"))) return;
    stopSoundCheck();
    clearTimer();
    try {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    releaseMic();
    setLeft(true);
  }

  // Repeat the sound-check prompt on a loop until the candidate confirms. Each
  // time the utterance ends we pause briefly, then say it again — unless the
  // sound check has been stopped (candidate confirmed, left, or unmounted).
  function speakSoundCheck() {
    if (soundCheckStopRef.current || !("speechSynthesis" in window)) return;
    const name = state?.candidate_name || t("aiInterview.session.thereFallback");
    const sentence = t("aiInterview.session.soundCheckSpoken", { name });
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
    if (!("speechSynthesis" in window)) {
      onDone?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);

      // Chrome's speechSynthesis fires onend unreliably and stops speaking after
      // ~15s, which used to leave the AI "Speaking" forever and the mic never
      // auto-started for the answer. Guard with a single idempotent finish() that
      // runs on onend/onerror, on a keep-alive poke, and on an estimated-duration
      // fallback — so the answer phase (which starts the mic) ALWAYS begins.
      let done = false;
      let keepAlive: number | undefined;
      let fallback: number | undefined;
      const finish = () => {
        if (done) return;
        done = true;
        if (keepAlive != null) window.clearInterval(keepAlive);
        if (fallback != null) window.clearTimeout(fallback);
        ttsFinishRef.current = null;
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
        setAiSpeaking(false);
        onDone?.();
      };
      ttsFinishRef.current = finish;

      u.onstart = () => setAiSpeaking(true);
      u.onend = finish;
      u.onerror = finish;

      // Keep Chrome speaking past its ~15s cap.
      keepAlive = window.setInterval(() => {
        if (!window.speechSynthesis.speaking) return;
        try {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } catch {
          /* ignore */
        }
      }, 8000);
      // Hard safety net: ~11 chars/sec + a buffer, clamped to a sane range.
      const estMs = Math.min(60000, Math.max(4000, text.length * 90)) + 3000;
      fallback = window.setTimeout(finish, estMs);

      setAiSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch {
      ttsFinishRef.current = null;
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

  // Acquire the mic once, then (a) drive a live input-level meter so the
  // candidate can confirm it works, and (b) record the interview audio. If the
  // mic is denied/unavailable we surface a clear error instead of silently
  // producing an empty interview.
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("This browser can't access the microphone. Please use Chrome.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError(
        "We couldn't access your microphone. Please allow mic access in your browser and reload the page.",
      );
      return;
    }
    setMicError(null);
    mediaStreamRef.current = stream;
    startMicMeter(stream);

    if (typeof MediaRecorder !== "undefined") {
      try {
        const mr = new MediaRecorder(stream);
        audioChunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current = mr;
        mr.start(1000); // flush a chunk every second so nothing is lost on stop
        setRecording(true);
      } catch {
        /* recording unavailable — the interview + meter still work */
      }
    }
  }

  // Live mic level via the Web Audio API — updates a meter so the candidate can
  // see the mic is picking up their voice.
  function startMicMeter(stream: MediaStream) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setMicLevel(level);
        if (level > 0.06) setMicReady(true);
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter unavailable */
    }
  }

  function releaseMic() {
    if (micRafRef.current != null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    try {
      audioContextRef.current?.close();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    mediaStreamRef.current = null;
    setRecording(false);
    setMicLevel(0);
  }

  // Stop recording, then upload the audio so it shows on the recruiter's view.
  async function stopAndUploadRecording() {
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (!mr) {
      releaseMic();
      return;
    }
    const mime = mr.mimeType || "audio/webm";
    const blob = await new Promise<Blob | null>((resolve) => {
      mr.onstop = () => resolve(new Blob(audioChunksRef.current, { type: mime }));
      try {
        if (mr.state !== "inactive") mr.stop();
        else resolve(new Blob(audioChunksRef.current, { type: mime }));
      } catch {
        resolve(null);
      }
    });
    releaseMic();
    if (!blob || blob.size === 0) return;
    try {
      const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `interview.${ext}`);
      await axios.post(`${PUBLIC_API}/${token}/recording`, fd);
    } catch {
      /* best-effort upload */
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
        if (active) setError(e?.response?.data?.error?.message || t("aiInterview.session.invalidLink"));
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
        mediaRecorderRef.current?.stop();
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
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

  // Keep answerRef in sync so startListening() always sees the latest answer.
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  // Confirm the sound check and move on to the first question.
  function proceedToQuestions() {
    stopSoundCheck();
    stopListening();
    setAnswer("");
    answerRef.current = "";
    committedRef.current = "";
    setSoundChecked(true);
  }

  function stopListening() {
    // Preserve words still marked interim. Chrome often ends recognition before
    // promoting the final phrase when Next is clicked or the timer expires.
    const pending = interimRef.current.trim();
    if (pending) {
      const combined = `${answerRef.current} ${pending}`.replace(/\s+/g, " ").trim();
      answerRef.current = combined;
      committedRef.current = combined;
      setAnswer(combined);
    }
    interimRef.current = "";

    // Abort this recognition instance after preserving its interim text. Ignore
    // late events from it so that the same phrase is not appended twice.
    manualStopRef.current = true;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort?.();
    } catch {
      /* ignore */
    }
    setInterim("");
    setListening(false);
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    // Tear down any previous recognition so start() doesn't throw "already started".
    manualStopRef.current = true; // suppress the old rec's onend restart
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
      // Everything already captured becomes this run's committed base; the run's
      // own results are rebuilt from scratch each event so a repeated final
      // segment is never appended twice. (#3)
      committedRef.current = answerRef.current;
      manualStopRef.current = false;
      rec.onresult = (e: any) => {
        // Rebuild from ALL results of THIS run (idempotent), not by appending the
        // latest chunk — browsers can re-fire the same final result. (#3)
        let runFinal = "";
        let interimText = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) runFinal += r[0].transcript + " ";
          else interimText += r[0].transcript;
        }
        if (recognitionRef.current !== rec) return;
        interimRef.current = interimText.trim();
        const combined = `${committedRef.current} ${runFinal}`.replace(/\s+/g, " ").trim();
        answerRef.current = combined;
        setAnswer(combined);
        setInterim(interimText);
      };
      rec.onend = () => {
        // Only act for the recognition that's still current.
        if (recognitionRef.current !== rec) return;
        // Chrome ends recognition after a pause even in continuous mode. Unless
        // we stopped on purpose, commit what we have and restart so the mic keeps
        // listening and the "Listening" badge stays accurate. (#4/#5)
        if (!manualStopRef.current) {
          committedRef.current = answerRef.current;
          try {
            rec.start();
            return;
          } catch {
            /* fall through to stop */
          }
        }
        setListening(false);
      };
      rec.onerror = (e: any) => {
        if (e?.error === "not-allowed" || e?.error === "audio-capture" || e?.error === "service-not-allowed") {
          // A permission/hardware error — don't auto-restart into a loop.
          manualStopRef.current = true;
          setListening(false);
          setMicError(
            "We couldn't access your microphone. Please allow mic access in your browser and reload the page.",
          );
        }
        // Transient errors (no-speech, aborted) fall through to onend, which
        // restarts recognition so the candidate isn't cut off.
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  // Mic button. If the AI is still reading the question, don't no-op — skip the
  // rest of the read and jump straight to the answer phase (which starts the
  // mic). Otherwise toggle listening.
  function toggleMic() {
    if (aiSpeaking) {
      if (ttsFinishRef.current) ttsFinishRef.current();
      else {
        setAiSpeaking(false);
        beginAnswerPhase();
      }
      return;
    }
    if (listening) stopListening();
    else startListening();
  }

  async function submitAnswer() {
    if (!state || submitting) return;
    clearTimer();
    stopListening();
    setSubmitting(true);
    try {
      const capturedAnswer = answerRef.current;
      const { data } = await axios.post(`${PUBLIC_API}/${token}/answer`, { answer: capturedAnswer });
      const next = data.data;
      // Reset the transcript AND its refs so the next question starts clean.
      setAnswer("");
      answerRef.current = "";
      committedRef.current = "";
      interimRef.current = "";
      if (next.done) {
        await axios.post(`${PUBLIC_API}/${token}/complete`);
        // Upload the recorded audio so it appears on the recruiter's view.
        await stopAndUploadRecording();
        setState((s) => (s ? { ...s, done: true, status: "completed", question: null, current_index: next.current_index } : s));
      } else {
        setState((s) =>
          s ? { ...s, current_index: next.current_index, question: next.question, status: "in_progress" } : s,
        );
      }
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || t("aiInterview.session.submitError"));
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
        <p className="text-center text-sm text-red-600">{error || t("aiInterview.session.notFound")}</p>
      </Shell>
    );
  }

  // Candidate left the interview.
  if (left) {
    return (
      <Shell>
        <div className="text-center">
          <PhoneOff className="mx-auto h-12 w-12 text-gray-400" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t("aiInterview.session.leftTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("aiInterview.session.leftBody", { name: state.candidate_name })}
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
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t("aiInterview.session.completeTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("aiInterview.session.completeBody", { name: state.candidate_name })}
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
          <h1 className="mt-4 text-lg font-bold text-gray-900">{t("aiInterview.session.preparingTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("aiInterview.session.preparingBody", { name: state.candidate_name })}
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
          <h1 className="mt-5 text-2xl font-bold text-gray-900">{t("aiInterview.session.title")}</h1>
          {state.job_title && <p className="mt-1 text-sm font-medium text-brand-600">{state.job_title}</p>}
          <p className="mt-4 text-sm text-gray-600">
            <Trans
              i18nKey="aiInterview.session.introBody"
              values={{ name: state.candidate_name, total: state.total }}
              components={{ b1: <strong />, b2: <strong /> }}
            />
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Your audio will be recorded and shared with the hiring team.
          </p>
          <button
            onClick={() => {
              setStarted(true);
              soundCheckStopRef.current = false;
              startRecording();
              speakSoundCheck();
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("aiInterview.session.startInterview")}
          </button>
          {!SpeechRecognitionCtor && (
            <p className="mt-3 text-xs text-amber-600">
              {t("aiInterview.session.noVoiceSupport")}
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
    ? t("aiInterview.session.soundCheckCaption", { name: state.candidate_name })
    : state.question;
  const liveTranscript = `${answer} ${interim}`.trim();
  return (
    <div className="flex min-h-screen flex-col bg-[#202124] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{state.job_title || t("aiInterview.session.title")}</span>
          {recording && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC
            </span>
          )}
        </div>
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
            {inSoundCheck
              ? t("aiInterview.session.soundCheck")
              : t("aiInterview.session.questionProgress", { current: state.current_index + 1, total: state.total })}
          </span>
        </div>
      </div>

      {/* Mic problem banner */}
      {micError && (
        <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
          <MicOff className="h-4 w-4 flex-shrink-0" />
          {micError}
        </div>
      )}

      {/* Participant tiles */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
          <MeetTile
            label={t("aiInterview.session.interviewer")}
            speaking={aiSpeaking}
            status={aiSpeaking ? t("aiInterview.session.speaking") : t("aiInterview.session.asked")}
            icon={Brain}
            accent="purple"
          />
          <MeetTile
            label={t("aiInterview.session.you")}
            speaking={listening}
            status={listening ? t("aiInterview.session.listening") : inSoundCheck ? t("aiInterview.session.sayYes") : t("aiInterview.session.muted")}
            icon={Mic}
            accent="blue"
            muted={!listening}
          />
        </div>
      </div>

      {/* Mic test meter — during the sound check the candidate sees their input
          level move, confirming the microphone is working before answering. */}
      {inSoundCheck && !micError && (
        <div className="px-4 pb-2">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
            <Mic className={`h-4 w-4 flex-shrink-0 ${micReady ? "text-green-400" : "text-gray-400"}`} />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${micReady ? "bg-green-400" : "bg-gray-400"}`}
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
            <span className="w-24 flex-shrink-0 text-right text-xs text-gray-400">
              {micReady ? "✓ Mic working" : "Say something…"}
            </span>
          </div>
        </div>
      )}

      {/* Question caption (AI subtitle) */}
      <div className="px-4 pb-2">
        <div className="mx-auto flex max-w-3xl items-start justify-center gap-2 rounded-xl bg-black/40 px-4 py-3">
          <p className="text-center text-sm text-gray-100 sm:text-base">{caption}</p>
          {!inSoundCheck && (
            <button
              onClick={() => caption && say(caption)}
              title={t("aiInterview.session.replayQuestion")}
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
                {listening ? t("aiInterview.session.listeningHint") : t("aiInterview.session.tapMicHint")}
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
            <CheckCircle2 className="h-5 w-5" /> {t("aiInterview.session.canHearYou")}
          </button>
        ) : (
          <>
            {SpeechRecognitionCtor && (
              <button
                onClick={toggleMic}
                title={
                  aiSpeaking
                    ? t("aiInterview.session.tapToAnswer")
                    : listening
                      ? t("aiInterview.session.mute")
                      : t("aiInterview.session.unmute")
                }
                aria-label={
                  aiSpeaking
                    ? t("aiInterview.session.tapToAnswer")
                    : listening
                      ? t("aiInterview.session.mute")
                      : t("aiInterview.session.unmute")
                }
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
              title={isLast ? t("aiInterview.session.finishInterview") : t("aiInterview.session.nextQuestion")}
              className="flex h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isLast ? t("aiInterview.session.finishInterview") : t("aiInterview.session.nextQuestion")}
              {!submitting && <ChevronRight className="h-5 w-5" />}
            </button>
          </>
        )}
        <button
          onClick={quit}
          title={t("aiInterview.session.leaveInterview")}
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
  const { t } = useTranslation();
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
        setError(t("aiInterview.session.callProblem"));
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
        e?.response?.data?.error?.message || t("aiInterview.session.voiceStartError"),
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
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t("aiInterview.session.completeTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("aiInterview.session.voiceCompleteBody", { name: candidateName })}
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
          <span className="text-sm font-medium text-gray-200">{jobTitle || t("aiInterview.session.title")}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-gray-300">
            <span className={`h-2 w-2 rounded-full ${phase === "finishing" ? "bg-yellow-400" : "animate-pulse bg-red-500"}`} />
            {phase === "finishing" ? t("aiInterview.session.wrappingUp") : t("aiInterview.session.live")}
          </span>
        </div>

        {/* Participant tiles */}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2">
            <MeetTile
              label={t("aiInterview.session.interviewer")}
              speaking={agentTalking}
              status={agentTalking ? t("aiInterview.session.speaking") : t("aiInterview.session.listening")}
              icon={Brain}
              accent="purple"
              caption={agentText}
            />
            <MeetTile
              label={t("aiInterview.session.you")}
              speaking={userSpeaking}
              status={userSpeaking ? t("aiInterview.session.speaking") : t("aiInterview.session.muted")}
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
                if (window.confirm(t("aiInterview.session.endConfirm"))) endCall();
              }}
              title={t("aiInterview.session.leaveInterview")}
              className="flex h-12 w-16 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin" /> {t("aiInterview.session.wrappingUp")}
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
        <h1 className="mt-5 text-2xl font-bold text-gray-900">{t("aiInterview.session.voiceTitle")}</h1>
        {jobTitle && <p className="mt-1 text-sm font-medium text-brand-600">{jobTitle}</p>}
        <p className="mt-4 text-sm text-gray-600">
          {t("aiInterview.session.voiceIntroBody", { name: candidateName })}
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "connecting"}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {phase === "connecting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("aiInterview.session.connecting")}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" /> {t("aiInterview.session.startVoiceInterview")}
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

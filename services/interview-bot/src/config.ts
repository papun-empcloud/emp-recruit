// Runtime configuration for the Jitsi interview bot. All values come from the
// environment (see .env.example). Kept in one place so the modules stay pure.

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  // What to run
  apiBase: process.env.RECRUIT_API_BASE || "http://localhost:4500/api/v1",
  interviewToken: process.env.AI_INTERVIEW_TOKEN || "",
  roomUrl: process.env.JITSI_ROOM_URL || "",
  botName: process.env.BOT_DISPLAY_NAME || "AI Interviewer",
  chromiumPath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",

  // Speech-to-text (Deepgram live)
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || "",
    endpointingMs: num("DEEPGRAM_ENDPOINTING_MS", 1500),
    utteranceEndMs: num("DEEPGRAM_UTTERANCE_END_MS", 2000),
    sampleRate: 16000,
    model: process.env.DEEPGRAM_MODEL || "nova-2",
  },

  // Text-to-speech
  tts: {
    engine: process.env.TTS_ENGINE || "espeak",
    voice: process.env.TTS_VOICE || "en-us",
    wpm: num("TTS_WPM", 150),
  },

  // PulseAudio virtual devices (created at startup)
  audio: {
    micSink: "bot_mic_sink", // TTS is played here; Chromium uses its .monitor as the mic
    speakerSink: "bot_speaker", // Chromium plays call audio here; we capture .monitor
  },

  // Answer capture bounds
  minAnswerMs: num("MIN_ANSWER_MS", 2000),
  maxAnswerMs: num("MAX_ANSWER_MS", 90000),

  // How long to wait for a human to appear before starting
  waitForCandidateMs: num("WAIT_FOR_CANDIDATE_MS", 120000),
};

export function assertConfig(): void {
  const missing: string[] = [];
  if (!config.interviewToken) missing.push("AI_INTERVIEW_TOKEN");
  if (!config.roomUrl) missing.push("JITSI_ROOM_URL");
  if (!config.deepgram.apiKey) missing.push("DEEPGRAM_API_KEY");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

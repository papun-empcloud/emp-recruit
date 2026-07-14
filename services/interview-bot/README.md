# AI Interview Bot (Jitsi) — Proof of Concept

An AI participant that **joins a Jitsi meeting**, asks the candidate resume‑tailored
questions **by voice**, transcribes the spoken answers, and stores a scored
evaluation on the same AI‑interview record HR sees in emp‑recruit.

> ⚠️ **Status: proof of concept.** This is a scaffold with real, working building
> blocks, but it has **not** been run end‑to‑end in this repo's environment. It
> needs a Linux/Docker host (for Chromium + virtual audio), a Deepgram key, and
> hands‑on tuning of the Jitsi selectors/turn‑taking before it's demo‑solid.
> It is **not** production‑ready. It does not run on Windows directly — use Docker.

## How it fits together

It reuses the existing **AI Interview** backend (`packages/server`,
`feat/ai-voice-interview`). The bot is just an automated interviewer that drives
the same public session by voice from inside a call:

```
 HR: AI Interviews → New AI Interview → gets a token (session + tailored questions)
 HR: schedules a Jitsi interview → gets the room URL
                        │
                        ▼
   ┌──────────────────────────── interview-bot (this worker) ─────────────────────────┐
   │  Puppeteer → joins meet.jit.si room as "AI Interviewer"                           │
   │                                                                                   │
   │  GET /public/ai-interviews/:token        ── the tailored questions                │
   │  for each question:                                                               │
   │     espeak-ng(text) → WAV → PulseAudio bot_mic_sink → Chromium mic → into call    │
   │     candidate speaks → Chromium out → bot_speaker.monitor → parec → Deepgram STT  │
   │     Deepgram "UtteranceEnd" → answer done → POST /answer { transcript }           │
   │  POST /complete   → existing evaluation runs → score/summary on the record        │
   └───────────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
 HR: AI Interviews → the session now shows the transcript + score
```

### Modules
| File | Role |
|------|------|
| `src/jitsi.ts` | Puppeteer joins the room (prejoin skipped via URL config), participant count |
| `src/audio.ts` | PulseAudio virtual mic/speaker; play TTS in, capture call audio out |
| `src/tts.ts` | Text‑to‑speech (espeak‑ng offline by default; swap in a cloud voice) |
| `src/stt.ts` | Deepgram live WebSocket STT + utterance‑end (turn‑taking) |
| `src/api.ts` | Talks to the emp‑recruit public AI‑interview endpoints |
| `src/orchestrator.ts` | The loop: join → greet → per‑question speak/listen/submit → complete |

## Prerequisites
- A **Linux/Docker** host (virtual audio needs PulseAudio; Chromium runs headless).
- A **Deepgram** API key (`DEEPGRAM_API_KEY`) for streaming speech‑to‑text.
- Network access from the bot host to the emp‑recruit API (`RECRUIT_API_BASE`).
- An AI‑interview **token** (create one in the app) and the interview's **Jitsi room URL**.

## Run it (Docker)
```bash
cd services/interview-bot
cp .env.example .env      # fill in AI_INTERVIEW_TOKEN, JITSI_ROOM_URL, DEEPGRAM_API_KEY, RECRUIT_API_BASE

docker build -t emp-interview-bot .
docker run --rm --env-file .env \
  --add-host=host.docker.internal:host-gateway \
  emp-interview-bot
```
The bot joins the room, waits for the candidate, then conducts the interview. When
it finishes, the score + transcript appear under **AI Interviews → (that session)**.

## Known limitations / next steps (why it's a PoC)
- **Jitsi coupling is brittle.** Join detection and participant count use Jitsi's
  internal `window.APP.conference` API and URL config overrides, which meet.jit.si
  can change. **Self‑hosting Jitsi** and using the official **iframe/external API**
  (or a lib‑jitsi‑meet bot) would be far more reliable.
- **Turn‑taking is naive** — a single Deepgram utterance‑end ends the answer. Real
  interviews need barge‑in handling, pauses, "are you finished?" prompts, etc.
- **TTS is robotic** (espeak). Wire a cloud voice (ElevenLabs/Azure/Google/OpenAI)
  in `src/tts.ts` for a human‑sounding interviewer.
- **No adaptive follow‑ups yet** — it asks the pre‑generated question set. Adding
  per‑answer LLM follow‑ups would make it feel more like a real interviewer.
- **One interview per worker.** For scale you'd run one container per interview
  (orchestrated by a queue) and add reconnect/timeout handling.
- **Cost/ops:** each interview runs a headless Chromium + live STT for its whole
  duration — budget accordingly.
- **Untested here.** The individual pieces are standard, but the full pipeline
  hasn't been validated in this repo's environment; expect to iterate on the audio
  routing and Jitsi selectors on first run.

# Real-time AI Voice Interview (Retell AI)

This is the FoloUp-style experience: the candidate opens their AI-interview link,
clicks **Start voice interview**, and has a **live spoken conversation** with an
AI interviewer in the browser — it asks the resume-tailored questions and they
answer out loud. The transcript is scored and shown to HR.

It's powered by **[Retell AI](https://www.retellai.com/)**, which runs the
real-time speech-to-speech (STT + LLM + TTS + turn-taking). No Docker, no Jitsi —
it all runs in the browser via Retell's web SDK.

> Without `RETELL_API_KEY` + `RETELL_AGENT_ID` set, the candidate page falls back
> to the typed/turn-based flow automatically (the app keeps working). Add the keys
> to turn on the live voice experience.

## 1. Create a Retell agent

**Easiest — run the setup script** (creates the LLM + agent with the right
interviewer prompt and prints the agent ID):

```bash
cd packages/server
RETELL_API_KEY=key_xxx \
RETELL_WEBHOOK_URL=https://<public-host>/api/v1/public/ai-interviews/retell-webhook \
pnpm setup:retell
# → prints: RETELL_AGENT_ID=agent_xxx
```
(`RETELL_WEBHOOK_URL` is optional here; you can also set the webhook in the
dashboard — see step 3.)

**Already have an agent?** Run the same command with your existing
`RETELL_AGENT_ID` also set — the script updates that agent's prompt in place
(no new ID, no env change):

```bash
RETELL_API_KEY=key_xxx RETELL_AGENT_ID=agent_xxx pnpm setup:retell
```

The interviewer starts with an audio check — it greets the candidate, asks them
to unmute and "Can you hear me okay?", and only asks the interview questions once
the candidate confirms they can hear it.

**Or manually** in the [Retell dashboard](https://dashboard.retellai.com/): create
a Retell LLM agent + a voice, with a prompt that uses the **dynamic variables**
the app injects per candidate (`{{candidate_name}}`, `{{job_title}}`,
`{{questions}}`) — the exact prompt the script uses is in
`packages/server/scripts/setup-retell-agent.ts`. Then copy the **Agent ID**.

Get your **API key** from the dashboard → API Keys.

## 2. Configure the server
Set these where the server reads env (repo `.env` / `packages/server`):

```
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=your_agent_id
# Recommended so questions/evaluation are AI-generated (not the fallback):
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```
Restart the server.

## 3. Point Retell's webhook at the app
So the transcript + score are saved when a call ends, set the agent's (or
account's) **webhook URL** in Retell to:

```
POST  https://<your-server>/api/v1/public/ai-interviews/retell-webhook
```
In local dev the server must be publicly reachable — expose it with a tunnel:
```
ngrok http 4500
# use the https URL + /api/v1/public/ai-interviews/retell-webhook
```

## 4. Use it
1. App → **AI Interviews → New AI Interview** → pick the application → copy the link.
2. Candidate opens the link → **Start voice interview** → allows the mic → has the
   spoken conversation.
3. On hang-up, Retell posts the transcript to the webhook; the app scores it and
   the result appears under **AI Interviews → (that session)** (transcript + score).

## How it's wired
| Piece | Where |
|-------|-------|
| Create web call (`POST /v2/create-web-call`, dynamic vars from the session's questions) | `packages/server/.../ai-interview.service.ts` → `createVoiceCall` |
| Candidate live call (`retell-client-js-sdk` → `RetellWebClient.startCall`) | `packages/client/.../AiInterviewPage.tsx` → `VoiceInterview` |
| Webhook → save transcript + evaluate + complete | `ai-interview.service.ts` → `handleRetellWebhook`, route `POST /public/ai-interviews/retell-webhook` |
| Voice transcript + score for HR | `AiInterviewDetailPage.tsx` |

## Notes
- Retell is a paid service (free trial minutes). Budget for per-minute cost.
- The webhook has no signature check in this cut — add Retell's signature
  verification before production.
- Question generation and transcript scoring use the app's existing LLM
  (`AI_PROVIDER`), with a deterministic fallback when none is set.

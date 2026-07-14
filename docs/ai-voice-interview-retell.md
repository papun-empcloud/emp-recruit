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
In the [Retell dashboard](https://dashboard.retellai.com/): create an agent (a
Retell LLM agent + a voice). Give it a prompt that conducts an interview using
**dynamic variables** — the app injects these per candidate:

```
You are a friendly, professional AI interviewer for the {{job_title}} role.
You are interviewing {{candidate_name}}.

Ask these questions ONE AT A TIME, in order. Wait for a full answer before moving
on, and ask a brief natural follow-up if an answer is vague or very short:

{{questions}}

Keep your turns short and conversational. Do not read the numbers out loud. After
the last question, thank the candidate warmly and end the call.
```

Copy the **Agent ID** and grab your **API key** (dashboard → API Keys).

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

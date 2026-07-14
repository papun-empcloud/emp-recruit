/**
 * One-time setup for the real-time AI voice interview.
 *
 * Creates a Retell LLM + agent configured for interviewing (using the
 * {{candidate_name}}, {{job_title}} and {{questions}} dynamic variables the app
 * injects per candidate) and prints the RETELL_AGENT_ID to put in your env.
 *
 * Usage (from packages/server):
 *   RETELL_API_KEY=key_xxx \
 *   RETELL_WEBHOOK_URL=https://<public-host>/api/v1/public/ai-interviews/retell-webhook \
 *   pnpm setup:retell
 *
 * RETELL_WEBHOOK_URL is optional here — you can also set the webhook in the
 * Retell dashboard. In local dev, expose the server with `ngrok http 4500`.
 */

const API = "https://api.retellai.com";
const key = process.env.RETELL_API_KEY;
const webhookUrl = process.env.RETELL_WEBHOOK_URL || "";
const voiceOverride = process.env.RETELL_VOICE_ID || "";

const GENERAL_PROMPT = `You are a friendly, professional AI interviewer for the {{job_title}} role, interviewing {{candidate_name}}.

Greet the candidate warmly by name, then ask these questions ONE AT A TIME, in order. Wait for a complete answer before moving on. If an answer is vague or very short, ask ONE brief, natural follow-up, then continue.

Questions:
{{questions}}

Keep your turns short and conversational. Do NOT read the question numbers aloud. After the final question, thank the candidate sincerely and end the call.`;

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function pickVoice(): Promise<string> {
  if (voiceOverride) return voiceOverride;
  try {
    const res = await fetch(`${API}/list-voices`, { headers: { Authorization: `Bearer ${key}` } });
    const voices = (await res.json()) as Array<{ voice_id: string }>;
    if (Array.isArray(voices) && voices[0]?.voice_id) return voices[0].voice_id;
  } catch {
    /* fall through to a common default */
  }
  return "11labs-Adrian";
}

async function main() {
  if (!key) {
    console.error("Set RETELL_API_KEY (get it from https://dashboard.retellai.com → API Keys).");
    process.exit(1);
  }

  const voiceId = await pickVoice();
  console.log(`Using voice: ${voiceId}`);

  const llm = await post("/create-retell-llm", { general_prompt: GENERAL_PROMPT });
  console.log(`Created Retell LLM: ${llm.llm_id}`);

  const agent = await post("/create-agent", {
    response_engine: { type: "retell-llm", llm_id: llm.llm_id },
    voice_id: voiceId,
    agent_name: "EMP Recruit AI Interviewer",
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
  });

  console.log("\n✅ Retell agent created.\n");
  console.log("Add to your server env and restart:");
  console.log(`  RETELL_AGENT_ID=${agent.agent_id}`);
  if (!webhookUrl) {
    console.log(
      "\n⚠ No RETELL_WEBHOOK_URL was set. Set the agent's webhook in the Retell dashboard to:",
    );
    console.log("  <your-public-server>/api/v1/public/ai-interviews/retell-webhook");
    console.log("  (local dev: `ngrok http 4500`, then use the https URL)");
  }
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});

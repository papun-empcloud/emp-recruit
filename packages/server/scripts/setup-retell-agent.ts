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
const existingAgentId = process.env.RETELL_AGENT_ID || "";

const GENERAL_PROMPT = `You are a friendly, professional AI interviewer for the {{job_title}} role, interviewing {{candidate_name}}.

AUDIO CHECK — do this FIRST, before anything else:
1. Greet {{candidate_name}} warmly by name and ask them to make sure they are unmuted.
2. Ask "Can you hear me okay?" and then WAIT for their reply.
3. Only after they clearly confirm they can hear you (for example they say "yes"), briefly tell them you'll ask a few questions and then begin.
If they say they cannot hear you, don't respond, or are unclear, kindly ask them again to unmute and check their audio. Do NOT ask any interview question until they have confirmed they can hear you.

Once the audio is confirmed, ask these questions ONE AT A TIME, in order. Wait for a complete answer before moving on. If an answer is vague or very short, ask ONE brief, natural follow-up, then continue.

Questions:
{{questions}}

Keep your turns short and conversational. Do NOT read the question numbers aloud. After the final question, thank the candidate sincerely and end the call.`;

// The agent's very first spoken line — a deterministic audio check. The model
// then waits (per the prompt above) for the candidate to confirm before asking.
const BEGIN_MESSAGE = `Hi {{candidate_name}}! Before we begin, please make sure you're unmuted. Can you hear me okay?`;

async function request(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
const post = (path: string, body: unknown) => request("POST", path, body);

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

// Update the prompt/begin-message of an agent you already created — so the new
// audio-check behavior applies without minting a new RETELL_AGENT_ID. Re-run
// `pnpm setup:retell` with your existing RETELL_AGENT_ID set to take this path.
async function updateExistingAgent(agentId: string) {
  console.log(`Updating existing agent ${agentId}…`);
  const agent = await request("GET", `/get-agent/${agentId}`);
  const llmId = agent?.response_engine?.llm_id;
  if (!llmId) {
    throw new Error(`Agent ${agentId} is not backed by a Retell LLM (cannot update its prompt).`);
  }
  await request("PATCH", `/update-retell-llm/${llmId}`, {
    general_prompt: GENERAL_PROMPT,
    begin_message: BEGIN_MESSAGE,
  });
  console.log(`\n✅ Updated Retell LLM ${llmId} on agent ${agentId}.`);
  console.log("The AI now starts with an audio check and waits for confirmation before questions.");
  console.log("No env change needed — your RETELL_AGENT_ID is unchanged.");
}

async function main() {
  if (!key) {
    console.error("Set RETELL_API_KEY (get it from https://dashboard.retellai.com → API Keys).");
    process.exit(1);
  }

  // Already have an agent? Update it in place instead of creating a new one.
  if (existingAgentId) {
    await updateExistingAgent(existingAgentId);
    return;
  }

  const voiceId = await pickVoice();
  console.log(`Using voice: ${voiceId}`);

  const llm = await post("/create-retell-llm", {
    general_prompt: GENERAL_PROMPT,
    begin_message: BEGIN_MESSAGE,
  });
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

// The interview loop: join the room, wait for the candidate, then for each
// question — speak it, listen until the candidate finishes (Deepgram utterance
// end), submit the transcribed answer — and finally complete the session so the
// existing evaluation runs. The transcript/score land on the same AI-interview
// record HR sees in the app.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { config, assertConfig } from "./config.js";
import { api, type InterviewState } from "./api.js";
import { synthesize } from "./tts.js";
import { setupVirtualDevices, playToMic, startCapture } from "./audio.js";
import { openDeepgram } from "./stt.js";
import { joinRoom, participantCount, leave, type JitsiSession } from "./jitsi.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runInterview(): Promise<void> {
  assertConfig();

  // Fail fast if the session isn't valid before we spin up a browser.
  let state: InterviewState = await api.getState(config.interviewToken);
  if (state.status === "completed") {
    console.log("This interview is already completed. Nothing to do.");
    return;
  }

  console.log(`Interviewing ${state.candidate_name}${state.job_title ? ` for ${state.job_title}` : ""} (${state.total} questions).`);

  setupVirtualDevices();
  const session = await joinRoom();
  console.log(`Bot joined ${config.roomUrl} as "${config.botName}".`);

  try {
    await waitForCandidate(session);

    await speak(
      `Hello ${state.candidate_name}. Thank you for joining. I'm your A I interviewer. I'll ask you ${state.total} questions. Please answer out loud after each one, and take your time.`,
    );

    while (!state.done && state.question) {
      await speak(state.question);
      const answer = await listenForAnswer();
      console.log(`Q${state.current_index + 1}: "${answer.slice(0, 100)}${answer.length > 100 ? "…" : ""}"`);

      const next = await api.submitAnswer(config.interviewToken, answer);
      state = {
        ...state,
        current_index: next.current_index,
        question: next.question,
        done: next.done,
      };
    }

    const result = await api.complete(config.interviewToken);
    console.log(`Interview complete. Score: ${result.overall_score ?? "n/a"}/100.`);
    await speak("That concludes the interview. Thank you very much for your time. Goodbye.");
    await sleep(1500);
  } finally {
    await leave(session);
  }
}

async function waitForCandidate(session: JitsiSession): Promise<void> {
  const deadline = Date.now() + config.waitForCandidateMs;
  while (Date.now() < deadline) {
    if ((await participantCount(session.page)) > 0) return;
    await sleep(2000);
  }
  console.warn("No other participant appeared; starting anyway.");
}

async function speak(text: string): Promise<void> {
  const wav = join(tmpdir(), `q-${Date.now()}.wav`);
  await synthesize(text, wav);
  await playToMic(wav);
  await sleep(400); // small gap before we start listening
}

/** Capture the candidate's spoken answer, ending on Deepgram's utterance-end. */
async function listenForAnswer(): Promise<string> {
  const dg = openDeepgram();
  await dg.ready;

  const capture = startCapture();
  let transcript = "";
  let ended = false;
  const startedAt = Date.now();

  dg.onFinal((t) => {
    transcript += (transcript ? " " : "") + t;
  });
  dg.onUtteranceEnd(() => {
    // Ignore an utterance-end that fires before the candidate has really spoken.
    if (Date.now() - startedAt >= config.minAnswerMs && transcript.trim().length > 0) {
      ended = true;
    }
  });
  capture.stdout?.on("data", (chunk: Buffer) => dg.send(chunk));

  while (!ended && Date.now() - startedAt < config.maxAnswerMs) {
    await sleep(200);
  }

  try {
    capture.kill("SIGINT");
  } catch {
    /* ignore */
  }
  dg.close();
  return transcript.trim();
}

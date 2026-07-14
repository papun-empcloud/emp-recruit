// Text-to-speech. Default engine is espeak-ng (offline, bundled in the Docker
// image) so the PoC runs with no cloud key. To use a natural cloud voice
// (ElevenLabs, Azure, Google, OpenAI…), add a branch here that writes a 16-bit
// mono WAV to `outPath` and set TTS_ENGINE accordingly.

import { spawn } from "node:child_process";
import { config } from "./config.js";

export async function synthesize(text: string, outPath: string): Promise<void> {
  switch (config.tts.engine) {
    case "espeak":
      await run("espeak-ng", ["-v", config.tts.voice, "-s", String(config.tts.wpm), "-w", outPath, text]);
      return;
    default:
      throw new Error(
        `Unsupported TTS_ENGINE "${config.tts.engine}". Implement a cloud provider in src/tts.ts.`,
      );
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

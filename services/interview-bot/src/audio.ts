// Virtual audio wiring via PulseAudio (Linux).
//
//   TTS WAV --paplay--> [bot_mic_sink] --.monitor--> Chromium mic --> into call
//   candidate voice --> Chromium output --> [bot_speaker] --.monitor--parec--> STT
//
// Two null sinks are created and set as Chromium's default output/input so the
// browser "hears" the candidate on bot_speaker and "speaks" whatever we play
// into bot_mic_sink. Requires a running PulseAudio server (see the Dockerfile).

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { config } from "./config.js";

export function setupVirtualDevices(): void {
  // Chromium's microphone source (its input = the monitor of this sink).
  sh("pactl", [
    "load-module",
    "module-null-sink",
    `sink_name=${config.audio.micSink}`,
    "sink_properties=device.description=BotMic",
  ]);
  // Chromium's speaker output (we capture the candidate audio from its monitor).
  sh("pactl", [
    "load-module",
    "module-null-sink",
    `sink_name=${config.audio.speakerSink}`,
    "sink_properties=device.description=BotSpeaker",
  ]);
  sh("pactl", ["set-default-sink", config.audio.speakerSink]);
  sh("pactl", ["set-default-source", `${config.audio.micSink}.monitor`]);
}

/** Play a WAV into the bot's virtual mic so it's heard by everyone in the call. */
export function playToMic(wavPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("paplay", [`--device=${config.audio.micSink}`, wavPath], { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", () => resolve());
  });
}

/**
 * Start capturing the call audio the bot hears as raw s16le PCM (16 kHz mono).
 * The returned process's stdout streams the PCM; kill it to stop capturing.
 */
export function startCapture(): ChildProcess {
  return spawn(
    "parec",
    [
      `--device=${config.audio.speakerSink}.monitor`,
      "--format=s16le",
      `--rate=${config.deepgram.sampleRate}`,
      "--channels=1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
}

function sh(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

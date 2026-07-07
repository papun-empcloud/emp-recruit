// ============================================================================
// LOCAL WHISPER STT ADAPTER (on-device, no API key)
// ============================================================================
// Runs Whisper on the CPU via @xenova/transformers (ONNX, no native build).
// ffmpeg-static extracts 16 kHz mono audio from the uploaded video/audio; the
// model weights download once from the HF hub and cache locally. Slower than the
// cloud providers, but needs no account. Model set by config.ai.transcription.local.
// ============================================================================

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import ffmpegPath from "ffmpeg-static";
import { WaveFile } from "wavefile";
import { config } from "../../../config";
import { AppError } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import type { STTProvider, TranscriptionResult } from "./types";

// Load the ESM-only @xenova/transformers from this CommonJS module without tsc
// downleveling `import()` to `require()` (which would break on an ESM package).
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

let transcriberPromise: Promise<any> | null = null;

async function getTranscriber(): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await dynamicImport("@xenova/transformers");
      env.allowLocalModels = false; // fetch from the HF hub, then cache
      logger.info(`Loading local Whisper model ${config.ai.transcription.local.model} …`);
      return pipeline("automatic-speech-recognition", config.ai.transcription.local.model);
    })();
    // Don't cache a rejected load — reset so the next upload retries.
    transcriberPromise.catch(() => {
      transcriberPromise = null;
    });
  }
  return transcriberPromise;
}

/** Extract a 16 kHz mono WAV from any audio/video file using ffmpeg. */
async function extractWav(inputPath: string): Promise<string> {
  if (!ffmpegPath) {
    throw new AppError(500, "FFMPEG_MISSING", "ffmpeg binary is not available");
  }
  const out = path.join(os.tmpdir(), `stt-${uuidv4()}.wav`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, [
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-f", "wav",
      "-y", out,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`)),
    );
  });
  return out;
}

/** Read a 16 kHz mono WAV into a Float32Array of PCM samples. */
function readWavSamples(wavPath: string): Float32Array {
  const wav = new WaveFile(fs.readFileSync(wavPath));
  wav.toBitDepth("32f");
  const samples = wav.getSamples();
  const mono = Array.isArray(samples) ? samples[0] : samples;
  return Float32Array.from(mono as unknown as ArrayLike<number>);
}

export const localWhisperProvider: STTProvider = {
  key: "local",

  isConfigured(): boolean {
    return true; // on-device — always available
  },

  async transcribe(filePath: string, _mimeType: string | null): Promise<TranscriptionResult> {
    let wavPath: string | null = null;
    try {
      wavPath = await extractWav(filePath);
      const samples = readWavSamples(wavPath);
      const durationSeconds = samples.length ? Math.round(samples.length / 16000) : null;

      const asr = await getTranscriber();
      const result = await asr(samples, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(result)
        ? result.map((r: any) => r.text).join(" ")
        : (result?.text ?? "");

      logger.info(`Local Whisper transcription complete (${durationSeconds ?? "?"}s)`);
      return { text: String(text).trim(), durationSeconds };
    } finally {
      if (wavPath) {
        try {
          fs.unlinkSync(wavPath);
        } catch {
          /* best-effort cleanup */
        }
      }
    }
  },
};

// ============================================================================
// OPENAI WHISPER STT ADAPTER (cloud)
// ============================================================================
// Transcribes via OpenAI's /audio/transcriptions (whisper-1). Used when
// OPENAI_API_KEY is set. Works with any OpenAI-compatible endpoint.
// ============================================================================

import fs from "fs";
import path from "path";
import { config } from "../../../config";
import { AppError } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import type { STTProvider, TranscriptionResult } from "./types";

export const openaiWhisperProvider: STTProvider = {
  key: "openai",

  isConfigured(): boolean {
    return !!config.ai.transcription.openai.apiKey;
  },

  async transcribe(filePath: string, mimeType: string | null): Promise<TranscriptionResult> {
    const buf = await fs.promises.readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mimeType || "audio/mpeg" }), path.basename(filePath));
    form.append("model", config.ai.transcription.openai.model);

    const res = await fetch(`${config.ai.transcription.openai.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.ai.transcription.openai.apiKey}` },
      body: form,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(502, "STT_ERROR", json?.error?.message || `Transcription failed (${res.status})`);
    }
    logger.info("OpenAI Whisper transcription complete");
    return { text: (json.text ?? "").trim(), durationSeconds: json.duration ? Math.round(json.duration) : null };
  },
};

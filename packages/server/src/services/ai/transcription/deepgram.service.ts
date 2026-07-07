// ============================================================================
// DEEPGRAM STT ADAPTER (cloud)
// ============================================================================
// Deepgram prerecorded API with speaker diarization. Used when DEEPGRAM_API_KEY
// is set. Raw fetch — no SDK dependency.
// ============================================================================

import fs from "fs";
import { config } from "../../../config";
import { AppError } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import type { STTProvider, TranscriptionResult } from "./types";

/** Build "Speaker N: …" paragraphs when diarization data is present. */
function formatDiarized(alt: any): string {
  const paragraphs = alt?.paragraphs?.paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return "";
  return paragraphs
    .map((p: any) => {
      const speaker = typeof p.speaker === "number" ? `Speaker ${p.speaker}` : "Speaker";
      const sentences = (p.sentences ?? []).map((s: any) => s.text).join(" ");
      return `${speaker}: ${sentences}`;
    })
    .join("\n\n");
}

export const deepgramProvider: STTProvider = {
  key: "deepgram",

  isConfigured(): boolean {
    return !!config.ai.transcription.deepgram.apiKey;
  },

  async transcribe(filePath: string, mimeType: string | null): Promise<TranscriptionResult> {
    const audio = await fs.promises.readFile(filePath);
    const params = new URLSearchParams({
      model: config.ai.transcription.deepgram.model,
      smart_format: "true",
      diarize: "true",
      punctuate: "true",
      paragraphs: "true",
    });

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.ai.transcription.deepgram.apiKey}`,
        "Content-Type": mimeType || "application/octet-stream",
      },
      body: audio,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AppError(502, "STT_ERROR", json?.err_msg || json?.reason || `Transcription failed (${res.status})`);
    }

    const alt = json?.results?.channels?.[0]?.alternatives?.[0];
    const durationSeconds = json?.metadata?.duration ? Math.round(json.metadata.duration) : null;
    const text = formatDiarized(alt) || alt?.transcript || "";
    logger.info(`Deepgram transcription complete (${durationSeconds ?? "?"}s)`);
    return { text, durationSeconds };
  },
};

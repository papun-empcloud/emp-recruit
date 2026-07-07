// ============================================================================
// SPEECH-TO-TEXT REGISTRY
// ============================================================================
// Resolves the active STT provider from config.ai.transcription.provider and
// exposes the wrappers recording.service uses. Falls back to local Whisper so
// transcription always works, and upgrades to Deepgram/OpenAI when keyed.
// ============================================================================

import { config } from "../../../config";
import { logger } from "../../../utils/logger";
import type { STTProvider, STTProviderKey, TranscriptionResult } from "./types";
import { deepgramProvider } from "./deepgram.service";
import { openaiWhisperProvider } from "./openai.adapter";
import { localWhisperProvider } from "./local.adapter";

const registry: Record<STTProviderKey, STTProvider> = {
  deepgram: deepgramProvider,
  openai: openaiWhisperProvider,
  local: localWhisperProvider,
};

export function resolveTranscriptionProvider(): STTProvider {
  const key = config.ai.transcription.provider as STTProviderKey;
  const provider = registry[key];
  if (!provider) {
    logger.warn(`Unknown STT provider "${key}"; using local Whisper`);
    return localWhisperProvider;
  }
  if (!provider.isConfigured()) {
    logger.warn(`STT provider "${key}" is not configured; using local Whisper`);
    return localWhisperProvider;
  }
  return provider;
}

/** Transcription is always available now (local Whisper needs no key). */
export function isTranscriptionEnabled(): boolean {
  return true;
}

export async function transcribeFile(
  filePath: string,
  mimeType: string | null,
): Promise<TranscriptionResult> {
  return resolveTranscriptionProvider().transcribe(filePath, mimeType);
}

export type { TranscriptionResult } from "./types";

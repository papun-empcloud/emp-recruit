// ============================================================================
// SPEECH-TO-TEXT PROVIDER — adapter interface
// ============================================================================
// One interface, swappable engines: local Whisper (on-device, no key), Deepgram
// or OpenAI Whisper (cloud, need a key). Selected via config.ai.transcription.
// ============================================================================

export interface TranscriptionResult {
  text: string;
  durationSeconds: number | null;
}

export type STTProviderKey = "local" | "deepgram" | "openai";

export interface STTProvider {
  key: STTProviderKey;
  /** Cloud providers need a key; local is always available. */
  isConfigured(): boolean;
  /** Transcribe an audio/video file to text. */
  transcribe(filePath: string, mimeType: string | null): Promise<TranscriptionResult>;
}

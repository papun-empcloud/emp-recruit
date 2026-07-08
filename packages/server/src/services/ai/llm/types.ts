// ============================================================================
// LLM PROVIDER — adapter interface
// ============================================================================
// One interface, swappable providers (Anthropic Claude, OpenAI, or any
// OpenAI-compatible endpoint). Used by AI candidate evaluation and, later,
// resume scoring. Selected via config.ai.provider.
// ============================================================================

// "compatible" is an alias for the OpenAI-compatible adapter (OpenRouter,
// Together, Groq, local, …) — same wire format, just a different base URL.
export type LLMProviderKey = "anthropic" | "openai" | "compatible" | "none";

export interface LLMCompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Ask the provider to return strict JSON when supported. */
  json?: boolean;
}

export interface LLMProvider {
  key: LLMProviderKey;
  /** True when the provider has the credentials it needs. */
  isConfigured(): boolean;
  /** Which model this provider will use (for auditing/storage). */
  model(): string;
  /** Single-shot completion; returns the raw assistant text. */
  complete(req: LLMCompletionRequest): Promise<string>;
}

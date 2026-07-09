// ============================================================================
// OPENAI-COMPATIBLE LLM ADAPTER
// ============================================================================
// Talks to any /v1/chat/completions endpoint via config.ai.openai.baseUrl, so
// the same adapter covers OpenAI, Together, Groq, OpenRouter, and local models.
// Raw fetch — no SDK dependency.
// ============================================================================

import { config } from "../../../config";
import { AppError } from "../../../utils/errors";
import type { LLMCompletionRequest, LLMProvider } from "./types";

export const openaiProvider: LLMProvider = {
  key: "openai",

  isConfigured(): boolean {
    return !!config.ai.openai.apiKey;
  },

  model(): string {
    return config.ai.openai.model;
  },

  async complete(req: LLMCompletionRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model: config.ai.openai.model,
      max_tokens: req.maxTokens ?? 4096,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
    };
    if (req.json) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${config.ai.openai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.openai.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error ?? {};
      // Surface the upstream reason (e.g. OpenRouter's "rate-limited upstream")
      // instead of a generic "Provider returned error".
      const detail = e.metadata?.raw || e.message || `request failed (${res.status})`;
      const code = e.code || res.status;
      throw new AppError(502, "LLM_ERROR", `LLM provider error (${code}): ${detail}`);
    }
    return (json.choices?.[0]?.message?.content ?? "").trim();
  },
};

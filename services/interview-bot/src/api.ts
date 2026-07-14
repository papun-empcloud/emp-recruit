// Client for the emp-recruit public AI-interview endpoints. The bot reuses the
// exact same session the in-app interview uses — it just drives it by voice from
// inside a meeting instead of the candidate typing/speaking in the web page.

import { config } from "./config.js";

export interface InterviewState {
  status: "pending" | "in_progress" | "completed";
  candidate_name: string;
  job_title: string | null;
  total: number;
  current_index: number;
  question: string | null;
  done: boolean;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${method} ${path} -> ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export const api = {
  getState: (token: string) => request<InterviewState>("GET", `/public/ai-interviews/${token}`),
  submitAnswer: (token: string, answer: string) =>
    request<{ done: boolean; current_index: number; question: string | null }>(
      "POST",
      `/public/ai-interviews/${token}/answer`,
      { answer },
    ),
  complete: (token: string) =>
    request<{ status: "completed"; overall_score?: number }>(
      "POST",
      `/public/ai-interviews/${token}/complete`,
    ),
};

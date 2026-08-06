// ============================================================================
// SCREENING QUESTIONS SERVICE (029)
// Job-specific application questions + candidate answers, with optional
// "knockout" questions that flag an application for auto-rejection.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import type { IDBAdapter } from "../../db/adapters/interface";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type { JobScreeningQuestion, JobPosting } from "@emp-recruit/shared";

type QuestionInput = {
  question: string;
  type: "text" | "number" | "yes_no" | "single_choice";
  options?: string[];
  required: boolean;
  is_knockout: boolean;
  knockout_value?: string;
  sort_order: number;
};

function parseOptions(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function rowToQuestion(row: any): JobScreeningQuestion {
  return { ...row, options: parseOptions(row.options), required: !!row.required, is_knockout: !!row.is_knockout };
}

/** Admin: the screening questions configured on a job, in display order. */
export async function getJobQuestions(orgId: number, jobId: string): Promise<JobScreeningQuestion[]> {
  const db = getDB();
  const result = await db.findMany<any>("job_screening_questions", {
    filters: { organization_id: orgId, job_id: jobId },
    sort: { field: "sort_order", order: "asc" },
    limit: 100,
  });
  return result.data.map(rowToQuestion);
}

/** Replace the full ordered set of screening questions on a job. */
export async function setJobQuestions(
  orgId: number,
  jobId: string,
  questions: QuestionInput[],
): Promise<JobScreeningQuestion[]> {
  const db = getDB();
  const job = await db.findOne<JobPosting>("job_postings", { id: jobId, organization_id: orgId });
  if (!job) throw new NotFoundError("Job", jobId);

  // Simplest correct approach: clear existing and re-insert in order.
  const existing = await db.findMany<any>("job_screening_questions", {
    filters: { organization_id: orgId, job_id: jobId },
    limit: 100,
  });
  for (const q of existing.data) {
    await db.delete("job_screening_questions", q.id);
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await db.create("job_screening_questions", {
      id: uuidv4(),
      organization_id: orgId,
      job_id: jobId,
      question: q.question,
      type: q.type,
      options: q.type === "single_choice" && q.options ? JSON.stringify(q.options) : null,
      required: q.required,
      is_knockout: q.is_knockout,
      knockout_value: q.is_knockout ? q.knockout_value ?? null : null,
      sort_order: q.sort_order ?? i,
    } as any);
  }

  return getJobQuestions(orgId, jobId);
}

/**
 * Public (apply form): the questions a candidate must answer. Never exposes the
 * knockout flag or the disqualifying value — that's internal to the recruiter.
 */
export async function getPublicJobQuestions(
  jobId: string,
): Promise<Array<Pick<JobScreeningQuestion, "id" | "question" | "type" | "options" | "required">>> {
  const db = getDB();
  const result = await db.findMany<any>("job_screening_questions", {
    filters: { job_id: jobId },
    sort: { field: "sort_order", order: "asc" },
    limit: 100,
  });
  return result.data.map((row) => ({
    id: row.id,
    question: row.question,
    type: row.type,
    options: parseOptions(row.options),
    required: !!row.required,
  }));
}

export interface PreparedAnswers {
  rows: Array<{ question_id: string; question_text: string; answer: string | null; knockout_failed: boolean }>;
  knockoutFailed: boolean;
}

/**
 * Validate a candidate's answers against a job's questions BEFORE the
 * application is created: required questions must be answered. Also computes
 * per-answer knockout results. Throws ValidationError on a missing required
 * answer so the applicant gets a clear message and no orphan application.
 */
export async function prepareAnswers(
  jobId: string,
  answers: Array<{ question_id: string; answer?: string }>,
): Promise<PreparedAnswers> {
  const db = getDB();
  const result = await db.findMany<any>("job_screening_questions", {
    filters: { job_id: jobId },
    sort: { field: "sort_order", order: "asc" },
    limit: 100,
  });
  const questions = result.data.map(rowToQuestion);
  if (questions.length === 0) return { rows: [], knockoutFailed: false };

  const byId = new Map(answers.map((a) => [a.question_id, (a.answer ?? "").trim()]));
  const rows: PreparedAnswers["rows"] = [];
  const missing: Record<string, string[]> = {};
  let knockoutFailed = false;

  for (const q of questions) {
    const answer = byId.get(q.id) ?? "";
    if (q.required && answer === "") {
      missing[`screening.${q.id}`] = ["This question is required"];
      continue;
    }
    const failed =
      q.is_knockout &&
      q.knockout_value != null &&
      answer !== "" &&
      answer.toLowerCase() === q.knockout_value.trim().toLowerCase();
    if (failed) knockoutFailed = true;
    rows.push({
      question_id: q.id,
      question_text: q.question,
      answer: answer === "" ? null : answer,
      knockout_failed: failed,
    });
  }

  if (Object.keys(missing).length > 0) {
    throw new ValidationError("Please answer all required screening questions", missing);
  }
  return { rows, knockoutFailed };
}

/** Persist prepared answers for an application. */
export async function storeAnswers(
  orgId: number,
  applicationId: string,
  rows: PreparedAnswers["rows"],
  database?: IDBAdapter,
): Promise<void> {
  if (rows.length === 0) return;
  const db = database ?? getDB();
  for (const r of rows) {
    await db.create("application_screening_answers", {
      id: uuidv4(),
      organization_id: orgId,
      application_id: applicationId,
      question_id: r.question_id,
      question_text: r.question_text,
      answer: r.answer,
      knockout_failed: r.knockout_failed,
    } as any);
  }
}

/** Admin: a candidate's stored screening answers for an application. */
export async function getApplicationAnswers(orgId: number, applicationId: string) {
  const db = getDB();
  const result = await db.findMany<any>("application_screening_answers", {
    filters: { organization_id: orgId, application_id: applicationId },
    sort: { field: "created_at", order: "asc" },
    limit: 100,
  });
  return result.data.map((r) => ({ ...r, knockout_failed: !!r.knockout_failed }));
}

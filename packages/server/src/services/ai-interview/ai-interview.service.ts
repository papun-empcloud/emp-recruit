// ============================================================================
// AI VOICE INTERVIEW
// ============================================================================
// A self-contained AI interviewer. For an application it generates resume- and
// job-tailored questions, the candidate answers them over a public token link
// (voice via the browser, or typed), and an LLM — with a deterministic fallback
// so it works with no AI provider — produces a scored evaluation.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { getLLM } from "../ai/llm";
import { parseResumeText } from "../scoring/resume-scoring.service";

export interface AiInterviewQuestion {
  id: string;
  text: string;
}

interface AiInterviewRow {
  id: string;
  organization_id: number;
  application_id: string;
  candidate_id: string;
  job_id: string | null;
  token: string;
  status: "pending" | "in_progress" | "completed";
  questions: any;
  current_index: number;
  overall_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  concerns: string | null;
  summary: string | null;
  provider: string | null;
  model: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AiInterviewMessage {
  id: string;
  ai_interview_id: string;
  role: "ai" | "candidate";
  question_index: number | null;
  content: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArrayColumn(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseSkills(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function getQuestions(row: AiInterviewRow): AiInterviewQuestion[] {
  return parseArrayColumn(row.questions).filter(
    (q): q is AiInterviewQuestion => q && typeof q.text === "string",
  );
}

function recommendationFor(score: number): string {
  if (score >= 85) return "strong_yes";
  if (score >= 70) return "yes";
  if (score >= 50) return "neutral";
  if (score >= 30) return "no";
  return "strong_no";
}

/** Pull a JSON array out of an LLM response that may include fences/prose. */
function parseJsonArray(raw: string): any[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced ? fenced[1] : raw;
  const s = c.indexOf("[");
  const e = c.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("No JSON array in LLM response");
  const parsed = JSON.parse(c.slice(s, e + 1));
  return Array.isArray(parsed) ? parsed : [];
}

/** Pull a JSON object out of an LLM response that may include fences/prose. */
function parseJsonObject(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced ? fenced[1] : raw;
  const s = c.indexOf("{");
  const e = c.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(c.slice(s, e + 1));
}

// ---------------------------------------------------------------------------
// Question generation (LLM + deterministic fallback)
// ---------------------------------------------------------------------------

const QUESTION_SYSTEM = `You are an expert technical interviewer. Given a job and a candidate's resume, write focused interview questions tailored to THIS candidate — probe the specific skills, projects, and gaps you see. Mix technical and behavioral. Reply with ONLY a JSON array of 6 question strings, no prose, no markdown.`;

function fallbackQuestions(job: any, jobSkills: string[]): AiInterviewQuestion[] {
  const title = job?.title || "this role";
  const texts: string[] = [];
  texts.push(`To start, tell me about yourself and the experience that's most relevant to the ${title} role.`);
  for (const skill of jobSkills.slice(0, 3)) {
    texts.push(`Can you describe your hands-on experience with ${skill}, with a specific example of how you used it?`);
  }
  texts.push(`Walk me through a challenging project relevant to ${title} — your role, the approach you took, and the outcome.`);
  texts.push(`Tell me about a time you faced a difficult problem or a tight deadline. How did you handle it?`);
  texts.push(`Why are you interested in the ${title} role, and what would you most want to contribute?`);
  return texts.map((text, i) => ({ id: `q${i + 1}`, text }));
}

async function generateQuestions(
  job: any,
  jobSkills: string[],
  resumeText: string,
): Promise<AiInterviewQuestion[]> {
  const llm = getLLM();
  if (llm && (resumeText.trim() || job?.title)) {
    try {
      const prompt = [
        `JOB TITLE: ${job?.title ?? ""}`,
        `DESCRIPTION: ${(job?.description ?? "").slice(0, 1500)}`,
        `REQUIREMENTS: ${(job?.requirements ?? "").slice(0, 1000)}`,
        `REQUIRED SKILLS: ${jobSkills.join(", ")}`,
        "",
        `CANDIDATE RESUME (excerpt):`,
        resumeText.slice(0, 3500) || "(no resume on file — ask general and role-based questions)",
        "",
        `Write 6 tailored interview questions. Return ONLY a JSON array of 6 strings.`,
      ].join("\n");
      const raw = await llm.complete({ system: QUESTION_SYSTEM, prompt, json: true, maxTokens: 900 });
      const arr = parseJsonArray(raw)
        .filter((x) => typeof x === "string" && x.trim())
        .slice(0, 8)
        .map((text: string, i: number) => ({ id: `q${i + 1}`, text: String(text).trim() }));
      if (arr.length >= 3) {
        logger.info(`AI interview questions generated via ${llm.key} (${arr.length})`);
        return arr;
      }
    } catch (err) {
      logger.warn("AI interview question generation failed; using fallback:", err);
    }
  }
  return fallbackQuestions(job, jobSkills);
}

// ---------------------------------------------------------------------------
// Evaluation (LLM + deterministic fallback)
// ---------------------------------------------------------------------------

const EVAL_SYSTEM = `You are an expert interview assessor. You are given a job and a transcript of an AI-led interview (each question and the candidate's answer). Evaluate ONLY on the evidence in the answers — never invent facts. Reply with ONLY a JSON object with exactly these keys:
{
  "overall_score": integer 0-100,
  "recommendation": one of "strong_yes" | "yes" | "neutral" | "no" | "strong_no",
  "strengths": string (2-4 sentences),
  "concerns": string (2-4 sentences),
  "summary": string (3-5 sentences)
}`;

interface EvalResult {
  overall_score: number;
  recommendation: string;
  strengths: string;
  concerns: string;
  summary: string;
  provider: string;
  model: string | null;
}

function heuristicEvaluation(
  questions: AiInterviewQuestion[],
  answers: AiInterviewMessage[],
): EvalResult {
  const totalQ = Math.max(questions.length, 1);
  const answered = answers.filter((a) => a.content.trim().length > 0).length;
  const avgLen = answered
    ? answers.reduce((sum, a) => sum + a.content.trim().length, 0) / answered
    : 0;
  const completeness = Math.round((answered / totalQ) * 60); // 0-60
  const substance = Math.min(40, Math.round(avgLen / 10)); // ~400 chars => full 40
  const overall = Math.min(100, completeness + substance);
  return {
    overall_score: overall,
    recommendation: recommendationFor(overall),
    strengths:
      answered > 0
        ? `The candidate engaged with ${answered} of ${totalQ} questions with an average answer length of ${Math.round(avgLen)} characters.`
        : "The candidate did not provide substantive answers.",
    concerns:
      "This is an automated completion score (no AI provider is configured), based on how fully the candidate answered — it does not assess answer correctness. Enable AI_PROVIDER for a content-based evaluation.",
    summary: `Automated summary: ${answered}/${totalQ} questions answered. Review the transcript below for the candidate's responses.`,
    provider: "heuristic",
    model: null,
  };
}

async function evaluate(
  job: any,
  questions: AiInterviewQuestion[],
  messages: AiInterviewMessage[],
): Promise<EvalResult> {
  const answers = messages.filter((m) => m.role === "candidate");
  const llm = getLLM();
  if (llm && answers.some((a) => a.content.trim().length > 0)) {
    try {
      const transcript = questions
        .map((q, i) => {
          const ans = messages.find((m) => m.role === "candidate" && m.question_index === i);
          return `Q${i + 1}: ${q.text}\nA${i + 1}: ${ans?.content?.trim() || "(no answer)"}`;
        })
        .join("\n\n");
      const prompt = `JOB: ${job?.title ?? ""}\nREQUIREMENTS: ${(job?.requirements ?? "").slice(0, 800)}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`;
      const raw = await llm.complete({ system: EVAL_SYSTEM, prompt, json: true, maxTokens: 1200 });
      const p = parseJsonObject(raw);
      const overall = Math.max(0, Math.min(100, Math.round(Number(p.overall_score))));
      if (Number.isFinite(overall)) {
        return {
          overall_score: overall,
          recommendation:
            typeof p.recommendation === "string" ? p.recommendation : recommendationFor(overall),
          strengths: String(p.strengths ?? ""),
          concerns: String(p.concerns ?? ""),
          summary: String(p.summary ?? ""),
          provider: llm.key,
          model: llm.model(),
        };
      }
    } catch (err) {
      logger.warn("AI interview evaluation failed; using heuristic:", err);
    }
  }
  return heuristicEvaluation(questions, answers);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** HR: create an AI interview session for an application (generates questions). */
export async function createSession(orgId: number, applicationId: string): Promise<AiInterviewRow & { questions: AiInterviewQuestion[] }> {
  const db = getDB();

  const application = await db.findOne<{ id: string; candidate_id: string; job_id: string | null }>(
    "applications",
    { id: applicationId, organization_id: orgId },
  );
  if (!application) throw new NotFoundError("Application", applicationId);

  const candidate = await db.findById<{ resume_path: string | null }>("candidates", application.candidate_id);
  if (!candidate) throw new NotFoundError("Candidate", application.candidate_id);

  const job = application.job_id
    ? await db.findById<any>("job_postings", application.job_id)
    : null;
  const jobSkills = parseSkills(job?.skills);

  let resumeText = "";
  if (candidate.resume_path) {
    try {
      resumeText = await parseResumeText(candidate.resume_path);
    } catch (err) {
      logger.warn(`AI interview: failed to parse resume for candidate ${application.candidate_id}:`, err);
    }
  }

  const questions = await generateQuestions(job, jobSkills, resumeText);

  const now = new Date();
  const id = uuidv4();
  const token = uuidv4().replace(/-/g, "");
  await db.create<AiInterviewRow>("ai_interviews", {
    id,
    organization_id: orgId,
    application_id: applicationId,
    candidate_id: application.candidate_id,
    job_id: application.job_id ?? null,
    token,
    status: "pending",
    questions: JSON.stringify(questions) as any,
    current_index: 0,
    created_at: now,
    updated_at: now,
  } as Partial<AiInterviewRow>);

  const created = await db.findOne<AiInterviewRow>("ai_interviews", { id, organization_id: orgId });
  logger.info(`AI interview session ${id} created for application ${applicationId} (${questions.length} questions)`);
  return { ...(created as AiInterviewRow), questions };
}

async function loadByToken(token: string): Promise<AiInterviewRow> {
  const db = getDB();
  const session = await db.findOne<AiInterviewRow>("ai_interviews", { token });
  if (!session) throw new NotFoundError("AI interview", token);
  return session;
}

/** Candidate (public): current state of the interview. */
export async function getPublicState(token: string) {
  const db = getDB();
  const session = await loadByToken(token);
  const questions = getQuestions(session);
  const candidate = await db.findById<{ first_name: string; last_name: string }>(
    "candidates",
    session.candidate_id,
  );
  const job = session.job_id ? await db.findById<{ title: string }>("job_postings", session.job_id) : null;

  const done = session.status === "completed" || session.current_index >= questions.length;
  return {
    status: session.status,
    candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : "Candidate",
    job_title: job?.title ?? null,
    total: questions.length,
    current_index: session.current_index,
    question: done ? null : questions[session.current_index]?.text ?? null,
    done,
  };
}

/** Candidate (public): record the answer to the current question, advance. */
export async function submitAnswer(token: string, answer: string) {
  const db = getDB();
  const session = await loadByToken(token);
  if (session.status === "completed") {
    throw new ValidationError("This interview has already been completed");
  }
  const questions = getQuestions(session);
  const index = session.current_index;
  if (index >= questions.length) {
    return { done: true, current_index: index, question: null as string | null };
  }

  const now = new Date();
  // Record the question that was asked (once) and the candidate's answer.
  await db.create<AiInterviewMessage>("ai_interview_messages", {
    id: uuidv4(),
    ai_interview_id: session.id,
    role: "ai",
    question_index: index,
    content: questions[index].text,
    created_at: now,
  } as Partial<AiInterviewMessage>);
  await db.create<AiInterviewMessage>("ai_interview_messages", {
    id: uuidv4(),
    ai_interview_id: session.id,
    role: "candidate",
    question_index: index,
    content: (answer || "").trim(),
    created_at: new Date(now.getTime() + 1),
  } as Partial<AiInterviewMessage>);

  const nextIndex = index + 1;
  await db.update("ai_interviews", session.id, {
    current_index: nextIndex,
    status: "in_progress",
    started_at: session.started_at ?? now,
    updated_at: now,
  });

  const done = nextIndex >= questions.length;
  return {
    done,
    current_index: nextIndex,
    question: done ? null : questions[nextIndex]?.text ?? null,
  };
}

/** Candidate (public): finish the interview and generate the evaluation. */
export async function completeSession(token: string) {
  const db = getDB();
  const session = await loadByToken(token);
  if (session.status === "completed") {
    return { status: "completed" as const };
  }

  const questions = getQuestions(session);
  const messagesResult = await db.findMany<AiInterviewMessage>("ai_interview_messages", {
    filters: { ai_interview_id: session.id },
    sort: { field: "created_at", order: "asc" },
    limit: 500,
  });

  const job = session.job_id ? await db.findById<any>("job_postings", session.job_id) : null;
  const evaluation = await evaluate(job, questions, messagesResult.data);

  const now = new Date();
  await db.update("ai_interviews", session.id, {
    status: "completed",
    overall_score: evaluation.overall_score,
    recommendation: evaluation.recommendation,
    strengths: evaluation.strengths,
    concerns: evaluation.concerns,
    summary: evaluation.summary,
    provider: evaluation.provider,
    model: evaluation.model,
    completed_at: now,
    updated_at: now,
  });
  logger.info(`AI interview ${session.id} completed — ${evaluation.overall_score}/100 (${evaluation.provider})`);
  return { status: "completed" as const, overall_score: evaluation.overall_score };
}

// ---------------------------------------------------------------------------
// HR views
// ---------------------------------------------------------------------------

export async function listSessions(
  orgId: number,
  params: { page?: number; limit?: number; status?: string },
) {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;

  const result = await db.findMany<AiInterviewRow>("ai_interviews", {
    filters,
    page: params.page || 1,
    limit: params.limit || 20,
    sort: { field: "created_at", order: "desc" },
  });

  const data = await Promise.all(
    result.data.map(async (s) => {
      const candidate = await db.findById<{ first_name: string; last_name: string }>(
        "candidates",
        s.candidate_id,
      );
      const job = s.job_id ? await db.findById<{ title: string }>("job_postings", s.job_id) : null;
      return {
        id: s.id,
        status: s.status,
        candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : "Unknown",
        job_title: job?.title ?? null,
        token: s.token,
        overall_score: s.overall_score,
        recommendation: s.recommendation,
        total_questions: getQuestions(s).length,
        created_at: s.created_at,
        completed_at: s.completed_at,
      };
    }),
  );

  return { data, total: result.total, page: result.page, perPage: result.limit, totalPages: result.totalPages };
}

export async function getSession(orgId: number, id: string) {
  const db = getDB();
  const session = await db.findOne<AiInterviewRow>("ai_interviews", { id, organization_id: orgId });
  if (!session) throw new NotFoundError("AI interview", id);

  const candidate = await db.findById<{ first_name: string; last_name: string; email: string }>(
    "candidates",
    session.candidate_id,
  );
  const job = session.job_id ? await db.findById<{ title: string }>("job_postings", session.job_id) : null;
  const messagesResult = await db.findMany<AiInterviewMessage>("ai_interview_messages", {
    filters: { ai_interview_id: session.id },
    sort: { field: "created_at", order: "asc" },
    limit: 500,
  });

  const questions = getQuestions(session);
  const transcript = questions.map((q, i) => ({
    question: q.text,
    answer:
      messagesResult.data.find((m) => m.role === "candidate" && m.question_index === i)?.content ?? null,
  }));

  return {
    id: session.id,
    application_id: session.application_id,
    candidate_id: session.candidate_id,
    candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : "Unknown",
    candidate_email: candidate?.email ?? null,
    job_title: job?.title ?? null,
    token: session.token,
    status: session.status,
    total_questions: questions.length,
    answered: transcript.filter((t) => t.answer && t.answer.trim().length > 0).length,
    overall_score: session.overall_score,
    recommendation: session.recommendation,
    strengths: session.strengths,
    concerns: session.concerns,
    summary: session.summary,
    provider: session.provider,
    started_at: session.started_at,
    completed_at: session.completed_at,
    created_at: session.created_at,
    transcript,
  };
}

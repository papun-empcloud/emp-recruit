// ============================================================================
// PSYCHOMETRIC ASSESSMENT SERVICE
// Manages assessment templates, candidate invitations, test-taking, auto-scoring.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  AssessmentTemplate,
  CandidateAssessment,
  AssessmentResponse,
  AssessmentType,
  AssessmentQuestion,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function createTemplate(
  orgId: number,
  data: {
    name: string;
    description?: string;
    assessment_type: AssessmentType;
    time_limit_minutes?: number;
    questions: AssessmentQuestion[];
  },
): Promise<AssessmentTemplate> {
  const db = getDB();

  if (!data.questions || data.questions.length === 0) {
    throw new ValidationError("At least one question is required");
  }

  const id = uuidv4();

  const record = await db.create<AssessmentTemplate>("assessment_templates", {
    id,
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    assessment_type: data.assessment_type,
    time_limit_minutes: data.time_limit_minutes ?? null,
    questions: JSON.stringify(data.questions),
    is_active: true,
  } as any);

  return record;
}

export async function listTemplates(
  orgId: number,
  options?: { assessment_type?: AssessmentType },
): Promise<AssessmentTemplate[]> {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId, is_active: true };
  if (options?.assessment_type) filters.assessment_type = options.assessment_type;

  const result = await db.findMany<AssessmentTemplate>("assessment_templates", {
    filters,
    limit: 100,
    sort: { field: "created_at", order: "desc" },
  });
  return result.data;
}

export async function getTemplate(
  orgId: number,
  templateId: string,
): Promise<AssessmentTemplate> {
  const db = getDB();
  const template = await db.findOne<AssessmentTemplate>("assessment_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("Assessment template", templateId);
  return template;
}

// ---------------------------------------------------------------------------
// Invite Candidate
// ---------------------------------------------------------------------------

export async function inviteCandidate(
  orgId: number,
  data: {
    candidate_id: string;
    template_id: string;
  },
): Promise<CandidateAssessment> {
  const db = getDB();

  // Verify candidate
  const candidate = await db.findOne<any>("candidates", {
    id: data.candidate_id,
    organization_id: orgId,
  });
  if (!candidate) throw new NotFoundError("Candidate", data.candidate_id);

  // Verify template
  const template = await db.findOne<AssessmentTemplate>("assessment_templates", {
    id: data.template_id,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("Assessment template", data.template_id);

  // Check for existing active assessment
  const existing = await db.findOne<CandidateAssessment>("candidate_assessments", {
    candidate_id: data.candidate_id,
    template_id: data.template_id,
    organization_id: orgId,
  });
  if (existing && (existing.status === "invited" || existing.status === "started")) {
    throw new ValidationError("Candidate already has an active assessment for this template");
  }

  const id = uuidv4();
  const token = crypto.randomBytes(48).toString("hex");

  // Calculate max_score from the template questions
  const questions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;
  const maxScore = questions.filter((q) => q.correct_answer !== undefined && q.correct_answer !== null).length;

  const record = await db.create<CandidateAssessment>("candidate_assessments", {
    id,
    organization_id: orgId,
    candidate_id: data.candidate_id,
    template_id: data.template_id,
    status: "invited",
    token,
    started_at: null,
    completed_at: null,
    score: null,
    max_score: maxScore || null,
    percentile: null,
    result_summary: null,
  } as any);

  logger.info(
    `Assessment invitation sent: ${id} for candidate ${data.candidate_id}, template ${data.template_id}`,
  );

  return record;
}

// ---------------------------------------------------------------------------
// Take Assessment (PUBLIC — via token)
// ---------------------------------------------------------------------------

/**
 * Get assessment questions for a candidate (via token). Starts the assessment.
 */
export async function getAssessmentByToken(
  token: string,
): Promise<{
  assessment: CandidateAssessment;
  template: { name: string; description: string | null; assessment_type: string; time_limit_minutes: number | null };
  questions: Array<{ index: number; question: string; options: string[]; type: string }>;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", { token });
  if (!assessment) throw new NotFoundError("Assessment");

  if (assessment.status === "completed") {
    throw new ValidationError("This assessment has already been completed");
  }

  if (assessment.status === "expired") {
    throw new ValidationError("This assessment has expired");
  }

  // Mark as started if not already
  if (assessment.status === "invited") {
    await db.update<CandidateAssessment>("candidate_assessments", assessment.id, {
      status: "started",
      started_at: new Date(),
    } as any);
    assessment.status = "started" as any;
    assessment.started_at = new Date().toISOString();
  }

  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  // Parse questions and strip correct answers (candidates must not see them)
  const allQuestions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;

  const questions = allQuestions.map((q, index) => ({
    index,
    question: q.question,
    options: q.options || [],
    type: q.type,
  }));

  return {
    assessment,
    template: {
      name: template.name,
      description: template.description,
      assessment_type: template.assessment_type,
      time_limit_minutes: template.time_limit_minutes,
    },
    questions,
  };
}

// ---------------------------------------------------------------------------
// Submit Assessment (PUBLIC — via token)
// ---------------------------------------------------------------------------

export async function submitAssessment(
  token: string,
  answers: Array<{ question_index: number; answer: string; time_taken_seconds?: number }>,
): Promise<{
  score: number;
  max_score: number;
  percentile: number | null;
  result_summary: Record<string, any>;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", { token });
  if (!assessment) throw new NotFoundError("Assessment");

  if (assessment.status === "completed") {
    throw new ValidationError("This assessment has already been submitted");
  }

  if (assessment.status === "expired") {
    throw new ValidationError("This assessment has expired");
  }

  if (assessment.status === "invited") {
    throw new ValidationError("Assessment must be started before submitting");
  }

  // Get template and questions
  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  // Enforce the time limit server-side (audit L12) — it was returned to the
  // client but never checked, so a candidate could submit long after it passed.
  if (template.time_limit_minutes && assessment.started_at) {
    const elapsedMin = (Date.now() - new Date(assessment.started_at).getTime()) / 60000;
    if (elapsedMin > template.time_limit_minutes) {
      await db.update("candidate_assessments", assessment.id, { status: "expired" } as any);
      throw new ValidationError("The time limit for this assessment has passed");
    }
  }

  const allQuestions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;

  // Score the assessment
  let correctCount = 0;
  let scoredCount = 0;

  for (const ans of answers) {
    if (ans.question_index < 0 || ans.question_index >= allQuestions.length) continue;

    const question = allQuestions[ans.question_index];
    let isCorrect: boolean | null = null;

    // Auto-score if question has a correct answer
    if (question.correct_answer !== undefined && question.correct_answer !== null) {
      isCorrect = String(ans.answer).toLowerCase().trim() === String(question.correct_answer).toLowerCase().trim();
      scoredCount++;
      if (isCorrect) correctCount++;
    }

    // Save response
    await db.create<AssessmentResponse>("assessment_responses", {
      id: uuidv4(),
      assessment_id: assessment.id,
      organization_id: assessment.organization_id,
      question_index: ans.question_index,
      answer: ans.answer,
      is_correct: isCorrect,
      time_taken_seconds: ans.time_taken_seconds ?? null,
    } as any);
  }

  // Calculate score. max_score is the number of scorable questions in the
  // TEMPLATE — not just the ones the candidate answered — otherwise a candidate
  // who answers only the one question they know and skips the rest scores 100%
  // (audit H9). Unanswered scorable questions count against them.
  const maxScore = allQuestions.filter(
    (q) => q.correct_answer !== undefined && q.correct_answer !== null,
  ).length;
  const score = correctCount;

  // Calculate percentile based on other assessments for this template
  let percentile: number | null = null;
  try {
    const prevScores = await db.raw<any[][]>(
      `SELECT score FROM candidate_assessments
       WHERE template_id = ? AND organization_id = ? AND status = 'completed' AND score IS NOT NULL`,
      [assessment.template_id, assessment.organization_id],
    );
    const scores = (prevScores[0] || []) as Array<{ score: number }>;
    if (scores.length > 0) {
      const below = scores.filter((s) => s.score < score).length;
      percentile = Math.round((below / scores.length) * 100);
    }
  } catch (err) {
    logger.warn("Failed to calculate percentile:", err);
  }

  // Build result summary
  const totalTimeTaken = answers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0);
  const resultSummary = {
    total_questions: allQuestions.length,
    answered: answers.length,
    correct: correctCount,
    incorrect: scoredCount - correctCount,
    unanswered: allQuestions.length - answers.length,
    score_percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    total_time_seconds: totalTimeTaken,
    average_time_per_question: answers.length > 0 ? Math.round(totalTimeTaken / answers.length) : 0,
  };

  // Update assessment record
  await db.update<CandidateAssessment>("candidate_assessments", assessment.id, {
    status: "completed",
    completed_at: new Date(),
    score,
    max_score: maxScore,
    percentile,
    result_summary: JSON.stringify(resultSummary),
  } as any);

  logger.info(
    `Assessment completed: ${assessment.id} — score: ${score}/${maxScore}`,
  );

  return {
    score,
    max_score: maxScore,
    percentile,
    result_summary: resultSummary,
  };
}

// ---------------------------------------------------------------------------
// Get Results (Admin)
// ---------------------------------------------------------------------------

export async function getAssessmentResults(
  orgId: number,
  assessmentId: string,
): Promise<{
  assessment: CandidateAssessment;
  responses: AssessmentResponse[];
  template: AssessmentTemplate;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", {
    id: assessmentId,
    organization_id: orgId,
  });
  if (!assessment) throw new NotFoundError("Assessment", assessmentId);

  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  const responsesResult = await db.findMany<AssessmentResponse>("assessment_responses", {
    filters: { assessment_id: assessmentId, organization_id: orgId },
    limit: 500,
    sort: { field: "question_index", order: "asc" },
  });

  return {
    assessment,
    responses: responsesResult.data,
    template,
  };
}

export async function listCandidateAssessments(
  orgId: number,
  candidateId: string,
): Promise<CandidateAssessment[]> {
  const db = getDB();
  const result = await db.findMany<CandidateAssessment>("candidate_assessments", {
    filters: { organization_id: orgId, candidate_id: candidateId },
    sort: { field: "created_at", order: "desc" },
    limit: 100,
  });
  return result.data;
}

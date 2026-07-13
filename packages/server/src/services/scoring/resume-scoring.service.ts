import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import { getDB } from "../../db/adapters";
import { NotFoundError } from "../../utils/errors";
import { ALL_SKILLS } from "@emp-recruit/shared";
import type {
  CandidateScore,
  Candidate,
  JobPosting,
  Application,
  ScoringRecommendation,
} from "@emp-recruit/shared";
import { logger } from "../../utils/logger";
import { getLLM } from "../ai/llm";
import { config } from "../../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreResult {
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: ScoringRecommendation;
}

// ---------------------------------------------------------------------------
// Resume Text Extraction (basic MVP — no external libs)
// ---------------------------------------------------------------------------

/**
 * Extract raw text from a resume file.
 * - PDF: read raw buffer and extract visible text between stream markers
 * - DOCX: read the XML content inside the zip and strip tags
 * - TXT/other: read as UTF-8
 */
export async function parseResumeText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  // resume_path is stored app-relative (e.g. "/uploads/resumes/x.pdf"). A leading
  // "/" makes path.isAbsolute() true on Linux and resolves to the filesystem root
  // (file-not-found), so career-page / public résumés never parsed on the server
  // and those resume-only applicants scored 0. Strip leading separators and always
  // resolve against the server's working directory.
  const absolutePath = path.join(process.cwd(), filePath.replace(/^[/\\]+/, ""));

  try {
    await fs.access(absolutePath);
  } catch {
    logger.warn(`Resume file not found: ${absolutePath}`);
    return "";
  }

  if (ext === ".pdf") {
    return extractTextFromPDF(absolutePath);
  }

  if (ext === ".docx") {
    return extractTextFromDOCX(absolutePath);
  }

  // Fallback: read as plain text
  const content = await fs.readFile(absolutePath, "utf-8");
  return content;
}

/**
 * Basic PDF text extraction — reads raw bytes, finds text between
 * parentheses in stream sections and Tj/TJ operators. This is a
 * best-effort MVP approach that works for most text-based PDFs.
 */
async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const raw = buffer.toString("latin1");

  const textParts: string[] = [];

  // Extract text from PDF text objects: strings inside parentheses near Tj/TJ operators
  const textRegex = /\(([^)]*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(raw)) !== null) {
    textParts.push(match[1]);
  }

  // Also try to extract from TJ arrays: [(text) num (text) ...] TJ
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(raw)) !== null) {
    const inner = match[1];
    const innerTextRegex = /\(([^)]*)\)/g;
    let innerMatch: RegExpExecArray | null;
    while ((innerMatch = innerTextRegex.exec(inner)) !== null) {
      textParts.push(innerMatch[1]);
    }
  }

  // Decode basic PDF escape sequences
  const decoded = textParts
    .map((t) =>
      t
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\([()])/g, "$1"),
    )
    .join(" ");

  return decoded || raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ");
}

/**
 * Basic DOCX text extraction — DOCX is a ZIP containing XML files.
 * We read the raw bytes, find XML-like content, and strip tags.
 */
async function extractTextFromDOCX(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const raw = buffer.toString("utf-8");

  // DOCX XML content contains <w:t> tags with text
  const textParts: string[] = [];
  const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = wtRegex.exec(raw)) !== null) {
    textParts.push(match[1]);
  }

  if (textParts.length > 0) {
    return textParts.join(" ");
  }

  // Fallback: strip all XML tags
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Skill Extraction
// ---------------------------------------------------------------------------

interface ExtractedSkill {
  skill: string;
  confidence: number; // 0.0 – 1.0
}

/**
 * Match resume text against the predefined skills dictionary.
 * Uses case-insensitive matching with word boundaries.
 */
export function extractSkills(resumeText: string): ExtractedSkill[] {
  if (!resumeText || resumeText.trim().length === 0) {
    return [];
  }

  const lowerText = resumeText.toLowerCase();
  const found: ExtractedSkill[] = [];

  for (const skill of ALL_SKILLS) {
    const skillLower = skill.toLowerCase();
    // Escape regex special characters in the skill name
    const escaped = skillLower.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");

    // Try exact word boundary match first
    const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, "i");
    if (wordBoundaryRegex.test(lowerText)) {
      // Higher confidence for longer skill names (more specific)
      const confidence = Math.min(0.6 + skill.length * 0.03, 1.0);
      found.push({ skill, confidence });
      continue;
    }

    // Try partial match (e.g., "react" in "reactjs")
    if (lowerText.includes(skillLower)) {
      found.push({ skill, confidence: 0.5 });
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// LLM scoring (real AI) — used when an AI provider is configured (config.ai).
// Provider-agnostic: OpenAI/OpenRouter/compatible today, Claude etc. later.
// Returns null when no provider or on any error, so scoreCandidate() falls
// back to the deterministic heuristic.
// ---------------------------------------------------------------------------

const LLM_SCORING_SYSTEM = `You are an expert technical recruiter. Score how well a candidate fits a job using ONLY the data provided — never invent facts. Reply with ONLY a JSON object (no prose, no markdown) with exactly these keys:
{
  "overall_score": integer 0-100,
  "skills_score": integer 0-100,
  "experience_score": integer 0-100,
  "matched_skills": array of the job's required skills the candidate clearly has,
  "missing_skills": array of the job's required skills the candidate lacks,
  "recommendation": one of "strong_match" | "good_match" | "partial_match" | "weak_match"
}`;

function clampScore100(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
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

async function computeLlmScore(
  job: JobPosting,
  candidate: Candidate,
  candidateSkills: string[],
  resumeText: string,
  jobSkills: string[],
): Promise<ScoreResult | null> {
  const llm = getLLM();
  if (!llm) return null;

  const prompt = [
    "JOB",
    `Title: ${job.title ?? ""}`,
    `Description: ${(job.description ?? "").slice(0, 2000)}`,
    `Requirements: ${(job.requirements ?? "").slice(0, 2000)}`,
    `Required skills: ${jobSkills.join(", ") || "(none listed)"}`,
    `Experience wanted: ${job.experience_min ?? "?"}-${job.experience_max ?? "?"} years`,
    "",
    "CANDIDATE",
    `Current title: ${candidate.current_title ?? ""}`,
    `Current company: ${candidate.current_company ?? ""}`,
    `Experience: ${candidate.experience_years ?? "unknown"} years`,
    `Skills: ${candidateSkills.join(", ") || "(none listed)"}`,
    resumeText ? `Resume excerpt:\n${resumeText.slice(0, 4000)}` : "",
  ].join("\n");

  try {
    const raw = await llm.complete({ system: LLM_SCORING_SYSTEM, prompt, maxTokens: 800 });
    const p = parseJsonObject(raw);
    const overallScore = clampScore100(p.overall_score);
    const recommendation = ["strong_match", "good_match", "partial_match", "weak_match"].includes(
      p.recommendation,
    )
      ? (p.recommendation as ScoringRecommendation)
      : getRecommendation(overallScore);
    logger.info(`Resume scored via LLM ${llm.key} (${llm.model()}): ${overallScore}/100`);
    return {
      overallScore,
      skillsScore: clampScore100(p.skills_score),
      experienceScore: clampScore100(p.experience_score),
      matchedSkills: Array.isArray(p.matched_skills) ? p.matched_skills.map(String) : [],
      missingSkills: Array.isArray(p.missing_skills) ? p.missing_skills.map(String) : [],
      recommendation,
    };
  } catch (err) {
    logger.warn("LLM resume scoring failed; using heuristic:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scoring Logic
// ---------------------------------------------------------------------------

/**
 * Score a single candidate against a job posting.
 * Returns the computed score and persists it to the database.
 */
export async function scoreCandidate(
  orgId: number,
  candidateId: string,
  jobId: string,
  applicationId: string,
): Promise<ScoreResult & { id: string }> {
  const db = getDB();

  // Fetch candidate
  const candidate = await db.findOne<Candidate>("candidates", {
    id: candidateId,
    organization_id: orgId,
  });
  if (!candidate) throw new NotFoundError("Candidate", candidateId);

  // Fetch job
  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: orgId,
  });
  if (!job) throw new NotFoundError("Job", jobId);

  // Fetch application to verify it exists
  const application = await db.findOne<Application>("applications", {
    id: applicationId,
    organization_id: orgId,
  });
  if (!application) throw new NotFoundError("Application", applicationId);

  // Gather candidate skills from profile + resume
  // Handle both string (raw JSON) and already-parsed array from MySQL JSON column
  const candidateSkills: string[] = candidate.skills
    ? (typeof candidate.skills === "string" ? JSON.parse(candidate.skills) : candidate.skills)
    : [];

  // If candidate has a resume, extract skills from it too — and keep the text
  // so the LLM scorer can read it.
  let resumeSkills: string[] = [];
  let resumeText = "";
  if (candidate.resume_path) {
    try {
      resumeText = await parseResumeText(candidate.resume_path);
      const extracted = extractSkills(resumeText);
      resumeSkills = extracted.map((e) => e.skill);
    } catch (err) {
      logger.warn(`Failed to parse resume for candidate ${candidateId}:`, err);
    }
  }

  // Merge all candidate skills (deduplicated, lowercased for comparison)
  const allCandidateSkills = [
    ...new Set([
      ...candidateSkills.map((s) => s.toLowerCase()),
      ...resumeSkills.map((s) => s.toLowerCase()),
    ]),
  ];

  // Parse job required skills (handle both string and already-parsed array)
  const jobSkills: string[] = job.skills
    ? (typeof job.skills === "string" ? JSON.parse(job.skills) : job.skills)
    : [];
  const jobSkillsLower = jobSkills.map((s) => s.toLowerCase());

  // Real AI scoring when a provider is configured; deterministic heuristic
  // (60% skills + 40% experience) otherwise or if the LLM call fails.
  function heuristicScore(): ScoreResult {
    const { skillsScore, matchedSkills, missingSkills } = calculateSkillsScore(
      allCandidateSkills,
      jobSkillsLower,
      jobSkills,
    );
    const experienceScore = calculateExperienceScore(
      candidate!.experience_years,
      job!.experience_min,
      job!.experience_max,
    );
    const overallScore = Math.round(skillsScore * 0.6 + experienceScore * 0.4);
    return {
      overallScore,
      skillsScore,
      experienceScore,
      matchedSkills,
      missingSkills,
      recommendation: getRecommendation(overallScore),
    };
  }

  // Deterministic heuristic by default so the individual "AI Score" and "Batch
  // Score All" always agree for the same candidate and are reproducible. Only
  // reach for the (non-deterministic, rate-limited) LLM when explicitly enabled.
  const result =
    (config.ai.resumeScoringLlm
      ? await computeLlmScore(job, candidate, allCandidateSkills, resumeText, jobSkills)
      : null) ?? heuristicScore();
  const { overallScore, skillsScore, experienceScore, matchedSkills, missingSkills, recommendation } =
    result;

  // Upsert score record (delete existing if any, then create new)
  const existingScore = await db.findOne<CandidateScore>("candidate_scores", {
    application_id: applicationId,
    organization_id: orgId,
  });

  const scoreId = existingScore ? existingScore.id : uuidv4();

  if (existingScore) {
    await db.update<CandidateScore>("candidate_scores", existingScore.id, {
      overall_score: overallScore,
      skills_score: skillsScore,
      experience_score: experienceScore,
      matched_skills: JSON.stringify(matchedSkills),
      missing_skills: JSON.stringify(missingSkills),
      recommendation,
      scored_at: new Date(),
    } as any);
  } else {
    await db.create<CandidateScore>("candidate_scores", {
      id: scoreId,
      organization_id: orgId,
      application_id: applicationId,
      candidate_id: candidateId,
      job_id: jobId,
      overall_score: overallScore,
      skills_score: skillsScore,
      experience_score: experienceScore,
      matched_skills: JSON.stringify(matchedSkills),
      missing_skills: JSON.stringify(missingSkills),
      recommendation,
      scored_at: new Date(),
    } as any);
  }

  return {
    id: scoreId,
    overallScore,
    skillsScore,
    experienceScore,
    matchedSkills,
    missingSkills,
    recommendation,
  };
}

function calculateSkillsScore(
  candidateSkills: string[],
  jobSkillsLower: string[],
  jobSkillsOriginal: string[],
): { skillsScore: number; matchedSkills: string[]; missingSkills: string[] } {
  if (jobSkillsLower.length === 0) {
    // No required skills to match against. Awarding a flat 100 gave every
    // candidate an identical perfect score (BUG-010). With nothing to match,
    // score by the candidate's own skill breadth instead, so distinct
    // candidates are differentiated (≈8 recognised skills reaches 100).
    const score = Math.min(100, candidateSkills.length * 12);
    return { skillsScore: score, matchedSkills: candidateSkills.slice(0, 12), missingSkills: [] };
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (let i = 0; i < jobSkillsLower.length; i++) {
    const jobSkill = jobSkillsLower[i];
    const hasSkill = candidateSkills.some(
      (cs) => cs === jobSkill || cs.includes(jobSkill) || jobSkill.includes(cs),
    );

    if (hasSkill) {
      matchedSkills.push(jobSkillsOriginal[i]);
    } else {
      missingSkills.push(jobSkillsOriginal[i]);
    }
  }

  const skillsScore = Math.round((matchedSkills.length / jobSkillsLower.length) * 100);
  return { skillsScore, matchedSkills, missingSkills };
}

function calculateExperienceScore(
  candidateYears: number | null,
  minYears: number | null,
  maxYears: number | null,
): number {
  // No stated experience requirement — scale by the candidate's actual years
  // (instead of a flat 100 for everyone) so distinct candidates differ. Reaches
  // 100 around 10 years; unknown experience is treated as mid.
  if (minYears === null && maxYears === null) {
    if (candidateYears === null) return 50;
    return Math.min(100, 50 + candidateYears * 5);
  }

  // If candidate has no experience info, give partial score
  if (candidateYears === null) {
    return 40;
  }

  const min = minYears ?? 0;
  const max = maxYears ?? min + 10;

  // Candidate within range = 100
  if (candidateYears >= min && candidateYears <= max) {
    return 100;
  }

  // Candidate slightly below minimum (within 2 years)
  if (candidateYears < min) {
    const deficit = min - candidateYears;
    if (deficit <= 1) return 75;
    if (deficit <= 2) return 50;
    if (deficit <= 3) return 30;
    return 10;
  }

  // Candidate above maximum (overqualified) — slight penalty
  const excess = candidateYears - max;
  if (excess <= 2) return 85;
  if (excess <= 5) return 70;
  return 60;
}

function getRecommendation(overallScore: number): ScoringRecommendation {
  if (overallScore >= 80) return "strong_match" as ScoringRecommendation;
  if (overallScore >= 60) return "good_match" as ScoringRecommendation;
  if (overallScore >= 40) return "partial_match" as ScoringRecommendation;
  return "weak_match" as ScoringRecommendation;
}

// ---------------------------------------------------------------------------
// Batch Scoring
// ---------------------------------------------------------------------------

/**
 * Score all candidates who applied to a given job.
 */
export async function batchScoreCandidates(
  orgId: number,
  jobId: string,
): Promise<{
  scored: number;
  total: number;
  skipped: number;
  results: Array<ScoreResult & { id: string; applicationId: string; candidateId: string }>;
}> {
  const db = getDB();

  // Verify job exists
  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: orgId,
  });
  if (!job) throw new NotFoundError("Job", jobId);

  // Get all applications for this job
  const applicationsResult = await db.findMany<Application>("applications", {
    filters: { job_id: jobId, organization_id: orgId },
    limit: 1000,
  });

  const results: Array<ScoreResult & { id: string; applicationId: string; candidateId: string }> = [];

  for (const app of applicationsResult.data) {
    try {
      const result = await scoreCandidate(orgId, app.candidate_id, jobId, app.id);
      results.push({
        ...result,
        applicationId: app.id,
        candidateId: app.candidate_id,
      });
    } catch (err) {
      logger.warn(`Failed to score candidate ${app.candidate_id} for job ${jobId}:`, err);
    }
  }

  const total = applicationsResult.data.length;
  return { scored: results.length, total, skipped: total - results.length, results };
}

// ---------------------------------------------------------------------------
// Score Report
// ---------------------------------------------------------------------------

/**
 * Get the stored score report for an application.
 */
export async function getScoreReport(
  orgId: number,
  applicationId: string,
): Promise<CandidateScore | null> {
  const db = getDB();

  const score = await db.findOne<CandidateScore>("candidate_scores", {
    application_id: applicationId,
    organization_id: orgId,
  });

  return score;
}

// Shared SELECT/FROM/WHERE for a job's ranked candidates. Callers append the
// ORDER BY (and, when paginating, LIMIT/OFFSET) and bind [orgId, jobId, ...].
const JOB_RANKINGS_SELECT = `SELECT cs.*,
          c.first_name as candidate_first_name,
          c.last_name as candidate_last_name,
          TRIM(CONCAT(COALESCE(c.first_name,''), ' ', COALESCE(c.last_name,''))) as candidate_name,
          c.email as candidate_email,
          j.title as job_title,
          a.stage as application_stage
   FROM candidate_scores cs
   LEFT JOIN candidates c ON c.id = cs.candidate_id
   LEFT JOIN applications a ON a.id = cs.application_id
   LEFT JOIN job_postings j ON j.id = cs.job_id
   WHERE cs.organization_id = ? AND cs.job_id = ?`;

/**
 * Get all scored applications for a job, ranked by overall score descending.
 */
export async function getJobRankings(orgId: number, jobId: string): Promise<any[]> {
  const db = getDB();

  // Verify job exists
  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: orgId,
  });
  if (!job) throw new NotFoundError("Job", jobId);

  const rows = await db.raw<any[][]>(
    `${JOB_RANKINGS_SELECT} ORDER BY cs.overall_score DESC`,
    [orgId, jobId],
  );

  return rows[0] as any[];
}

/**
 * Server-side-paginated ranked candidates for a job, so the rankings table can
 * scale. Returns the standard { data, total, page, perPage, totalPages } shape.
 */
export async function getJobRankingsPaginated(
  orgId: number,
  jobId: string,
  params?: { page?: number; limit?: number },
): Promise<{ data: any[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();
  const page = params?.page && params.page > 0 ? params.page : 1;
  const perPage = params?.limit && params.limit > 0 ? params.limit : 10;

  // Verify job exists
  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: orgId,
  });
  if (!job) throw new NotFoundError("Job", jobId);

  const countRows = await db.raw<any[][]>(
    `SELECT COUNT(*) as total FROM candidate_scores cs WHERE cs.organization_id = ? AND cs.job_id = ?`,
    [orgId, jobId],
  );
  const total = Number(countRows[0]?.[0]?.total ?? 0);

  const offset = (page - 1) * perPage;
  const rows = await db.raw<any[][]>(
    `${JOB_RANKINGS_SELECT} ORDER BY cs.overall_score DESC LIMIT ? OFFSET ?`,
    [orgId, jobId, perPage, offset],
  );

  return {
    data: rows[0] as any[],
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

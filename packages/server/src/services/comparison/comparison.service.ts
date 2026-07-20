// ============================================================================
// CANDIDATE COMPARISON SERVICE
// Side-by-side comparison of multiple candidates for a job.
// ============================================================================

import { getDB } from "../../db/adapters";
import { ValidationError, NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonCandidate {
  application_id: string;
  candidate_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_title: string | null;
  experience_years: number | null;
  skills: string[] | null;
  stage: string;
  rating: number | null;
  applied_at: string;
  job_title: string;
  // AI score data
  overall_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  recommendation: string | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  // Interview feedback
  interviews: InterviewSummary[];
}

interface InterviewSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  overall_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  cultural_fit_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  weaknesses: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function compareCandidates(
  orgId: number,
  applicationIds: string[],
): Promise<ComparisonCandidate[]> {
  if (!applicationIds || applicationIds.length < 2) {
    throw new ValidationError("At least 2 application IDs are required for comparison");
  }
  if (applicationIds.length > 5) {
    throw new ValidationError("Maximum 5 candidates can be compared at once");
  }

  const db = getDB();
  const results: ComparisonCandidate[] = [];

  for (const appId of applicationIds) {
    // Fetch application with candidate and job info
    const rows = await db.raw<any[][]>(
      `SELECT a.*, c.first_name, c.last_name, c.email, c.phone,
              c.current_company, c.current_title, c.experience_years,
              c.skills as candidate_skills, j.title as job_title
       FROM applications a
       LEFT JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN job_postings j ON j.id = a.job_id
       WHERE a.id = ? AND a.organization_id = ?`,
      [appId, orgId],
    );

    const app = rows[0]?.[0];
    if (!app) {
      throw new NotFoundError("Application", appId);
    }

    // Fetch AI score if available
    const scoreRows = await db.raw<any[][]>(
      `SELECT overall_score, skills_score, experience_score, recommendation,
              matched_skills, missing_skills
       FROM candidate_scores
       WHERE application_id = ? AND organization_id = ?
       ORDER BY scored_at DESC LIMIT 1`,
      [appId, orgId],
    );
    const score = scoreRows[0]?.[0];

    // Fetch interviews, then their feedback separately and aggregate per
    // interview. A LEFT JOIN would fan out one row per panelist (N feedback rows
    // per interview), so the same interview appeared N times, unaggregated (M19).
    const interviewRows = await db.raw<any[][]>(
      `SELECT i.id, i.title, i.type, i.status
       FROM interviews i
       WHERE i.application_id = ? AND i.organization_id = ?
       ORDER BY i.round ASC`,
      [appId, orgId],
    );
    const interviewList = (interviewRows[0] || []) as any[];

    // Group all feedback for these interviews by interview_id in one query.
    const feedbackByInterview = new Map<string, any[]>();
    if (interviewList.length > 0) {
      const ids = interviewList.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(", ");
      const feedbackRows = await db.raw<any[][]>(
        `SELECT interview_id, overall_score, technical_score, communication_score,
                cultural_fit_score, recommendation, strengths, weaknesses
         FROM interview_feedback
         WHERE interview_id IN (${placeholders})`,
        ids,
      );
      for (const f of (feedbackRows[0] || []) as any[]) {
        const list = feedbackByInterview.get(f.interview_id) || [];
        list.push(f);
        feedbackByInterview.set(f.interview_id, list);
      }
    }

    const avgScore = (vals: Array<number | null>): number | null => {
      const nums = vals.filter((v): v is number => v != null);
      if (nums.length === 0) return null;
      return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
    };
    const joinText = (vals: Array<string | null>): string | null => {
      const parts = [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))];
      return parts.length ? parts.join("; ") : null;
    };

    const interviews: InterviewSummary[] = interviewList.map((iv) => {
      const fbs = feedbackByInterview.get(iv.id) || [];
      return {
        id: iv.id,
        title: iv.title,
        type: iv.type,
        status: iv.status,
        overall_score: avgScore(fbs.map((f) => f.overall_score)),
        technical_score: avgScore(fbs.map((f) => f.technical_score)),
        communication_score: avgScore(fbs.map((f) => f.communication_score)),
        cultural_fit_score: avgScore(fbs.map((f) => f.cultural_fit_score)),
        recommendation: fbs[0]?.recommendation ?? null,
        strengths: joinText(fbs.map((f) => f.strengths)),
        weaknesses: joinText(fbs.map((f) => f.weaknesses)),
      };
    });

    // Parse JSON fields safely
    const parseJson = (val: any): string[] | null => {
      if (!val) return null;
      try {
        return typeof val === "string" ? JSON.parse(val) : val;
      } catch {
        return null;
      }
    };

    results.push({
      application_id: appId,
      candidate_id: app.candidate_id,
      first_name: app.first_name,
      last_name: app.last_name,
      email: app.email,
      phone: app.phone,
      current_company: app.current_company,
      current_title: app.current_title,
      experience_years: app.experience_years,
      skills: parseJson(app.candidate_skills),
      stage: app.stage,
      rating: app.rating,
      applied_at: app.applied_at,
      job_title: app.job_title,
      overall_score: score?.overall_score ?? null,
      skills_score: score?.skills_score ?? null,
      experience_score: score?.experience_score ?? null,
      recommendation: score?.recommendation ?? null,
      matched_skills: parseJson(score?.matched_skills),
      missing_skills: parseJson(score?.missing_skills),
      interviews,
    });
  }

  return results;
}

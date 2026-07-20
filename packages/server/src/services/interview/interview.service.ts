// ============================================================================
// INTERVIEW SERVICE
// Business logic for scheduling interviews, managing panelists, and feedback.
// Calendar/ICS logic lives in ./calendar.service.ts
// Email invitation logic lives in ./invitation.service.ts
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  Interview,
  InterviewPanelist,
  InterviewFeedback,
  InterviewStatus,
  InterviewType,
  Recommendation,
} from "@emp-recruit/shared";

import { findUserById } from "../../db/empcloud";
import { resolveProvider } from "./providers";
import { getDefaultProviderKey } from "./meeting-config.service";
import type {
  CreatedMeeting,
  MeetingContext,
  MeetingProviderKey,
  RoomToken,
} from "./providers/types";

// Re-export calendar and invitation functions so existing `import *` still works
export { getCalendarLinks, generateICSFile } from "./calendar.service";
export { sendInterviewInvitation } from "./invitation.service";
// Re-export meeting-config functions for the routes' `import * as interviewService`
export { getMeetingConfig, setMeetingConfig } from "./meeting-config.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleInterviewInput {
  application_id: string;
  type: InterviewType;
  round: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
  created_by: number;
  panelists?: { user_id: number; role: string }[];
}

export interface UpdateInterviewInput {
  type?: InterviewType;
  round?: number;
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
}

export interface ListInterviewsParams {
  page?: number;
  limit?: number;
  application_id?: string;
  status?: InterviewStatus;
  search?: string;
  sort_field?: string;
  sort_order?: "asc" | "desc";
}

export interface SubmitFeedbackInput {
  recommendation: Recommendation;
  technical_score?: number;
  communication_score?: number;
  cultural_fit_score?: number;
  overall_score?: number;
  strengths?: string;
  weaknesses?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Schedule a new interview with optional panelists
// ---------------------------------------------------------------------------

export async function scheduleInterview(
  orgId: number,
  data: ScheduleInterviewInput,
): Promise<Interview & { panelists: InterviewPanelist[] }> {
  const db = getDB();

  // Verify the application belongs to this org
  const app = await db.findOne<{ id: string }>("applications", {
    id: data.application_id,
    organization_id: orgId,
  });
  if (!app) {
    throw new NotFoundError("Application", data.application_id);
  }

  const interviewId = uuidv4();
  const now = new Date();

  const interview = await db.create<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
    application_id: data.application_id,
    type: data.type,
    round: data.round,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at) as any,
    duration_minutes: data.duration_minutes,
    location: data.location || null,
    meeting_link: data.meeting_link || null,
    status: "scheduled" as InterviewStatus,
    notes: data.notes || null,
    created_by: data.created_by,
    created_at: now as any,
    updated_at: now as any,
  });

  // Create panelists
  const panelists: InterviewPanelist[] = [];
  if (data.panelists && data.panelists.length > 0) {
    for (const p of data.panelists) {
      const panelist = await db.create<InterviewPanelist>("interview_panelists", {
        id: uuidv4(),
        interview_id: interviewId,
        user_id: p.user_id,
        role: p.role,
        created_at: now as any,
      });
      panelists.push(panelist);
    }
  }

  return { ...interview, panelists };
}

// ---------------------------------------------------------------------------
// Update / reschedule an interview
// ---------------------------------------------------------------------------

export async function updateInterview(
  orgId: number,
  id: string,
  data: UpdateInterviewInput,
): Promise<Interview> {
  const db = getDB();

  const existing = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Interview", id);
  }

  // Convert scheduled_at to Date if present
  const updateData: Record<string, any> = { ...data };
  if (updateData.scheduled_at) {
    updateData.scheduled_at = new Date(updateData.scheduled_at);
  }
  const updated = await db.update<Interview>("interviews", id, updateData);

  return updated;
}

/**
 * Update just the HR summary/notes for an interview. Independent of the
 * transcript, so HR can jot notes before (or without) any recording.
 */
export async function updateSummary(
  orgId: number,
  id: string,
  summary: string,
): Promise<Interview> {
  const db = getDB();
  const existing = await db.findOne<Interview>("interviews", { id, organization_id: orgId });
  if (!existing) {
    throw new NotFoundError("Interview", id);
  }
  return db.update<Interview>("interviews", id, { summary } as Partial<Interview>);
}

// ---------------------------------------------------------------------------
// List interviews with pagination and filters
// ---------------------------------------------------------------------------

export async function listInterviews(
  orgId: number,
  params: ListInterviewsParams,
): Promise<{
  data: (Interview & { candidate_name: string; job_title: string; panelist_count: number })[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page || 1;
  const limit = params.limit || 20;

  let rows: Interview[];
  let total: number;
  let totalPages: number;

  const search = params.search?.trim();
  if (search) {
    // Candidate name and job title live in joined tables, so a text search has
    // to reach across applications -> candidates/job_postings. Only whitelisted
    // columns are interpolated into ORDER BY; everything else is bound.
    const like = `%${search}%`;
    const offset = (page - 1) * limit;
    const filterClause =
      (params.application_id ? "AND i.application_id = ? " : "") +
      (params.status ? "AND i.status = ? " : "");
    const filterArgs: any[] = [];
    if (params.application_id) filterArgs.push(params.application_id);
    if (params.status) filterArgs.push(params.status);
    const searchArgs = [like, like, like, like];

    const joinWhere = `FROM interviews i
        JOIN applications a ON a.id = i.application_id
        JOIN candidates c ON c.id = a.candidate_id
        JOIN job_postings j ON j.id = a.job_id
       WHERE i.organization_id = ? ${filterClause}
         AND (c.first_name LIKE ? OR c.last_name LIKE ?
              OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR j.title LIKE ?)`;

    const countRows = await db.raw<any[][]>(
      `SELECT COUNT(*) as total ${joinWhere}`,
      [orgId, ...filterArgs, ...searchArgs],
    );
    total = Number(countRows[0]?.[0]?.total ?? 0);

    const allowedSort = ["scheduled_at", "created_at", "status", "duration_minutes"];
    const sortField = allowedSort.includes(params.sort_field || "")
      ? params.sort_field!
      : "scheduled_at";
    const sortOrder = (params.sort_order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const dataRows = await db.raw<any[][]>(
      `SELECT i.* ${joinWhere} ORDER BY i.\`${sortField}\` ${sortOrder} LIMIT ? OFFSET ?`,
      [orgId, ...filterArgs, ...searchArgs, limit, offset],
    );
    rows = dataRows[0] as Interview[];
    totalPages = Math.max(1, Math.ceil(total / limit));
  } else {
    const filters: Record<string, any> = { organization_id: orgId };
    if (params.application_id) filters.application_id = params.application_id;
    if (params.status) filters.status = params.status;

    const result = await db.findMany<Interview>("interviews", {
      page,
      limit,
      filters,
      sort: {
        field: params.sort_field || "scheduled_at",
        order: params.sort_order || "desc",
      },
    });
    rows = result.data;
    total = result.total;
    totalPages = result.totalPages;
  }

  // Enrich with candidate name, job title, and panelist count. Batch the lookups
  // instead of running ~4 queries per row (audit M20): one JOIN across all the
  // applications on this page, and one grouped panelist count.
  if (rows.length === 0) {
    return { data: [], total, page, perPage: limit, totalPages };
  }

  const appIds = [...new Set(rows.map((r) => r.application_id))];
  const interviewIds = rows.map((r) => r.id);
  const appPlaceholders = appIds.map(() => "?").join(", ");
  const ivPlaceholders = interviewIds.map(() => "?").join(", ");

  const appInfoRows = await db.raw<any[][]>(
    `SELECT a.id AS application_id,
            CONCAT(c.first_name, ' ', c.last_name) AS candidate_name,
            j.title AS job_title
     FROM applications a
     LEFT JOIN candidates c ON c.id = a.candidate_id
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE a.id IN (${appPlaceholders})`,
    appIds,
  );
  const appInfo = new Map<string, { candidate_name: string; job_title: string }>();
  for (const r of (appInfoRows[0] || []) as any[]) {
    appInfo.set(r.application_id, {
      candidate_name: (r.candidate_name && String(r.candidate_name).trim()) || "Unknown",
      job_title: r.job_title || "Unknown",
    });
  }

  const panelistRows = await db.raw<any[][]>(
    `SELECT interview_id, COUNT(*) AS cnt
     FROM interview_panelists
     WHERE interview_id IN (${ivPlaceholders})
     GROUP BY interview_id`,
    interviewIds,
  );
  const panelistCounts = new Map<string, number>();
  for (const r of (panelistRows[0] || []) as any[]) {
    panelistCounts.set(r.interview_id, Number(r.cnt));
  }

  const enriched = rows.map((interview) => {
    const info = appInfo.get(interview.application_id);
    return {
      ...interview,
      candidate_name: info?.candidate_name || "Unknown",
      job_title: info?.job_title || "Unknown",
      panelist_count: panelistCounts.get(interview.id) || 0,
    };
  });

  return {
    data: enriched,
    total,
    page,
    perPage: limit,
    totalPages,
  };
}

// ---------------------------------------------------------------------------
// Get interview detail with panelists and feedback
// ---------------------------------------------------------------------------

export async function getInterview(
  orgId: number,
  id: string,
): Promise<
  Interview & {
    panelists: InterviewPanelist[];
    feedback: InterviewFeedback[];
    candidate_name: string;
    job_title: string;
    application: { id: string; candidate_id: string; job_id: string } | null;
  }
> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", id);
  }

  const panelistResult = await db.findMany<InterviewPanelist>("interview_panelists", {
    filters: { interview_id: id },
    limit: 100,
  });

  const feedbackResult = await db.findMany<InterviewFeedback>("interview_feedback", {
    filters: { interview_id: id },
    limit: 100,
  });

  // Get application -> candidate + job
  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);

  let candidate_name = "Unknown";
  let job_title = "Unknown";

  if (appRow) {
    const candidate = await db.findById<{ first_name: string; last_name: string }>(
      "candidates",
      appRow.candidate_id,
    );
    if (candidate) {
      candidate_name = `${candidate.first_name} ${candidate.last_name}`;
    }
    const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
    if (job) {
      job_title = job.title;
    }
  }

  return {
    ...interview,
    panelists: panelistResult.data,
    feedback: feedbackResult.data,
    candidate_name,
    job_title,
    application: appRow || null,
  };
}

// ---------------------------------------------------------------------------
// Change interview status
// ---------------------------------------------------------------------------

// Allowed interview status transitions (audit L15). `completed` is terminal;
// `cancelled`/`no_show` can only go back to `scheduled` (a reschedule).
// Same-status is a no-op and always allowed.
const INTERVIEW_STATUS_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  scheduled: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: ["scheduled"],
  no_show: ["scheduled"],
} as Record<InterviewStatus, InterviewStatus[]>;

export async function changeStatus(
  orgId: number,
  id: string,
  status: InterviewStatus,
): Promise<Interview> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", id);
  }

  const current = interview.status as InterviewStatus;
  if (status !== current && !(INTERVIEW_STATUS_TRANSITIONS[current] || []).includes(status)) {
    throw new ValidationError(`Cannot change interview status from '${current}' to '${status}'`);
  }

  const updated = await db.update<Interview>("interviews", id, {
    status,
    updated_at: new Date().toISOString(),
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Add panelist to interview
// ---------------------------------------------------------------------------

export async function addPanelist(
  orgId: number,
  interviewId: string,
  userId: number,
  role: string,
): Promise<InterviewPanelist> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Check if already a panelist
  const existing = await db.findOne<InterviewPanelist>("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (existing) {
    throw new ValidationError("User is already a panelist for this interview");
  }

  const panelist = await db.create<InterviewPanelist>("interview_panelists", {
    id: uuidv4(),
    interview_id: interviewId,
    user_id: userId,
    role,
    created_at: new Date().toISOString(),
  });

  return panelist;
}

// ---------------------------------------------------------------------------
// Remove panelist from interview
// ---------------------------------------------------------------------------

export async function removePanelist(
  orgId: number,
  interviewId: string,
  userId: number,
): Promise<void> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const deleted = await db.deleteMany("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (deleted === 0) {
    throw new NotFoundError("Panelist");
  }
}

// ---------------------------------------------------------------------------
// Submit feedback for an interview
// ---------------------------------------------------------------------------

export async function submitFeedback(
  orgId: number,
  interviewId: string,
  userId: number,
  data: SubmitFeedbackInput,
): Promise<InterviewFeedback> {
  const db = getDB();

  // Verify interview belongs to org
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Verify user is a panelist
  const panelist = await db.findOne<InterviewPanelist>("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (!panelist) {
    throw new ForbiddenError("Only panelists can submit feedback for this interview");
  }

  // Check if feedback already submitted
  const existingFeedback = await db.findOne<InterviewFeedback>("interview_feedback", {
    interview_id: interviewId,
    panelist_id: userId,
  });
  if (existingFeedback) {
    throw new ValidationError("Feedback has already been submitted for this interview");
  }

  const now = new Date();
  const feedback = await db.create<InterviewFeedback>("interview_feedback", {
    id: uuidv4(),
    interview_id: interviewId,
    panelist_id: userId,
    recommendation: data.recommendation,
    technical_score: data.technical_score ?? null,
    communication_score: data.communication_score ?? null,
    cultural_fit_score: data.cultural_fit_score ?? null,
    overall_score: data.overall_score ?? null,
    strengths: data.strengths || null,
    weaknesses: data.weaknesses || null,
    notes: data.notes || null,
    submitted_at: now.toISOString(),
    created_at: now.toISOString(),
  });

  return feedback;
}

// ---------------------------------------------------------------------------
// Get all feedback for an interview
// ---------------------------------------------------------------------------

export async function getFeedback(
  orgId: number,
  interviewId: string,
): Promise<InterviewFeedback[]> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const result = await db.findMany<InterviewFeedback>("interview_feedback", {
    filters: { interview_id: interviewId },
    limit: 100,
  });

  return result.data;
}

// ---------------------------------------------------------------------------
// Get aggregated feedback across all interviews for an application
// ---------------------------------------------------------------------------

export async function getAggregatedFeedback(
  orgId: number,
  applicationId: string,
): Promise<{
  total_interviews: number;
  total_feedback: number;
  average_overall_score: number | null;
  average_technical_score: number | null;
  average_communication_score: number | null;
  average_cultural_fit_score: number | null;
  recommendation_summary: Record<string, number>;
  feedback_by_interview: {
    interview_id: string;
    interview_title: string;
    round: number;
    feedback: InterviewFeedback[];
  }[];
}> {
  const db = getDB();

  // Get all interviews for the application in this org
  const interviewResult = await db.findMany<Interview>("interviews", {
    filters: { organization_id: orgId, application_id: applicationId },
    limit: 100,
    sort: { field: "round", order: "asc" },
  });

  const interviews = interviewResult.data;

  let totalFeedback = 0;
  let overallScores: number[] = [];
  let technicalScores: number[] = [];
  let communicationScores: number[] = [];
  let culturalFitScores: number[] = [];
  const recommendationSummary: Record<string, number> = {};
  const feedbackByInterview: {
    interview_id: string;
    interview_title: string;
    round: number;
    feedback: InterviewFeedback[];
  }[] = [];

  for (const interview of interviews) {
    const fbResult = await db.findMany<InterviewFeedback>("interview_feedback", {
      filters: { interview_id: interview.id },
      limit: 100,
    });

    const feedbacks = fbResult.data;
    totalFeedback += feedbacks.length;

    feedbackByInterview.push({
      interview_id: interview.id,
      interview_title: interview.title,
      round: interview.round,
      feedback: feedbacks,
    });

    for (const fb of feedbacks) {
      if (fb.overall_score !== null) overallScores.push(fb.overall_score);
      if (fb.technical_score !== null) technicalScores.push(fb.technical_score);
      if (fb.communication_score !== null) communicationScores.push(fb.communication_score);
      if (fb.cultural_fit_score !== null) culturalFitScores.push(fb.cultural_fit_score);
      recommendationSummary[fb.recommendation] =
        (recommendationSummary[fb.recommendation] || 0) + 1;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  return {
    total_interviews: interviews.length,
    total_feedback: totalFeedback,
    average_overall_score: avg(overallScores),
    average_technical_score: avg(technicalScores),
    average_communication_score: avg(communicationScores),
    average_cultural_fit_score: avg(culturalFitScores),
    recommendation_summary: recommendationSummary,
    feedback_by_interview: feedbackByInterview,
  };
}

// ---------------------------------------------------------------------------
// Meetings — provisioned through the pluggable adapters in ./providers
// ---------------------------------------------------------------------------

/**
 * Assemble organizer + candidate + panelists for an interview's meeting.
 * Best-effort: a missing/unresolvable user never blocks meeting creation.
 */
async function buildMeetingContext(orgId: number, interview: Interview): Promise<MeetingContext> {
  const db = getDB();
  const participants: MeetingContext["participants"] = [];

  // Candidate (via the application)
  try {
    const app = await db.findById<{ candidate_id: string }>("applications", interview.application_id);
    if (app?.candidate_id) {
      const cand = await db.findById<{ first_name?: string; last_name?: string; email?: string }>(
        "candidates",
        app.candidate_id,
      );
      const name = `${cand?.first_name ?? ""} ${cand?.last_name ?? ""}`.trim();
      if (cand?.email) {
        participants.push({ name: name || "Candidate", email: cand.email, role: "candidate" });
      }
    }
  } catch {
    /* best-effort */
  }

  // Panelists (internal users)
  try {
    const rows = await db.findMany<{ user_id: number }>("interview_panelists", {
      filters: { interview_id: interview.id },
      limit: 50,
    });
    for (const p of rows.data) {
      const u = await findUserById(p.user_id).catch(() => null);
      if (u?.email) {
        participants.push({
          userId: u.id,
          name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
          email: u.email,
          role: "panelist",
        });
      }
    }
  } catch {
    /* best-effort */
  }

  // Organizer (interview creator)
  let organizer = { userId: interview.created_by, name: "Interviewer", email: "" };
  try {
    const u = await findUserById(interview.created_by);
    if (u) {
      organizer = {
        userId: u.id,
        name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
        email: u.email ?? "",
      };
    }
  } catch {
    /* best-effort */
  }

  return {
    orgId,
    interviewId: interview.id,
    title: interview.title,
    scheduledAt: new Date(interview.scheduled_at),
    durationMinutes: interview.duration_minutes ?? 60,
    organizer,
    participants,
  };
}

/**
 * Provision (or re-provision) the meeting for an interview via the resolved
 * provider and persist the result onto the interview row.
 */
export async function createMeeting(
  orgId: number,
  interviewId: string,
  providerKey?: MeetingProviderKey | string,
): Promise<CreatedMeeting> {
  const db = getDB();
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const key = providerKey ?? (await getDefaultProviderKey(orgId));
  const provider = resolveProvider(key as string);

  const ctx = await buildMeetingContext(orgId, interview);
  const meeting = await provider.createMeeting(ctx);

  await db.update<Interview>("interviews", interviewId, {
    meeting_provider: meeting.provider,
    meeting_link: meeting.joinUrl,
    meeting_external_id: meeting.externalId,
    meeting_host_url: meeting.hostUrl ?? null,
    meeting_embeddable: meeting.embeddable,
  } as Partial<Interview>);

  logger.info(
    `Meeting created for interview ${interviewId} via ${meeting.provider}: ${meeting.joinUrl}`,
  );
  return meeting;
}

/**
 * Backward-compatible wrapper returning just the join URL. Existing callers
 * (POST /:id/generate-meet and its tests) keep working unchanged.
 */
export async function generateMeetingLink(
  orgId: number,
  interviewId: string,
  providerKey?: MeetingProviderKey | string,
): Promise<string> {
  const meeting = await createMeeting(orgId, interviewId, providerKey);
  return meeting.joinUrl;
}

/**
 * Mint short-lived join credentials for an embedded room. The <InterviewRoom>
 * client page consumes these. Throws if the provider isn't embeddable.
 */
export async function getInterviewRoomToken(
  orgId: number,
  interviewId: string,
  participant: { userId?: number; name: string; email: string; moderator: boolean },
): Promise<RoomToken & { provider: string }> {
  const db = getDB();
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const provider = resolveProvider(interview.meeting_provider ?? undefined);
  if (!provider.embeddable || !provider.issueRoomToken) {
    throw new ValidationError("This interview does not use an embedded meeting room");
  }

  const token = await provider.issueRoomToken({
    orgId,
    interviewId,
    roomName: interview.meeting_external_id ?? "",
    participant,
  });
  return { ...token, provider: provider.key };
}


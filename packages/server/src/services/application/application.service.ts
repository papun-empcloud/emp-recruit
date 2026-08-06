import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { safeOrderBy } from "../../utils/sort";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors";
import type { Application, ApplicationActivity, ApplicationStageHistory } from "@emp-recruit/shared";
import { dispatchAutomationEvent } from "../recruitment-ops/recruitment-ops.service";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Activity feed (030) — a unified per-application log.
// ---------------------------------------------------------------------------

export async function logActivity(
  orgId: number,
  applicationId: string,
  actorId: number | null,
  type: ApplicationActivity["type"],
  message: string,
): Promise<void> {
  const db = getDB();
  await db.create("application_activity", {
    id: uuidv4(),
    organization_id: orgId,
    application_id: applicationId,
    actor_id: actorId,
    type,
    message: message.slice(0, 500),
  } as any);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createApplication(
  orgId: number,
  data: {
    job_id: string;
    candidate_id: string;
    source?: string;
    cover_letter?: string;
  },
): Promise<Application> {
  const db = getDB();

  // Verify the job exists
  const job = await db.findOne<any>("job_postings", { id: data.job_id, organization_id: orgId });
  if (!job) throw new NotFoundError("Job", data.job_id);

  // Verify the candidate exists
  const candidate = await db.findOne<any>("candidates", { id: data.candidate_id, organization_id: orgId });
  if (!candidate) throw new NotFoundError("Candidate", data.candidate_id);

  // Prevent duplicate application (same candidate + same job)
  const existing = await db.findOne<Application>("applications", {
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: data.candidate_id,
  });
  if (existing) {
    throw new ConflictError("This candidate has already applied to this job");
  }

  const id = uuidv4();
  const record: Record<string, any> = {
    id,
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: data.candidate_id,
    stage: "applied",
    source: data.source ?? "direct",
    cover_letter: data.cover_letter ?? null,
    resume_path: candidate.resume_path ?? null,
    applied_at: new Date(),
  };

  let application: Application;
  try {
    application = await db.create<Application>("applications", record as any);
  } catch (err: any) {
    // Lost a race against the unique constraint (audit H10) — surface a clean 409.
    if (err?.code === "ER_DUP_ENTRY" || /duplicate/i.test(String(err?.message))) {
      throw new ConflictError("This candidate has already applied to this job");
    }
    throw err;
  }

  // Insert initial stage history
  await db.create("application_stage_history", {
    id: uuidv4(),
    application_id: id,
    from_stage: null,
    to_stage: "applied",
    changed_by: 0, // system
    notes: "Application submitted",
  });

  await dispatchAutomationEvent(orgId, { trigger: "application_created", value: "applied", applicationId: id })
    .catch((error) => logger.error(`Application ${id} created but automation dispatch failed`, error));

  return application;
}

export async function moveStage(
  orgId: number,
  id: string,
  newStage: string,
  userId: number,
  notes?: string,
  rejectionReason?: string,
): Promise<Application> {
  const db = getDB();
  const app = await db.findOne<Application>("applications", { id, organization_id: orgId });
  if (!app) throw new NotFoundError("Application", id);

  const fromStage = app.stage;

  // Validate the target stage against the org's pipeline (audit M17) — otherwise
  // any string could be written as an application stage.
  const stageRows = await db.raw<any[][]>(
    "SELECT slug FROM pipeline_stages WHERE organization_id = ? AND is_active = 1",
    [orgId],
  );
  const configured = (stageRows[0] as any[]).map((s) => s.slug);
  const allowed =
    configured.length > 0
      ? configured
      : ["applied", "screened", "interview", "offer", "hired", "rejected", "withdrawn"];
  if (!allowed.includes(newStage)) {
    throw new ValidationError(`'${newStage}' is not a valid pipeline stage`);
  }

  const updates: Record<string, any> = { stage: newStage };
  if (rejectionReason) updates.rejection_reason = rejectionReason;

  const updated = await db.update<Application>("applications", id, updates);

  // Insert stage history
  await db.create("application_stage_history", {
    id: uuidv4(),
    application_id: id,
    from_stage: fromStage,
    to_stage: newStage,
    changed_by: userId,
    notes: notes ?? null,
  });

  await logActivity(orgId, id, userId, "stage_change", `Moved from ${fromStage} to ${newStage}`);

  // Persisting the stage is the source of truth; automation failures are
  // isolated in run records and never roll back the recruiter's action.
  await dispatchAutomationEvent(orgId, { trigger: "application_stage_changed", value: newStage, applicationId: id })
    .catch((error) => logger.error(`Application ${id} moved to ${newStage} but automation dispatch failed`, error));

  return updated;
}

// Move several applications to a stage in one action; each is validated and
// moved independently, and a per-application activity entry is written.
export async function bulkMoveStage(
  orgId: number,
  applicationIds: string[],
  newStage: string,
  userId: number,
  notes?: string,
): Promise<{ moved: number; failed: { id: string; reason: string }[] }> {
  const result = { moved: 0, failed: [] as { id: string; reason: string }[] };
  for (const id of applicationIds) {
    try {
      await moveStage(orgId, id, newStage, userId, notes);
      result.moved++;
    } catch (err: any) {
      result.failed.push({ id, reason: err?.message ?? "Unknown error" });
    }
  }
  return result;
}

// Assign a responsible recruiter and/or set the SLA due date on an application.
export async function assignApplication(
  orgId: number,
  id: string,
  userId: number,
  data: { assigned_to?: number | null; sla_due_date?: string | null },
): Promise<Application> {
  const db = getDB();
  const app = await db.findOne<Application>("applications", { id, organization_id: orgId });
  if (!app) throw new NotFoundError("Application", id);

  // Users live in the EmpCloud master DB with no FK from this table, so an
  // arbitrary user id would otherwise persist and later leak that (possibly
  // cross-org) user's name back on read. Only allow assigning to an ACTIVE
  // member of the caller's own organization.
  let assignee: Awaited<ReturnType<typeof findUserById>> = null;
  if (data.assigned_to != null) {
    assignee = await findUserById(data.assigned_to).catch(() => null);
    if (!assignee || assignee.organization_id !== orgId || assignee.status !== 1) {
      throw new ValidationError("Assignee must be an active member of your organization");
    }
  }

  const updates: Record<string, any> = {};
  if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to;
  if (data.sla_due_date !== undefined) {
    updates.sla_due_date = data.sla_due_date ? String(data.sla_due_date).slice(0, 10) : null;
  }
  const updated = await db.update<Application>("applications", id, updates);

  if (data.assigned_to !== undefined) {
    if (data.assigned_to === null) {
      await logActivity(orgId, id, userId, "assigned", "Unassigned");
    } else {
      const name = assignee ? `${assignee.first_name ?? ""} ${assignee.last_name ?? ""}`.trim() : "";
      await logActivity(orgId, id, userId, "assigned", `Assigned to ${name || `User #${data.assigned_to}`}`);
    }
  }
  if (data.sla_due_date !== undefined) {
    await logActivity(
      orgId,
      id,
      userId,
      "sla_set",
      data.sla_due_date ? `SLA due date set to ${String(data.sla_due_date).slice(0, 10)}` : "SLA due date cleared",
    );
  }
  return updated;
}

// The unified activity feed for an application (most recent first).
export async function getActivity(orgId: number, applicationId: string): Promise<ApplicationActivity[]> {
  const db = getDB();
  const app = await db.findOne<Application>("applications", { id: applicationId, organization_id: orgId });
  if (!app) throw new NotFoundError("Application", applicationId);

  const result = await db.findMany<any>("application_activity", {
    filters: { organization_id: orgId, application_id: applicationId },
    sort: { field: "created_at", order: "desc" },
    limit: 200,
  });

  // Resolve actor names (EmpCloud users) for display.
  const actorIds = [...new Set(result.data.map((r) => r.actor_id).filter((x): x is number => x != null))];
  const names = new Map<number, string>();
  await Promise.all(
    actorIds.map(async (uid) => {
      const u = await findUserById(uid).catch(() => null);
      if (u) names.set(uid, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim());
    }),
  );
  return result.data.map((r) => ({ ...r, actor_name: r.actor_id != null ? names.get(r.actor_id) ?? null : null }));
}

export async function listApplications(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    job_id?: string;
    stage?: string;
    candidate_id?: string;
    search?: string;
    department?: string;
    location?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    order?: "asc" | "desc";
  },
): Promise<{ data: any[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const offset = (page - 1) * perPage;

  // Build filters
  const conditions: string[] = ["a.organization_id = ?"];
  const queryParams: any[] = [orgId];

  if (params.job_id) {
    conditions.push("a.job_id = ?");
    queryParams.push(params.job_id);
  }
  if (params.stage) {
    conditions.push("a.stage = ?");
    queryParams.push(params.stage);
  }
  if (params.candidate_id) {
    conditions.push("a.candidate_id = ?");
    queryParams.push(params.candidate_id);
  }
  // #1365 — Support candidate name/email search from Schedule Interview UI
  if (params.search) {
    const like = `%${params.search}%`;
    conditions.push(
      "(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR j.title LIKE ?)"
    );
    queryParams.push(like, like, like, like, like);
  }
  if (params.department) {
    conditions.push("j.department = ?");
    queryParams.push(params.department);
  }
  if (params.location) {
    conditions.push("j.location = ?");
    queryParams.push(params.location);
  }
  // Date range on the application's applied date (inclusive, date-only).
  if (params.date_from) {
    conditions.push("DATE(a.applied_at) >= ?");
    queryParams.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push("DATE(a.applied_at) <= ?");
    queryParams.push(params.date_to);
  }

  const whereClause = conditions.join(" AND ");

  const countRows = await db.raw<any[][]>(
    `SELECT COUNT(*) as total FROM applications a
     LEFT JOIN candidates c ON c.id = a.candidate_id
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE ${whereClause}`,
    queryParams,
  );
  const total = Number(countRows[0]?.[0]?.total ?? 0);

  // Allowlist the sort column — never interpolate a request string into SQL.
  const { column: sortField, direction: sortOrder } = safeOrderBy(
    params.sort,
    params.order,
    ["applied_at", "created_at", "updated_at", "stage", "rating"],
    "applied_at",
  );

  const dataRows = await db.raw<any[][]>(
    // #16 — also expose a concatenated candidate_name so the Schedule
    // Interview picker (and any future UI that wants a display label)
    // doesn't have to stitch first/last together on the client.
    `SELECT a.*,
            c.first_name AS candidate_first_name,
            c.last_name  AS candidate_last_name,
            c.email      AS candidate_email,
            TRIM(CONCAT(COALESCE(c.first_name,''), ' ', COALESCE(c.last_name,''))) AS candidate_name,
            j.title      AS job_title,
            j.department AS job_department
     FROM applications a
     LEFT JOIN candidates c ON c.id = a.candidate_id
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE ${whereClause}
     ORDER BY a.\`${sortField}\` ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...queryParams, perPage, offset],
  );

  return { data: dataRows[0] as any[], total, page, perPage };
}

export async function getApplication(orgId: number, id: string): Promise<any> {
  const db = getDB();

  const rows = await db.raw<any[][]>(
    `SELECT a.*, c.first_name as candidate_first_name, c.last_name as candidate_last_name, c.email as candidate_email, c.phone as candidate_phone, j.title as job_title, j.department as job_department
     FROM applications a
     LEFT JOIN candidates c ON c.id = a.candidate_id
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE a.id = ? AND a.organization_id = ?`,
    [id, orgId],
  );

  const app = rows[0]?.[0];
  if (!app) throw new NotFoundError("Application", id);

  // Resolve the assigned recruiter's name (EmpCloud user) for display. Guard on
  // org membership so a stale/foreign assigned_to can never leak a cross-org
  // user's name (assignment is org-validated on write, this is defense-in-depth).
  if (app.assigned_to != null) {
    const u = await findUserById(app.assigned_to).catch(() => null);
    app.assignee_name =
      u && u.organization_id === orgId ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null : null;
  } else {
    app.assignee_name = null;
  }
  return app;
}

export async function getTimeline(
  orgId: number,
  applicationId: string,
): Promise<ApplicationStageHistory[]> {
  const db = getDB();

  // Verify the application exists
  const app = await db.findOne<Application>("applications", { id: applicationId, organization_id: orgId });
  if (!app) throw new NotFoundError("Application", applicationId);

  const result = await db.findMany<ApplicationStageHistory>("application_stage_history", {
    filters: { application_id: applicationId },
    sort: { field: "created_at", order: "asc" },
    limit: 200,
  });

  return result.data;
}

export async function addNote(
  orgId: number,
  applicationId: string,
  userId: number,
  note: string,
): Promise<Application> {
  const db = getDB();
  const app = await db.findOne<Application>("applications", { id: applicationId, organization_id: orgId });
  if (!app) throw new NotFoundError("Application", applicationId);

  // Append atomically via SQL so two reviewers adding notes concurrently don't
  // clobber each other (audit M18 — the previous read-modify-write lost updates).
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] (User ${userId}): ${note}`;
  await db.raw(
    `UPDATE applications
        SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE CONCAT(notes, '\n\n', ?) END
      WHERE id = ? AND organization_id = ?`,
    [entry, entry, applicationId, orgId],
  );
  const updated = await db.findOne<Application>("applications", { id: applicationId, organization_id: orgId });
  await logActivity(orgId, applicationId, userId, "note", note.slice(0, 200));
  return updated as Application;
}

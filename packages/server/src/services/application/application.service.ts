import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { safeOrderBy } from "../../utils/sort";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors";
import type { Application, ApplicationStageHistory } from "@emp-recruit/shared";

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

  const application = await db.create<Application>("applications", record as any);

  // Insert initial stage history
  await db.create("application_stage_history", {
    id: uuidv4(),
    application_id: id,
    from_stage: null,
    to_stage: "applied",
    changed_by: 0, // system
    notes: "Application submitted",
  });

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

  return updated;
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

  // Append note to existing notes
  const existingNotes = app.notes ? app.notes + "\n\n" : "";
  const timestamp = new Date().toISOString();
  const updatedNotes = `${existingNotes}[${timestamp}] (User ${userId}): ${note}`;

  return db.update<Application>("applications", applicationId, { notes: updatedNotes } as any);
}

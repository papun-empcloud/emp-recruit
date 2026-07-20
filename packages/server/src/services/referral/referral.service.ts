// ============================================================================
// REFERRAL SERVICE
// Employee referrals: submit, list, update status, track bonuses.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { Referral, Candidate, Application, JobPosting } from "@emp-recruit/shared";

interface SubmitReferralData {
  job_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  relationship?: string;
  notes?: string;
  resume_path?: string;
}

interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  referrerId?: number; // for employee: show only own referrals
}

export async function submitReferral(
  orgId: number,
  userId: number,
  data: SubmitReferralData,
): Promise<Referral> {
  const db = getDB();

  // Validate job exists and is open
  const job = await db.findOne<JobPosting>("job_postings", {
    id: data.job_id,
    organization_id: orgId,
    status: "open",
  });
  if (!job) {
    throw new NotFoundError("Job posting", data.job_id);
  }

  // Check if candidate already exists in this org
  let candidate = await db.findOne<Candidate>("candidates", {
    organization_id: orgId,
    email: data.email,
  });

  if (!candidate) {
    candidate = await db.create<Candidate>("candidates", {
      organization_id: orgId,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      source: "referral",
      resume_path: data.resume_path || null,
    } as Partial<Candidate>);
  }

  // #1361 — Prevent duplicate applications for the same candidate/job
  const existingApplication = await db.findOne<Application>("applications", {
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: candidate.id,
  });
  if (existingApplication) {
    throw new ValidationError("You have already applied for this job");
  }

  // Create application linked to referral
  const application = await db.create<Application>("applications", {
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: candidate.id,
    stage: "applied",
    source: "referral",
  } as Partial<Application>);

  // Create referral record
  const referral = await db.create<Referral>("referrals", {
    organization_id: orgId,
    job_id: data.job_id,
    referrer_id: userId,
    candidate_id: candidate.id,
    application_id: application.id,
    status: "submitted",
    relationship: data.relationship || null,
    notes: data.notes || null,
  } as Partial<Referral>);

  // Log stage history
  await db.create("application_stage_history", {
    application_id: application.id,
    from_stage: null,
    to_stage: "applied",
    changed_by: userId,
    notes: "Referred by employee",
  });

  logger.info(`Referral submitted by user ${userId} for ${data.email} to job ${job.title}`);

  return referral;
}

export async function listReferrals(
  orgId: number,
  params: ListParams,
): Promise<{
  data: (Referral & { candidate_name: string; job_title: string })[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page || 1;
  const limit = params.limit || 20;

  let rows: Referral[];
  let total: number;
  let totalPages: number;

  const search = params.search?.trim();
  if (search) {
    // The referred candidate's name/email and the job title live in joined
    // tables, so a text search reaches across candidates and job_postings.
    const like = `%${search}%`;
    const offset = (page - 1) * limit;
    const filterClause =
      (params.status ? "AND r.status = ? " : "") +
      (params.referrerId ? "AND r.referrer_id = ? " : "");
    const filterArgs: any[] = [];
    if (params.status) filterArgs.push(params.status);
    if (params.referrerId) filterArgs.push(params.referrerId);
    const searchArgs = [like, like, like, like, like];

    const joinWhere = `FROM referrals r
        JOIN candidates c ON c.id = r.candidate_id
        JOIN job_postings j ON j.id = r.job_id
       WHERE r.organization_id = ? ${filterClause}
         AND (c.first_name LIKE ? OR c.last_name LIKE ?
              OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.email LIKE ? OR j.title LIKE ?)`;

    const countRows = await db.raw<any[][]>(
      `SELECT COUNT(*) as total ${joinWhere}`,
      [orgId, ...filterArgs, ...searchArgs],
    );
    total = Number(countRows[0]?.[0]?.total ?? 0);

    const dataRows = await db.raw<any[][]>(
      `SELECT r.* ${joinWhere} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [orgId, ...filterArgs, ...searchArgs, limit, offset],
    );
    rows = dataRows[0] as Referral[];
    totalPages = Math.max(1, Math.ceil(total / limit));
  } else {
    const filters: Record<string, any> = { organization_id: orgId };
    if (params.status) filters.status = params.status;
    if (params.referrerId) filters.referrer_id = params.referrerId;

    const result = await db.findMany<Referral>("referrals", {
      page,
      limit,
      filters,
      sort: { field: "created_at", order: "desc" },
    });
    rows = result.data;
    total = result.total;
    totalPages = result.totalPages;
  }

  // Enrich with candidate name and job title
  const enriched = await Promise.all(
    rows.map(async (ref) => {
      const candidate = await db.findById<Candidate>("candidates", ref.candidate_id);
      const job = await db.findById<JobPosting>("job_postings", ref.job_id);
      return {
        ...ref,
        candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
        job_title: job?.title || "Unknown",
      };
    }),
  );

  return {
    data: enriched,
    total,
    page,
    perPage: limit,
    totalPages,
  };
}

export async function updateReferralStatus(
  orgId: number,
  id: string,
  status: string,
  bonusAmount?: number,
): Promise<Referral> {
  const db = getDB();

  const referral = await db.findOne<Referral>("referrals", { id, organization_id: orgId });
  if (!referral) {
    throw new NotFoundError("Referral", id);
  }

  // A paid bonus is terminal — block re-paying or amount changes so a bonus
  // can't be re-recorded repeatedly or edited after payment (audit M13).
  if (referral.status === "bonus_paid") {
    throw new ValidationError("This referral bonus has already been paid and cannot be changed");
  }

  const updateData: Partial<Referral> = { status } as Partial<Referral>;

  if (bonusAmount !== undefined) {
    if (!Number.isInteger(bonusAmount) || bonusAmount < 0) {
      throw new ValidationError("Bonus amount must be a non-negative integer (minor units)");
    }
    (updateData as any).bonus_amount = bonusAmount;
  }

  if (status === "bonus_paid") {
    (updateData as any).bonus_paid_at = new Date();
  }

  const updated = await db.update<Referral>("referrals", id, updateData);

  logger.info(`Referral ${id} status updated to ${status}`);

  return updated;
}

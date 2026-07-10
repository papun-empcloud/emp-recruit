// ============================================================================
// OFFER SERVICE
// Business logic for offer management, approval workflow, and candidate response.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, AppError } from "../../utils/errors";
import { toMysqlDateTime } from "../../utils/date";
import { logger } from "../../utils/logger";
import * as onboardingService from "../onboarding/onboarding.service";
import type { Offer, OfferApprover, OfferStatus } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateOfferData {
  application_id: string;
  candidate_id?: string;
  job_id?: string;
  salary_amount: number;
  salary_currency: string;
  joining_date: string;
  expiry_date: string;
  job_title?: string;
  department?: string;
  benefits?: string;
  notes?: string;
  created_by: number;
}

interface UpdateOfferData {
  salary_amount?: number;
  salary_currency?: string;
  joining_date?: string;
  expiry_date?: string;
  job_title?: string;
  department?: string;
  benefits?: string;
  notes?: string;
}

interface ListOffersParams {
  status?: OfferStatus;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createOffer(orgId: number, data: CreateOfferData): Promise<Offer> {
  const db = getDB();

  // Verify application belongs to this org
  const application = await db.findOne<any>("applications", {
    id: data.application_id,
    organization_id: orgId,
  });
  if (!application) {
    throw new NotFoundError("Application", data.application_id);
  }

  // Auto-derive candidate_id and job_id from application if not provided
  const candidateId = data.candidate_id || application.candidate_id;
  const jobId = data.job_id || application.job_id;

  // Default job_title/department from the actual job so an offer can't silently
  // drift from the role the candidate applied to (e.g. an Engineering job with a
  // "Design" department typed on the offer). Explicit values still win.
  const job = jobId
    ? await db.findOne<any>("job_postings", { id: jobId, organization_id: orgId })
    : null;

  const resolvedJobTitle = data.job_title || job?.title;
  if (!resolvedJobTitle) {
    throw new ValidationError("Job title is required (and could not be derived from the job)");
  }

  // Offers that are still "live" — anything not terminally closed. A new offer
  // is only a duplicate against one of these; a candidate can be re-offered
  // after a prior offer was declined/revoked/expired.
  const TERMINAL = ["declined", "revoked", "expired"];

  // Check no active offer exists for this application
  const existingOffer = await db.findOne<Offer>("offers", {
    application_id: data.application_id,
    organization_id: orgId,
  });
  if (existingOffer && !TERMINAL.includes(existingOffer.status)) {
    throw new ValidationError("An active offer already exists for this application");
  }

  // Guard against a duplicate offer for the same candidate + role reached via a
  // DIFFERENT application (e.g. the candidate applied to the same job twice, or
  // an offer was raised on each application). The per-application check above
  // misses that, which let two live offers for one candidate/role slip through.
  if (candidateId && jobId) {
    const sameRoleOffers = await db.findMany<Offer>("offers", {
      filters: { organization_id: orgId, candidate_id: candidateId, job_id: jobId },
      limit: 100,
    });
    const activeDuplicate = sameRoleOffers.data.find((o) => !TERMINAL.includes(o.status));
    if (activeDuplicate) {
      throw new ValidationError(
        "An active offer already exists for this candidate and role. Revoke or close the existing offer before creating a new one.",
      );
    }
  }

  const offer = await db.create<Offer>("offers", {
    organization_id: orgId,
    application_id: data.application_id,
    candidate_id: candidateId,
    job_id: jobId,
    status: "draft" as OfferStatus,
    salary_amount: data.salary_amount,
    salary_currency: data.salary_currency,
    joining_date: data.joining_date,
    expiry_date: data.expiry_date,
    job_title: resolvedJobTitle,
    department: data.department || job?.department || null,
    benefits: data.benefits || null,
    notes: data.notes || null,
    created_by: data.created_by,
  });

  // Move application to offer stage
  await db.update("applications", data.application_id, { stage: "offer" });

  return offer;
}

export async function updateOffer(orgId: number, id: string, data: UpdateOfferData): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "draft") {
    throw new ValidationError("Only draft offers can be edited");
  }

  return db.update<Offer>("offers", id, data);
}

export async function getOffer(
  orgId: number,
  id: string,
): Promise<
  Offer & {
    approvers: OfferApprover[];
    candidate_name: string;
    candidate_email: string | null;
    job_title_display: string;
  }
> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }

  const approversResult = await db.findMany<OfferApprover>("offer_approvers", {
    filters: { offer_id: id },
    sort: { field: "order", order: "asc" },
    limit: 100,
  });

  // Resolve candidate/job so the detail view can show names, not raw UUIDs
  // (mirrors the enrichment listOffers already does).
  const candidate = await db.findById<any>("candidates", offer.candidate_id);
  const job = offer.job_id ? await db.findById<any>("job_postings", offer.job_id) : null;

  return {
    ...offer,
    candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
    candidate_email: candidate?.email ?? null,
    job_title_display: job?.title || offer.job_title,
    approvers: approversResult.data,
  };
}

export async function listOffers(orgId: number, params: ListOffersParams) {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) {
    filters.status = params.status;
  }

  const result = await db.findMany<Offer>("offers", {
    filters,
    page: params.page || 1,
    limit: params.limit || 20,
    sort: { field: "created_at", order: "desc" },
  });

  // Enrich with candidate and job info
  const enriched = await Promise.all(
    result.data.map(async (offer) => {
      const candidate = await db.findById<any>("candidates", offer.candidate_id);
      const job = await db.findById<any>("job_postings", offer.job_id);
      return {
        ...offer,
        candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
        job_title_display: job?.title || offer.job_title,
      };
    }),
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function submitForApproval(
  orgId: number,
  id: string,
  approverUserIds: number[],
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "draft") {
    throw new ValidationError("Only draft offers can be submitted for approval");
  }
  if (!approverUserIds || approverUserIds.length === 0) {
    throw new ValidationError("At least one approver is required");
  }

  // Create approver records
  for (let i = 0; i < approverUserIds.length; i++) {
    await db.create<OfferApprover>("offer_approvers", {
      offer_id: id,
      user_id: approverUserIds[i],
      order: i + 1,
      status: "pending",
    });
  }

  return db.update<Offer>("offers", id, { status: "pending_approval" as OfferStatus });
}

export async function approve(
  orgId: number,
  offerId: string,
  userId: number,
  userRole: string,
  comment?: string,
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }
  if (offer.status !== "pending_approval") {
    throw new ValidationError("Offer is not pending approval");
  }

  const PRIVILEGED_ROLES = ["super_admin", "org_admin", "hr_admin"];
  const isPrivileged = PRIVILEGED_ROLES.includes(userRole);

  // Find this user's approver record (may not exist for privileged overrides)
  const approver = await db.findOne<OfferApprover>("offer_approvers", {
    offer_id: offerId,
    user_id: userId,
  });

  if (!approver && !isPrivileged) {
    throw new AppError(403, "FORBIDDEN", "You are not an approver for this offer");
  }
  if (approver && approver.status !== "pending") {
    throw new ValidationError("You have already acted on this offer");
  }

  // Mark this approver as approved (if they are one)
  if (approver) {
    await db.update("offer_approvers", approver.id, {
      status: "approved",
      notes: comment || null,
      acted_at: toMysqlDateTime(),
    });
  }

  // Privileged override — mark any remaining pending approvers as approved so
  // the offer transitions out of pending_approval immediately.
  if (isPrivileged) {
    await db.updateMany(
      "offer_approvers",
      { offer_id: offerId, status: "pending" },
      { status: "approved", notes: comment || null, acted_at: toMysqlDateTime() },
    );
  }

  // Check if all approvers have approved
  const pendingCount = await db.count("offer_approvers", {
    offer_id: offerId,
    status: "pending",
  });

  if (pendingCount === 0) {
    return db.update<Offer>("offers", offerId, {
      status: "approved" as OfferStatus,
      approved_by: userId,
      approved_at: toMysqlDateTime(),
    });
  }

  return db.findById<Offer>("offers", offerId) as Promise<Offer>;
}

export async function reject(
  orgId: number,
  offerId: string,
  userId: number,
  userRole: string,
  comment?: string,
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }
  if (offer.status !== "pending_approval") {
    throw new ValidationError("Offer is not pending approval");
  }

  const PRIVILEGED_ROLES = ["super_admin", "org_admin", "hr_admin"];
  const isPrivileged = PRIVILEGED_ROLES.includes(userRole);

  const approver = await db.findOne<OfferApprover>("offer_approvers", {
    offer_id: offerId,
    user_id: userId,
  });
  if (!approver && !isPrivileged) {
    throw new AppError(403, "FORBIDDEN", "You are not an approver for this offer");
  }

  if (approver) {
    await db.update("offer_approvers", approver.id, {
      status: "rejected",
      notes: comment || null,
      acted_at: toMysqlDateTime(),
    });
  }

  // Mark entire offer as rejected (any single rejection rejects the offer)
  return db.update<Offer>("offers", offerId, { status: "draft" as OfferStatus });
}

export async function sendOffer(orgId: number, id: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "approved") {
    throw new ValidationError("Only approved offers can be sent");
  }

  return db.update<Offer>("offers", id, {
    status: "sent" as OfferStatus,
    sent_at: toMysqlDateTime(),
  });
}

export async function revokeOffer(orgId: number, id: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (!["sent", "approved", "pending_approval"].includes(offer.status)) {
    throw new ValidationError("This offer cannot be revoked in its current status");
  }

  return db.update<Offer>("offers", id, { status: "revoked" as OfferStatus });
}

export async function acceptOffer(orgId: number, id: string, notes?: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "sent") {
    throw new ValidationError("Only sent offers can be accepted");
  }

  // Update offer
  const updated = await db.update<Offer>("offers", id, {
    status: "accepted" as OfferStatus,
    notes: notes || offer.notes,
    responded_at: toMysqlDateTime(),
  });

  // Move application to hired stage
  await db.update("applications", offer.application_id, { stage: "hired" });

  // Mark the underlying job posting as "filled" so HR sees it in the Filled
  // tab on the job listings page.
  let department: string | null = null;
  if (offer.job_id) {
    const job = await db.findOne<{ id: string; status: string; department: string | null }>(
      "job_postings",
      { id: offer.job_id, organization_id: orgId },
    );
    department = job?.department ?? null;
    if (job && job.status !== "closed") {
      await db.update("job_postings", offer.job_id, { status: "filled" });
    }
  }

  // Auto-generate the onboarding checklist for the new hire (the offer-to-
  // onboarding handoff the UI advertises). Best-effort — a missing default
  // template or any error must never fail the acceptance itself.
  try {
    const joining = offer.joining_date
      ? String(offer.joining_date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const checklist = await onboardingService.autoGenerateOnAcceptance(
      orgId,
      offer.application_id,
      joining,
      department,
    );
    if (checklist) {
      logger.info(`Onboarding checklist auto-generated for accepted offer ${id}`);
    } else {
      logger.info(`Offer ${id} accepted but no default onboarding template — checklist skipped`);
    }
  } catch (err) {
    logger.error(`Onboarding auto-generation failed for offer ${id}:`, err);
  }

  // Notify EMP Cloud about the hire (non-blocking)
  const webhookUrl = process.env.EMPCLOUD_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "recruit.candidate_hired",
        data: {
          candidateId: offer.candidate_id,
          jobTitle: offer.job_title,
          joiningDate: offer.joining_date,
        },
        source: "emp-recruit",
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // fire-and-forget
  }

  return updated;
}

export async function declineOffer(orgId: number, id: string, notes?: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "sent") {
    throw new ValidationError("Only sent offers can be declined");
  }

  return db.update<Offer>("offers", id, {
    status: "declined" as OfferStatus,
    notes: notes || offer.notes,
    responded_at: toMysqlDateTime(),
  });
}

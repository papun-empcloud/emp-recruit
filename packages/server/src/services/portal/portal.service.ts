// ============================================================================
// PORTAL SERVICE
// Candidate-facing portal: magic link auth, application tracking, interviews.
// Candidates do NOT need an EmpCloud account — a short-lived JWT is issued
// directly to their email address.
// ============================================================================

import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { sendEmail } from "../email/email.service";
import { NotFoundError, ValidationError, AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  Application,
  ApplicationStageHistory,
  Interview,
  Offer,
  Candidate,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORTAL_TOKEN_EXPIRY = "24h";
const PORTAL_TOKEN_ISSUER = "emp-recruit-portal";

/** Escape user-derived values before interpolating them into raw HTML emails
 *  to prevent HTML/markup injection (audit L6). */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PortalTokenPayload {
  candidateId: string;
  email: string;
  orgId: number;
  iss: string;
  type: "portal";
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

export function generatePortalToken(
  candidateId: string,
  email: string,
  orgId: number,
): string {
  const payload: Omit<PortalTokenPayload, "iss"> = {
    candidateId,
    email,
    orgId,
    type: "portal",
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: PORTAL_TOKEN_EXPIRY,
    issuer: PORTAL_TOKEN_ISSUER,
  });
}

// ---------------------------------------------------------------------------
// Send portal magic link
// ---------------------------------------------------------------------------

export async function sendPortalLink(candidateId: string, orgId: number): Promise<void> {
  const db = getDB();

  const candidate = await db.findOne<Candidate>("candidates", {
    id: candidateId,
    organization_id: orgId,
  });
  if (!candidate) {
    throw new NotFoundError("Candidate", candidateId);
  }

  const token = generatePortalToken(candidateId, candidate.email, orgId);
  const portalUrl = `${config.cors.origin}/portal/dashboard?token=${token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Candidate Portal Access</h2>
      <p>Hi ${escapeHtml(candidate.first_name)},</p>
      <p>You can view your application status and upcoming interviews using the link below:</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}"
           style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View My Applications
        </a>
      </p>
      <p style="color: #6B7280; font-size: 14px;">
        This link expires in 24 hours. If it has expired, you can request a new one from the portal page.
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px;">Powered by EMP Recruit</p>
    </div>
  `;

  // Staff-initiated send, so a transport failure should be reported rather than
  // swallowed. (requestAccess below deliberately does the opposite — it must
  // stay silent to avoid leaking which emails exist.)
  try {
    await sendEmail(candidate.email, "Your Candidate Portal Access Link", html);
  } catch (err) {
    logger.error(
      `Failed to send portal link to candidate ${candidateId} (${candidate.email}): ${String(err)}`,
    );
    throw new AppError(
      502,
      "EMAIL_SEND_FAILED",
      "Couldn't email the portal link. Check the mail server settings and try again.",
    );
  }
  logger.info(`Portal link sent to candidate ${candidateId} (${candidate.email})`);
}

// ---------------------------------------------------------------------------
// Request access — candidate enters email, we find them and send magic link
// ---------------------------------------------------------------------------

export async function requestAccess(email: string): Promise<{ sent: boolean }> {
  const db = getDB();

  // Find all candidates with this email (could be across multiple orgs)
  const rows = await db.raw<any[][]>(
    "SELECT id, organization_id, first_name, email FROM candidates WHERE email = ? LIMIT 10",
    [email],
  );

  const candidates = rows[0] as Array<{
    id: string;
    organization_id: number;
    first_name: string;
    email: string;
  }>;

  if (candidates.length === 0) {
    // Don't reveal whether email exists — always return success
    logger.info(`Portal access requested for unknown email: ${email}`);
    return { sent: true };
  }

  // Send a link for each org where the candidate exists. Email delivery is
  // best-effort: a mail failure must NOT surface to the caller — otherwise the
  // request would 500 (leaking internal infra) and behave differently from the
  // unknown-email path, enabling account enumeration. We always return the same
  // neutral result and log failures server-side instead.
  for (const c of candidates) {
    const token = generatePortalToken(c.id, c.email, c.organization_id);
    const portalUrl = `${config.cors.origin}/portal/dashboard?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Candidate Portal Access</h2>
        <p>Hi ${escapeHtml(c.first_name)},</p>
        <p>You requested access to the candidate portal. Click below to view your applications:</p>
        <p style="margin: 24px 0;">
          <a href="${portalUrl}"
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View My Applications
          </a>
        </p>
        <p style="color: #6B7280; font-size: 14px;">
          This link expires in 24 hours.
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #9CA3AF; font-size: 12px;">Powered by EMP Recruit</p>
      </div>
    `;

    try {
      await sendEmail(c.email, "Your Candidate Portal Access Link", html);
    } catch (err) {
      logger.error(`Failed to send portal access email to ${c.email}:`, err);
      // In non-production, surface the link in the logs so the portal is still
      // usable without a running SMTP server (e.g. Mailhog on :1025).
      if (config.env !== "production") {
        logger.warn(`[dev] Portal access link for ${c.email}: ${portalUrl}`);
      }
    }
  }

  logger.info(`Portal access requested for email: ${email} (${candidates.length} org(s))`);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Get candidate portal overview
// ---------------------------------------------------------------------------

export async function getCandidatePortal(
  candidateId: string,
  orgId: number,
): Promise<{
  candidate: Candidate;
  applications: Array<
    Application & {
      job_title: string;
      job_department: string | null;
      stage_history: ApplicationStageHistory[];
    }
  >;
}> {
  const db = getDB();

  const candidate = await db.findOne<Candidate>("candidates", {
    id: candidateId,
    organization_id: orgId,
  });
  if (!candidate) {
    throw new NotFoundError("Candidate", candidateId);
  }

  // Get all applications with job info
  const appRows = await db.raw<any[][]>(
    `SELECT a.*, j.title as job_title, j.department as job_department
     FROM applications a
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE a.candidate_id = ? AND a.organization_id = ?
     ORDER BY a.applied_at DESC`,
    [candidateId, orgId],
  );

  const applications = appRows[0] as any[];

  // Get stage history for each application
  for (const app of applications) {
    const historyResult = await db.findMany<ApplicationStageHistory>(
      "application_stage_history",
      {
        filters: { application_id: app.id },
        sort: { field: "created_at", order: "asc" },
        limit: 200,
      },
    );
    app.stage_history = historyResult.data;
  }

  return { candidate, applications };
}

// ---------------------------------------------------------------------------
// Get detailed application status with timeline
// ---------------------------------------------------------------------------

export async function getApplicationStatus(
  candidateId: string,
  applicationId: string,
  orgId: number,
): Promise<{
  application: any;
  timeline: ApplicationStageHistory[];
  interviews: Interview[];
  offers: Offer[];
}> {
  const db = getDB();

  // Get application with job info
  const appRows = await db.raw<any[][]>(
    `SELECT a.*, j.title as job_title, j.department as job_department, j.location as job_location
     FROM applications a
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE a.id = ? AND a.candidate_id = ? AND a.organization_id = ?`,
    [applicationId, candidateId, orgId],
  );

  const application = appRows[0]?.[0];
  if (!application) {
    throw new NotFoundError("Application", applicationId);
  }

  // Get timeline
  const historyResult = await db.findMany<ApplicationStageHistory>(
    "application_stage_history",
    {
      filters: { application_id: applicationId },
      sort: { field: "created_at", order: "asc" },
      limit: 200,
    },
  );

  // Get interviews for this application
  const interviewResult = await db.findMany<Interview>("interviews", {
    filters: { application_id: applicationId, organization_id: orgId },
    sort: { field: "scheduled_at", order: "asc" },
    limit: 50,
  });

  // Get offers for this application
  const offerResult = await db.findMany<Offer>("offers", {
    filters: { application_id: applicationId, organization_id: orgId },
    sort: { field: "created_at", order: "desc" },
    limit: 10,
  });

  return {
    application,
    timeline: historyResult.data,
    interviews: interviewResult.data,
    offers: offerResult.data,
  };
}

// ---------------------------------------------------------------------------
// Get upcoming interviews for a candidate
// ---------------------------------------------------------------------------

export async function getUpcomingInterviews(
  candidateId: string,
  orgId: number,
): Promise<any[]> {
  const db = getDB();

  const rows = await db.raw<any[][]>(
    `SELECT i.*, a.job_id, j.title as job_title, j.department as job_department
     FROM interviews i
     JOIN applications a ON a.id = i.application_id
     LEFT JOIN job_postings j ON j.id = a.job_id
     WHERE a.candidate_id = ?
       AND a.organization_id = ?
       AND i.status IN ('scheduled', 'in_progress')
       AND i.scheduled_at >= NOW()
     ORDER BY i.scheduled_at ASC`,
    [candidateId, orgId],
  );

  return rows[0] as any[];
}

// ---------------------------------------------------------------------------
// Get pending offers for a candidate
// ---------------------------------------------------------------------------

export async function getPendingOffers(
  candidateId: string,
  orgId: number,
): Promise<Offer[]> {
  const db = getDB();

  const rows = await db.raw<any[][]>(
    `SELECT o.*, j.title as job_title, j.department as job_department
     FROM offers o
     LEFT JOIN job_postings j ON j.id = o.job_id
     WHERE o.candidate_id = ?
       AND o.organization_id = ?
       AND o.status IN ('sent', 'approved')
     ORDER BY o.created_at DESC`,
    [candidateId, orgId],
  );

  return rows[0] as Offer[];
}

// ---------------------------------------------------------------------------
// Upload document (ID proof, certificates, etc.)
// ---------------------------------------------------------------------------

export async function uploadDocument(
  candidateId: string,
  orgId: number,
  file: Express.Multer.File,
): Promise<{ path: string }> {
  const db = getDB();

  const candidate = await db.findOne<Candidate>("candidates", {
    id: candidateId,
    organization_id: orgId,
  });
  if (!candidate) {
    throw new NotFoundError("Candidate", candidateId);
  }

  const relativePath = `/uploads/portal-documents/${orgId}/${file.filename}`;

  logger.info(`Document uploaded by candidate ${candidateId}: ${relativePath}`);

  return { path: relativePath };
}

// ============================================================================
// OFFER LETTER SERVICE
// Template management, Handlebars rendering, and offer letter generation.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import Handlebars from "handlebars";
import path from "path";
import fs from "fs/promises";
import { getDB } from "../../db/adapters";
import { findOrgById } from "../../db/empcloud";
import { AppError, NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { toMysqlDateTime } from "../../utils/date";
import * as emailService from "../email/email.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfferLetterTemplate {
  id: string;
  organization_id: number;
  name: string;
  content_template: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GeneratedOfferLetter {
  id: string;
  organization_id: number;
  offer_id: string;
  template_id: string;
  content: string;
  file_path: string | null;
  generated_by: number;
  sent_at: string | null;
  created_at: string;
}

interface CreateTemplateData {
  name: string;
  content_template: string;
  is_default?: boolean;
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function createLetterTemplate(
  orgId: number,
  data: CreateTemplateData,
): Promise<OfferLetterTemplate> {
  const db = getDB();

  if (!data.name || !data.content_template) {
    throw new ValidationError("Name and content template are required");
  }

  // Prevent duplicate template names within an org.
  const dupe = await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    organization_id: orgId,
    name: data.name.trim(),
    is_active: true,
  });
  if (dupe) {
    throw new ValidationError(`A template named "${data.name.trim()}" already exists`);
  }

  // If marking as default, unset other defaults first
  if (data.is_default) {
    await db.updateMany(
      "offer_letter_templates",
      { organization_id: orgId, is_default: true },
      { is_default: false },
    );
  }

  return db.create<OfferLetterTemplate>("offer_letter_templates", {
    organization_id: orgId,
    name: data.name.trim(),
    content_template: data.content_template,
    is_default: data.is_default ?? false,
    is_active: true,
  } as Partial<OfferLetterTemplate>);
}

export async function updateLetterTemplate(
  orgId: number,
  id: string,
  data: CreateTemplateData,
): Promise<OfferLetterTemplate> {
  const db = getDB();

  const existing = await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("Offer letter template", id);

  if (!data.name || !data.content_template) {
    throw new ValidationError("Name and content template are required");
  }

  // Prevent renaming onto another template's name.
  const dupe = await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    organization_id: orgId,
    name: data.name.trim(),
    is_active: true,
  });
  if (dupe && dupe.id !== id) {
    throw new ValidationError(`A template named "${data.name.trim()}" already exists`);
  }

  // If marking as default, unset other defaults first.
  if (data.is_default) {
    await db.updateMany(
      "offer_letter_templates",
      { organization_id: orgId, is_default: true },
      { is_default: false },
    );
  }

  await db.update<OfferLetterTemplate>("offer_letter_templates", id, {
    name: data.name.trim(),
    content_template: data.content_template,
    is_default: data.is_default ?? false,
  } as Partial<OfferLetterTemplate>);

  return (await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    id,
    organization_id: orgId,
  }))!;
}

export async function deleteLetterTemplate(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const existing = await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("Offer letter template", id);

  // Soft-delete (is_active=false) rather than a hard delete: generated letters
  // FK to template_id with ON DELETE CASCADE, so a hard delete would wipe the
  // history of letters already generated from this template. Soft-delete hides
  // it from the list while preserving that history.
  await db.update<OfferLetterTemplate>("offer_letter_templates", id, {
    is_active: false,
  } as Partial<OfferLetterTemplate>);
}

export async function listLetterTemplates(orgId: number): Promise<OfferLetterTemplate[]> {
  const db = getDB();
  const result = await db.findMany<OfferLetterTemplate>("offer_letter_templates", {
    filters: { organization_id: orgId, is_active: true },
    sort: { field: "name", order: "asc" },
    limit: 100,
  });
  // MySQL stores booleans as tinyint(1); normalize so the client gets real
  // booleans (otherwise `0` leaks into the UI via `is_default && <badge>`).
  return result.data.map((t) => ({ ...t, is_default: Boolean(t.is_default) }));
}

// ---------------------------------------------------------------------------
// Letter Generation
// ---------------------------------------------------------------------------

export async function generateOfferLetter(
  orgId: number,
  offerId: string,
  templateId: string,
  generatedBy: number,
): Promise<GeneratedOfferLetter> {
  const db = getDB();

  // Fetch offer with candidate and job data
  const offer = await db.findOne<any>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }

  const candidate = await db.findById<any>("candidates", offer.candidate_id);
  if (!candidate) {
    throw new NotFoundError("Candidate", offer.candidate_id);
  }

  const job = await db.findById<any>("job_postings", offer.job_id);

  const template = await db.findOne<OfferLetterTemplate>("offer_letter_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Offer letter template", templateId);
  }

  // Resolve the real organization name for the letter (audit M23) — this was
  // using the job's DEPARTMENT (or "Our Organization") as the company name.
  const org = await findOrgById(orgId).catch(() => null);

  // Build template variables
  const variables = {
    candidate: {
      firstName: candidate.first_name,
      lastName: candidate.last_name,
      fullName: `${candidate.first_name} ${candidate.last_name}`,
      email: candidate.email,
      phone: candidate.phone,
    },
    offer: {
      designation: offer.job_title,
      salary: new Intl.NumberFormat("en-IN").format(offer.salary_amount / 100),
      salaryCurrency: offer.salary_currency,
      joiningDate: new Date(offer.joining_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      expiryDate: new Date(offer.expiry_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      department: offer.department || "",
      benefits: offer.benefits || "",
    },
    organization: {
      name: org?.name || job?.department || "Our Organization",
    },
    job: {
      title: job?.title || offer.job_title,
      department: job?.department || "",
      location: job?.location || "",
    },
    date: new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };

  // Render Handlebars template
  const compiled = Handlebars.compile(template.content_template);
  const renderedContent = compiled(variables);

  // Save HTML file to uploads
  const uploadDir = path.join(process.cwd(), "uploads", "offer-letters", String(orgId));
  await fs.mkdir(uploadDir, { recursive: true });

  const fileName = `offer-letter-${offerId}-${Date.now()}.html`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, renderedContent, "utf-8");

  const relativePath = `uploads/offer-letters/${orgId}/${fileName}`;

  // Delete any previous generated letter for this offer
  await db.deleteMany("generated_offer_letters", { offer_id: offerId, organization_id: orgId });

  // Save generated letter record
  const letter = await db.create<GeneratedOfferLetter>("generated_offer_letters", {
    organization_id: orgId,
    offer_id: offerId,
    template_id: templateId,
    content: renderedContent,
    file_path: relativePath,
    generated_by: generatedBy,
  } as Partial<GeneratedOfferLetter>);

  // Update the offer with the letter path
  await db.update("offers", offerId, { offer_letter_path: relativePath });

  logger.info(`Offer letter generated for offer ${offerId} by user ${generatedBy}`);

  return letter;
}

// ---------------------------------------------------------------------------
// Get generated letter
// ---------------------------------------------------------------------------

export async function getOfferLetter(
  orgId: number,
  offerId: string,
): Promise<GeneratedOfferLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedOfferLetter>("generated_offer_letters", {
    offer_id: offerId,
    organization_id: orgId,
  });

  if (!letter) {
    throw new NotFoundError("Generated offer letter for offer", offerId);
  }

  return letter;
}

// ---------------------------------------------------------------------------
// Send letter to candidate via email
// ---------------------------------------------------------------------------

/**
 * Turn a nodemailer/provider transport error into something the recruiter and
 * whoever maintains the deployment can both act on. The underlying error object
 * is logged in full; this is only the user-facing sentence.
 */
function describeEmailFailure(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "ECONNREFUSED":
    case "ESOCKET":
    case "ECONNECTION":
      return "Couldn't reach the mail server, so the offer letter wasn't sent. Check the SMTP settings and try again.";
    case "ETIMEDOUT":
      return "The mail server didn't respond in time, so the offer letter wasn't sent. Check the SMTP settings and try again.";
    case "EAUTH":
      return "The mail server rejected our credentials, so the offer letter wasn't sent. Check the SMTP username and password.";
    case "EENVELOPE":
      return "The mail server rejected the recipient address, so the offer letter wasn't sent.";
    default:
      return "The offer letter couldn't be emailed. Check the mail server configuration and try again.";
  }
}

export async function sendOfferLetter(
  orgId: number,
  offerId: string,
): Promise<GeneratedOfferLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedOfferLetter>("generated_offer_letters", {
    offer_id: offerId,
    organization_id: orgId,
  });
  if (!letter) {
    throw new NotFoundError("Generated offer letter for offer", offerId);
  }

  const offer = await db.findOne<any>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }

  // Don't email a letter for an offer that's been revoked/declined/expired.
  if (["revoked", "declined", "expired"].includes(offer.status)) {
    throw new ValidationError(`Cannot email the letter — this offer is ${offer.status}.`);
  }

  const candidate = await db.findById<any>("candidates", offer.candidate_id);
  if (!candidate) {
    throw new NotFoundError("Candidate", offer.candidate_id);
  }
  if (!candidate.email || !String(candidate.email).trim()) {
    throw new ValidationError(
      "This candidate has no email address on file, so the offer letter can't be sent.",
    );
  }

  // Send email with the rendered letter content as HTML body.
  // A mail-transport failure is an infrastructure problem, not a broken
  // request — surface it as an actionable 502 rather than letting it escape
  // as a bare 500 ("An unexpected error occurred"), which tells the recruiter
  // nothing and hides the real cause from whoever has to fix it.
  try {
    await emailService.sendEmail(
      candidate.email,
      `Offer Letter — ${offer.job_title}`,
      letter.content,
    );
  } catch (err) {
    logger.error(
      `Offer letter email failed for offer ${offerId} to ${candidate.email}: ${String(err)}`,
    );
    throw new AppError(502, "EMAIL_SEND_FAILED", describeEmailFailure(err));
  }

  // Update sent_at (MySQL datetime format, not ISO-with-Z which it rejects)
  const updated = await db.update<GeneratedOfferLetter>("generated_offer_letters", letter.id, {
    sent_at: toMysqlDateTime(),
  } as Partial<GeneratedOfferLetter>);

  logger.info(`Offer letter for offer ${offerId} sent to ${candidate.email}`);

  return updated;
}

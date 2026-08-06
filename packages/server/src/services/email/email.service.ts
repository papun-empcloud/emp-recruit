// ============================================================================
// EMAIL SERVICE
// Email template management and sending via nodemailer + Handlebars.
// ============================================================================

import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { AppError, NotFoundError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { EmailTemplate } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Nodemailer transporter (singleton)
// ---------------------------------------------------------------------------
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth:
        config.email.user && config.email.password
          ? { user: config.email.user, pass: config.email.password }
          : undefined,
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listTemplates(orgId: number): Promise<EmailTemplate[]> {
  const db = getDB();
  const result = await db.findMany<EmailTemplate>("email_templates", {
    filters: { organization_id: orgId },
    sort: { field: "name", order: "asc" },
    limit: 100,
  });
  return result.data;
}

export async function getTemplateById(orgId: number, id: string): Promise<EmailTemplate> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Email template", id);
  }
  return template;
}

export async function createTemplate(
  orgId: number,
  data: { name: string; trigger: string; subject: string; body: string; is_active?: boolean },
): Promise<EmailTemplate> {
  const db = getDB();
  return db.create<EmailTemplate>("email_templates", {
    organization_id: orgId,
    name: data.name,
    trigger: data.trigger,
    subject: data.subject,
    body: data.body,
    is_active: data.is_active !== false,
  } as Partial<EmailTemplate>);
}

export async function updateTemplate(
  orgId: number,
  id: string,
  data: Partial<Pick<EmailTemplate, "name" | "trigger" | "subject" | "body" | "is_active">>,
): Promise<EmailTemplate> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Email template", id);
  }
  return db.update<EmailTemplate>("email_templates", id, data as Partial<EmailTemplate>);
}

export async function deleteTemplate(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Email template", id);
  }
  await db.delete("email_templates", id);
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

export function renderTemplate(
  templateContent: string,
  variables: Record<string, any>,
): string {
  const compiled = Handlebars.compile(templateContent);
  return compiled(variables);
}

// ---------------------------------------------------------------------------
// Send email
// ---------------------------------------------------------------------------

/**
 * Send an email via the configured provider. `EMAIL_PROVIDER=sendgrid` uses the
 * SendGrid Web API; anything else (default) uses SMTP/nodemailer (Mailhog in
 * dev, any SMTP host in prod).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string }> {
  if (config.email.provider === "sendgrid") {
    return sendViaSendGrid(to, subject, html);
  }
  return sendViaSmtp(to, subject, html);
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string }> {
  const transport = getTransporter();

  const info = await transport.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
  });

  logger.info(`Email sent to ${to} via SMTP: ${subject} (messageId: ${info.messageId})`);

  return { messageId: info.messageId };
}

/**
 * Send via SendGrid's v3 Web API (raw fetch — no SDK dependency, same approach
 * as the LLM adapters). Requires SENDGRID_API_KEY.
 */
async function sendViaSendGrid(
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string }> {
  if (!config.email.sendgridApiKey) {
    throw new AppError(500, "EMAIL_NOT_CONFIGURED", "EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.email.from },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new AppError(502, "EMAIL_ERROR", `SendGrid error (${res.status}): ${detail}`);
  }

  // SendGrid returns 202 with the message id in the X-Message-Id header.
  const messageId = res.headers.get("x-message-id") || "sendgrid-accepted";
  logger.info(`Email sent to ${to} via SendGrid: ${subject} (messageId: ${messageId})`);

  return { messageId };
}

// ---------------------------------------------------------------------------
// Convenience: render + send using a stored template
// ---------------------------------------------------------------------------

export async function sendTemplatedEmail(
  orgId: number,
  trigger: string,
  to: string,
  variables: Record<string, any>,
): Promise<{ messageId: string } | null> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    organization_id: orgId,
    trigger,
    is_active: true,
  });

  if (!template) {
    logger.warn(`No active email template found for trigger: ${trigger} (org: ${orgId})`);
    return null;
  }

  const renderedSubject = renderTemplate(template.subject, variables);
  const renderedBody = renderTemplate(template.body, variables);

  return sendEmail(to, renderedSubject, renderedBody);
}

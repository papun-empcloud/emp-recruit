// ============================================================================
// INTERVIEW INVITATION SERVICE
// Sends interview invitation emails to candidates and panelists.
// ============================================================================

import { getDB } from "../../db/adapters";
import { findUserById, findOrgById } from "../../db/empcloud";
import { sendEmail } from "../email/email.service";
import { AppError, NotFoundError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { generateCalendarLinks } from "./calendar.service";
import type { Interview, InterviewPanelist } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Send interview invitation emails to candidate and panelists
// ---------------------------------------------------------------------------

export async function sendInterviewInvitation(
  orgId: number,
  interviewId: string,
): Promise<{ sent_to: string[]; failed_to: string[] }> {
  const db = getDB();

  // Get interview details
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Get application -> candidate + job
  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);
  if (!appRow) {
    throw new NotFoundError("Application", interview.application_id);
  }

  const candidate = await db.findById<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }>("candidates", appRow.candidate_id);
  if (!candidate) {
    throw new NotFoundError("Candidate", appRow.candidate_id);
  }

  const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
  const jobTitle = job?.title || "Open Position";

  // Get organization name from empcloud
  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  // Format schedule
  const scheduledDate = new Date(interview.scheduled_at);
  const dateStr = scheduledDate.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = scheduledDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const meetingLinkHtml = interview.meeting_link
    ? `<p><strong>Meeting Link:</strong> <a href="${interview.meeting_link}">${interview.meeting_link}</a></p>`
    : "";

  const locationHtml = interview.location
    ? `<p><strong>Location:</strong> ${interview.location}</p>`
    : "";

  // Generate calendar links for the email
  const calLinks = generateCalendarLinks(
    interview,
    `${candidate.first_name} ${candidate.last_name}`,
    jobTitle,
    orgName,
  );

  const calendarLinksHtml = `
      <div style="margin: 16px 0;">
        <p style="font-weight: bold; margin-bottom: 8px;">Add to Calendar:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="${calLinks.google}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #4285f4; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Google Calendar
          </a>
          <a href="${calLinks.outlook}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #0078d4; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Outlook
          </a>
          <a href="${calLinks.office365}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #7c3aed; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Office 365
          </a>
        </div>
      </div>`;

  // Build candidate email
  const candidateSubject = `Interview Invitation — ${jobTitle} at ${orgName}`;
  const candidateBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Interview Invitation</h2>
      <p>Dear ${candidate.first_name} ${candidate.last_name},</p>
      <p>We are pleased to invite you for an interview for the <strong>${jobTitle}</strong> position at <strong>${orgName}</strong>.</p>
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        <p><strong>Duration:</strong> ${interview.duration_minutes} minutes</p>
        <p><strong>Type:</strong> ${interview.type} (Round ${interview.round})</p>
        ${locationHtml}
        ${meetingLinkHtml}
      </div>
      ${calendarLinksHtml}
      <p>Please ensure you join the meeting on time. If you need to reschedule, please contact us as soon as possible.</p>
      <p>Best regards,<br/>${orgName} Recruitment Team</p>
    </div>
  `;

  const sentTo: string[] = [];
  const failedTo: string[] = [];

  // Send to candidate
  if (!candidate.email || !String(candidate.email).trim()) {
    // No address to send to — report it as a named failure rather than handing
    // nodemailer an empty recipient (and an empty string to the UI).
    logger.error(`Interview ${interviewId}: candidate has no email address on file`);
    failedTo.push(`${candidate.first_name} ${candidate.last_name} (no email on file)`);
  } else {
    try {
      await sendEmail(candidate.email, candidateSubject, candidateBody);
      sentTo.push(candidate.email);
    } catch (err) {
      logger.error(`Failed to send invitation to candidate ${candidate.email}`, err);
      failedTo.push(candidate.email);
    }
  }

  // Get panelists and send to each
  const panelistResult = await db.findMany<InterviewPanelist>("interview_panelists", {
    filters: { interview_id: interviewId },
    limit: 100,
  });

  for (const panelist of panelistResult.data) {
    let panelistEmail: string | null = null;
    try {
      const user = await findUserById(panelist.user_id);
      if (!user) continue;
      panelistEmail = user.email;

      const panelistSubject = `Interview Panel — ${jobTitle} with ${candidate.first_name} ${candidate.last_name}`;
      const panelistBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Interview Panel Invitation</h2>
          <p>Dear ${user.first_name},</p>
          <p>You have been assigned as a panelist for an upcoming interview.</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p><strong>Candidate:</strong> ${candidate.first_name} ${candidate.last_name}</p>
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${timeStr}</p>
            <p><strong>Duration:</strong> ${interview.duration_minutes} minutes</p>
            <p><strong>Your Role:</strong> ${panelist.role}</p>
            ${locationHtml}
            ${meetingLinkHtml}
          </div>
          ${calendarLinksHtml}
          <p>Please prepare your questions and join on time. You can submit your feedback through the recruitment portal after the interview.</p>
          <p>Best regards,<br/>${orgName} Recruitment Team</p>
        </div>
      `;

      await sendEmail(user.email, panelistSubject, panelistBody);
      sentTo.push(user.email);
    } catch (err) {
      logger.error(`Failed to send invitation to panelist ${panelist.user_id}`, err);
      failedTo.push(panelistEmail ?? `panelist #${panelist.user_id}`);
    }
  }

  // If nothing reached anyone, fail loudly. Returning 200 here made the UI
  // report "Invitation sent" off the status code alone, so a dead mail server
  // looked identical to a delivered invitation and the candidate silently
  // never heard about their interview.
  if (sentTo.length === 0 && failedTo.length > 0) {
    throw new AppError(
      502,
      "EMAIL_SEND_FAILED",
      "The invitation couldn't be emailed to anyone. Check the mail server settings and try again.",
    );
  }

  logger.info(
    `Interview invitation sent for ${interviewId} to ${sentTo.length} recipients` +
      (failedTo.length ? ` (${failedTo.length} failed)` : ""),
  );

  return { sent_to: sentTo, failed_to: failedTo };
}

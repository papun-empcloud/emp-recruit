import { config } from "./index";
import { logger } from "../utils/logger";

export function validateConfig(): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  // JWT secret (audit H1) — must be a real, strong secret outside local dev.
  // The same secret signs access, refresh, and portal tokens, so a default/weak
  // value means anyone can forge tokens for any user/org.
  const devEnv = config.env === "development" || config.env === "test";
  if (!devEnv && (config.jwt.secret === "change-this-in-production" || !process.env.JWT_SECRET)) {
    errors.push("JWT_SECRET must be set to a real secret (not the default) outside development");
  }
  if (!devEnv && config.jwt.secret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters");
  } else if (config.jwt.secret.length < 16) {
    warnings.push("JWT_SECRET should be at least 32 characters");
  }

  // Database
  if (!config.db.host) errors.push("DB_HOST is required");
  if (!config.db.name) errors.push("DB_NAME is required");
  if (config.env === "production" && !config.db.password) {
    errors.push("DB_PASSWORD is required in production");
  }

  // Email
  if (config.email.provider === "sendgrid" && !config.email.sendgridApiKey) {
    errors.push("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");
  }
  if (!["smtp", "sendgrid"].includes(config.email.provider)) {
    warnings.push(`Unknown EMAIL_PROVIDER "${config.email.provider}" — falling back to SMTP`);
  }
  // SMTP_HOST defaults to localhost:1025 (the dev Mailhog address). Outside
  // development that default silently makes every send fail at connect time,
  // so say so at boot instead of only when a recruiter clicks "Email Offer
  // Letter". A warning, not an error: email being down shouldn't stop the
  // whole ATS from serving.
  if (!devEnv && config.email.provider === "smtp" && (!process.env.SMTP_HOST || config.email.host === "localhost")) {
    warnings.push(
      "SMTP_HOST is not set — falling back to localhost:1025 (dev Mailhog). " +
        "Offer letters, interview invites and notifications will fail to send.",
    );
  }

  // CORS
  if (config.env === "production" && config.cors.origin === "*") {
    errors.push("CORS_ORIGIN must not be '*' in production");
  }
  if (config.env === "production" && config.cors.origin.includes("localhost")) {
    warnings.push("CORS_ORIGIN contains localhost — change for production");
  }

  // Log results
  if (warnings.length > 0) {
    for (const w of warnings) logger.warn(`Config warning: ${w}`);
  }
  if (errors.length > 0) {
    for (const e of errors) logger.error(`Config error: ${e}`);
    if (!devEnv) {
      throw new Error(`Configuration errors:\n${errors.join("\n")}`);
    }
  }

  logger.info(`Config validated (${warnings.length} warnings, ${errors.length} errors)`);
}

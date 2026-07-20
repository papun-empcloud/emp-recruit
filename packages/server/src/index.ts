// ============================================================================
// EMP-RECRUIT SERVER ENTRY POINT
// ============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { initDB, closeDB } from "./db/adapters";
import { initEmpCloudDB, migrateEmpCloudDB, closeEmpCloudDB } from "./db/empcloud";
import { logger } from "./utils/logger";

// Route imports
import { healthRoutes } from "./api/routes/health.routes";
import { jobRoutes } from "./api/routes/job.routes";
import { candidateRoutes } from "./api/routes/candidate.routes";
import { applicationRoutes } from "./api/routes/application.routes";
import { offerRoutes } from "./api/routes/offer.routes";
import { onboardingRoutes } from "./api/routes/onboarding.routes";
import { interviewRoutes } from "./api/routes/interview.routes";
import { authRoutes } from "./api/routes/auth.routes";
import { publicRoutes } from "./api/routes/public.routes";
import { portalRoutes } from "./api/routes/portal.routes";
import { careerPageRoutes } from "./api/routes/career-page.routes";
import { referralRoutes } from "./api/routes/referral.routes";
import { analyticsRoutes } from "./api/routes/analytics.routes";
import { emailTemplateRoutes } from "./api/routes/email-template.routes";
import { scoringRoutes } from "./api/routes/scoring.routes";
import { aiInterviewRoutes } from "./api/routes/ai-interview.routes";
import { aiInterviewPublicRoutes } from "./api/routes/ai-interview-public.routes";
import { offerLetterRoutes } from "./api/routes/offer-letter.routes";
import { comparisonRoutes } from "./api/routes/comparison.routes";
import { pipelineRoutes } from "./api/routes/pipeline.routes";
import { backgroundCheckRoutes } from "./api/routes/background-check.routes";
import { jobDescriptionRoutes } from "./api/routes/job-description.routes";
import { surveyRoutes } from "./api/routes/survey.routes";
import { assessmentRoutes } from "./api/routes/assessment.routes";
import { organizationRoutes } from "./api/routes/organization.routes";
import { meetingProviderRoutes } from "./api/routes/meeting-provider.routes";
import { jobBoardRoutes } from "./api/routes/job-board.routes";
import { jobPublishingRoutes } from "./api/routes/job-publishing.routes";
import { readCookie } from "./api/middleware/auth.middleware";
import { errorHandler } from "./api/middleware/error.middleware";
import { apiLimiter, authLimiter } from "./api/middleware/rate-limit.middleware";
import { swaggerUIHandler, openapiHandler } from "./api/docs";
import { recordMounts } from "./api/route-recorder";

const app = express();

// Record route mounts for OpenAPI auto-discovery (before any .use mounts).
recordMounts(app);

// Self-hosted Swagger UI assets — served same-origin from /api/docs/ui so the
// proxy/helmet CSP ('self') allows them (the old unpkg CDN is blocked).
const swaggerUiAssetPath = (
  require("swagger-ui-dist") as { getAbsoluteFSPath(): string }
).getAbsoluteFSPath();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Strict helmet everywhere except the Swagger UI page, which needs a relaxed
// CSP (inline initializer + Swagger's inline styles / eval). swaggerUIHandler
// sets its own permissive CSP for that route.
const helmetStrict = helmet();
const helmetNoCsp = helmet({ contentSecurityPolicy: false });
app.use((req, res, next) =>
  req.path.startsWith("/api/docs") ? helmetNoCsp(req, res, next) : helmetStrict(req, res, next),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Never reflect an arbitrary origin together with credentials:true in
      // production (audit M7) — a wildcard is only honoured in development.
      if (config.cors.origin === "*") {
        if (config.env === "development") return callback(null, true);
        logger.warn("CORS_ORIGIN=* is ignored in production; configure an explicit allowlist");
        return callback(new Error("Not allowed by CORS"));
      }
      // Allow empcloud.com subdomains (production & test)
      if (origin.endsWith(".empcloud.com") && origin.startsWith("https://")) {
        return callback(null, true);
      }
      // Local dev only. `.ngrok-free.dev` is intentionally NOT trusted — those
      // hostnames are attacker-registerable (audit M7).
      if (
        config.env === "development" &&
        (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))
      ) {
        return callback(null, true);
      }
      const allowed = config.cors.origin.split(",").map((s) => s.trim());
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(compression());
// Capture the raw body so signed webhooks (e.g. Retell) can be verified against
// the exact bytes received. Cheap — just keeps a reference to the parsed buffer.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
// Guarantee req.body is always an object. express.json() only populates it when
// a JSON content-type is present, so a body-less POST (e.g. POST /accept with no
// payload) leaves req.body undefined — and any `req.body.x` read then throws.
app.use((req, _res, next) => {
  if (req.body == null) req.body = {};
  next();
});
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.use("/health", healthRoutes);

// ---------------------------------------------------------------------------
// API Routes (v1)
// ---------------------------------------------------------------------------
const v1 = express.Router();
// Record v1's sub-mounts (v1.use('/x', routes)) for OpenAPI auto-discovery,
// prefixed with /api/v1 — must run before the v1.use(...) calls below.
recordMounts(v1, "/api/v1");
v1.use(apiLimiter);

// Active routes
v1.use("/jobs", jobRoutes);
v1.use("/candidates", candidateRoutes);
v1.use("/applications", applicationRoutes);
v1.use("/offers", offerRoutes);
v1.use("/onboarding", onboardingRoutes);

v1.use("/interviews", interviewRoutes);

v1.use("/auth", authLimiter, authRoutes);
v1.use("/referrals", referralRoutes);
v1.use("/email-templates", emailTemplateRoutes);
v1.use("/career-pages", careerPageRoutes);
v1.use("/analytics", analyticsRoutes);
v1.use("/scoring", scoringRoutes);
v1.use("/ai", scoringRoutes); // alias — /ai/batch-score -> /scoring/batch-score (#866)
v1.use("/ai-interviews", aiInterviewRoutes);
v1.use("/offer-letters", offerLetterRoutes);
v1.use("/applications", comparisonRoutes);
v1.use("/pipeline", pipelineRoutes);
v1.use("/pipeline-stages", pipelineRoutes); // alias — /pipeline-stages/stages -> /pipeline/stages (#864)
v1.use("/background-checks", backgroundCheckRoutes);
v1.use("/jobs", jobDescriptionRoutes);
v1.use("/job-descriptions", jobDescriptionRoutes); // alias — /job-descriptions/generate-description (#862 #863)
v1.use("/surveys", surveyRoutes);
v1.use("/assessments", assessmentRoutes);
v1.use("/organizations", organizationRoutes);
v1.use("/meeting-providers", meetingProviderRoutes);
v1.use("/job-boards", jobBoardRoutes);
v1.use("/job-publishing", jobPublishingRoutes); // outbound job-board publishing (scaffold)

// Public routes (no auth required) — career pages, job listings, applications.
// The AI-interview public router is mounted first so its more specific prefix
// is matched before the general public router. These routers are mounted on
// `app` (not the v1 router), so apply the rate limiter here too — otherwise
// these unauthenticated endpoints (uploads, magic links, tokens) are unthrottled.
app.use("/api/v1/public/ai-interviews", apiLimiter, aiInterviewPublicRoutes);
app.use("/api/v1/public", apiLimiter, publicRoutes);

// Candidate portal routes (portal auth — separate from employee auth)
app.use("/api/v1/portal", apiLimiter, portalRoutes);

app.use("/api/v1", v1);

// Uploaded files (resumes, ID proofs, offer letters, recordings) are PII and
// were previously served by `express.static` with NO auth and NO org scoping —
// anyone with a URL could download any tenant's files. Serve them through an
// authenticated, org-scoped handler instead (audit H2).
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
app.get(/^\/uploads\/(.+)/, (req, res) => {
  // Accept the token via the httpOnly cookie (audit H3), ?token= (browser
  // <a>/<img> can't send headers, and carry it in-session), or Authorization.
  // Employee and portal tokens share the signing secret; both carry the org, so
  // either can authorize its own org's files.
  const header = req.headers.authorization;
  const token =
    (req.query.token as string | undefined) ||
    (header?.startsWith("Bearer ") ? header.slice(7) : undefined) ||
    readCookie(req, "access_token");
  if (!token) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
  }
  let tokenOrg: string | null = null;
  try {
    const payload = jwt.verify(token, config.jwt.secret) as any;
    tokenOrg = payload.empcloudOrgId != null ? String(payload.empcloudOrgId) : payload.orgId != null ? String(payload.orgId) : null;
  } catch {
    return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid token" } });
  }

  const rel = req.params[0]; // path after /uploads/
  const filePath = path.resolve(UPLOADS_ROOT, rel);
  // Traversal guard: the resolved path must stay inside the uploads root.
  if (filePath !== UPLOADS_ROOT && !filePath.startsWith(UPLOADS_ROOT + path.sep)) {
    return res.status(400).json({ success: false, error: { code: "BAD_PATH", message: "Invalid path" } });
  }
  // Org scope: most paths are <category>/<orgId>/<file> — enforce the numeric
  // org segment against the token's org. A few categories (e.g. ai-interviews/
  // <uuid>) carry no org segment; those require a valid token only (the uuid is
  // unguessable), since the path holds no org to match.
  if (!tokenOrg) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized" } });
  }
  const segments = rel.split(/[\\/]/);
  const pathOrg = segments[1];
  if (/^\d+$/.test(pathOrg || "") && String(tokenOrg) !== String(pathOrg)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized for this file" } });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "File not found" } });
    }
  });
});

// API Documentation
// Self-hosted Swagger UI assets (swagger-ui-dist) served same-origin.
app.use("/api/docs/ui", express.static(swaggerUiAssetPath, { maxAge: "7d", immutable: true }));
app.get("/api/docs", swaggerUIHandler);
app.get("/api/docs/openapi.json", openapiHandler);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  try {
    // Validate configuration
    const { validateConfig } = await import("./config/validate");
    validateConfig();

    // Initialize EmpCloud master database (users, orgs, auth)
    await initEmpCloudDB();
    await migrateEmpCloudDB();

    // Initialize recruit module database
    const db = await initDB();
    logger.info("Recruit database connected");

    // Run migrations
    await db.migrate();
    logger.info("Recruit database migrations applied");

    // Start server
    app.listen(config.port, config.host, () => {
      logger.info(`emp-recruit server running at http://${config.host}:${config.port}`);
      logger.info(`   Environment: ${config.env}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  await closeDB();
  await closeEmpCloudDB();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();

export { app };

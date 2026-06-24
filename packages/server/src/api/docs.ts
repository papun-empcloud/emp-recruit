// ============================================================================
// EMP-RECRUIT — OpenAPI / Swagger Documentation
// ============================================================================

import { Request, Response } from "express";
import { discoveredPaths } from "./route-recorder";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "EMP Recruit API",
    version: "1.0.0",
    description:
      "Recruitment and applicant tracking module for the EMP HRMS ecosystem. Manages job postings, candidates, applications, interviews, offers, and onboarding.",
  },
  servers: [{ url: "http://localhost:3001", description: "Local development" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http" as const, scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiResponse: {
        type: "object" as const,
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
        },
      },
      Error: {
        type: "object" as const,
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } },
        },
      },
    },
  },
  paths: {
    // =========================================================================
    // AUTH
    // =========================================================================
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } } } } },
        },
        responses: { "200": { description: "Login successful" }, "401": { description: "Invalid credentials" } },
      },
    },
    "/api/v1/auth/register": {
      post: { tags: ["Auth"], summary: "Register a new organization", security: [], responses: { "201": { description: "Registered" } } },
    },
    "/api/v1/auth/sso": {
      post: { tags: ["Auth"], summary: "SSO authentication via EMP Cloud token", security: [], responses: { "200": { description: "SSO login successful" } } },
    },
    "/api/v1/auth/refresh-token": {
      post: { tags: ["Auth"], summary: "Refresh access token", security: [], responses: { "200": { description: "New tokens" } } },
    },

    // =========================================================================
    // JOBS
    // =========================================================================
    "/api/v1/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List job postings (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated job list" } },
      },
      post: {
        tags: ["Jobs"],
        summary: "Create a job posting",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Job created" } },
      },
    },
    "/api/v1/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Get job posting by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Job data" } },
      },
      put: {
        tags: ["Jobs"],
        summary: "Update job posting",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Job updated" } },
      },
      delete: {
        tags: ["Jobs"],
        summary: "Delete job posting",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Job deleted" } },
      },
    },
    "/api/v1/jobs/{id}/status": {
      patch: {
        tags: ["Jobs"],
        summary: "Update job status (open/closed/draft)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Status updated" } },
      },
    },
    "/api/v1/jobs/{id}/applications": {
      get: {
        tags: ["Jobs"],
        summary: "List applications for a job",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Application list" } },
      },
    },
    "/api/v1/jobs/{id}/analytics": {
      get: {
        tags: ["Jobs"],
        summary: "Get analytics for a job posting",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Job analytics" } },
      },
    },

    // =========================================================================
    // CANDIDATES
    // =========================================================================
    "/api/v1/candidates": {
      get: { tags: ["Candidates"], summary: "List candidates (paginated)", responses: { "200": { description: "Candidate list" } } },
      post: { tags: ["Candidates"], summary: "Create a candidate profile", responses: { "201": { description: "Candidate created" } } },
    },
    "/api/v1/candidates/{id}": {
      get: {
        tags: ["Candidates"],
        summary: "Get candidate by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Candidate data" } },
      },
      put: {
        tags: ["Candidates"],
        summary: "Update candidate",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Candidate updated" } },
      },
    },
    "/api/v1/candidates/{id}/resume": {
      post: {
        tags: ["Candidates"],
        summary: "Upload candidate resume",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Resume uploaded" } },
      },
    },
    "/api/v1/candidates/{id}/applications": {
      get: {
        tags: ["Candidates"],
        summary: "List applications for a candidate",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Application list" } },
      },
    },

    // =========================================================================
    // APPLICATIONS
    // =========================================================================
    "/api/v1/applications": {
      get: { tags: ["Applications"], summary: "List applications (paginated)", responses: { "200": { description: "Application list" } } },
      post: { tags: ["Applications"], summary: "Create an application", responses: { "201": { description: "Application created" } } },
    },
    "/api/v1/applications/{id}": {
      get: {
        tags: ["Applications"],
        summary: "Get application by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Application data" } },
      },
    },
    "/api/v1/applications/{id}/stage": {
      patch: {
        tags: ["Applications"],
        summary: "Move application to a new stage",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Stage updated" } },
      },
    },
    "/api/v1/applications/{id}/notes": {
      post: {
        tags: ["Applications"],
        summary: "Add a note to an application",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Note added" } },
      },
    },
    "/api/v1/applications/{id}/timeline": {
      get: {
        tags: ["Applications"],
        summary: "Get application timeline",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Timeline events" } },
      },
    },

    // =========================================================================
    // INTERVIEWS
    // =========================================================================
    "/api/v1/interviews": {
      get: { tags: ["Interviews"], summary: "List interviews (paginated)", responses: { "200": { description: "Interview list" } } },
      post: { tags: ["Interviews"], summary: "Schedule an interview", responses: { "201": { description: "Interview scheduled" } } },
    },
    "/api/v1/interviews/{id}": {
      get: {
        tags: ["Interviews"],
        summary: "Get interview by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Interview data" } },
      },
      put: {
        tags: ["Interviews"],
        summary: "Update interview",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Interview updated" } },
      },
    },
    "/api/v1/interviews/{id}/status": {
      patch: {
        tags: ["Interviews"],
        summary: "Update interview status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Status updated" } },
      },
    },
    "/api/v1/interviews/{id}/feedback": {
      get: {
        tags: ["Interviews"],
        summary: "Get interview feedback",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Feedback data" } },
      },
      post: {
        tags: ["Interviews"],
        summary: "Submit interview feedback",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Feedback submitted" } },
      },
    },
    "/api/v1/interviews/{id}/calendar-links": {
      get: {
        tags: ["Interviews"],
        summary: "Get calendar integration links",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Calendar links" } },
      },
    },
    "/api/v1/interviews/{id}/recordings": {
      get: {
        tags: ["Interviews"],
        summary: "Get interview recordings",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Recording list" } },
      },
    },
    "/api/v1/interviews/{id}/transcript": {
      get: {
        tags: ["Interviews"],
        summary: "Get interview transcript",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Transcript data" } },
      },
    },

    // =========================================================================
    // OFFERS
    // =========================================================================
    "/api/v1/offers": {
      get: { tags: ["Offers"], summary: "List offers (paginated)", responses: { "200": { description: "Offer list" } } },
      post: { tags: ["Offers"], summary: "Create an offer", responses: { "201": { description: "Offer created" } } },
    },
    "/api/v1/offers/{id}": {
      get: {
        tags: ["Offers"],
        summary: "Get offer by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer data" } },
      },
      put: {
        tags: ["Offers"],
        summary: "Update offer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer updated" } },
      },
    },
    "/api/v1/offers/{id}/send": {
      post: {
        tags: ["Offers"],
        summary: "Send offer to candidate",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer sent" } },
      },
    },
    "/api/v1/offers/{id}/accept": {
      post: {
        tags: ["Offers"],
        summary: "Accept an offer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer accepted" } },
      },
    },
    "/api/v1/offers/{id}/decline": {
      post: {
        tags: ["Offers"],
        summary: "Decline an offer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer declined" } },
      },
    },
    "/api/v1/offers/{id}/revoke": {
      post: {
        tags: ["Offers"],
        summary: "Revoke an offer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Offer revoked" } },
      },
    },
    "/api/v1/offers/{id}/negotiate": {
      post: {
        tags: ["Offers"],
        summary: "Submit offer negotiation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Negotiation submitted" } },
      },
    },

    // =========================================================================
    // ONBOARDING
    // =========================================================================
    "/api/v1/onboarding": {
      get: { tags: ["Onboarding"], summary: "List onboarding tasks", responses: { "200": { description: "Onboarding list" } } },
      post: { tags: ["Onboarding"], summary: "Create onboarding checklist", responses: { "201": { description: "Checklist created" } } },
    },
    "/api/v1/onboarding/{id}": {
      put: {
        tags: ["Onboarding"],
        summary: "Update onboarding checklist",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Checklist updated" } },
      },
    },
    "/api/v1/onboarding/{id}/tasks": {
      post: {
        tags: ["Onboarding"],
        summary: "Add task to checklist",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Task added" } },
      },
    },

    // =========================================================================
    // REFERRALS
    // =========================================================================
    "/api/v1/referrals": {
      get: { tags: ["Referrals"], summary: "List referrals", responses: { "200": { description: "Referral list" } } },
      post: { tags: ["Referrals"], summary: "Submit a referral", responses: { "201": { description: "Referral submitted" } } },
    },
    "/api/v1/referrals/{id}/status": {
      patch: {
        tags: ["Referrals"],
        summary: "Update referral status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Status updated" } },
      },
    },

    // =========================================================================
    // EMAIL TEMPLATES
    // =========================================================================
    "/api/v1/email-templates": {
      get: { tags: ["Email Templates"], summary: "List email templates", responses: { "200": { description: "Template list" } } },
      post: { tags: ["Email Templates"], summary: "Create email template", responses: { "201": { description: "Template created" } } },
    },
    "/api/v1/email-templates/{id}": {
      put: {
        tags: ["Email Templates"],
        summary: "Update email template",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Template updated" } },
      },
    },
    "/api/v1/email-templates/{id}/preview": {
      post: {
        tags: ["Email Templates"],
        summary: "Preview email template with sample data",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Preview HTML" } },
      },
    },

    // =========================================================================
    // CAREER PAGE
    // =========================================================================
    "/api/v1/career-pages": {
      get: { tags: ["Career Page"], summary: "Get career page settings", responses: { "200": { description: "Career page config" } } },
      put: { tags: ["Career Page"], summary: "Update career page settings", responses: { "200": { description: "Settings updated" } } },
    },
    "/api/v1/career-pages/publish": {
      post: { tags: ["Career Page"], summary: "Publish career page", responses: { "200": { description: "Published" } } },
    },

    // =========================================================================
    // PUBLIC
    // =========================================================================
    "/api/v1/public/careers/{slug}": {
      get: {
        tags: ["Public"],
        summary: "Get public career page by slug",
        security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Career page" } },
      },
    },
    "/api/v1/public/careers/{slug}/jobs": {
      get: {
        tags: ["Public"],
        summary: "List public job postings",
        security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Public job list" } },
      },
    },
    "/api/v1/public/careers/{slug}/jobs/{jobId}": {
      get: {
        tags: ["Public"],
        summary: "Get public job posting details",
        security: [],
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "jobId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Job details" } },
      },
    },
    "/api/v1/public/careers/{slug}/jobs/{jobId}/apply": {
      post: {
        tags: ["Public"],
        summary: "Submit a public job application",
        security: [],
        responses: { "201": { description: "Application submitted" } },
      },
    },

    // =========================================================================
    // PORTAL (Candidate Self-Service)
    // =========================================================================
    "/api/v1/portal/login": {
      post: { tags: ["Portal"], summary: "Candidate portal login", security: [], responses: { "200": { description: "Login successful" } } },
    },
    "/api/v1/portal/me": {
      get: { tags: ["Portal"], summary: "Get current candidate profile", responses: { "200": { description: "Candidate profile" } } },
    },
    "/api/v1/portal/applications": {
      get: { tags: ["Portal"], summary: "List my applications", responses: { "200": { description: "Application list" } } },
    },
    "/api/v1/portal/applications/{id}": {
      get: {
        tags: ["Portal"],
        summary: "Get application details",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Application details" } },
      },
    },
    "/api/v1/portal/interviews": {
      get: { tags: ["Portal"], summary: "List my upcoming interviews", responses: { "200": { description: "Interview list" } } },
    },

    // =========================================================================
    // SCORING
    // =========================================================================
    "/api/v1/scoring/scorecards": {
      post: { tags: ["Scoring"], summary: "Create a scorecard template", responses: { "201": { description: "Scorecard created" } } },
    },
    "/api/v1/scoring/evaluate": {
      post: { tags: ["Scoring"], summary: "Evaluate a candidate with a scorecard", responses: { "201": { description: "Evaluation submitted" } } },
    },
    "/api/v1/scoring/scorecards/{id}": {
      get: {
        tags: ["Scoring"],
        summary: "Get scorecard by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Scorecard data" } },
      },
    },

    // =========================================================================
    // ANALYTICS
    // =========================================================================
    "/api/v1/analytics/overview": {
      get: { tags: ["Analytics"], summary: "Recruitment overview metrics", responses: { "200": { description: "Overview data" } } },
    },
    "/api/v1/analytics/pipeline": {
      get: { tags: ["Analytics"], summary: "Pipeline stage breakdown", responses: { "200": { description: "Pipeline data" } } },
    },
    "/api/v1/analytics/time-to-hire": {
      get: { tags: ["Analytics"], summary: "Time-to-hire analytics", responses: { "200": { description: "Time-to-hire data" } } },
    },
    "/api/v1/analytics/sources": {
      get: { tags: ["Analytics"], summary: "Source effectiveness analytics", responses: { "200": { description: "Source data" } } },
    },

    // =========================================================================
    // HEALTH
    // =========================================================================
    "/health": {
      get: { tags: ["Health"], summary: "Health check", security: [], responses: { "200": { description: "Server is healthy" } } },
    },
  },
};

// Self-hosted Swagger UI — assets served same-origin from /api/docs/ui
// (express.static of swagger-ui-dist in index.ts) instead of the unpkg CDN,
// which the proxy/helmet CSP ('self') blocks. A permissive per-response CSP
// (set here, with /api/docs excluded from the global helmet CSP) lets the
// inline initializer + Swagger's inline styles run.
export function swaggerUIHandler(_req: Request, res: Response) {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join("; "),
  );
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html><head><title>EMP Recruit API</title>
<link rel="stylesheet" href="/api/docs/ui/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="/api/docs/ui/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui', deepLinking: true })</script>
</body></html>`);
}

// Merge auto-discovered routes into the curated spec (full paths). Any
// path+method not already hand-documented gets a tagged stub, so the published
// API surface is complete for integrators; curated operations keep their detail.
let cachedSpec: unknown = null;

function buildCompleteSpec(): unknown {
  const merged: any = { ...spec, paths: { ...(spec as any).paths } };
  for (const { path, methods } of discoveredPaths()) {
    const node = (merged.paths[path] = merged.paths[path] || {});
    const seg = path.split("/").filter(Boolean);
    const tag = seg[2] || seg[1] || seg[0] || "general";
    for (const method of methods) {
      if (method === "head" || method === "options" || node[method]) continue;
      const params = Array.from(path.matchAll(/\{([A-Za-z0-9_]+)\}/g)).map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" as const },
      }));
      node[method] = {
        tags: [tag],
        summary: `${method.toUpperCase()} ${path}`,
        ...(params.length ? { parameters: params } : {}),
        responses: { "200": { description: "OK" } },
      };
    }
  }
  return merged;
}

export function openapiHandler(req: Request, res: Response) {
  if (!cachedSpec) cachedSpec = buildCompleteSpec();
  // Primary server = the request's own origin so "Try it out" targets the host
  // the docs are loaded from (e.g. https://recruit-api.empcloud.com) rather than
  // localhost. Honors the proxy's X-Forwarded-* headers.
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) || req.get("host");
  const servers = host
    ? [
        { url: `${proto}://${host}`, description: "This server" },
        { url: "http://localhost:3001", description: "Local development" },
      ]
    : (cachedSpec as any).servers;
  res.json({ ...(cachedSpec as any), servers });
}

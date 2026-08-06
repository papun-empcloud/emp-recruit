// ============================================================================
// PUBLIC ROUTES (NO AUTH)
// Career pages, public job listings, and application submissions.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { parsePage, parseLimit } from "../../utils/pagination";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import * as careerPageService from "../../services/career-page/career-page.service";
import * as feedService from "../../services/job-board/feed.service";
import * as screeningService from "../../services/screening/screening.service";
import * as recruitmentOps from "../../services/recruitment-ops/recruitment-ops.service";
import { screeningAnswersSchema } from "@emp-recruit/shared";
import { getDB } from "../../db/adapters";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

const router = Router();

// ---------------------------------------------------------------------------
// Multer config for resume uploads
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Create the target dir if it doesn't exist yet — a public applicant may be
    // the first resume uploaded on a fresh deploy, so this dir won't exist and
    // multer's write would fail with ENOENT.
    const dir = path.join(process.cwd(), "uploads", "resumes");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    // Validate BOTH the extension and the declared MIME type (audit L13) —
    // extension-only checks let a mislabelled file through.
    const allowed = [".pdf", ".doc", ".docx"];
    const allowedMimes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, and DOCX resume files are allowed"));
    }
  },
});

// Wrap multer so a rejected upload (wrong file type from the fileFilter, or a
// file over the size limit) surfaces as a clean 400 to the applicant instead of
// a bare 500 Internal Server Error.
function uploadResume(req: Request, res: Response, next: NextFunction) {
  upload.single("resume")(req, res, (err: any) => {
    if (err) {
      const message =
        err instanceof multer.MulterError
          ? err.code === "LIMIT_FILE_SIZE"
            ? "Resume file is too large (max 10MB)."
            : "Resume upload failed."
          : err?.message || "Invalid resume file.";
      return next(new ValidationError(message));
    }
    next();
  });
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const applySchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  // Phone is optional. When given, it must contain only digits and phone
  // punctuation (no letters/symbols — BUG-02) and at least one digit, but we do
  // NOT enforce a strict length: a real number of any reasonable length must
  // never be rejected, which was blocking legitimate applications (BUG-09).
  phone: z
    .string()
    .refine(
      (v) => {
        if (!v.trim()) return true;
        if (/[^\d+\-()\s]/.test(v)) return false;
        const digits = v.replace(/\D/g, "");
        return digits.length >= 7 && digits.length <= 15;
      },
      { message: "Please enter a valid phone number" },
    )
    .optional(),
  cover_letter: z.string().optional(),
  current_company: z.string().optional(),
  // Upper bounds reject unrealistic values (BUG-10): 999 years, 999,999,999 salary.
  experience_years: z.coerce
    .number()
    .min(0, "Years of experience cannot be negative")
    .max(50, "Years of experience can't exceed 50")
    .optional(),
  expected_salary: z.coerce
    .number()
    .min(0, "Expected salary cannot be negative")
    .max(100000000, "Please enter a realistic expected salary")
    .optional(),
  // Skills arrive as a comma-separated string (multipart form field) and are
  // normalised to a bounded string[] — they feed the ATS skills match, which
  // otherwise only has resume text extraction to go on (BUG-004).
  skills: z
    .string()
    .max(2000, "Skills list is too long")
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const arr = v
        .split(",")
        .map((s) => s.trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 50);
      return arr.length ? arr : undefined;
    }),
});

// ---------------------------------------------------------------------------
// GET /careers/:slug — career page info
// ---------------------------------------------------------------------------
router.get("/careers/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await careerPageService.getPublicCareerPage(String(req.params.slug));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// Alias: GET /career-page/:slug -> /careers/:slug (#867)
router.get("/career-page/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await careerPageService.getPublicCareerPage(String(req.params.slug));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /careers/:slug/jobs — list open jobs
// ---------------------------------------------------------------------------
router.get("/careers/:slug/jobs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, perPage, search, department, location } = req.query;
    const result = await careerPageService.getPublicJobs(String(req.params.slug), {
      page: page ? parsePage(page) : undefined,
      perPage: perPage ? parseLimit(perPage) : undefined,
      search: search ? String(search) : undefined,
      department: department ? String(department) : undefined,
      location: location ? String(location) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /careers/:slug/jobs/:jobId — job detail
// ---------------------------------------------------------------------------
router.get("/careers/:slug/jobs/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await careerPageService.getPublicJobDetail(String(req.params.slug), String(req.params.jobId));
    sendSuccess(res, job);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /careers/:slug/apply — submit application (multipart)
// ---------------------------------------------------------------------------
router.post(
  "/careers/:slug/apply",
  uploadResume,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = applySchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const jobId = req.body.job_id || req.query.job_id;
      if (!jobId) {
        throw new ValidationError("job_id is required");
      }

      // Resume is mandatory (BUG-013). uploadResume only rejects wrong file
      // types; a request with no file at all previously created a candidate
      // with resume_path = null. Enforce it here (server-side) so the API
      // can't be bypassed by a client that skips the field.
      if (!req.file) {
        throw new ValidationError("Resume is required", { resume: ["Resume is required"] });
      }

      // Screening answers arrive as a JSON string field in the multipart form.
      // Validate required questions BEFORE creating the application (so a missing
      // answer doesn't leave an orphan) and compute knockout results.
      let rawAnswers: unknown = [];
      if (req.body.screening_answers) {
        try {
          rawAnswers = JSON.parse(req.body.screening_answers);
        } catch {
          throw new ValidationError("Invalid screening answers");
        }
      }
      const answers = screeningAnswersSchema.parse(rawAnswers);
      const prepared = await screeningService.prepareAnswers(jobId as string, answers);

      let rawCustomValues: Record<string, unknown> = {};
      if (req.body.custom_form_values) {
        try { rawCustomValues = JSON.parse(req.body.custom_form_values); }
        catch { throw new ValidationError("Invalid custom application fields"); }
      }
      const publicJob = await careerPageService.getPublicJobDetail(String(req.params.slug), String(jobId));
      const preparedCustom = await recruitmentOps.prepareFormValues(publicJob.organization_id, String(jobId), rawCustomValues);

      const resumePath = `/uploads/resumes/${req.file.filename}`;

      const knockoutFailed = prepared.knockoutFailed || preparedCustom.knockoutFailed;
      const result = await getDB().transaction(async (tx) => {
        const submitted = await careerPageService.submitPublicApplication(
          String(req.params.slug), jobId as string, parsed.data, resumePath, tx,
        );
        await screeningService.storeAnswers(submitted.application.organization_id, submitted.application.id, prepared.rows, tx);
        await recruitmentOps.storeFormValues(submitted.application.organization_id, submitted.application.id, preparedCustom.rows, tx);
        if (knockoutFailed) {
          await tx.update("applications", submitted.application.id, {
            stage: "rejected",
            rejection_reason: "Did not meet a required screening criterion.",
          } as any);
          await tx.create("application_stage_history", {
            application_id: submitted.application.id,
            from_stage: "applied",
            to_stage: "rejected",
            changed_by: 0,
            notes: "Automatically rejected by a knockout screening criterion",
          });
          submitted.application.stage = "rejected" as any;
        }
        return submitted;
      });

      // Dispatch only after the transaction commits so automation never sees a
      // partially persisted application or sends mail for a rolled-back one.
      await recruitmentOps.dispatchAutomationEvent(result.application.organization_id, {
        trigger: "application_created", value: "applied", applicationId: result.application.id,
      }).catch((error) => logger.error(`Public application ${result.application.id} created but automation dispatch failed`, error));
      if (knockoutFailed) await recruitmentOps.dispatchAutomationEvent(result.application.organization_id, {
        trigger: "application_stage_changed", value: "rejected", applicationId: result.application.id,
      }).catch((error) => logger.error(`Public application ${result.application.id} rejected but automation dispatch failed`, error));

      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /careers/:slug/jobs/:jobId/screening-questions — questions for the apply
// form (public; never exposes the knockout flag or disqualifying value).
// ---------------------------------------------------------------------------
router.get(
  "/careers/:slug/jobs/:jobId/screening-questions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Scope to the career page's org + public visibility (open, not internal,
      // shown on the page). Throws 404 for any job that isn't publicly listed
      // on this slug — same guard the job-detail/apply endpoints enforce.
      const job = await careerPageService.getPublicJobDetail(
        String(req.params.slug),
        String(req.params.jobId),
      );
      const questions = await screeningService.getPublicJobQuestions(job.id);
      sendSuccess(res, questions);
    } catch (err) {
      next(err);
    }
  },
);

router.get("/careers/:slug/jobs/:jobId/form-fields", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await careerPageService.getPublicJobDetail(String(req.params.slug), String(req.params.jobId));
    const fields = await recruitmentOps.listFormFields(job.organization_id, job.id);
    sendSuccess(res, fields.map(({ is_knockout: _a, knockout_value: _b, organization_id: _c, ...field }) => field));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Job feed — crawlable by external boards (Indeed, Google Jobs, …).
// GET /careers/:slug/feed.xml  (Indeed XML format)
// GET /careers/:slug/feed.json
// ---------------------------------------------------------------------------
router.get("/careers/:slug/feed.xml", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const xml = await feedService.getFeedXml(String(req.params.slug));
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

router.get("/careers/:slug/feed.json", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await feedService.getFeedJson(String(req.params.slug));
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /feeds/indeed/:token.xml — public Indeed XML job feed (no auth).
// Indeed's crawler fetches this URL; the token scopes it to one org.
// ---------------------------------------------------------------------------
router.get(
  "/feeds/indeed/:token.xml",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { buildIndeedFeed, resolveOrgByFeedToken } = await import(
        "../../services/publishing/indeed-feed.service"
      );
      const token = String(req.params.token);
      const orgId = await resolveOrgByFeedToken(token);
      if (orgId == null) {
        res.status(404).type("application/xml").send("<!-- unknown feed -->");
        return;
      }
      const xml = await buildIndeedFeed(orgId);
      res.type("application/xml").send(xml);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /feeds/linkedin/:token.xml — public LinkedIn XML job feed (no auth).
// ---------------------------------------------------------------------------
router.get(
  "/feeds/linkedin/:token.xml",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { buildLinkedInFeed, resolveOrgByLinkedInToken } = await import(
        "../../services/publishing/linkedin-feed.service"
      );
      const token = String(req.params.token);
      const orgId = await resolveOrgByLinkedInToken(token);
      if (orgId == null) {
        res.status(404).type("application/xml").send("<!-- unknown feed -->");
        return;
      }
      const xml = await buildLinkedInFeed(orgId);
      res.type("application/xml").send(xml);
    } catch (err) {
      next(err);
    }
  },
);

export { router as publicRoutes };

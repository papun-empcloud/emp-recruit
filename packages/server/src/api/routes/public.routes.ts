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
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

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
  // Phone is optional; when given it must be a real number (7–15 digits, only
  // digits and phone punctuation). BUG-02.
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

      const resumePath = req.file ? `/uploads/resumes/${req.file.filename}` : undefined;

      const result = await careerPageService.submitPublicApplication(
        String(req.params.slug),
        jobId as string,
        parsed.data,
        resumePath,
      );

      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

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

// ============================================================================
// CAREER PAGE ROUTES (authenticated)
// GET / — get org career page config
// PUT / — update config
// POST /publish — publish career page
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as careerPageService from "../../services/career-page/career-page.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  logo_url: z.string().url().nullable().optional(),
  banner_url: z.string().url().nullable().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").optional(),
  custom_css: z.string().nullable().optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only").optional(),
});

// GET /
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await careerPageService.getConfig(req.user!.empcloudOrgId);
    sendSuccess(res, config);
  } catch (err) {
    next(err);
  }
});

// PUT /
router.put("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const result = await careerPageService.updateConfig(req.user!.empcloudOrgId, parsed.data);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /publish
router.post("/publish", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await careerPageService.publishCareerPage(req.user!.empcloudOrgId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /jobs — open, public jobs eligible for the career page (with their flag)
router.get("/jobs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await careerPageService.getManagedJobs(req.user!.empcloudOrgId);
    sendSuccess(res, jobs);
  } catch (err) {
    next(err);
  }
});

// PUT /jobs — set the exact set of jobs shown on the career page
const setJobsSchema = z.object({ jobIds: z.array(z.string()) });
router.put("/jobs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = setJobsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("`jobIds` (array of job ids) is required");
    }
    const jobs = await careerPageService.setCareerJobs(
      req.user!.empcloudOrgId,
      parsed.data.jobIds,
    );
    sendSuccess(res, jobs);
  } catch (err) {
    next(err);
  }
});

export { router as careerPageRoutes };

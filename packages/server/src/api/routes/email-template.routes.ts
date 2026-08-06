// ============================================================================
// EMAIL TEMPLATE ROUTES
// GET / — list templates
// POST / — create template
// PUT /:id — update template
// POST /:id/preview — preview rendered template
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as emailService from "../../services/email/email.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trigger: z.string().min(1, "Trigger is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  is_active: z.preprocess((v) => (v === 1 || v === "1" || v === true ? true : v === 0 || v === "0" || v === false ? false : v), z.boolean()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  is_active: z.preprocess((v) => (v === 1 || v === "1" || v === true ? true : v === 0 || v === "0" || v === false ? false : v), z.boolean()).optional(),
});

const previewSchema = z.object({
  variables: z.record(z.any()).optional(),
});

// GET /
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await emailService.listTemplates(req.user!.empcloudOrgId);
    sendSuccess(res, templates);
  } catch (err) {
    next(err);
  }
});

// POST /
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const template = await emailService.createTemplate(req.user!.empcloudOrgId, parsed.data);
    sendSuccess(res, template, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /:id
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
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

    const template = await emailService.updateTemplate(
      req.user!.empcloudOrgId,
      String(req.params.id),
      parsed.data,
    );
    sendSuccess(res, template);
  } catch (err) {
    next(err);
  }
});

// POST /:id/preview
router.post("/:id/preview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = previewSchema.safeParse(req.body);
    const variables = parsed.success ? parsed.data.variables || {} : {};

    const template = await emailService.getTemplateById(req.user!.empcloudOrgId, String(req.params.id));

    // Default sample variables for preview
    const sampleVars = {
      candidateName: "John Doe",
      jobTitle: "Software Engineer",
      orgName: req.user!.orgName,
      interviewDate: "March 25, 2026",
      interviewTime: "10:00 AM IST",
      interviewType: "Video",
      meetingLink: "https://meet.example.com/interview-123",
      expiryDate: "April 1, 2026",
      ...variables,
    };

    const renderedSubject = emailService.renderTemplate(template.subject, sampleVars);
    const renderedBody = emailService.renderTemplate(template.body, sampleVars);

    sendSuccess(res, { subject: renderedSubject, body: renderedBody });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await emailService.deleteTemplate(req.user!.empcloudOrgId, String(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export { router as emailTemplateRoutes };

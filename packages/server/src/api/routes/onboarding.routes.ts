// ============================================================================
// ONBOARDING ROUTES
// GET    /templates        — List onboarding templates
// POST   /templates        — Create template
// PUT    /templates/:id    — Update template
// GET    /templates/:id/tasks — List tasks for a template
// POST   /templates/:id/tasks — Add task to template
// PUT    /templates/:id/tasks/:taskId — Update template task
// DELETE /templates/:id/tasks/:taskId — Remove template task
// POST   /checklists       — Generate checklist from template
// GET    /checklists       — List active checklists
// GET    /checklists/:id   — Get checklist with tasks
// PATCH  /tasks/:id        — Update task status
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { parsePage, parseLimit } from "../../utils/pagination";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import * as onboardingService from "../../services/onboarding/onboarding.service";

const router = Router();

// All onboarding routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// GET /templates — List templates
router.get(
  "/templates",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const templates = await onboardingService.listTemplates(orgId);
      sendSuccess(res, templates);
    } catch (err) {
      next(err);
    }
  },
);

// POST /templates — Create template
router.post(
  "/templates",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const template = await onboardingService.createTemplate(orgId, req.body);
      sendSuccess(res, template, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /templates/:id — Update template
router.put(
  "/templates/:id",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const template = await onboardingService.updateTemplate(orgId, String(req.params.id), req.body);
      sendSuccess(res, template);
    } catch (err) {
      next(err);
    }
  },
);

// GET /templates/:id/tasks — List tasks for a template
router.get(
  "/templates/:id/tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const tasks = await onboardingService.listTemplateTasks(orgId, String(req.params.id));
      sendSuccess(res, tasks);
    } catch (err) {
      next(err);
    }
  },
);

// POST /templates/:id/tasks — Add task to template
router.post(
  "/templates/:id/tasks",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const task = await onboardingService.addTemplateTask(orgId, String(req.params.id), req.body);
      sendSuccess(res, task, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /templates/:id/tasks/:taskId — Update template task
router.put(
  "/templates/:id/tasks/:taskId",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const task = await onboardingService.updateTemplateTask(
        orgId,
        String(req.params.id),
        String(req.params.taskId),
        req.body,
      );
      sendSuccess(res, task);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /templates/:id/tasks/:taskId — Remove template task
router.delete(
  "/templates/:id/tasks/:taskId",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await onboardingService.removeTemplateTask(orgId, String(req.params.id), String(req.params.taskId));
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

// POST /checklists — Generate checklist from template
router.post(
  "/checklists",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { application_id, template_id, joining_date } = req.body;
      const checklist = await onboardingService.generateChecklist(
        orgId,
        application_id,
        template_id,
        joining_date,
      );
      sendSuccess(res, checklist, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /checklists — List active checklists
router.get(
  "/checklists",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { status, page, limit } = req.query;
      const result = await onboardingService.listChecklists(orgId, {
        status: status as any,
        page: page ? parsePage(page) : undefined,
        limit: limit ? parseLimit(limit) : undefined,
      });
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  },
);

// GET /checklists/:id — Get checklist with tasks and progress
router.get(
  "/checklists/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const checklist = await onboardingService.getChecklist(orgId, String(req.params.id));
      sendSuccess(res, checklist);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /tasks/:id — Update task status
router.patch(
  "/tasks/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { status } = req.body;
      const task = await onboardingService.updateTaskStatus(orgId, String(req.params.id), status, userId);
      sendSuccess(res, task);
    } catch (err) {
      next(err);
    }
  },
);

export { router as onboardingRoutes };

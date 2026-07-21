// ============================================================================
// PIPELINE STAGE ROUTES
// GET    /stages          — Get stages for org
// POST   /stages          — Create custom stage (admin)
// PUT    /stages/:id      — Update stage
// DELETE /stages/:id      — Delete stage
// PUT    /stages/reorder  — Reorder stages
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as pipelineService from "../../services/pipeline/pipeline.service";

const router = Router();

router.use(authenticate);

// Whitelist the writable stage fields so protected columns (organization_id,
// id, is_default, ...) can't be mass-assigned through the update path, which
// passes the body straight to the DB (audit M8).
const createStageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
  sort_order: z.number().int().optional(),
});
const updateStageSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().max(20).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
const reorderStagesSchema = z
  .array(z.object({ id: z.string().min(1), sort_order: z.number().int() }))
  .min(1);

// GET /stages — Get stages for org
router.get(
  "/stages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stages = await pipelineService.getOrgStages(orgId);
      sendSuccess(res, stages);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /stages/reorder — Reorder stages (must be before /:id to avoid route conflict)
router.put(
  "/stages/reorder",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const items = reorderStagesSchema.parse(req.body);
      const stages = await pipelineService.reorderStages(orgId, items);
      sendSuccess(res, stages);
    } catch (err) {
      next(err);
    }
  },
);

// POST /stages — Create custom stage (admin)
router.post(
  "/stages",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = createStageSchema.parse(req.body);
      const stage = await pipelineService.createStage(orgId, data);
      sendSuccess(res, stage, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /stages/:id — Update stage
router.put(
  "/stages/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = updateStageSchema.parse(req.body);
      const stage = await pipelineService.updateStage(orgId, req.params.id as string, data);
      sendSuccess(res, stage);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /stages/:id — Delete stage
router.delete(
  "/stages/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await pipelineService.deleteStage(orgId, req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as pipelineRoutes };

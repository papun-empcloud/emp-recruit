// ============================================================================
// ANALYTICS ROUTES
// GET /overview — dashboard stats
// GET /pipeline — pipeline funnel
// GET /time-to-hire — avg time to hire
// GET /sources — source effectiveness
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as analyticsService from "../../services/analytics/analytics.service";
import { sendSuccess } from "../../utils/response";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// GET /overview
router.get("/overview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getDashboard(req.user!.empcloudOrgId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /pipeline
router.get("/pipeline", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.query.jobId as string | undefined;
    const data = await analyticsService.getPipelineFunnel(req.user!.empcloudOrgId, jobId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /time-to-hire
router.get("/time-to-hire", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getTimeToHire(req.user!.empcloudOrgId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /sources
router.get("/sources", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getSourceEffectiveness(req.user!.empcloudOrgId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /metrics — hire rate + offer outcome stats
router.get("/metrics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getKpiMetrics(req.user!.empcloudOrgId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /trend — weekly application volume
router.get("/trend", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const weeks = req.query.weeks ? Math.min(26, Math.max(4, parseInt(req.query.weeks as string, 10))) : 8;
    const data = await analyticsService.getApplicationsTrend(req.user!.empcloudOrgId, weeks);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };

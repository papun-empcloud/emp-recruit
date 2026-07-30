import { parsePage, parseLimit } from "../../utils/pagination";
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { idParamSchema } from "@emp-recruit/shared";
import { getDB } from "../../db/adapters";
import * as scoringService from "../../services/scoring/resume-scoring.service";

const router = Router();

// All scoring routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// POST /applications/:appId/score — score a single application
router.post(
  "/applications/:appId/score",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.params.appId;
      if (!appId) throw new ValidationError("Application ID is required");

      const orgId = req.user!.empcloudOrgId;

      // Get the application to find candidate_id and job_id
      const db = getDB();
      const app = await db.findOne<any>("applications", {
        id: appId,
        organization_id: orgId,
      });
      if (!app) throw new NotFoundError("Application", appId as string);

      const result = await scoringService.scoreCandidate(
        orgId,
        app.candidate_id,
        app.job_id,
        appId as string,
      );

      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /applications/:appId/rescore — retry AI scoring for one application.
// Same operation as /score (re-evaluates and upserts the score), exposed under
// an explicit name for the "Retry AI scoring" action on the score report.
router.post(
  "/applications/:appId/rescore",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.params.appId;
      if (!appId) throw new ValidationError("Application ID is required");

      const orgId = req.user!.empcloudOrgId;
      const db = getDB();
      const app = await db.findOne<any>("applications", { id: appId, organization_id: orgId });
      if (!app) throw new NotFoundError("Application", appId as string);

      const result = await scoringService.scoreCandidate(
        orgId,
        app.candidate_id,
        app.job_id,
        appId as string,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /jobs/:jobId/batch-score — score all applications for a job
router.post(
  "/jobs/:jobId/batch-score",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) throw new ValidationError("Job ID is required");

      const orgId = req.user!.empcloudOrgId;
      const result = await scoringService.batchScoreCandidates(orgId, jobId);

      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /applications/:appId — get score report for an application
router.get(
  "/applications/:appId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.params.appId as string;
      if (!appId) throw new ValidationError("Application ID is required");

      const orgId = req.user!.empcloudOrgId;
      const score = await scoringService.getScoreReport(orgId, appId);

      if (!score) {
        throw new NotFoundError("Score report for application", appId);
      }

      return sendSuccess(res, score);
    } catch (err) {
      next(err);
    }
  },
);

// GET /jobs/:jobId/rankings — scored applications ranked by score (paginated)
router.get(
  "/jobs/:jobId/rankings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) throw new ValidationError("Job ID is required");

      const orgId = req.user!.empcloudOrgId;
      const page = parsePage(req.query.page);
      const limit = parseLimit(req.query.limit ?? req.query.perPage, 10);
      const rankings = await scoringService.getJobRankingsPaginated(orgId, jobId, { page, limit });

      return sendSuccess(res, rankings);
    } catch (err) {
      next(err);
    }
  },
);

// POST /batch-score — score all applications for a job (alias for /jobs/:jobId/batch-score) (#866)
// Accepts { job_id } in body instead of URL param, used by /ai/batch-score alias
router.post(
  "/batch-score",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.body.job_id || req.body.jobId;
      if (!jobId) throw new ValidationError("job_id is required in request body");

      const orgId = req.user!.empcloudOrgId;
      const result = await scoringService.batchScoreCandidates(orgId, String(jobId));

      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /score-resume — alias for /applications/:appId/score (#865)
// Accepts { application_id } in body
router.post(
  "/score-resume",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.body.application_id || req.body.applicationId;
      if (!appId) throw new ValidationError("application_id is required in request body");
      const orgId = req.user!.empcloudOrgId;
      const db = getDB();
      const app = await db.findOne<any>("applications", { id: appId, organization_id: orgId });
      if (!app) throw new NotFoundError("Application", appId);
      const result = await scoringService.scoreCandidate(orgId, app.candidate_id, app.job_id, String(appId));
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as scoringRoutes };

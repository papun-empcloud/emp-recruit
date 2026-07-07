// ============================================================================
// JOB BOARD ROUTES
// Manage per-org board connections and inspect/trigger publishing.
// Mounted at /api/v1/job-boards.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as jobBoardService from "../../services/job-board/job-board.service";
import { ALL_BOARDS } from "../../services/job-board/providers";
import type { JobBoardKey } from "../../services/job-board/providers/types";

const router = Router();
router.use(authenticate);

// GET /config — board connection status for the org
router.get(
  "/config",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configs = await jobBoardService.getBoardConfigs(req.user!.empcloudOrgId);
      return sendSuccess(res, { boards: configs });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /config/:board — enable/disable, toggle auto-publish, set credentials
router.put(
  "/config/:board",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled, auto_publish, config } = req.body ?? {};
      const configs = await jobBoardService.setBoardConfig(
        req.user!.empcloudOrgId,
        String(req.params.board),
        { enabled, auto_publish, config },
      );
      return sendSuccess(res, { boards: configs });
    } catch (err) {
      next(err);
    }
  },
);

// GET /jobs/:jobId/postings — where a job has been published
router.get(
  "/jobs/:jobId/postings",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const postings = await jobBoardService.getPostings(
        req.user!.empcloudOrgId,
        String(req.params.jobId),
      );
      return sendSuccess(res, postings);
    } catch (err) {
      next(err);
    }
  },
);

// POST /jobs/:jobId/publish — manually publish/retry a job to all enabled
// boards (optional body { boards: ["linkedin", ...] })
router.post(
  "/jobs/:jobId/publish",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requested = Array.isArray(req.body?.boards)
        ? (req.body.boards.filter((b: string) => ALL_BOARDS.includes(b as JobBoardKey)) as JobBoardKey[])
        : undefined;
      const postings = await jobBoardService.publishJobToBoards(
        req.user!.empcloudOrgId,
        String(req.params.jobId),
        { boards: requested },
      );
      return sendSuccess(res, postings);
    } catch (err) {
      next(err);
    }
  },
);

export { router as jobBoardRoutes };

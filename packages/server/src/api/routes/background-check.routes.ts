// ============================================================================
// BACKGROUND CHECK ROUTES
// POST /initiate                    — Initiate a background check
// GET  /candidate/:candidateId      — List checks for a candidate
// GET  /                            — List all checks (admin dashboard)
// GET  /packages                    — List check packages
// POST /packages                    — Create check package (HR)
// GET  /:id                         — Get single check
// PUT  /:id                         — Update result (manual checks)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { parsePage, parseLimit } from "../../utils/pagination";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import * as bgCheckService from "../../services/background-check/background-check.service";
import {
  initiateBackgroundCheckSchema,
  createBackgroundCheckPackageSchema,
  updateBackgroundCheckResultSchema,
} from "@emp-recruit/shared";

const router = Router();

// All background check routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// POST /initiate — Initiate a background check
router.post(
  "/initiate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = initiateBackgroundCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const orgId = req.user!.empcloudOrgId;
      const result = await bgCheckService.initiateCheck(orgId, {
        ...parsed.data,
        initiated_by: req.user!.empcloudUserId,
      });

      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /packages — List check packages
router.get(
  "/packages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const packages = await bgCheckService.listPackages(orgId);
      sendSuccess(res, packages);
    } catch (err) {
      next(err);
    }
  },
);

// POST /packages — Create check package
router.post(
  "/packages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createBackgroundCheckPackageSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const orgId = req.user!.empcloudOrgId;
      const pkg = await bgCheckService.createPackage(orgId, parsed.data);

      sendSuccess(res, pkg, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /candidate/:candidateId — List checks for a candidate
router.get(
  "/candidate/:candidateId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const checks = await bgCheckService.listChecksForCandidate(
        orgId,
        String(req.params.candidateId),
      );
      sendSuccess(res, checks);
    } catch (err) {
      next(err);
    }
  },
);

// GET / — List all checks (admin dashboard)
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { status, page, limit } = req.query;
      const result = await bgCheckService.listAllChecks(orgId, {
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

// GET /:id — Get single check
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const check = await bgCheckService.getCheck(orgId, String(req.params.id));
      sendSuccess(res, check);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /:id — Update result (for manual checks)
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateBackgroundCheckResultSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const orgId = req.user!.empcloudOrgId;
      const check = await bgCheckService.updateCheckResult(
        orgId,
        String(req.params.id),
        parsed.data,
      );
      sendSuccess(res, check);
    } catch (err) {
      next(err);
    }
  },
);

export { router as backgroundCheckRoutes };

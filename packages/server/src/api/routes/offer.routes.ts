// ============================================================================
// OFFER ROUTES
// POST /              — Create offer
// GET  /:id           — Get offer with approvers
// PUT  /:id           — Update draft offer
// POST /:id/submit-approval — Submit for approval
// POST /:id/approve   — Approve offer
// POST /:id/reject    — Reject offer
// POST /:id/send      — Send offer to candidate
// POST /:id/revoke    — Revoke offer
// POST /:id/accept    — Candidate accepts offer
// POST /:id/decline   — Candidate declines offer
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { createOfferSchema } from "@emp-recruit/shared";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import * as offerService from "../../services/offer/offer.service";

const router = Router();

// All offer routes require authentication
router.use(authenticate);

// POST / — Create offer
router.post(
  "/",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the payload (required fields incl. joining_date/expiry_date)
      // up front — otherwise a missing NOT NULL field used to surface as a 500.
      const data = createOfferSchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.createOffer(orgId, {
        ...data,
        created_by: req.user!.empcloudUserId,
      });
      sendSuccess(res, offer, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET / — List offers
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { status, search, page, limit, perPage } = req.query;
      const result = await offerService.listOffers(orgId, {
        status: status as any,
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : perPage ? Number(perPage) : undefined,
      });
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id — Get offer with approvers
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.getOffer(orgId, String(req.params.id));
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /:id — Update draft offer
router.put(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.updateOffer(orgId, String(req.params.id), req.body);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/submit-approval — Submit for approval
router.post(
  "/:id/submit-approval",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { approver_ids } = req.body;
      const offer = await offerService.submitForApproval(orgId, String(req.params.id), approver_ids);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/approve — Approve offer
router.post(
  "/:id/approve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const userRole = req.user!.role;
      const offer = await offerService.approve(orgId, String(req.params.id), userId, userRole, req.body?.comment);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/reject — Reject offer
router.post(
  "/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const userRole = req.user!.role;
      const offer = await offerService.reject(orgId, String(req.params.id), userId, userRole, req.body?.comment);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/send — Send offer to candidate
router.post(
  "/:id/send",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.sendOffer(orgId, String(req.params.id));
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/revoke — Revoke offer
router.post(
  "/:id/revoke",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.revokeOffer(orgId, String(req.params.id));
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/accept — Candidate accepts offer
router.post(
  "/:id/accept",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.acceptOffer(orgId, String(req.params.id), req.body?.notes);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/decline — Candidate declines offer
router.post(
  "/:id/decline",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const offer = await offerService.declineOffer(orgId, String(req.params.id), req.body?.notes);
      sendSuccess(res, offer);
    } catch (err) {
      next(err);
    }
  },
);

export { router as offerRoutes };

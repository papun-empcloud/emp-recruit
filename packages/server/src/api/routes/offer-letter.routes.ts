// ============================================================================
// OFFER LETTER ROUTES
// GET  /templates          — List templates
// POST /templates          — Create template (admin)
// POST /generate/:offerId  — Generate letter for an offer
// GET  /:offerId           — Get generated letter
// POST /:offerId/send      — Email letter to candidate
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as offerLetterService from "../../services/offer/offer-letter.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /templates — List templates
router.get(
  "/templates",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const templates = await offerLetterService.listLetterTemplates(orgId);
      sendSuccess(res, templates);
    } catch (err) {
      next(err);
    }
  },
);

// POST /templates/preview — render an unsaved template with realistic sample
// data. The client displays this in a sandboxed iframe.
router.post(
  "/templates/preview",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, offerLetterService.previewLetterTemplate(req.body.content_template));
    } catch (err) {
      next(err);
    }
  },
);

// POST /templates — Create template (admin only)
router.post(
  "/templates",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const template = await offerLetterService.createLetterTemplate(orgId, {
        name: req.body.name,
        content_template: req.body.content_template,
        is_default: req.body.is_default,
      });
      sendSuccess(res, template, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /templates/:id — Update an existing template (admin only)
router.put(
  "/templates/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const template = await offerLetterService.updateLetterTemplate(orgId, req.params.id as string, {
        name: req.body.name,
        content_template: req.body.content_template,
        is_default: req.body.is_default,
      });
      sendSuccess(res, template);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /templates/:id — Remove a template (admin only)
router.delete(
  "/templates/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await offerLetterService.deleteLetterTemplate(orgId, req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /generate/:offerId — Generate letter for an offer
router.post(
  "/generate/:offerId",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { offerId } = req.params;
      const { templateId } = req.body;
      const letter = await offerLetterService.generateOfferLetter(orgId, offerId as string, templateId, userId);
      sendSuccess(res, letter, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:offerId — Get generated letter
router.get(
  "/:offerId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const letter = await offerLetterService.getOfferLetter(orgId, req.params.offerId as string);
      sendSuccess(res, letter);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:offerId/send — Email letter to candidate
router.post(
  "/:offerId/send",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const letter = await offerLetterService.sendOfferLetter(orgId, req.params.offerId as string);
      sendSuccess(res, letter);
    } catch (err) {
      next(err);
    }
  },
);

export { router as offerLetterRoutes };

// ============================================================================
// CANDIDATE EXPERIENCE SURVEY / NPS ROUTES
// POST /send                  — Send survey to candidate (HR)
// GET  /                      — List all surveys
// GET  /nps                   — Aggregate NPS score
// GET  /:id/results           — Get survey results
// POST /respond/:token        — Submit response (PUBLIC — no auth)
// GET  /take/:token           — Get survey form (PUBLIC — no auth)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { parsePage, parseLimit } from "../../utils/pagination";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import * as surveyService from "../../services/survey/survey.service";
import { sendSurveySchema, submitSurveyResponseSchema } from "@emp-recruit/shared";

const router = Router();

// ---------------------------------------------------------------------------
// PUBLIC routes (no auth — accessed via token)
// ---------------------------------------------------------------------------

// GET /take/:token — Get survey form for candidate
router.get(
  "/take/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await surveyService.getSurveyByToken(String(req.params.token));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /respond/:token — Submit survey response (PUBLIC)
router.post(
  "/respond/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = submitSurveyResponseSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const result = await surveyService.submitResponse(
        String(req.params.token),
        parsed.data.responses,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTHENTICATED routes (HR/Admin)
// ---------------------------------------------------------------------------

// POST /send — Send survey to candidate
router.post(
  "/send",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = sendSurveySchema.safeParse(req.body);
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
      const result = await surveyService.sendSurvey(orgId, parsed.data);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /nps — Aggregate NPS score
router.get(
  "/nps",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { survey_type, from_date, to_date } = req.query;
      const result = await surveyService.calculateNPS(orgId, {
        survey_type: survey_type as any,
        from_date: from_date as string,
        to_date: to_date as string,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET / — List all surveys
router.get(
  "/",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { survey_type, status, page, limit } = req.query;
      const result = await surveyService.listSurveys(orgId, {
        survey_type: survey_type as any,
        status: status as string,
        page: page ? parsePage(page) : undefined,
        limit: limit ? parseLimit(limit) : undefined,
      });
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/results — Get survey results
router.get(
  "/:id/results",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await surveyService.getSurveyResults(orgId, String(req.params.id));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as surveyRoutes };

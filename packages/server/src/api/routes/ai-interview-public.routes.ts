// ============================================================================
// AI INTERVIEW ROUTES (candidate-facing — PUBLIC, token-scoped, no auth)
// GET  /:token           — current interview state (question, progress)
// POST /:token/answer     — submit the current answer, advance
// POST /:token/complete   — finish and generate the evaluation
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as aiInterviewService from "../../services/ai-interview/ai-interview.service";
import { sendSuccess } from "../../utils/response";

const router = Router();

router.get("/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await aiInterviewService.getPublicState(String(req.params.token));
    sendSuccess(res, state);
  } catch (err) {
    next(err);
  }
});

router.post("/:token/answer", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aiInterviewService.submitAnswer(
      String(req.params.token),
      String(req.body.answer ?? ""),
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post("/:token/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aiInterviewService.completeSession(String(req.params.token));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as aiInterviewPublicRoutes };

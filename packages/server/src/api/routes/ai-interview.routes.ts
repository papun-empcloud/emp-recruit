// ============================================================================
// AI INTERVIEW ROUTES (HR / admin — authenticated)
// POST /              — create an AI interview session for an application
// GET  /              — list sessions
// GET  /:id           — session detail (transcript + evaluation)
// ============================================================================

import { parsePage, parseLimit } from "../../utils/pagination";
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as aiInterviewService from "../../services/ai-interview/ai-interview.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// POST / — create a session for an application (generates draft questions)
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicationId = req.body.application_id;
    if (!applicationId) throw new ValidationError("application_id is required");
    const session = await aiInterviewService.createSession(req.user!.empcloudOrgId, String(applicationId), {
      objective: req.body.objective,
      questionCount: req.body.question_count,
      secondsPerQuestion: req.body.seconds_per_question,
    });
    sendSuccess(
      res,
      { id: session.id, token: session.token, status: session.status, questions: session.questions },
      201,
    );
  } catch (err) {
    next(err);
  }
});

// PUT /:id/questions — HR edits the draft questions
router.put("/:id/questions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questions = req.body.questions;
    if (!Array.isArray(questions)) throw new ValidationError("questions must be an array of strings");
    const updated = await aiInterviewService.updateQuestions(
      req.user!.empcloudOrgId,
      String(req.params.id),
      questions.map((q: any) => String(q)),
    );
    sendSuccess(res, { questions: updated });
  } catch (err) {
    next(err);
  }
});

// POST /:id/approve — HR approves; the candidate link becomes usable
router.post("/:id/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await aiInterviewService.approveSession(req.user!.empcloudOrgId, String(req.params.id));
    sendSuccess(res, { status: "ready" });
  } catch (err) {
    next(err);
  }
});

// GET / — list sessions
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aiInterviewService.listSessions(req.user!.empcloudOrgId, {
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit ?? req.query.perPage),
      status: req.query.status as string | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /:id — detail
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await aiInterviewService.getSession(
      req.user!.empcloudOrgId,
      String(req.params.id),
    );
    sendSuccess(res, session);
  } catch (err) {
    next(err);
  }
});

export { router as aiInterviewRoutes };

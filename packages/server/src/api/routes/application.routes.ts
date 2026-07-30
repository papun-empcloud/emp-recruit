import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createApplicationSchema,
  moveStageSchema,
  addNoteSchema,
  idParamSchema,
  paginationSchema,
} from "@emp-recruit/shared";
import * as applicationService from "../../services/application/application.service";
import * as screeningService from "../../services/screening/screening.service";

const router = Router();

// All application routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// GET / — list applications
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = paginationSchema.parse(req.query);
    const job_id = req.query.job_id as string | undefined;
    const stage = req.query.stage as string | undefined;
    const candidate_id = req.query.candidate_id as string | undefined;
    const search = req.query.search as string | undefined;
    const department = req.query.department as string | undefined;
    const location = req.query.location as string | undefined;
    const date_from = req.query.date_from as string | undefined;
    const date_to = req.query.date_to as string | undefined;
    const orgId = req.user!.empcloudOrgId;

    const result = await applicationService.listApplications(orgId, {
      page: query.page,
      perPage: query.perPage,
      job_id,
      stage,
      candidate_id,
      search,
      department,
      location,
      date_from,
      date_to,
      sort: query.sort,
      order: query.order,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST / — create application
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createApplicationSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const application = await applicationService.createApplication(orgId, data);
    return sendSuccess(res, application, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid application data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// GET /:id — get application
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const application = await applicationService.getApplication(orgId, id);
    return sendSuccess(res, application);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/stage — move application stage
router.patch("/:id/stage", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { stage, notes, rejection_reason } = moveStageSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;

    const application = await applicationService.moveStage(orgId, id, stage, userId, notes, rejection_reason);
    return sendSuccess(res, application);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid stage data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /:id/notes — add a note
router.post("/:id/notes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { notes } = addNoteSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;

    const application = await applicationService.addNote(orgId, id, userId, notes);
    return sendSuccess(res, application);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid note data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// GET /:id/timeline — get application stage history
router.get("/:id/timeline", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const timeline = await applicationService.getTimeline(orgId, id);
    return sendSuccess(res, timeline);
  } catch (err) {
    next(err);
  }
});

// GET /:id/screening-answers — a candidate's screening answers for this application
router.get("/:id/screening-answers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const orgId = req.user!.empcloudOrgId;
    const answers = await screeningService.getApplicationAnswers(orgId, id);
    return sendSuccess(res, answers);
  } catch (err) {
    next(err);
  }
});

export { router as applicationRoutes };

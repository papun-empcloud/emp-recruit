import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { z } from "zod";
import {
  createJobSchema,
  updateJobSchema,
  changeJobStatusSchema,
  bulkImportJobsSchema,
  bulkUpdateJobsSchema,
  setScreeningQuestionsSchema,
  addHiringTeamMemberSchema,
  updateHiringTeamMemberSchema,
  createRecruitmentTaskSchema,
  updateRecruitmentTaskSchema,
  idParamSchema,
  paginationSchema,
} from "@emp-recruit/shared";
import * as jobService from "../../services/job/job.service";
import * as applicationService from "../../services/application/application.service";
import * as screeningService from "../../services/screening/screening.service";
import * as recruitmentService from "../../services/recruitment/recruitment.service";

const uuid = z.string().uuid();

const router = Router();

// All job routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// GET / — list jobs
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = paginationSchema.parse(req.query);
    const status = req.query.status as string | undefined;
    const orgId = req.user!.empcloudOrgId;

    const result = await jobService.listJobs(orgId, {
      page: query.page,
      perPage: query.perPage,
      status,
      search: query.search,
      sort: query.sort,
      order: query.order,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST / — create job
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createJobSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const createdBy = req.user!.empcloudUserId;

    const job = await jobService.createJob(orgId, data, createdBy);
    return sendSuccess(res, job, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid job data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /bulk — import many job postings in one request. Each row is validated
// and created independently; the response reports how many were created and
// per-row failures. (Registered before "/:id" — /bulk is a POST so there's no
// route collision, but keeping it next to POST / keeps the create paths together.)
router.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobs } = bulkImportJobsSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const createdBy = req.user!.empcloudUserId;

    const result = await jobService.bulkImportJobs(orgId, jobs, createdBy);
    return sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid job import data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /bulk-update — update many job postings in one request, each keyed on
// the job id. Only the fields present on a row are changed; the response reports
// how many were updated and per-row failures.
router.post("/bulk-update", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobs } = bulkUpdateJobsSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const result = await jobService.bulkUpdateJobs(orgId, jobs);
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid job update data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// GET /:id — get job
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const job = await jobService.getJob(orgId, id);
    return sendSuccess(res, job);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — update job
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = updateJobSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const job = await jobService.updateJob(orgId, id, data);
    return sendSuccess(res, job);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid job data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// PATCH /:id/status — change job status
router.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { status } = changeJobStatusSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const job = await jobService.changeStatus(orgId, id, status);
    return sendSuccess(res, job);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid status", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// DELETE /:id — delete job
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    await jobService.deleteJob(orgId, id);
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// GET /:id/applications — list applications for a job
router.get("/:id/applications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const query = paginationSchema.parse(req.query);
    const stage = req.query.stage as string | undefined;
    const orgId = req.user!.empcloudOrgId;

    const result = await applicationService.listApplications(orgId, {
      job_id: id,
      stage,
      page: query.page,
      perPage: query.perPage,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /:id/analytics — job analytics
router.get("/:id/analytics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const analytics = await jobService.getJobAnalytics(orgId, id);
    return sendSuccess(res, analytics);
  } catch (err) {
    next(err);
  }
});

// GET /:id/screening-questions — the job's screening/knockout questions
router.get("/:id/screening-questions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const questions = await screeningService.getJobQuestions(orgId, id);
    return sendSuccess(res, questions);
  } catch (err) {
    next(err);
  }
});

// PUT /:id/screening-questions — replace the job's screening questions
router.put("/:id/screening-questions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { questions } = setScreeningQuestionsSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const saved = await screeningService.setJobQuestions(orgId, id, questions);
    return sendSuccess(res, saved);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid screening questions", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Hiring team (031)
// ---------------------------------------------------------------------------

// GET /:id/hiring-team — members assigned to the job
router.get("/:id/hiring-team", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const team = await recruitmentService.listHiringTeam(req.user!.empcloudOrgId, id);
    return sendSuccess(res, team);
  } catch (err) {
    next(err);
  }
});

// POST /:id/hiring-team — add (or re-role) a member
router.post("/:id/hiring-team", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = addHiringTeamMemberSchema.parse(req.body);
    const member = await recruitmentService.addHiringTeamMember(req.user!.empcloudOrgId, id, data);
    return sendSuccess(res, member, 201);
  } catch (err: any) {
    if (err.name === "ZodError") return next(new ValidationError("Invalid team member", err.flatten().fieldErrors));
    next(err);
  }
});

// PATCH /:id/hiring-team/:memberId — change a member's role
router.patch("/:id/hiring-team/:memberId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberId = uuid.parse(req.params.memberId);
    const data = updateHiringTeamMemberSchema.parse(req.body);
    const member = await recruitmentService.updateHiringTeamMember(req.user!.empcloudOrgId, memberId, data);
    return sendSuccess(res, member);
  } catch (err: any) {
    if (err.name === "ZodError") return next(new ValidationError("Invalid team member", err.flatten().fieldErrors));
    next(err);
  }
});

// DELETE /:id/hiring-team/:memberId — remove a member
router.delete("/:id/hiring-team/:memberId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberId = uuid.parse(req.params.memberId);
    await recruitmentService.removeHiringTeamMember(req.user!.empcloudOrgId, memberId);
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Recruitment tasks (031)
// ---------------------------------------------------------------------------

// GET /:id/tasks — tasks for the job
router.get("/:id/tasks", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const tasks = await recruitmentService.listJobTasks(req.user!.empcloudOrgId, id);
    return sendSuccess(res, tasks);
  } catch (err) {
    next(err);
  }
});

// POST /:id/tasks — create a task on the job
router.post("/:id/tasks", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = createRecruitmentTaskSchema.parse(req.body);
    const task = await recruitmentService.createJobTask(
      req.user!.empcloudOrgId,
      req.user!.empcloudUserId,
      id,
      data,
    );
    return sendSuccess(res, task, 201);
  } catch (err: any) {
    if (err.name === "ZodError") return next(new ValidationError("Invalid task", err.flatten().fieldErrors));
    next(err);
  }
});

// PATCH /:id/tasks/:taskId — update a task (status, assignee, due date, …)
router.patch("/:id/tasks/:taskId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = uuid.parse(req.params.taskId);
    const data = updateRecruitmentTaskSchema.parse(req.body);
    const task = await recruitmentService.updateTask(req.user!.empcloudOrgId, taskId, data);
    return sendSuccess(res, task);
  } catch (err: any) {
    if (err.name === "ZodError") return next(new ValidationError("Invalid task", err.flatten().fieldErrors));
    next(err);
  }
});

// DELETE /:id/tasks/:taskId — delete a task
router.delete("/:id/tasks/:taskId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = uuid.parse(req.params.taskId);
    await recruitmentService.deleteTask(req.user!.empcloudOrgId, taskId);
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as jobRoutes };

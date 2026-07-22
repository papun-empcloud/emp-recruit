import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createJobSchema,
  updateJobSchema,
  changeJobStatusSchema,
  bulkImportJobsSchema,
  idParamSchema,
  paginationSchema,
} from "@emp-recruit/shared";
import * as jobService from "../../services/job/job.service";
import * as applicationService from "../../services/application/application.service";

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

export { router as jobRoutes };

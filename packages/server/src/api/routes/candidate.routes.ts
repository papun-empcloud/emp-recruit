import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createCandidateSchema,
  updateCandidateSchema,
  bulkImportCandidatesSchema,
  idParamSchema,
  paginationSchema,
} from "@emp-recruit/shared";
import { uploadResume, uploadResumes } from "../middleware/upload.middleware";
import * as candidateService from "../../services/candidate/candidate.service";
import { parseResumeText, extractSkills } from "../../services/scoring/resume-scoring.service";
import { extractResumeIdentity } from "../../services/recruitment-ops/recruitment-ops.service";
import fs from "fs/promises";
import { getDB } from "../../db/adapters";

const router = Router();

// All candidate routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// GET / — list candidates
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = paginationSchema.parse(req.query);
    const orgId = req.user!.empcloudOrgId;

    const result = await candidateService.listCandidates(orgId, {
      page: query.page,
      perPage: query.perPage,
      search: query.search,
      sort: query.sort,
      order: query.order,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST / — create candidate
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCandidateSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const candidate = await candidateService.createCandidate(orgId, data);
    return sendSuccess(res, candidate, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid candidate data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /bulk — import many candidates into a job's pipeline in one request
router.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { job_id, candidates } = bulkImportCandidatesSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const result = await candidateService.bulkImportCandidates(orgId, job_id, candidates);
    return sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid bulk import data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /bulk-resumes — upload and independently process up to 100 resumes.
router.post("/bulk-resumes", uploadResumes.array("resumes", 100), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (!files.length) return next(new ValidationError("No resume files provided"));
    if (req.body.job_id) {
      const job = await getDB().findOne<any>("job_postings", { id: String(req.body.job_id), organization_id: orgId });
      if (!job) {
        await Promise.all(files.map((file) => fs.rm(file.path, { force: true }).catch(() => undefined)));
        return next(new ValidationError("The selected job does not exist or is not available to this organization"));
      }
    }
    const results: any[] = [];
    for (const file of files) {
      try {
        const text = await parseResumeText(file.path);
        if (!text.trim()) throw new ValidationError("No readable text found. The file may be scanned/image-only, password-protected, or an unsupported legacy DOC file");
        const identity = extractResumeIdentity(text);
        if (!identity.email) throw new ValidationError("No email address was found in the readable resume text");
        const relativePath = file.path.replace(process.cwd(), "").replace(/\\/g, "/");
        const existing = await candidateService.findCandidateByEmail(orgId, identity.email);
        let candidate = existing;
        let status = "matched_existing";
        if (!candidate) {
          candidate = await candidateService.createCandidate(orgId, { ...identity, phone: identity.phone || undefined, skills: extractSkills(text).map((s) => s.skill), source: "bulk_resume" });
          status = "created";
          candidate = await candidateService.updateResumePath(orgId, candidate.id, relativePath);
        } else {
          // Do not silently replace a canonical resume. The recruiter can review
          // the duplicate and merge explicitly; discard the unclaimed PII file.
          await fs.rm(file.path, { force: true });
          results.push({ file: file.originalname, status: "duplicate_review_required", candidate_id: candidate.id, extracted: identity });
          continue;
        }
        if (req.body.job_id) {
          try {
            const imported = await candidateService.bulkImportCandidates(orgId, String(req.body.job_id), [{ ...identity, phone: identity.phone || undefined, source: "bulk_resume" }]);
            if (imported.skipped) status = "already_applied";
            if (imported.failed.length) {
              results.push({ file: file.originalname, status: "candidate_created_application_failed", candidate_id: candidate.id, extracted: identity, error: imported.failed[0]?.reason || "Candidate was created, but job application failed" });
              continue;
            }
          } catch (applicationError: any) {
            results.push({ file: file.originalname, status: "candidate_created_application_failed", candidate_id: candidate.id, extracted: identity, error: `Candidate was created, but job application failed: ${applicationError?.message || "Unknown application error"}` });
            continue;
          }
        }
        results.push({ file: file.originalname, status, candidate_id: candidate.id, extracted: identity });
      } catch (err: any) {
        await fs.rm(file.path, { force: true }).catch(() => undefined);
        results.push({ file: file.originalname, status: "failed", error: err?.message || "Unable to process resume" });
      }
    }
    return sendSuccess(res, {
      total: files.length,
      created: results.filter((r) => r.status === "created").length,
      matched: results.filter((r) => ["matched_existing", "already_applied", "duplicate_review_required"].includes(r.status)).length,
      failed: results.filter((r) => ["failed", "candidate_created_application_failed"].includes(r.status)).length,
      results,
    }, 201);
  } catch (err) { next(err); }
});

// GET /:id — get candidate
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const candidate = await candidateService.getCandidate(orgId, id);
    return sendSuccess(res, candidate);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — update candidate
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = updateCandidateSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;

    const candidate = await candidateService.updateCandidate(orgId, id, data);
    return sendSuccess(res, candidate);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid candidate data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

router.post("/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const candidate = await candidateService.archiveCandidate(req.user!.empcloudOrgId, id, req.user!.empcloudUserId);
    return sendSuccess(res, candidate);
  } catch (err) { next(err); }
});

// POST /:id/resume — upload resume
router.post(
  "/:id/resume",
  uploadResume.single("resume"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const orgId = req.user!.empcloudOrgId;

      if (!req.file) {
        return next(new ValidationError("No resume file provided"));
      }

      const relativePath = req.file.path.replace(process.cwd(), "").replace(/\\/g, "/");
      const candidate = await candidateService.updateResumePath(orgId, id, relativePath);
      return sendSuccess(res, candidate);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/applications — get candidate's applications
router.get("/:id/applications", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;

    const applications = await candidateService.getCandidateApplications(orgId, id);
    return sendSuccess(res, applications);
  } catch (err) {
    next(err);
  }
});

export { router as candidateRoutes };

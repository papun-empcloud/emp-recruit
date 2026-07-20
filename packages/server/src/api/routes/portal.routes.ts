// ============================================================================
// PORTAL ROUTES
// Public-facing candidate portal — magic link auth, application tracking,
// interview schedule, document upload.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { portalAuthenticate } from "../middleware/portal-auth.middleware";
import { strictLimiter } from "../middleware/rate-limit.middleware";
import * as portalService from "../../services/portal/portal.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError, AppError } from "../../utils/errors";

const router = Router();

// ---------------------------------------------------------------------------
// Multer config for portal document uploads
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Map each allowed MIME to a fixed, safe extension. The client-supplied
// originalname extension is never used for the stored file — otherwise a
// candidate could upload a `.html`/`.svg` and have it served as active content
// (audit M6). An unknown type is stored as `.bin`.
const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const ALLOWED_MIMES = Object.keys(MIME_TO_EXT);

const documentStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.candidate?.orgId || "unknown";
    const dir = path.join(process.cwd(), "uploads", "portal-documents", String(orgId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || ".bin";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "INVALID_FILE_TYPE", "Only PDF, Word, JPEG, and PNG files are allowed"));
    }
  },
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const requestAccessSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
});

// ---------------------------------------------------------------------------
// POST /portal/request-access — public, no auth
// Candidate enters email and receives a magic link.
// ---------------------------------------------------------------------------
router.post(
  "/request-access",
  strictLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = requestAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid email address");
      }

      const result = await portalService.requestAccess(parsed.data.email);
      sendSuccess(res, {
        message: "If an account exists with this email, a portal access link has been sent.",
        sent: result.sent,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// All routes below require portal authentication
// ---------------------------------------------------------------------------
router.use(portalAuthenticate);

// ---------------------------------------------------------------------------
// GET /portal/dashboard — candidate's applications overview
// ---------------------------------------------------------------------------
router.get(
  "/dashboard",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, orgId } = req.candidate!;
      const data = await portalService.getCandidatePortal(id, orgId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /portal/applications/:id — application detail with timeline
// ---------------------------------------------------------------------------
router.get(
  "/applications/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: candidateId, orgId } = req.candidate!;
      const data = await portalService.getApplicationStatus(
        candidateId,
        String(req.params.id),
        orgId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /portal/interviews — upcoming interviews with meeting links
// ---------------------------------------------------------------------------
router.get(
  "/interviews",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, orgId } = req.candidate!;
      const data = await portalService.getUpcomingInterviews(id, orgId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /portal/offers — pending offers
// ---------------------------------------------------------------------------
router.get(
  "/offers",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, orgId } = req.candidate!;
      const data = await portalService.getPendingOffers(id, orgId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /portal/documents — upload documents (ID proof, certificates)
// ---------------------------------------------------------------------------
router.post(
  "/documents",
  documentUpload.single("document"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded");
      }

      const { id, orgId } = req.candidate!;
      const data = await portalService.uploadDocument(id, orgId, req.file);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

export { router as portalRoutes };

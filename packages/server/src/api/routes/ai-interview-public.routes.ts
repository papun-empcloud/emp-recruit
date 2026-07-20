// ============================================================================
// AI INTERVIEW ROUTES (candidate-facing — PUBLIC, token-scoped, no auth)
// GET  /:token           — current interview state (question, progress)
// POST /:token/answer     — submit the current answer, advance
// POST /:token/complete   — finish and generate the evaluation
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import * as aiInterviewService from "../../services/ai-interview/ai-interview.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError, AppError } from "../../utils/errors";
import { config } from "../../config";

/**
 * Verify a Retell webhook signature: HMAC-SHA256 of the raw request body keyed
 * with the Retell API key, hex-encoded, matched constant-time against the
 * `x-retell-signature` header. Matches Retell's `verify()` scheme.
 */
function verifyRetellSignature(rawBody: Buffer | undefined, signature: string | undefined, apiKey: string): boolean {
  if (!rawBody || !signature) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const router = Router();

// Store the candidate's recorded interview audio under uploads/ai-interviews.
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "ai-interviews");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Force a safe extension from the (audio-only) MIME type rather than trusting
    // the client's originalname, so a `.html`/`.svg` can't be stored and later
    // served as active content (audit M6). Unknown audio types fall back to .webm.
    const AUDIO_EXT: Record<string, string> = {
      "audio/webm": ".webm",
      "audio/ogg": ".ogg",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav",
      "audio/mpeg": ".mp3",
      "audio/mp4": ".m4a",
    };
    cb(null, `${uuidv4()}${AUDIO_EXT[file.mimetype] || ".webm"}`);
  },
});
const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio recordings are allowed"));
  },
});

// POST /retell-webhook — Retell posts call lifecycle events here. Defined before
// the "/:token" routes so its fixed path isn't shadowed.
router.post("/retell-webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Reject forged webhooks. When Retell is configured, the request must carry
    // a valid signature — otherwise anyone could POST fake transcripts/evals that
    // drive HR hiring recommendations. If no API key is set (dev), skip the check.
    const apiKey = config.ai.retell.apiKey;
    if (apiKey) {
      const ok = verifyRetellSignature(
        (req as any).rawBody,
        req.header("x-retell-signature"),
        apiKey,
      );
      if (!ok) {
        return next(new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature"));
      }
    }
    await aiInterviewService.handleRetellWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

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

// POST /:token/voice-call — start a real-time Retell voice interview.
router.post("/:token/voice-call", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aiInterviewService.createVoiceCall(String(req.params.token));
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /:token/recording — upload the recorded interview audio (multipart).
router.post("/:token/recording", (req: Request, res: Response, next: NextFunction) => {
  audioUpload.single("audio")(req, res, async (err: any) => {
    if (err) {
      return next(new ValidationError(err?.message || "Recording upload failed"));
    }
    try {
      if (!req.file) throw new ValidationError("No audio file uploaded");
      const url = `/uploads/ai-interviews/${req.file.filename}`;
      await aiInterviewService.saveRecording(String(req.params.token), url);
      sendSuccess(res, { recording_url: url });
    } catch (e) {
      next(e);
    }
  });
});

export { router as aiInterviewPublicRoutes };

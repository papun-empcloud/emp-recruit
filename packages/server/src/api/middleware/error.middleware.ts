import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";
import type { ApiResponse } from "@emp-recruit/shared";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Zod validation failures are a client error (400), not a server error (500).
  // Surface the first field message so the caller knows what's missing/invalid.
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const field = first?.path?.join(".");
    // Group messages by field for the details map (Record<string, string[]>).
    const details: Record<string, string[]> = {};
    for (const issue of err.errors) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: field ? `${field}: ${first.message}` : (first?.message ?? "Invalid request"),
        details,
      },
    };
    return res.status(400).json(response);
  }

  logger.error("Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isDev ? err.message : "An unexpected error occurred",
    },
  };
  return res.status(500).json(response);
}

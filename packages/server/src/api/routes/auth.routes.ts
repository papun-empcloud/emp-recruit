// ============================================================================
// AUTH ROUTES
// POST /login, POST /register, POST /refresh-token
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../../services/auth/auth.service";
import { readCookie } from "../middleware/auth.middleware";
import { config } from "../../config";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();

// ---------------------------------------------------------------------------
// httpOnly auth cookies (audit H3)
// Tokens are delivered as httpOnly cookies so XSS can't read them from JS.
// SameSite=Lax keeps them off cross-site POST/PUT/DELETE, which covers CSRF for
// the state-changing API; the cookie is only auto-sent on same-site requests
// and top-level GET navigations. `path: "/"` so `/uploads` media is covered too.
// Secure is enabled outside development (dev is plain http via the Vite proxy).
// ---------------------------------------------------------------------------
const ACCESS_COOKIE_MAX_AGE = 2 * 60 * 60 * 1000; // 2h — matches JWT_ACCESS_EXPIRY
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d — matches JWT_REFRESH_EXPIRY

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config.env !== "development",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie("access_token", tokens.accessToken, cookieOptions(ACCESS_COOKIE_MAX_AGE));
  res.cookie("refresh_token", tokens.refreshToken, cookieOptions(REFRESH_COOKIE_MAX_AGE));
}

function clearAuthCookies(res: Response) {
  const base = { httpOnly: true, secure: config.env !== "development", sameSite: "lax" as const, path: "/" };
  res.clearCookie("access_token", base);
  res.clearCookie("refresh_token", base);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  orgName: z.string().min(2, "Organization name is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  country: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const ssoSchema = z.object({
  token: z.string().min(1, "SSO token is required"),
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const result = await authService.login(parsed.data.email, parsed.data.password);
    setAuthCookies(res, result.tokens);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const result = await authService.register(parsed.data);
    setAuthCookies(res, result.tokens);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /sso — exchange EMP Cloud SSO token for Recruit tokens
// ---------------------------------------------------------------------------
router.post("/sso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ssoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("SSO token is required");
    }

    const result = await authService.ssoLogin(parsed.data.token);
    setAuthCookies(res, result.tokens);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /refresh-token
// ---------------------------------------------------------------------------
router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // The refresh token now lives in an httpOnly cookie (audit H3); still accept
    // it in the body for non-browser API clients / backward compatibility.
    const parsed = refreshSchema.safeParse(req.body);
    const refreshTokenValue = parsed.success
      ? parsed.data.refreshToken
      : readCookie(req, "refresh_token");
    if (!refreshTokenValue) {
      throw new ValidationError("Refresh token is required");
    }

    const tokens = await authService.refreshToken(refreshTokenValue);
    setAuthCookies(res, tokens);
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /logout — clear the httpOnly auth cookies (JS can't clear them itself).
// ---------------------------------------------------------------------------
router.post("/logout", (_req: Request, res: Response) => {
  clearAuthCookies(res);
  sendSuccess(res, { success: true });
});

export { router as authRoutes };

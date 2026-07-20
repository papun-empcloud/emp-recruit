import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { AppError } from "../../utils/errors";
import {
  API_KEY_PREFIX,
  findValidApiKey,
  findUserById,
  findOrgById,
} from "../../db/empcloud";

export interface AuthPayload {
  // EmpCloud IDs (source of truth — bigint stored as number)
  empcloudUserId: number;
  empcloudOrgId: number;
  // Recruit profile ID (UUID in recruit DB, null if profile not yet created)
  recruitProfileId: string | null;
  // User info from EmpCloud
  role: "super_admin" | "org_admin" | "hr_admin" | "hr_manager" | "employee";
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Read a single cookie from the raw Cookie header. Avoids a cookie-parser
 * dependency — auth tokens are now delivered as httpOnly cookies (audit H3), and
 * this is the only place that needs to read them server-side.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Internal service bypass for dashboard widget data fetching. This is a
  // static shared secret that grants org_admin for a client-supplied org, so
  // limit the blast radius if it leaks: it is READ-ONLY (GET requests only) —
  // it can never be used to mutate data (audit H7).
  const internalService = req.headers["x-internal-service"];
  const internalSecret = req.headers["x-internal-secret"];
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET || "";
  if (
    req.method === "GET" &&
    internalService === "empcloud-dashboard" &&
    expectedSecret &&
    internalSecret === expectedSecret
  ) {
    const orgId = Number(req.query.organization_id);
    if (orgId) {
      req.user = {
        empcloudUserId: 0,
        empcloudOrgId: orgId,
        recruitProfileId: null,
        role: "org_admin",
        email: "system@empcloud.internal",
        firstName: "System",
        lastName: "Service",
        orgName: "System",
      };
      return next();
    }
  }

  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  // httpOnly cookie set at login is the primary transport now (audit H3); the
  // Authorization header remains supported for API clients.
  const cookieToken = readCookie(req, "access_token");
  // ?token= is only honoured for the recording media-stream route, where a
  // native <video>/<audio> element can't send a header (audit M2) — everywhere
  // else it would just leak the token into logs/referrers/history.
  const isMediaStreamRequest =
    req.method === "GET" && /\/recordings\/[^/?]+\/file(?:\?|$)/.test(req.originalUrl || "");
  const queryToken = isMediaStreamRequest ? (req.query.token as string | undefined) : undefined;

  const token = queryToken || bearerToken || cookieToken;
  if (!token) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
  }

  // Shared API-key path — an `empc_` token is an opaque key minted in EmpCloud,
  // not a JWT. Validate it against the shared EmpCloud `api_keys` table and
  // build the same AuthPayload an SSO login would, so the role-based
  // authorize() checks downstream work unchanged.
  if (typeof token === "string" && token.startsWith(API_KEY_PREFIX)) {
    void authenticateApiKey(token, req, next);
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload & { type?: string };
    // Reject tokens that aren't access tokens (refresh/portal share the secret).
    // Legacy access tokens carry no `type`, so only an explicit non-access type
    // is rejected — this won't break tokens issued before the type was added.
    if (payload.type && payload.type !== "access") {
      return next(new AppError(401, "INVALID_TOKEN", "Not an access token"));
    }
    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError(401, "TOKEN_EXPIRED", "Access token has expired"));
    }
    return next(new AppError(401, "INVALID_TOKEN", "Invalid access token"));
  }
}

/**
 * Map an EmpCloud role string to an emp-recruit role. Mirrors the SSO login
 * mapping: HR-side admins keep elevated scope, everyone else is an employee.
 */
function mapEmpCloudRole(role: string): AuthPayload["role"] {
  const roleMap: Record<string, AuthPayload["role"]> = {
    super_admin: "super_admin",
    org_admin: "org_admin",
    hr_admin: "hr_admin",
    admin: "hr_admin",
    hr_manager: "hr_manager",
    manager: "employee",
    employee: "employee",
  };
  return roleMap[role?.toLowerCase()] || "employee";
}

/**
 * Validate a shared EmpCloud API key and populate req.user. The key mirrors the
 * owner admin (resolved live from EmpCloud), so deactivating the user or
 * revoking the key kills access immediately. Any failure resolves to a 401 via
 * next() — never throws into the event loop.
 */
async function authenticateApiKey(rawKey: string, req: Request, next: NextFunction): Promise<void> {
  try {
    const key = await findValidApiKey(rawKey);
    if (!key) {
      return next(new AppError(401, "INVALID_API_KEY", "Invalid or expired API key"));
    }

    const ecUser = await findUserById(key.user_id);
    if (!ecUser || ecUser.status !== 1) {
      return next(new AppError(401, "INVALID_API_KEY", "API key owner not found or inactive"));
    }

    const ecOrg = await findOrgById(ecUser.organization_id);

    req.user = {
      empcloudUserId: ecUser.id,
      empcloudOrgId: ecUser.organization_id,
      recruitProfileId: null,
      role: mapEmpCloudRole(ecUser.role),
      email: ecUser.email,
      firstName: ecUser.first_name,
      lastName: ecUser.last_name,
      orgName: ecOrg?.name ?? "",
    };
    next();
  } catch {
    next(new AppError(401, "API_KEY_AUTH_FAILED", "API key validation failed"));
  }
}

export function authorize(...roles: AuthPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Not authenticated"));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        new AppError(403, "FORBIDDEN", "You do not have permission to perform this action"),
      );
    }
    next();
  };
}

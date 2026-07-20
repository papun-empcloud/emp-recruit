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
  const queryToken = req.query.token as string | undefined;

  if (!header?.startsWith("Bearer ") && !queryToken) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
  }

  const token = queryToken || header!.slice(7);

  // Shared API-key path — an `empc_` token is an opaque key minted in EmpCloud,
  // not a JWT. Validate it against the shared EmpCloud `api_keys` table and
  // build the same AuthPayload an SSO login would, so the role-based
  // authorize() checks downstream work unchanged.
  if (typeof token === "string" && token.startsWith(API_KEY_PREFIX)) {
    void authenticateApiKey(token, req, next);
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
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

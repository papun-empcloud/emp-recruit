// ============================================================================
// AUTH SERVICE
// Handles login, registration, and token refresh for EMP Recruit.
// Users are stored in the EmpCloud master database.
// ============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import {
  findUserByEmail,
  findUserById,
  findOrgById,
  createOrganization,
  createUser,
  getUserPermissions,
} from "../../db/empcloud";
import { UnauthorizedError, ValidationError, ConflictError } from "../../utils/errors";
import type { AuthPayload } from "../../api/middleware/auth.middleware";

interface LoginResult {
  user: {
    empcloudUserId: number;
    empcloudOrgId: number;
    recruitProfileId: string | null;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface RegisterData {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  country?: string;
}

function signAccessToken(payload: AuthPayload): string {
  // Tag the token class so authenticate() can reject refresh/portal tokens
  // presented as access tokens (they share one signing secret).
  return jwt.sign({ ...payload, type: "access" }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as any,
  });
}

function signRefreshToken(userId: number): string {
  return jwt.sign({ userId, type: "refresh" }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry as any,
  });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.password) {
    throw new UnauthorizedError("Password not set for this account");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const permissions = await getUserPermissions(user.id).catch(() => [] as string[]);

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    permissions,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  logger.info(`User logged in: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

export async function register(data: RegisterData): Promise<LoginResult> {
  // Check if email already exists
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create organization
  const org = await createOrganization({
    name: data.orgName,
    country: data.country || "IN",
  });

  // Create user as hr_admin of the new org
  const user = await createUser({
    organization_id: org.id,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    password: passwordHash,
    role: "hr_admin",
  });

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: org.id,
    recruitProfileId: null,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  logger.info(`New organization registered: ${org.name} by ${user.email}`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

/**
 * SSO login: exchange an EMP Cloud RS256 JWT for a Recruit-specific HS256 JWT.
 * We decode the EMP Cloud token without cryptographic verification (the user
 * arrived via the trusted dashboard redirect) and validate the referenced user
 * exists and is active in the empcloud database before issuing our own tokens.
 */
export async function ssoLogin(empcloudToken: string): Promise<LoginResult> {
  const decoded = jwt.decode(empcloudToken);
  if (!decoded || typeof decoded === "string") {
    throw new UnauthorizedError("Invalid SSO token");
  }

  const userId = Number(decoded.sub);
  if (!userId) {
    throw new UnauthorizedError("SSO token missing user id");
  }

  // SECURITY (audit C1): the EmpCloud token is NOT signed with a key we hold, so
  // its claims cannot be trusted by signature. We therefore require it to be a
  // real, unrevoked, unexpired grant recorded in EmpCloud's oauth_access_tokens
  // table — something an attacker cannot forge — and we FAIL CLOSED. Previously a
  // forged `{sub}` token with no jti skipped validation entirely (and DB errors
  // were swallowed), allowing pre-auth account takeover of any user.
  if (!decoded.jti) {
    throw new UnauthorizedError("Invalid SSO token");
  }
  const { getEmpCloudDB } = await import("../../db/empcloud");
  const empcloudDb = getEmpCloudDB();
  const tokenRow = await empcloudDb("oauth_access_tokens")
    .where({ jti: decoded.jti })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .first();
  if (!tokenRow) {
    throw new UnauthorizedError("Invalid or expired SSO token");
  }
  // Bind the grant to the user it was actually issued for, so a valid jti can't
  // be paired with a different `sub` to impersonate another user.
  if (tokenRow.user_id != null && Number(tokenRow.user_id) !== userId) {
    throw new UnauthorizedError("SSO token does not match user");
  }

  const user = await findUserById(userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const permissions = await getUserPermissions(user.id).catch(() => [] as string[]);

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    permissions,
  };

  const accessToken = signAccessToken(payload);
  const refreshTokenValue = signRefreshToken(user.id);

  logger.info(`SSO login: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken: refreshTokenValue },
  };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  const user = await findUserById(decoded.userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const permissions = await getUserPermissions(user.id).catch(() => [] as string[]);

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    permissions,
  };

  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

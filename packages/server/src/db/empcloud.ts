// ============================================================================
// EMPCLOUD DATABASE CONNECTION
// Separate Knex connection to the EmpCloud master database.
// Used for authentication, user lookups, and org data.
// ============================================================================

import knex from "knex";
import type { Knex } from "knex";
import crypto from "node:crypto";
import { config } from "../config";
import { logger } from "../utils/logger";

let empcloudDb: Knex | null = null;

/**
 * Initialize the EmpCloud database connection.
 * Call this once at server startup.
 */
export async function initEmpCloudDB(): Promise<Knex> {
  if (empcloudDb) return empcloudDb;

  const { empcloudDb: dbConfig } = config;

  empcloudDb = knex({
    client: "mysql2",
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.name,
    },
    pool: { min: 2, max: 10 },
  });

  // Verify connection
  await empcloudDb.raw("SELECT 1");
  logger.info(`EmpCloud database connected (${dbConfig.host}:${dbConfig.port}/${dbConfig.name})`);

  return empcloudDb;
}

/**
 * Get the EmpCloud Knex instance. Throws if not initialized.
 */
export function getEmpCloudDB(): Knex {
  if (!empcloudDb) {
    throw new Error("EmpCloud database not initialized. Call initEmpCloudDB() first.");
  }
  return empcloudDb;
}

/**
 * Run the EmpCloud schema migration (creates tables if they don't exist).
 */
export async function migrateEmpCloudDB(): Promise<void> {
  const db = getEmpCloudDB();
  const { up } = await import("./empcloud-schema");
  await up(db);
  logger.info("EmpCloud schema migration applied");
}

/**
 * Close the EmpCloud database connection.
 */
export async function closeEmpCloudDB(): Promise<void> {
  if (empcloudDb) {
    await empcloudDb.destroy();
    empcloudDb = null;
  }
}

// ---------------------------------------------------------------------------
// Query helpers for common EmpCloud lookups
// ---------------------------------------------------------------------------

export interface EmpCloudUser {
  id: number;
  organization_id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string | null;
  emp_code: string | null;
  contact_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  date_of_joining: string | null;
  date_of_exit: string | null;
  designation: string | null;
  department_id: number | null;
  location_id: number | null;
  reporting_manager_id: number | null;
  employment_type: string;
  role: string;
  status: number;
  created_at: Date;
  updated_at: Date;
}

export interface EmpCloudOrganization {
  id: number;
  name: string;
  legal_name: string | null;
  email: string | null;
  contact_number: string | null;
  timezone: string | null;
  country: string;
  state: string | null;
  city: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find a user by email (active users only).
 */
export async function findUserByEmail(email: string): Promise<EmpCloudUser | null> {
  const db = getEmpCloudDB();
  const user = await db("users").where({ email, status: 1 }).first();
  return user || null;
}

/**
 * Find a user by ID.
 */
export async function findUserById(id: number): Promise<EmpCloudUser | null> {
  const db = getEmpCloudDB();
  const user = await db("users").where({ id }).first();
  return user || null;
}

/**
 * Resolve a user's custom-role permissions from the EmpCloud RBAC tables
 * (user_roles → roles.permissions). This is how a plain "employee" can carry
 * recruit access: an EmpCloud admin assigns them a custom role whose permission
 * list includes `recruit:*`, without touching their org-wide users.role.
 *
 * Only custom-role permissions are read here (system-role defaults like
 * hr_admin already pass Recruit's role check). Returns the deduped union of
 * permission keys; empty when the user has no custom roles.
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  const db = getEmpCloudDB();
  const rows = await db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .where("ur.user_id", userId)
    .select("r.permissions as permissions");
  const perms = new Set<string>();
  for (const row of rows as Array<{ permissions: unknown }>) {
    if (!row.permissions) continue;
    try {
      const arr =
        typeof row.permissions === "string" ? JSON.parse(row.permissions) : row.permissions;
      if (Array.isArray(arr)) {
        for (const p of arr) if (typeof p === "string") perms.add(p);
      }
    } catch {
      // malformed permissions JSON — skip this role rather than fail auth
    }
  }
  return [...perms];
}

/**
 * Find an organization by ID.
 */
export async function findOrgById(id: number): Promise<EmpCloudOrganization | null> {
  const db = getEmpCloudDB();
  const org = await db("organizations").where({ id }).first();
  return org || null;
}

/**
 * Find all users in an organization (active only).
 */
export async function findUsersByOrgId(
  orgId: number,
  options?: { limit?: number; offset?: number },
): Promise<EmpCloudUser[]> {
  const db = getEmpCloudDB();
  let query = db("users").where({ organization_id: orgId, status: 1 });
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.offset(options.offset);
  return query;
}

/**
 * Count active users in an organization.
 */
export async function countUsersByOrgId(orgId: number): Promise<number> {
  const db = getEmpCloudDB();
  const [{ count }] = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .count("* as count");
  return Number(count);
}

/**
 * Update user password in EmpCloud.
 */
export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const db = getEmpCloudDB();
  await db("users").where({ id: userId }).update({
    password: passwordHash,
    updated_at: new Date(),
  });
}

/**
 * Create a new user in EmpCloud.
 */
export async function createUser(data: {
  organization_id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role?: string;
  emp_code?: string;
  designation?: string;
  department_id?: number;
  date_of_joining?: string;
}): Promise<EmpCloudUser> {
  const db = getEmpCloudDB();
  const [id] = await db("users").insert({
    organization_id: data.organization_id,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    password: data.password,
    role: data.role || "employee",
    emp_code: data.emp_code || null,
    designation: data.designation || null,
    department_id: data.department_id || null,
    date_of_joining: data.date_of_joining || new Date().toISOString().slice(0, 10),
    status: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return findUserById(id) as Promise<EmpCloudUser>;
}

/**
 * Create a new organization in EmpCloud.
 */
export async function createOrganization(data: {
  name: string;
  legal_name?: string;
  email?: string;
  country?: string;
  state?: string;
  timezone?: string;
}): Promise<EmpCloudOrganization> {
  const db = getEmpCloudDB();
  const [id] = await db("organizations").insert({
    name: data.name,
    legal_name: data.legal_name || data.name,
    email: data.email || null,
    country: data.country || "IN",
    state: data.state || null,
    timezone: data.timezone || null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return findOrgById(id) as Promise<EmpCloudOrganization>;
}

// ---------------------------------------------------------------------------
// SHARED API KEYS (cross-module programmatic auth)
//
// API keys are minted in EmpCloud and stored (hashed) in the EmpCloud master
// DB's `api_keys` table. emp-recruit reads that SAME table to validate a key —
// no shared JWT secret, no callback to the EmpCloud server. A key carries no
// permissions of its own: we resolve the OWNER user (and their role) on every
// request, so it mirrors that admin and honours revocation / deactivation.
//
// emp-recruit gates by role (authorize()), so we only need the owner's role
// here; no permission resolution is required. Mirrors EmpCloud's
// services/auth/api-key.service.ts.
// ---------------------------------------------------------------------------

// Opaque key format issued by EmpCloud: `empc_live_...`. The prefix is how auth
// middleware tells an API key apart from a JWT.
export const API_KEY_PREFIX = "empc_";

export interface EmpCloudApiKey {
  id: number;
  organization_id: number;
  user_id: number;
  expires_at: Date | null;
  revoked_at: Date | null;
}

/**
 * Validate a raw API key against the shared EmpCloud `api_keys` table. Returns
 * the row when the key is live (not revoked, not expired) or null otherwise.
 * Best-effort bumps last_used_at. Degrades to null if the table doesn't exist
 * yet (EmpCloud migration 078 not applied) so emp-recruit never 500s on auth.
 */
export async function findValidApiKey(rawKey: string): Promise<EmpCloudApiKey | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;
  const db = getEmpCloudDB();
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  try {
    const row = await db("api_keys").where({ key_hash: keyHash }).whereNull("revoked_at").first();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
    // Usage tracking — never block auth on it.
    db("api_keys")
      .where({ id: row.id })
      .update({ last_used_at: new Date() })
      .catch(() => {});
    return {
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      expires_at: row.expires_at ?? null,
      revoked_at: row.revoked_at ?? null,
    };
  } catch {
    // Table missing / transient DB error — treat as "no valid key".
    return null;
  }
}

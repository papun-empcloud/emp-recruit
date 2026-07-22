// Single source of truth for Recruit roles on the client. Mirrors the server's
// AuthPayload["role"] union in packages/server/src/api/middleware/auth.middleware.ts.
export type Role = "super_admin" | "org_admin" | "hr_admin" | "hr_manager" | "employee";

// Staff roles that can access the recruiting workspace (jobs, candidates,
// interviews, offers, analytics, settings…). Everything an `employee` cannot do.
export const ADMIN_ROLES: Role[] = ["super_admin", "org_admin", "hr_admin", "hr_manager"];

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.includes((role || "employee") as Role);
}

// Permission keys under this prefix grant Recruit workspace access, mirroring
// the server's RECRUIT_PERMISSION_PREFIX. A core "employee" who holds any
// recruit:* permission (via an EmpCloud custom role) can use the workspace.
export const RECRUIT_PERMISSION_PREFIX = "recruit:";

export function hasRecruitPermission(permissions?: string[] | null): boolean {
  return !!permissions?.some((p) => p.startsWith(RECRUIT_PERMISSION_PREFIX));
}

/**
 * Whether a user may access the recruiting workspace: an allowed staff role OR
 * any recruit:* permission. Single source of truth for both the route guard and
 * conditional nav/menu rendering.
 */
export function canAccessRecruit(user?: { role?: string | null; permissions?: string[] | null } | null): boolean {
  return isAdminRole(user?.role) || hasRecruitPermission(user?.permissions);
}

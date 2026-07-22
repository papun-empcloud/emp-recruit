import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { getUser } from "@/lib/auth-store";
import { ADMIN_ROLES, hasRecruitPermission, type Role } from "@/lib/roles";

/**
 * Route guard for staff-only pages. Renders the nested routes only when the
 * signed-in user's role is allowed; otherwise sends them back to the dashboard
 * with a toast. This is the UI mirror of the server's authorize() checks — the
 * API already returns 403, but without this an employee could open an admin
 * page (e.g. /jobs/new) directly by URL and see a form they can't submit.
 */
export function RequireRole({ roles = ADMIN_ROLES }: { roles?: Role[] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const user = getUser();
  const role = (user?.role || "employee") as Role;
  // Allowed by role, OR by a federated recruit:* permission (a core "employee"
  // granted Recruit access via an EmpCloud custom role). Mirrors the server's
  // permission-aware authorize().
  const allowed = roles.includes(role) || hasRecruitPermission(user?.permissions);

  useEffect(() => {
    if (!allowed) {
      toast.error(t("components.requireRole.noAccess"));
    }
  }, [allowed, location.pathname, t]);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

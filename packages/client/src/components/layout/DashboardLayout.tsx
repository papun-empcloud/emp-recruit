import { useState, useEffect } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  FileText,
  UserPlus,
  Gift,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList,
  ClipboardCheck,
  Brain,
  Mic,
  Globe,
  Inbox,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { isLoggedIn, getUser, useAuthStore } from "@/lib/auth-store";
import { cn, getInitials } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isAdminRole, canAccessRecruit } from "@/lib/roles";

interface NavItem {
  to: string;
  labelKey: string;
  icon: any;
  adminOnly?: boolean;
  badge?: "beta" | "new";
}

interface NavGroup {
  titleKey?: string; // section header translation key; omitted for the top group
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: "nav.groups.overview",
    items: [
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/analytics", labelKey: "nav.analytics", icon: BarChart3, adminOnly: true },
    ],
  },
  {
    titleKey: "nav.groups.jobs",
    items: [
      { to: "/jobs", labelKey: "nav.jobPostings", icon: Briefcase, adminOnly: true },
      { to: "/career-page", labelKey: "nav.careerPage", icon: Globe, adminOnly: true },
    ],
  },
  {
    titleKey: "nav.groups.people",
    items: [
      { to: "/candidates", labelKey: "nav.candidates", icon: Users, adminOnly: true },
      { to: "/applications", labelKey: "nav.applications", icon: Inbox, adminOnly: true },
      { to: "/referrals", labelKey: "nav.referrals", icon: Gift },
    ],
  },
  {
    titleKey: "nav.groups.interviews",
    items: [
      { to: "/interviews", labelKey: "nav.interviews", icon: Calendar },
      { to: "/ai-interviews", labelKey: "nav.aiInterviews", icon: Mic, adminOnly: true, badge: "new" },
      { to: "/scoring", labelKey: "nav.aiScoring", icon: Brain, adminOnly: true, badge: "beta" },
    ],
  },
  {
    titleKey: "nav.groups.hiring",
    items: [
      { to: "/offers", labelKey: "nav.offers", icon: FileText, adminOnly: true },
      { to: "/offers/my-approvals", labelKey: "nav.myApprovals", icon: ClipboardCheck, adminOnly: true },
      { to: "/onboarding", labelKey: "nav.onboarding", icon: ClipboardList, adminOnly: true },
    ],
  },
  {
    titleKey: "nav.groups.system",
    items: [
      { to: "/recruitment-operations", labelKey: "nav.operations", icon: Workflow, adminOnly: true },
      { to: "/settings", labelKey: "nav.settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const { t } = useTranslation();

  // Close the mobile drawer on navigation. Must run before any early return so
  // hooks are called unconditionally on every render (rules of hooks).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  const user = getUser();
  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const roleLabel = canAccessRecruit(user) ? t("nav.admin") : t("nav.employee");

  function SidebarContent() {
    return (
      <div className="flex h-full min-h-0 w-[min(18rem,88vw)] flex-col border-r border-gray-200 bg-white lg:w-64">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-gray-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">{t("brand")}</span>
        </div>

        {/* Nav */}
        <nav className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) => !(item.adminOnly && !canAccessRecruit(user)),
            );
            if (items.length === 0) return null;
            return (
              <div key={group.titleKey ?? "top"} className="space-y-1">
                {group.titleKey && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {t(group.titleKey)}
                  </p>
                )}
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "ml-auto inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
                          "bg-violet-100 text-violet-600 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-400/30",
                        )}
                      >
                        {t(`nav.badges.${item.badge}`)}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* User card */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500">{roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              aria-label={t("nav.logout")}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title={t("nav.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex min-h-0 overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:px-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BackToDashboard />
          <div className="flex-1" />
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <div className="hidden min-[400px]:block"><LanguageSwitcher /></div>
            <ThemeToggle />
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 min-[430px]:flex">
              {getInitials(displayName)}
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">{displayName}</span>
          </div>
        </header>

        {/* Page content. The ErrorBoundary is keyed on the path so a crash on one
            page is isolated (sidebar stays usable) and clears when the user
            navigates elsewhere, instead of blanking the whole app. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin p-3 sm:p-5 lg:p-8">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Confirm before signing out — avoids accidental logouts (BUG-017). */}
      <ConfirmDialog
        open={confirmLogout}
        title={t("nav.logoutConfirmTitle")}
        message={t("nav.logoutConfirmMessage")}
        confirmLabel={t("nav.logout")}
        variant="danger"
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}

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
  Brain,
  Mic,
  Globe,
  Inbox,
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
      { to: "/interviews", labelKey: "nav.interviews", icon: Calendar, adminOnly: true },
      { to: "/ai-interviews", labelKey: "nav.aiInterviews", icon: Mic, adminOnly: true },
      { to: "/scoring", labelKey: "nav.aiScoring", icon: Brain, adminOnly: true },
    ],
  },
  {
    titleKey: "nav.groups.hiring",
    items: [
      { to: "/offers", labelKey: "nav.offers", icon: FileText, adminOnly: true },
      { to: "/onboarding", labelKey: "nav.onboarding", icon: ClipboardList, adminOnly: true },
    ],
  },
  {
    titleKey: "nav.groups.system",
    items: [{ to: "/settings", labelKey: "nav.settings", icon: Settings, adminOnly: true }],
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
      <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-gray-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <UserPlus className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">{t("brand")}</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
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
                    <item.icon className="h-5 w-5" />
                    {t(item.labelKey)}
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
              onClick={() => setConfirmLogout(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BackToDashboard />
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
              {getInitials(displayName)}
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">{displayName}</span>
          </div>
        </header>

        {/* Page content. The ErrorBoundary is keyed on the path so a crash on one
            page is isolated (sidebar stays usable) and clears when the user
            navigates elsewhere, instead of blanking the whole app. */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-8">
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

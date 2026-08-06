import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Routes, Route, Navigate, useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isLoggedIn, useAuthStore, extractSSOToken } from "@/lib/auth-store";
import { apiPost } from "@/api/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Layouts (eagerly loaded)
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { RequireRole } from "@/components/RequireRole";
import { ADMIN_ROLES } from "@/lib/roles";

// Route config imports
import { jobRoutes } from "./routes/jobs.routes";
import { candidateRoutes } from "./routes/candidates.routes";
import { adminInterviewRoutes, panelistInterviewRoutes } from "./routes/interviews.routes";
import { offerRoutes } from "./routes/offers.routes";
import { onboardingRoutes } from "./routes/onboarding.routes";
import { portalRoutes } from "./routes/portal.routes";
import { careerRoutes } from "./routes/careers.routes";

// Lazy-loaded pages (kept in App for single-route modules)
const LoginPage = lazyWithRetry(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazyWithRetry(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ReferralListPage = lazyWithRetry(() =>
  import("@/pages/referrals/ReferralListPage").then((m) => ({ default: m.ReferralListPage })),
);
const AnalyticsPage = lazyWithRetry(() =>
  import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const SettingsPage = lazyWithRetry(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const AiInterviewsListPage = lazyWithRetry(() =>
  import("@/pages/ai-interview/AiInterviewsListPage").then((m) => ({ default: m.AiInterviewsListPage })),
);
const AiInterviewDetailPage = lazyWithRetry(() =>
  import("@/pages/ai-interview/AiInterviewDetailPage").then((m) => ({ default: m.AiInterviewDetailPage })),
);
const AiInterviewPage = lazyWithRetry(() =>
  import("@/pages/ai-interview/AiInterviewPage").then((m) => ({ default: m.AiInterviewPage })),
);
const ScoreReportPage = lazyWithRetry(() =>
  import("@/pages/scoring/ScoreReportPage").then((m) => ({ default: m.ScoreReportPage })),
);
const ScoringPage = lazyWithRetry(() =>
  import("@/pages/scoring/ScoringPage").then((m) => ({ default: m.ScoringPage })),
);
const CareerPage = lazyWithRetry(() =>
  import("@/pages/career/CareerPage").then((m) => ({ default: m.CareerPage })),
);
const ApplicationsListPage = lazyWithRetry(() =>
  import("@/pages/applications/ApplicationsListPage").then((m) => ({ default: m.ApplicationsListPage })),
);
const ApplicationDetailPage = lazyWithRetry(() =>
  import("@/pages/applications/ApplicationDetailPage").then((m) => ({ default: m.ApplicationDetailPage })),
);
const RecruitmentOperationsPage = lazyWithRetry(() =>
  import("@/pages/operations/RecruitmentOperationsPage").then((m) => ({ default: m.RecruitmentOperationsPage })),
);
function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

function AuthRedirect() {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">{t("notFound.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {t("notFound.subtitle")}
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}

function SSOGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const [ssoToken] = useState(() => extractSSOToken());
  const [ready, setReady] = useState(!ssoToken); // ready immediately if no SSO token
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiPost<{
          user: any;
          tokens: { accessToken: string; refreshToken: string };
        }>("/auth/sso", { token: ssoToken });

        if (cancelled) return;

        const { user, tokens } = res.data!;
        login(user, tokens);

        // Redirect to dashboard after SSO login
        if (window.location.pathname === "/" || window.location.pathname === "/login") {
          window.location.replace("/dashboard");
          return; // Page is redirecting, don't setReady
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("SSO exchange failed:", err);
        setError(t("auth.ssoFailed"));
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [ssoToken, login, t]);

  if (!ready) return <PageLoader />;
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-brand-600 underline">{t("auth.goToLogin")}</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <SSOGate>
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Root redirect */}
        <Route path="/" element={<AuthRedirect />} />

        {/* Protected routes inside DashboardLayout */}
        <Route element={<DashboardLayout />}>
          {/* Available to every signed-in user, including employees */}
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Referrals */}
          <Route path="/referrals" element={<ReferralListPage />} />
          {panelistInterviewRoutes}

          {/* Staff-only workspace — employees are redirected to /dashboard.
              Mirrors the server's authorize() role checks so admin pages can't
              be reached by URL. */}
          <Route element={<RequireRole roles={ADMIN_ROLES} />}>
            {jobRoutes}
            {candidateRoutes}
            {adminInterviewRoutes}
            {offerRoutes}
            {onboardingRoutes}

            {/* Scoring / AI Resume */}
            <Route path="/scoring" element={<ScoringPage />} />
            <Route path="/scoring/:appId" element={<ScoreReportPage />} />

            {/* AI voice interviews */}
            <Route path="/ai-interviews" element={<AiInterviewsListPage />} />
            <Route path="/ai-interviews/:id" element={<AiInterviewDetailPage />} />

            {/* Public career page management */}
            <Route path="/career-page" element={<CareerPage />} />

            {/* All applications */}
            <Route path="/applications" element={<ApplicationsListPage />} />
            <Route path="/applications/:id" element={<ApplicationDetailPage />} />

            {/* Analytics */}
            <Route path="/analytics" element={<AnalyticsPage />} />

            {/* Settings */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/recruitment-operations" element={<RecruitmentOperationsPage />} />
          </Route>

          {/* Unknown routes for a signed-in user render a styled 404 inside the
              app shell (sidebar + header) instead of a bare page. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Candidate Portal (no employee auth — uses portal tokens) */}
        <Route path="/portal" element={<PortalLayout />}>
          {portalRoutes}
        </Route>

        {/* Public career pages (no auth) */}
        <Route path="/careers/:slug" element={<PublicLayout />}>
          {careerRoutes}
        </Route>

        {/* Candidate AI interview (no auth — token link) */}
        <Route path="/ai-interview/:token" element={<AiInterviewPage />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
    </SSOGate>
  );
}

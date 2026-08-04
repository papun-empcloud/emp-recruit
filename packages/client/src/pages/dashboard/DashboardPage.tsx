import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Archive,
  Users,
  FileText,
  TrendingUp,
  ChevronRight,
  Calendar,
  ArrowUpRight,
  Gift,
  CheckCircle2,
  Clock,
  Award,
  XCircle,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import { canAccessRecruit } from "@/lib/roles";
import type { PaginatedResponse } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { usePipelineStages, stageColor } from "@/lib/pipeline-stages";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, type StatAccent } from "@/components/dashboard/StatCard";
import { PipelineFunnel, type FunnelStageDatum } from "@/components/dashboard/PipelineFunnel";
import { AiInsights } from "@/components/dashboard/AiInsights";

interface ConversionFunnelResponse {
  stages: FunnelStageDatum[];
  overallConversionRate: number;
}

// Shape of GET /analytics/stat-cards — a current total plus its week-over-week
// change, derived from daily inflow (items added per day). "Open jobs as of day
// X" can't be replayed, since nothing records when a job stopped being open, so
// all four metrics use inflow.
interface StatMetric {
  total: number;
  today: number;
  deltaPct: number | null;
}
interface StatCardsResponse {
  openJobs: StatMetric;
  totalCandidates: StatMetric;
  totalApplications: StatMetric;
  totalJobs: StatMetric;
}

interface DashboardInterview {
  id: string;
  scheduled_at: string;
}

// Staff who get the recruiting overview: an admin role OR a user granted recruit
// access via an EmpCloud custom role (recruit:* permission). A plain `employee`
// with neither cannot hit the admin APIs (jobs/candidates/applications all 403),
// so they get a referral-focused dashboard instead of admin tiles that read 0.

export function DashboardPage() {
  return canAccessRecruit(getUser()) ? <AdminDashboard /> : <EmployeeDashboard />;
}

// ---------------------------------------------------------------------------
// Admin / HR dashboard — recruiting overview
// ---------------------------------------------------------------------------
function AdminDashboard() {
  const { t } = useTranslation();

  // Pipeline stages (colors) — shared source of truth with Settings and the
  // Job pipeline board so stage colors stay consistent app-wide (BUG-018).
  const pipelineStages = usePipelineStages();

  // KPI row — one request for all four tiles' totals, daily inflow and deltas.
  // This replaces the four separate perPage=1 count queries the tiles used to
  // make; those could only ever produce a bare number, because the totals they
  // read carry no history to draw a trend from.
  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stat-cards"],
    queryFn: () => apiGet<StatCardsResponse>("/analytics/stat-cards"),
  });
  const stats = statsRes?.data;

  const { data: closedJobsData, isLoading: closedJobsLoading } = useQuery({
    queryKey: ["dashboard-closed-jobs"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/jobs", { status: "closed", perPage: 1 }),
  });

  // Fetch recent applications
  const { data: appsData } = useQuery({
    queryKey: ["dashboard-applications"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { perPage: 10, sort: "applied_at", order: "desc" }),
  });
  const { data: screeningData } = useQuery({
    queryKey: ["dashboard-action-screening"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "applied", perPage: 1 }),
  });
  const { data: rejectedData } = useQuery({
    queryKey: ["dashboard-pipeline-rejected"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "rejected", perPage: 1 }),
  });

  const { data: pendingOffersData } = useQuery({
    queryKey: ["dashboard-action-offers"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/offers", { status: "pending_approval", limit: 1 }),
  });

  const { data: interviewsData } = useQuery({
    queryKey: ["dashboard-upcoming-interviews"],
    queryFn: () => apiGet<PaginatedResponse<DashboardInterview>>("/interviews", {
      status: "scheduled", limit: 100, sort_field: "scheduled_at", sort_order: "asc",
    }),
  });

  // Conversion funnel — cumulative reach per stage. Replaces the six
  // per-stage perPage=1 count queries the old bar list fired: those returned
  // current OCCUPANCY, which is not funnel data (it isn't monotonic, so the
  // bands would widen and narrow at random and the percentages would be
  // meaningless). One request now instead of six.
  const { data: funnelRes, isLoading: funnelLoading } = useQuery({
    queryKey: ["dashboard-conversion-funnel"],
    queryFn: () => apiGet<ConversionFunnelResponse>("/analytics/conversion-funnel"),
  });
  const funnel = funnelRes?.data;

  const recentApps = appsData?.data?.data ?? [];
  const pipelineDisplayStages: FunnelStageDatum[] = funnel
    ? [
        ...funnel.stages.filter((stage) => stage.stage !== "rejected"),
        {
          stage: "rejected",
          reached: rejectedData?.data?.total ?? 0,
          pctOfTop: 0,
          pctFromPrev: 0,
        },
      ]
    : [];
  const scheduledInterviews = interviewsData?.data?.data ?? [];
  const today = new Date();
  const interviewsToday = scheduledInterviews.filter((interview) => {
    const scheduled = new Date(interview.scheduled_at);
    return scheduled.getFullYear() === today.getFullYear()
      && scheduled.getMonth() === today.getMonth()
      && scheduled.getDate() === today.getDate();
  }).length;
  const actionItems = [
    {
      label: t("dashboard.actionCenter.awaitingScreening", { count: screeningData?.data?.total ?? 0 }),
      description: t("dashboard.actionCenter.screeningDescription"),
      icon: Users,
      to: "/applications",
      tone: "border-amber-200 bg-amber-50/70",
      iconTone: "bg-amber-500",
    },
    {
      label: t("dashboard.actionCenter.interviewsToday", { count: interviewsToday }),
      description: t("dashboard.actionCenter.interviewsDescription"),
      icon: Calendar,
      to: "/interviews",
      tone: "border-blue-200 bg-blue-50/70",
      iconTone: "bg-blue-500",
    },
    {
      label: t("dashboard.actionCenter.offersNeedApproval", { count: pendingOffersData?.data?.total ?? 0 }),
      description: t("dashboard.actionCenter.offersDescription"),
      icon: FileText,
      to: "/offers",
      tone: "border-red-200 bg-red-50/70",
      iconTone: "bg-red-500",
    },
  ];

  // Accents are assigned per tile and never cycled — see StatCard for the
  // validator results behind these four.
  const statCards: Array<{
    label: string;
    metric?: StatMetric;
    icon: typeof Briefcase;
    accent: StatAccent;
    link: string;
  }> = [
    {
      label: t("dashboard.stats.openJobs"),
      metric: stats?.openJobs,
      icon: Briefcase,
      accent: "indigo",
      link: "/jobs?status=open",
    },
    {
      label: t("dashboard.stats.totalCandidates"),
      metric: stats?.totalCandidates,
      icon: Users,
      accent: "magenta",
      link: "/candidates",
    },
    {
      label: t("dashboard.stats.totalApplications"),
      metric: stats?.totalApplications,
      icon: FileText,
      accent: "aqua",
      link: "/applications",
    },
    {
      label: t("dashboard.stats.totalJobs"),
      metric: stats?.totalJobs,
      icon: TrendingUp,
      accent: "orange",
      link: "/jobs",
    },
    {
      label: t("dashboard.stats.closedJobs"),
      metric: { total: closedJobsData?.data?.total ?? 0, today: 0, deltaPct: null },
      icon: Archive,
      accent: "slate",
      link: "/jobs?status=closed",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header. Same layout and same primary-button treatment as the Job
          Postings header, and it reuses that page's `jobs.list.createJob` label
          so the two can never drift apart or be translated differently. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          to="/jobs/new"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("jobs.list.createJob")}
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.metric?.total ?? 0}
            icon={stat.icon}
            accent={stat.accent}
            to={stat.link}
            deltaPct={stat.metric?.deltaPct}
            isLoading={statsLoading || (stat.accent === "slate" && closedJobsLoading)}
          />
        ))}
      </div>

      {/* Peer cards. `items-start` stops the grid stretching every card to
          the tallest one — the insight card is naturally short, and stretched it
          would be mostly empty space below its button. */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        {/* Hiring funnel — cumulative reach per stage */}
        <Card className="h-full lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-5">
            <CardTitle>{t("dashboard.pipelineDistribution")}</CardTitle>
            <Badge variant="secondary">
              {t("dashboard.totalCount", { count: funnel?.stages?.[0]?.reached ?? 0 })}
            </Badge>
          </CardHeader>
          <CardContent>
            {funnelLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : funnel && pipelineDisplayStages.some((s) => s.reached > 0) ? (
              <PipelineFunnel
                stages={pipelineDisplayStages}
                overallConversionRate={funnel.overallConversionRate}
              />
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">
                {t("dashboard.noApplications")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Applications */}
        <Card className="flex h-full flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>{t("dashboard.recentApplications")}</CardTitle>
            <Link
              to="/applications"
              className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              {t("dashboard.viewAll")} <ChevronRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="flex-1">
          {recentApps.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("dashboard.noApplications")}</p>
          ) : (
            // Ten rows fetched, five in view: the container is capped at five
            // row-heights (66px row + 12px gap) and scrolls for the rest.
            // pr-1 keeps the scrollbar off the row borders; -mr-1 gives that
            // padding back so the rows stay flush with the card.
            <div
              className="-mr-1 space-y-3 overflow-y-auto pr-1"
              style={{ maxHeight: 5 * 60 + 4 * 12 }}
              tabIndex={0}
              role="group"
              aria-label={t("dashboard.recentApplications")}
            >
              {/* #28 — each row now links to the candidate's detail page.
                  Falls back to the job detail if candidate_id is somehow
                  missing on legacy rows. */}
              {recentApps.map((app: any) => (
                <Link
                  key={app.id}
                  to={app.candidate_id ? `/candidates/${app.candidate_id}` : `/jobs/${app.job_id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 transition-colors hover:border-brand-200 hover:bg-gray-50"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {`${app.candidate_first_name?.[0] ?? ""}${app.candidate_last_name?.[0] ?? ""}`.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {app.candidate_first_name} {app.candidate_last_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">{app.job_title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                      style={{
                        backgroundColor: stageColor(app.stage, pipelineStages) + "22",
                        color: stageColor(app.stage, pipelineStages),
                      }}
                    >
                      {t(`dashboard.stages.${app.stage}`)}
                    </span>
                    <span className="text-xs text-gray-400 inline-flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {formatDate(app.applied_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="pb-4">
            <CardTitle>{t("dashboard.actionCenter.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {actionItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn("group flex flex-1 items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm", item.tone)}
              >
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm", item.iconTone)}>
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{item.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
            <Link to="/applications" className="mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50">
              {t("dashboard.actionCenter.viewAll")} <ChevronRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
        {/* Insights. Renders nothing at all when the org has no findings worth
            stating, so it never occupies a column to say "no insights". */}
        <div className="h-full [&>*]:h-full">
          <AiInsights />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee dashboard — referral-focused, no admin APIs
// ---------------------------------------------------------------------------
interface ReferralRow {
  id: string;
  status: string;
  candidate_name: string;
  job_title: string;
  created_at: string;
  bonus_amount: number | null;
}

const REF_STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  bonus_eligible: "bg-purple-100 text-purple-700",
  bonus_paid: "bg-emerald-100 text-emerald-700",
};

interface PendingApprovalOffer {
  id: string;
  candidate_name: string;
  job_title_display: string;
  salary_amount: string | number | null;
  salary_currency: string | null;
  created_at: string;
}

function EmployeeDashboard() {
  const { t } = useTranslation();
  const user = getUser();
  const firstName = user?.firstName || t("dashboard.defaultName");

  const queryClient = useQueryClient();

  const { data: refData, isLoading } = useQuery({
    queryKey: ["my-referrals"],
    queryFn: async () => {
      const res = await apiGet<any>("/referrals");
      return res.data;
    },
  });

  // Offers waiting on MY approval (BUG-012). Self-scoped endpoint — regular
  // employees only ever see offers where they hold a pending approver row.
  const { data: approvalsRes } = useQuery({
    queryKey: ["my-offer-approvals"],
    queryFn: () => apiGet<PendingApprovalOffer[]>("/offers/my-approvals"),
  });
  const pendingApprovals = approvalsRes?.data ?? [];

  const actOnOffer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiPost(`/offers/${id}/${action}`, {}),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.action === "approve" ? t("dashboard.approvals.toastApproved") : t("dashboard.approvals.toastRejected"),
      );
      queryClient.invalidateQueries({ queryKey: ["my-offer-approvals"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t("dashboard.approvals.toastActionFailed")),
  });

  const referrals: ReferralRow[] = refData?.data ?? [];
  const total = referrals.length;
  const inReview = referrals.filter((r) => ["submitted", "under_review"].includes(r.status)).length;
  const hired = referrals.filter((r) => r.status === "hired").length;
  const rewarded = referrals.filter((r) => ["bonus_eligible", "bonus_paid"].includes(r.status)).length;

  // Each card deep-links to the referral list pre-filtered to the SAME statuses
  // its number counts — In Review and Bonus each span two statuses, so filtering
  // on just one showed a list that didn't match the count (BUG-010).
  // No trend data exists for a single employee's referrals, so these tiles get
  // the same card treatment with the sparkline omitted rather than an invented one.
  const stats: Array<{ label: string; value: number; icon: typeof Gift; accent: StatAccent; link: string }> = [
    { label: t("dashboard.stats.myReferrals"), value: total, icon: Gift, accent: "indigo", link: "/referrals" },
    { label: t("dashboard.stats.inReview"), value: inReview, icon: Clock, accent: "orange", link: "/referrals?status=submitted,under_review" },
    { label: t("dashboard.stats.hired"), value: hired, icon: CheckCircle2, accent: "aqua", link: "/referrals?status=hired" },
    { label: t("dashboard.stats.bonus"), value: rewarded, icon: Award, accent: "magenta", link: "/referrals?status=bonus_eligible,bonus_paid" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.welcome", { name: firstName })}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("dashboard.employeeSubtitle")}
        </p>
      </div>

      {/* Referral stat cards — clickable, deep-link to the filtered list */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            accent={stat.accent}
            to={stat.link}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Offers awaiting my approval (BUG-012) — only rendered when the
          current user has pending approver rows. */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("dashboard.approvals.title")}
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {pendingApprovals.length}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {pendingApprovals.map((offer) => (
              <div
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{offer.candidate_name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {offer.job_title_display}
                    {offer.salary_amount
                      ? ` · ${offer.salary_currency || ""} ${Number(offer.salary_amount).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => actOnOffer.mutate({ id: offer.id, action: "approve" })}
                    disabled={actOnOffer.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("dashboard.approvals.approve")}
                  </button>
                  <button
                    onClick={() => actOnOffer.mutate({ id: offer.id, action: "reject" })}
                    disabled={actOnOffer.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("dashboard.approvals.reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/referrals"
          className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{t("dashboard.referSomeone")}</p>
              <p className="text-xs text-gray-500">{t("dashboard.recommendCandidate")}</p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand-500" />
        </Link>
      </div>

      {/* My recent referrals */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.myReferralsTitle")}</h2>
          <Link
            to="/referrals"
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            {t("dashboard.viewAll")} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-400">{t("dashboard.loading")}</p>
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Gift className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              {t("dashboard.noReferralsYet")}{" "}
              <Link to="/referrals" className="font-medium text-brand-600 hover:text-brand-700">
                {t("dashboard.referSomeoneLink")}
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.slice(0, 5).map((ref) => (
              <div
                key={ref.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{ref.candidate_name}</p>
                  <p className="truncate text-xs text-gray-500">{ref.job_title}</p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      REF_STATUS_BADGE[ref.status] ?? "bg-gray-100 text-gray-700",
                    )}
                  >
                    {t(`dashboard.referralStatus.${ref.status}`)}
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(ref.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

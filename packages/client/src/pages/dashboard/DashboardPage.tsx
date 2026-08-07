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
import { cn, formatDate, formatTime } from "@/lib/utils";
import { usePipelineStages, stageColor } from "@/lib/pipeline-stages";
import { enumLabel } from "@/lib/enums";
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
  title?: string;
  candidate_name?: string;
  status?: string;
  panelist_count?: number;
  panelist_names?: string[];
  round?: number;
}
interface RecruiterMetric { user_id: number; user_name?: string | null; function: string; applications: number; hires: number; conversion_rate: number; sla_breaches: number; }
interface SourceMetric { source: string; total: number; hired: number; hireRate: number; }

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
  const { data: appsData, isLoading: appsLoading } = useQuery({
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
  const { data: hiredData } = useQuery({
    queryKey: ["dashboard-pipeline-hired"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "hired", perPage: 1 }),
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
  const { data: recruiterMetricsRes } = useQuery({
    queryKey: ["dashboard-recruiter-performance"],
    queryFn: () => apiGet<RecruiterMetric[]>("/recruitment-ops/recruiter-performance"),
  });
  const recruiterMetrics = recruiterMetricsRes?.data ?? [];
  const { data: sourceMetricsRes } = useQuery({
    queryKey: ["dashboard-source-effectiveness"],
    queryFn: () => apiGet<SourceMetric[]>("/analytics/sources"),
  });
  const sourceMetrics = sourceMetricsRes?.data ?? [];

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
        ...funnel.stages.filter((stage) => stage.stage !== "rejected").map((stage) =>
          stage.stage === "hired" ? { ...stage, reached: hiredData?.data?.total ?? 0 } : stage,
        ),
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
    <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6">
      {/* Header. Same layout and same primary-button treatment as the Job
          Postings header, and it reuses that page's `jobs.list.createJob` label
          so the two can never drift apart or be translated differently. */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#111a35] via-[#18244a] to-brand-900 px-5 py-7 text-white shadow-xl sm:px-7 sm:py-8 lg:px-9">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-200">Recruitment overview</p>
          <h1 className="text-pretty text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{t("dashboard.title")}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          to="/jobs/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-800 shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-md sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("jobs.list.createJob")}
        </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
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
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
        {/* Hiring funnel — cumulative reach per stage */}
        <Card className="h-full overflow-hidden rounded-2xl xl:col-span-3">
          <CardHeader className="flex-col items-start gap-3 space-y-0 border-b border-gray-100 pb-5 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <CardTitle>{t("dashboard.pipelineDistribution")}</CardTitle>
            <Badge variant="secondary">
              {t("dashboard.totalCount", { count: funnel?.stages?.[0]?.reached ?? 0 })}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
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
        <Card className="flex h-full flex-col rounded-2xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
            <CardTitle>{t("dashboard.recentApplications")}</CardTitle>
            <Link
              to="/applications"
              className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              {t("dashboard.viewAll")} <ChevronRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="flex-1">
          {appsLoading ? (
            <div className="space-y-3" aria-label={t("dashboard.loading")}>
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : recentApps.length === 0 ? (
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
                  className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:border-brand-200 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
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
                  <div className="flex w-full items-center justify-between gap-3 sm:ml-4 sm:w-auto sm:justify-end">
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

        <Card className="flex h-full flex-col rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle>{t("dashboard.actionCenter.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {actionItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn("group flex flex-1 items-center gap-3 rounded-xl border p-3 transition-[transform,box-shadow,border-color,background-color] hover:-translate-y-0.5 hover:shadow-sm", item.tone)}
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

      {recruiterMetrics.length > 0 && <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="flex-col items-start gap-3 border-b border-gray-100 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between"><CardTitle>Recruiter &amp; Sourcing Performance</CardTitle><Link className="text-sm font-semibold text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" to="/recruitment-operations">Manage Operations</Link></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>{["User", "Team", "Applicants", "Hires", "Conversion", "SLA breaches"].map((heading) => <th key={heading} className="px-5 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{recruiterMetrics.slice(0, 8).map((metric) => <tr className="transition-colors hover:bg-gray-50" key={metric.user_id}><td className="px-5 py-4 font-semibold">{metric.user_name || metric.user_id}</td><td className="px-5 py-4">{metric.function}</td><td className="px-5 py-4 tabular-nums">{metric.applications}</td><td className="px-5 py-4 tabular-nums">{metric.hires}</td><td className="px-5 py-4 font-semibold tabular-nums">{metric.conversion_rate}%</td><td className="px-5 py-4 tabular-nums">{metric.sla_breaches}</td></tr>)}</tbody></table></div></CardContent>
      </Card>}

      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="flex-row items-center justify-between border-b border-gray-100"><CardTitle>Applicant Source Performance</CardTitle><Link className="text-sm font-semibold text-brand-600 hover:text-brand-700" to="/analytics">Full analytics</Link></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>{["Source", "Applicants", "Hires", "Hire rate"].map((heading) => <th key={heading} className="px-5 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{sourceMetrics.length ? sourceMetrics.map((metric) => <tr key={metric.source}><td className="px-5 py-4 font-semibold">{metric.source === "linkedin" ? "LinkedIn" : metric.source.charAt(0).toUpperCase() + metric.source.slice(1)}</td><td className="px-5 py-4 tabular-nums">{metric.total}</td><td className="px-5 py-4 tabular-nums">{metric.hired}</td><td className="px-5 py-4 font-semibold tabular-nums">{metric.hireRate}%</td></tr>) : <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">No applicant source data is available yet.</td></tr>}</tbody></table></div></CardContent>
      </Card>
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
  const { data: assignedInterviewsRes } = useQuery({
    queryKey: ["my-panelist-interviews"],
    queryFn: () => apiGet<PaginatedResponse<DashboardInterview>>("/interviews", { limit: 10, sort_field: "scheduled_at", sort_order: "asc" }),
  });
  const assignedInterviews = assignedInterviewsRes?.data?.data ?? [];

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
    <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#111a35] via-[#18244a] to-brand-900 px-5 py-7 text-white shadow-xl sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-2xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-200">{t("dashboard.welcome", { name: firstName })}</p>
        <h1 className="text-pretty text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{t("dashboard.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
          {t("dashboard.employeeSubtitle")}
        </p>
        </div>
      </div>

      {/* Referral stat cards — clickable, deep-link to the filtered list */}
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
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
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-6">
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
                className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center"
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
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
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
          className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md sm:p-5"
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
      {assignedInterviews.length > 0 && <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900">My assigned interviews</h2><Link to="/interviews" className="text-sm text-brand-600">View all</Link></div>
        <div className="space-y-3">{assignedInterviews.map((interview) => <Link key={interview.id} to={`/interviews/${interview.id}`} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 hover:border-brand-300 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{interview.title || "Interview"}</p><p className="truncate text-xs text-gray-500">{interview.candidate_name || "Candidate"}</p><p className="truncate text-xs text-gray-500">Panelists ({interview.panelist_count || 0}): {interview.panelist_names?.join(", ") || "None assigned"}</p><p className="text-xs text-gray-500">Round {interview.round || 1} · {interview.status ? enumLabel(t, "interviewStatus", interview.status) : "Scheduled"}</p></div><span className="shrink-0 text-xs font-medium text-brand-600">View details · {formatDate(interview.scheduled_at)} at {formatTime(interview.scheduled_at)}</span></Link>)}</div>
      </div>}

      {/* My recent referrals */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
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
                className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{ref.candidate_name}</p>
                  <p className="truncate text-xs text-gray-500">{ref.job_title}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:ml-4 sm:justify-end">
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

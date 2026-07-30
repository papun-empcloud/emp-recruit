import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Briefcase,
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
} from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import { canAccessRecruit } from "@/lib/roles";
import type { JobPosting, Candidate, PaginatedResponse } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { usePipelineStages, stageColor } from "@/lib/pipeline-stages";

// Staff who get the recruiting overview: an admin role OR a user granted recruit
// access via an EmpCloud custom role (recruit:* permission). A plain `employee`
// with neither cannot hit the admin APIs (jobs/candidates/applications all 403),
// so they get a referral-focused dashboard instead of admin tiles that read 0.

// Stages shown in the pipeline distribution, in order. Their colors come from
// the shared pipeline-stages source (Settings) so the Dashboard, Job board and
// Settings never disagree on a stage's color (BUG-018).
const STAGE_ORDER = ["applied", "screened", "interview", "offer", "hired", "rejected"] as const;

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

  // Fetch open jobs count
  const { data: jobsData } = useQuery({
    queryKey: ["dashboard-jobs"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { status: "open", perPage: 1 }),
  });

  // Fetch all jobs for total count
  const { data: allJobsData } = useQuery({
    queryKey: ["dashboard-all-jobs"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 1 }),
  });

  // Fetch candidates count
  const { data: candidatesData } = useQuery({
    queryKey: ["dashboard-candidates"],
    queryFn: () => apiGet<PaginatedResponse<Candidate>>("/candidates", { perPage: 1 }),
  });

  // Fetch recent applications
  const { data: appsData } = useQuery({
    queryKey: ["dashboard-applications"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { perPage: 10, sort: "applied_at", order: "desc" }),
  });

  // Fetch application stage distribution via multiple stage queries
  const { data: appliedData } = useQuery({
    queryKey: ["dashboard-stage-applied"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "applied", perPage: 1 }),
  });
  const { data: screenedData } = useQuery({
    queryKey: ["dashboard-stage-screened"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "screened", perPage: 1 }),
  });
  const { data: interviewData } = useQuery({
    queryKey: ["dashboard-stage-interview"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "interview", perPage: 1 }),
  });
  const { data: offerData } = useQuery({
    queryKey: ["dashboard-stage-offer"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "offer", perPage: 1 }),
  });
  const { data: hiredData } = useQuery({
    queryKey: ["dashboard-stage-hired"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "hired", perPage: 1 }),
  });
  const { data: rejectedData } = useQuery({
    queryKey: ["dashboard-stage-rejected"],
    queryFn: () => apiGet<PaginatedResponse<any>>("/applications", { stage: "rejected", perPage: 1 }),
  });

  const openJobsCount = jobsData?.data?.total ?? 0;
  const totalJobs = allJobsData?.data?.total ?? 0;
  const totalCandidates = candidatesData?.data?.total ?? 0;
  const totalApplications = appsData?.data?.total ?? 0;
  const recentApps = appsData?.data?.data ?? [];

  const stageDistribution: Record<string, number> = {
    applied: appliedData?.data?.total ?? 0,
    screened: screenedData?.data?.total ?? 0,
    interview: interviewData?.data?.total ?? 0,
    offer: offerData?.data?.total ?? 0,
    hired: hiredData?.data?.total ?? 0,
    rejected: rejectedData?.data?.total ?? 0,
  };

  const maxStageCount = Math.max(...Object.values(stageDistribution), 1);

  const statCards = [
    {
      label: t("dashboard.stats.openJobs"),
      value: openJobsCount,
      icon: Briefcase,
      color: "bg-brand-50 text-brand-600",
      link: "/jobs?status=open",
    },
    {
      label: t("dashboard.stats.totalCandidates"),
      value: totalCandidates,
      icon: Users,
      color: "bg-purple-50 text-purple-600",
      link: "/candidates",
    },
    {
      label: t("dashboard.stats.totalApplications"),
      value: totalApplications,
      icon: FileText,
      color: "bg-blue-50 text-blue-600",
      link: "/applications",
    },
    {
      label: t("dashboard.stats.totalJobs"),
      value: totalJobs,
      icon: TrendingUp,
      color: "bg-green-50 text-green-600",
      link: "/jobs",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("dashboard.subtitle")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            to={stat.link}
            className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className={cn("rounded-xl p-3", stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand-500" />
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{stat.value}</p>
            <p className="mt-0.5 text-sm font-medium text-gray-500">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline Stage Distribution */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.pipelineDistribution")}</h2>
            <span className="text-xs font-medium text-gray-400">
              {t("dashboard.totalCount", {
                count: Object.values(stageDistribution).reduce((a, b) => a + b, 0),
              })}
            </span>
          </div>
          <div className="space-y-4">
            {STAGE_ORDER.map((key) => {
              const count = stageDistribution[key] ?? 0;
              const percentage = maxStageCount > 0 ? (count / maxStageCount) * 100 : 0;
              const color = stageColor(key, pipelineStages);
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{t(`dashboard.stages.${key}`)}</span>
                    <span className="font-semibold text-gray-900">{count}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${count > 0 ? Math.max(percentage, 3) : 0}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.recentApplications")}</h2>
            <Link
              to="/applications"
              className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              {t("dashboard.viewAll")} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {recentApps.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("dashboard.noApplications")}</p>
          ) : (
            <div className="space-y-3">
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
  const stats = [
    { label: t("dashboard.stats.myReferrals"), value: total, icon: Gift, color: "bg-brand-50 text-brand-600", link: "/referrals" },
    { label: t("dashboard.stats.inReview"), value: inReview, icon: Clock, color: "bg-yellow-50 text-yellow-600", link: "/referrals?status=submitted,under_review" },
    { label: t("dashboard.stats.hired"), value: hired, icon: CheckCircle2, color: "bg-green-50 text-green-600", link: "/referrals?status=hired" },
    { label: t("dashboard.stats.bonus"), value: rewarded, icon: Award, color: "bg-purple-50 text-purple-600", link: "/referrals?status=bonus_eligible,bonus_paid" },
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
          <Link
            key={stat.label}
            to={stat.link}
            className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className={cn("inline-flex rounded-xl p-3", stat.color)}>
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{stat.value}</p>
            <p className="mt-0.5 text-sm font-medium text-gray-500">{stat.label}</p>
          </Link>
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  Plus,
  Calendar,
  User,
  Search,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import type { OnboardingStatus, OnboardingTemplate, PaginatedResponse } from "@emp-recruit/shared";

interface EligibleApplication {
  id: string;
  stage: string;
  candidate_name: string;
  job_title: string;
}

interface EnrichedChecklist {
  id: string;
  organization_id: number;
  application_id: string;
  candidate_id: string;
  template_id: string;
  status: OnboardingStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_name: string;
  job_title: string;
  joining_date: string | null;
  progress: { total: number; completed: number; percentage: number };
}

const STATUS_TABS: { labelKey: string; value: string }[] = [
  { labelKey: "onboarding.status.all", value: "all" },
  { labelKey: "onboarding.status.notStarted", value: "not_started" },
  { labelKey: "onboarding.status.inProgress", value: "in_progress" },
  { labelKey: "onboarding.status.completed", value: "completed" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: "onboarding.status.notStarted", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "onboarding.status.inProgress", className: "bg-blue-100 text-blue-700" },
  completed: { label: "onboarding.status.completed", className: "bg-green-100 text-green-700" },
};

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all ${
            percentage >= 100 ? "bg-green-500" : percentage > 0 ? "bg-brand-500" : "bg-gray-300"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 tabular-nums">{percentage}%</span>
    </div>
  );
}

export function OnboardingListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [startForm, setStartForm] = useState({ application_id: "", template_id: "", joining_date: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-checklists", activeTab, page],
    queryFn: () =>
      apiGet<PaginatedResponse<EnrichedChecklist>>("/onboarding/checklists", {
        ...(activeTab !== "all" && { status: activeTab }),
        page,
        limit: 20,
      }),
  });

  // Candidates eligible to onboard: applications at the offer or hired stage.
  // Fetched only while the Start modal is open.
  const { data: eligibleRes } = useQuery({
    queryKey: ["onboarding-eligible-applications"],
    queryFn: async () => {
      const [offer, hired] = await Promise.all([
        apiGet<PaginatedResponse<EligibleApplication>>("/applications", { stage: "offer", perPage: 100 }),
        apiGet<PaginatedResponse<EligibleApplication>>("/applications", { stage: "hired", perPage: 100 }),
      ]);
      return [...(offer.data?.data ?? []), ...(hired.data?.data ?? [])];
    },
    enabled: showStartModal,
  });
  const eligibleApps = eligibleRes ?? [];

  const { data: templatesRes } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: () => apiGet<(OnboardingTemplate & { task_count: number })[]>("/onboarding/templates"),
    enabled: showStartModal,
  });
  const startTemplates = templatesRes?.data ?? [];

  const startOnboarding = useMutation({
    mutationFn: () => apiPost("/onboarding/checklists", startForm),
    onSuccess: () => {
      toast.success(t("onboarding.list.toastStarted"));
      queryClient.invalidateQueries({ queryKey: ["onboarding-checklists"] });
      setShowStartModal(false);
      setStartForm({ application_id: "", template_id: "", joining_date: "" });
    },
    onError: (err: any) => toast.error(err?.message || t("onboarding.list.toastStartFailed")),
  });

  const checklists = data?.data;
  const filtered = checklists?.data?.filter(
    (c) =>
      !search ||
      c.candidate_name.toLowerCase().includes(search.toLowerCase()) ||
      c.job_title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("onboarding.list.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("onboarding.list.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/onboarding/templates"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t("onboarding.list.manageTemplates")}
          </Link>
          <button
            onClick={() => setShowStartModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("onboarding.list.startOnboarding")}
          </button>
        </div>
      </div>

      {/* Start Onboarding modal — assign a template to an offer/hired
          application (wires the existing POST /onboarding/checklists) */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowStartModal(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("onboarding.list.startOnboarding")}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">{t("onboarding.list.startModalSubtitle")}</p>
              </div>
              <button
                onClick={() => setShowStartModal(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                startOnboarding.mutate();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("onboarding.list.applicationLabel")}
                </label>
                <select
                  required
                  value={startForm.application_id}
                  onChange={(e) => setStartForm({ ...startForm, application_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">
                    {eligibleApps.length === 0
                      ? t("onboarding.list.noEligible")
                      : t("onboarding.list.applicationPlaceholder")}
                  </option>
                  {eligibleApps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.candidate_name} — {a.job_title} ({a.stage})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("onboarding.list.templateLabel")}
                </label>
                <select
                  required
                  value={startForm.template_id}
                  onChange={(e) => setStartForm({ ...startForm, template_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("onboarding.list.templatePlaceholder")}</option>
                  {startTemplates.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                      {tp.department ? ` — ${tp.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("onboarding.list.joiningDateLabel")}
                </label>
                <input
                  type="date"
                  required
                  value={startForm.joining_date}
                  onChange={(e) => setStartForm({ ...startForm, joining_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t("onboarding.templates.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={startOnboarding.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {t("onboarding.list.startButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t("onboarding.list.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label={t("onboarding.list.statusTabsAria")}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setPage(1); }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
          <ClipboardList className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">{t("onboarding.list.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t("onboarding.list.emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((checklist) => {
            const sConfig = STATUS_CONFIG[checklist.status] || STATUS_CONFIG.not_started;
            return (
              <Link
                key={checklist.id}
                to={`/onboarding/${checklist.id}`}
                className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
                        {checklist.candidate_name}
                      </p>
                      <p className="text-sm text-gray-500">{checklist.job_title}</p>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sConfig.className}`}>
                    {t(sConfig.label)}
                  </span>
                </div>

                <div className="mt-4">
                  <ProgressBar percentage={checklist.progress.percentage} />
                  <p className="mt-1 text-xs text-gray-500">
                    {checklist.progress.total > 0
                      ? t("onboarding.list.tasksCompleted", {
                          completed: checklist.progress.completed,
                          total: checklist.progress.total,
                        })
                      : t("onboarding.list.noTasksYet")}
                  </p>
                </div>

                {checklist.joining_date && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("onboarding.list.joining", { date: formatDate(checklist.joining_date) })}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {checklists && checklists.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {t("onboarding.list.pageInfo", {
              page: checklists.page,
              totalPages: checklists.totalPages,
              total: checklists.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.list.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (checklists?.totalPages || 1)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.list.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

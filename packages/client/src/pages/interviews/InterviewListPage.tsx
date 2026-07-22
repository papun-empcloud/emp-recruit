import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { Calendar, Users, Plus, Search, ShieldAlert, AlertTriangle } from "lucide-react";
import { getUser } from "@/lib/auth-store";
import { canAccessRecruit } from "@/lib/roles";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { InterviewStatus, InterviewType } from "@emp-recruit/shared";

interface InterviewRow {
  id: string;
  application_id: string;
  type: InterviewType;
  round: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: InterviewStatus;
  candidate_name: string;
  job_title: string;
  panelist_count: number;
}

const INTERVIEW_COLUMNS: ExportColumn<InterviewRow>[] = [
  { header: "Candidate", value: (i) => i.candidate_name },
  { header: "Job", value: (i) => i.job_title },
  { header: "Title", value: (i) => i.title },
  { header: "Type", value: (i) => i.type },
  { header: "Round", value: (i) => i.round },
  { header: "Scheduled", value: (i) => (i.scheduled_at ? formatDate(i.scheduled_at) : "") },
  { header: "Duration (min)", value: (i) => i.duration_minutes },
  { header: "Status", value: (i) => i.status },
  { header: "Panelists", value: (i) => i.panelist_count },
];

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-800",
};

const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "", labelKey: "interviews.list.statusAll" },
  { value: "scheduled", labelKey: "interviews.list.statusScheduled" },
  { value: "in_progress", labelKey: "interviews.list.statusInProgress" },
  { value: "completed", labelKey: "interviews.list.statusCompleted" },
  { value: "cancelled", labelKey: "interviews.list.statusCancelled" },
  { value: "no_show", labelKey: "interviews.list.statusNoShow" },
];

// An interview is overdue if its scheduled time has passed but it hasn't been
// completed, cancelled, or marked no-show yet. (BUG-07)
function isOverdue(interview: InterviewRow): boolean {
  if (interview.status !== "scheduled" && interview.status !== "in_progress") return false;
  const when = new Date(interview.scheduled_at).getTime();
  return Number.isFinite(when) && when < Date.now();
}

export function InterviewListPage() {
  const { t } = useTranslation();
  const user = getUser();

  // RBAC: admin/HR roles OR a federated recruit:* permission can access.
  if (user && !canAccessRecruit(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { rows, total, isLoading, isError } = usePaginatedList<InterviewRow>(
    ["interviews"],
    "/interviews",
    { status: statusFilter, search },
    page,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("interviews.list.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("interviews.list.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            baseName="interviews"
            title="Interviews"
            subtitle={`${total} interview${total !== 1 ? "s" : ""}${statusFilter ? ` (${statusFilter.replace("_", " ")})` : ""}`}
            columns={INTERVIEW_COLUMNS}
            fetchRows={() => fetchAllRows<InterviewRow>("/interviews", { status: statusFilter, search })}
          />
          <Link
            to="/interviews/schedule"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("interviews.list.scheduleInterview")}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("interviews.list.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm -mx-4 lg:mx-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colCandidate")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colJob")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colTypeRound")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colSchedule")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colStatus")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colPanelists")}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("interviews.list.colActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                  {t("interviews.list.loading")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-red-500">
                  {t("interviews.list.loadError")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                  {t("interviews.list.empty")}
                </td>
              </tr>
            )}
            {rows.map((interview) => (
              <tr key={interview.id} className="hover:bg-gray-50 transition-colors">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {interview.candidate_name}
                  </div>
                  <div className="text-xs text-gray-500">{interview.title}</div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {interview.job_title}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm text-gray-900 capitalize">{interview.type}</div>
                  <div className="text-xs text-gray-500">{t("interviews.list.round", { round: interview.round })}</div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-1.5 text-sm text-gray-900">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    {formatDate(interview.scheduled_at)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t("interviews.list.timeDuration", {
                      time: formatTime(interview.scheduled_at),
                      minutes: interview.duration_minutes,
                    })}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_COLORS[interview.status] || "bg-gray-100 text-gray-800",
                      )}
                    >
                      {enumLabel(t, "interviewStatus", interview.status)}
                    </span>
                    {isOverdue(interview) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> {t("interviews.list.overdue")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    {interview.panelist_count}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <Link
                    to={`/interviews/${interview.id}`}
                    className="text-sm font-medium text-brand-600 hover:text-brand-800"
                  >
                    {t("interviews.list.view")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {!isLoading && rows.length > 0 && (
          <div className="border-t border-gray-200 bg-white px-6 py-3">
            <Pagination
              page={page}
              perPage={DEFAULT_PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Calendar, Search, X } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { PaginatedResponse, JobPosting } from "@emp-recruit/shared";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const STAGES = ["applied", "screened", "interview", "offer", "hired", "rejected", "withdrawn"];

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screened: "bg-indigo-100 text-indigo-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

interface AppRow {
  id: string;
  candidate_id: string;
  candidate_first_name: string;
  candidate_last_name: string;
  job_id: string;
  job_title: string;
  job_department: string | null;
  stage: string;
  source: string;
  applied_at: string;
}

const APPLICATION_COLUMNS: ExportColumn<AppRow>[] = [
  { header: "Candidate", value: (a) => `${a.candidate_first_name} ${a.candidate_last_name}`.trim() },
  { header: "Job", value: (a) => a.job_title },
  { header: "Department", value: (a) => a.job_department },
  { header: "Stage", value: (a) => a.stage },
  { header: "Source", value: (a) => a.source },
  { header: "Applied", value: (a) => (a.applied_at ? formatDate(a.applied_at) : "") },
];

export function ApplicationsListPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(() => {
    const requested = searchParams.get("stage") ?? "";
    return STAGES.includes(requested) ? requested : "";
  });
  const [jobId, setJobId] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Jobs power the "job role" dropdown and the department/location options.
  const { data: jobsData } = useQuery({
    queryKey: ["jobs-for-app-filter"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { perPage: 100 }),
  });
  const jobs = jobsData?.data?.data ?? [];
  const departments = Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))).sort() as string[];
  const locations = Array.from(new Set(jobs.map((j) => j.location).filter(Boolean))).sort() as string[];

  const { rows, total, isLoading, isFetching } = usePaginatedList<AppRow>(
    ["applications"],
    "/applications",
    {
      sort: "applied_at",
      order: "desc",
      stage,
      job_id: jobId,
      department,
      location,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    },
    page,
  );

  const filtersActive = Boolean(
    stage || jobId || department || location || dateFrom || dateTo || search,
  );

  // Bulk stage updates: select rows, then move them all to a stage at once.
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const bulkMutation = useMutation({
    mutationFn: (targetStage: string) =>
      apiPost("/applications/bulk-stage", { application_ids: [...selected], stage: targetStage }),
    onSuccess: (res: any) => {
      toast.success(t("applications.bulk.moved", { count: res?.data?.moved ?? selected.size }));
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("applications.bulk.moveFailed")),
  });

  // Change a filter and reset to page 1.
  function setFilter(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPage(1);
    };
  }

  function clearFilters() {
    setStage("");
    setJobId("");
    setDepartment("");
    setLocation("");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("applications.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("applications.subtitle")}</p>
        </div>
        <ExportButtons
          baseName="applications"
          title={t("applications.title")}
          subtitle={t(filtersActive ? "applications.countMatch" : "applications.count", { count: total })}
          columns={APPLICATION_COLUMNS}
          fetchRows={() =>
            fetchAllRows<AppRow>("/applications", {
              sort: "applied_at",
              order: "desc",
              stage,
              job_id: jobId,
              department,
              location,
              date_from: dateFrom,
              date_to: dateTo,
              search,
            })
          }
        />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {/* Employee / job search */}
          <div className="w-full flex-1 sm:min-w-[16rem]">
            <label htmlFor="applications-search" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.searchLabel")}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                id="applications-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("applications.searchPlaceholder")}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Job role */}
          <div>
            <label htmlFor="applications-job" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.jobRole")}</label>
            <select
              id="applications-job"
              value={jobId}
              onChange={(e) => setFilter(setJobId)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-44"
            >
              <option value="">{t("applications.allJobs")}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label htmlFor="applications-department" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.department")}</label>
            <select
              id="applications-department"
              value={department}
              onChange={(e) => setFilter(setDepartment)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            >
              <option value="">{t("applications.allDepartments")}</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="applications-location" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.location")}</label>
            <select
              id="applications-location"
              value={location}
              onChange={(e) => setFilter(setLocation)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            >
              <option value="">{t("applications.allLocations")}</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label htmlFor="applications-stage" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.stageLabel")}</label>
            <select
              id="applications-stage"
              value={stage}
              onChange={(e) => setFilter(setStage)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-36"
            >
              <option value="">{t("applications.allStages")}</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`applications.stages.${s}`, s.charAt(0).toUpperCase() + s.slice(1))}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label htmlFor="applications-from" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.appliedFrom")}</label>
            <input
              id="applications-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setFilter(setDateFrom)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            />
          </div>
          <div>
            <label htmlFor="applications-to" className="mb-1 block text-xs font-medium text-gray-500">{t("applications.appliedTo")}</label>
            <input
              id="applications-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setFilter(setDateTo)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            />
          </div>

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <X className="h-4 w-4" /> {t("applications.clear")}
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {filtersActive
            ? t("applications.countMatch", { count: total })
            : t("applications.count", { count: total })}
        </p>
      </div>

      {isLoading && isFetching ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">{t("applications.noApplications")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2">
              <span className="text-sm font-medium text-brand-800">
                {t("applications.bulk.selected", { count: selected.size })}
              </span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) bulkMutation.mutate(e.target.value);
                }}
                disabled={bulkMutation.isPending}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">{t("applications.bulk.moveTo")}</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`applications.stage.${s}`, s)}
                  </option>
                ))}
              </select>
              {bulkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {t("applications.bulk.clear")}
              </button>
            </div>
          )}
          {rows.map((app) => (
            <div key={app.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.has(app.id)}
                onChange={() => toggleSelected(app.id)}
                className="h-4 w-4 flex-shrink-0 rounded border-gray-300"
                aria-label={t("applications.bulk.selected", { count: 1 })}
              />
              <Link
                to={`/applications/${app.id}`}
                className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-200 hover:bg-gray-50"
              >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {getInitials(`${app.candidate_first_name} ${app.candidate_last_name}`)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {app.candidate_first_name} {app.candidate_last_name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {app.job_title}
                    {app.job_department ? ` · ${app.job_department}` : ""}
                  </p>
                </div>
              </div>
              <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                    STAGE_BADGE[app.stage] ?? "bg-gray-100 text-gray-700",
                  )}
                >
                  {t(`applications.stages.${app.stage}`, app.stage)}
                </span>
                <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-gray-400 sm:inline-flex">
                  <Calendar className="h-3 w-3" />
                  {formatDate(app.applied_at)}
                </span>
              </div>
              </Link>
            </div>
          ))}

          {/* Pagination */}
          <Pagination
            page={page}
            perPage={DEFAULT_PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

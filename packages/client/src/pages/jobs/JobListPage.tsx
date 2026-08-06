import { useState, useEffect, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Briefcase, MapPin, ChevronRight, Upload, PencilLine, Building2, CalendarDays, Sparkles } from "lucide-react";
import { apiPatch } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
// Lazy-loaded so the Excel library (exceljs) is only fetched when a bulk dialog
// is actually opened, keeping the initial Job Postings page light.
const BulkImportJobsModal = lazy(() =>
  import("@/components/BulkImportJobsModal").then((m) => ({ default: m.BulkImportJobsModal })),
);
const BulkUpdateJobsModal = lazy(() =>
  import("@/components/BulkUpdateJobsModal").then((m) => ({ default: m.BulkUpdateJobsModal })),
);
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { JobPosting } from "@emp-recruit/shared";
import { JobStatus } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import toast from "react-hot-toast";

const range = (min: number | null | undefined, max: number | null | undefined) =>
  min == null && max == null ? "" : `${min ?? ""}–${max ?? ""}`;

const JOB_COLUMNS: ExportColumn<JobPosting>[] = [
  { header: "Title", value: (j) => j.title },
  { header: "Department", value: (j) => j.department },
  { header: "Location", value: (j) => j.location },
  { header: "Type", value: (j) => j.employment_type },
  { header: "Status", value: (j) => j.status },
  { header: "Experience", value: (j) => range(j.experience_min, j.experience_max) },
  { header: "Salary", value: (j) => range(j.salary_min, j.salary_max) },
  { header: "Created", value: (j) => (j.created_at ? formatDate(j.created_at) : "") },
];

const STATUS_TABS = [
  { labelKey: "jobs.list.tabs.all", value: "" },
  { labelKey: "jobs.list.tabs.draft", value: "draft" },
  { labelKey: "jobs.list.tabs.open", value: "open" },
  { labelKey: "jobs.list.tabs.paused", value: "paused" },
  { labelKey: "jobs.list.tabs.closed", value: "closed" },
  { labelKey: "jobs.list.tabs.filled", value: "filled" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  closed: "bg-red-100 text-red-700",
  filled: "bg-blue-100 text-blue-700",
};

export function JobListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const searchTerm = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const queryClient = useQueryClient();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  // Debounce the search box into the URL; changing the term resets to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== searchTerm) setFilter("search", searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { rows: jobs, total, isLoading } = usePaginatedList<JobPosting>(
    ["jobs"],
    "/jobs",
    { status: statusFilter, search: searchTerm },
    page,
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 sm:space-y-6">
      {/* Header */}
      <section className="relative z-20 overflow-visible rounded-3xl bg-gradient-to-br from-[#111a35] via-[#18244a] to-brand-900 px-5 py-7 text-white shadow-xl sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute right-4 top-4 h-40 w-40 rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-200"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Hiring Workspace</p>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t("jobs.list.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
            {t("jobs.list.totalCount", { count: total })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-white/10 p-0.5 ring-1 ring-white/15 [&>div>button]:border-white/15 [&>div>button]:bg-white/10 [&>div>button]:text-white [&>div>button:hover]:bg-white/15">
          <ExportButtons
            baseName="jobs"
            title={t("jobs.list.title")}
            subtitle={t("jobs.list.totalCount", { count: total })}
            columns={JOB_COLUMNS}
            fetchRows={() => fetchAllRows<JobPosting>("/jobs", { status: statusFilter, search: searchTerm })}
          />
          </div>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {t("jobs.list.bulkImport")}
          </button>
          <button
            type="button"
            onClick={() => setShowBulkUpdate(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {t("jobs.list.bulkUpdate")}
          </button>
          <Link
            to="/jobs/new"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-800 shadow-sm transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("jobs.list.createJob")}
          </Link>
        </div>
        </div>
      </section>

      {showBulkImport && (
        <Suspense fallback={null}>
          <BulkImportJobsModal
            open={showBulkImport}
            onClose={() => setShowBulkImport(false)}
            onImported={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })}
          />
        </Suspense>
      )}

      {showBulkUpdate && (
        <Suspense fallback={null}>
          <BulkUpdateJobsModal
            open={showBulkUpdate}
            onClose={() => setShowBulkUpdate(false)}
            fetchRows={() => fetchAllRows<JobPosting>("/jobs", {})}
            onUpdated={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })}
          />
        </Suspense>
      )}

      <section aria-label="Filter job postings" className="relative z-10 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 scrollbar-thin" role="tablist" aria-label="Job status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.value}
            onClick={() => setFilter("status", tab.value)}
            className={cn(
              "min-h-10 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              statusFilter === tab.value
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:bg-white/60 hover:text-gray-800",
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          name="job-search"
          aria-label={t("jobs.list.searchPlaceholder")}
          autoComplete="off"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("jobs.list.searchPlaceholder")}
          className="min-h-11 w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm transition-colors placeholder:text-gray-400 hover:border-gray-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
      </div>
      </section>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">{t("jobs.list.emptyTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("jobs.list.emptyDescription")}</p>
          <Link
            to="/jobs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            {t("jobs.list.createJob")}
          </Link>
        </div>
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="break-words text-base font-bold text-gray-900 transition-colors group-hover:text-brand-700">{job.title}</h2><p className="mt-1 text-xs text-gray-400">Created {formatDate(job.created_at)}</p></div>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-gray-500 min-[430px]:grid-cols-2">
                <span className="inline-flex min-w-0 items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{job.department || "No department"}</span></span>
                <span className="inline-flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{job.location || "No location"}</span></span>
                <span className="inline-flex min-w-0 items-center gap-2"><Briefcase className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{enumLabel(t, "employmentType", job.employment_type)}</span></span>
                <span className="inline-flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{(job as any).is_internal ? t("jobs.list.internal") : t("jobs.list.public")}</span></span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize", STATUS_BADGE[job.status] ?? "bg-gray-100 text-gray-700")}>{enumLabel(t, "jobStatus", job.status)}</span>
                {(job as any).remote_policy && <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 capitalize">{enumLabel(t, "remotePolicy", (job as any).remote_policy)}</span>}
              </div>
            </Link>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
          <table className="w-full min-w-[980px] table-fixed divide-y divide-gray-200">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colTitle")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colDepartment")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colLocation")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colType")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colVisibility")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colStatus")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("jobs.list.colCreated")}
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-brand-50/30">
                  <td className="px-6 py-4">
                    <Link to={`/jobs/${job.id}`} className="block max-w-72 break-words font-semibold text-gray-900 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500"><span className="block truncate" title={job.department || undefined}>{job.department || "--"}</span></td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {job.location ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate" title={job.location}>{job.location}</span>
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 capitalize">
                    {/* #32 — show remote policy next to employment type. */}
                    <span className="block">{enumLabel(t, "employmentType", job.employment_type)}</span>
                    {(job as any).remote_policy && (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 capitalize">
                        {enumLabel(t, "remotePolicy", (job as any).remote_policy)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        (job as any).is_internal
                          ? "bg-amber-100 text-amber-800"
                          : "bg-green-100 text-green-800",
                      )}
                    >
                      {(job as any).is_internal ? t("jobs.list.internal") : t("jobs.list.public")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_BADGE[job.status] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {enumLabel(t, "jobStatus", job.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(job.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/jobs/${job.id}`} aria-label={`${t("jobs.list.colTitle")}: ${job.title}`} className="inline-flex rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Pagination */}
      {!isLoading && jobs.length > 0 && (
        <Pagination
          page={page}
          perPage={DEFAULT_PAGE_SIZE}
          total={total}
          onPageChange={(p) => setFilter("page", String(p))}
        />
      )}
    </div>
  );
}

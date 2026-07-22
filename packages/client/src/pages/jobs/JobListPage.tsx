import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Briefcase, MapPin, Clock, ChevronRight, Upload } from "lucide-react";
import { apiPatch } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { BulkImportJobsModal } from "@/components/BulkImportJobsModal";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("jobs.list.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("jobs.list.totalCount", { count: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            baseName="jobs"
            title="Job Postings"
            subtitle={`${total} job${total !== 1 ? "s" : ""}${statusFilter ? ` (${statusFilter})` : ""}`}
            columns={JOB_COLUMNS}
            fetchRows={() => fetchAllRows<JobPosting>("/jobs", { status: statusFilter, search: searchTerm })}
          />
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("jobs.list.bulkImport")}
          </button>
          <Link
            to="/jobs/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("jobs.list.createJob")}
          </Link>
        </div>
      </div>

      <BulkImportJobsModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })}
      />

      {/* Status tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter("status", tab.value)}
            className={cn(
              "whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors",
              statusFilter === tab.value
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("jobs.list.searchPlaceholder")}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

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
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
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
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{job.department || "--"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {job.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
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
                    <Link to={`/jobs/${job.id}`} className="text-gray-400 hover:text-gray-600">
                      <ChevronRight className="h-5 w-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { apiGet } from "@/api/client";
import type { PaginatedResponse, JobPosting } from "@emp-recruit/shared";
import { cn, formatDate, getInitials } from "@/lib/utils";

const PER_PAGE = 20;

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

export function ApplicationsListPage() {
  const [stage, setStage] = useState("");
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

  const { data, isLoading } = useQuery({
    queryKey: ["applications", { stage, jobId, department, location, dateFrom, dateTo, search, page }],
    queryFn: () =>
      apiGet<PaginatedResponse<AppRow>>("/applications", {
        page,
        perPage: PER_PAGE,
        sort: "applied_at",
        order: "desc",
        ...(stage ? { stage } : {}),
        ...(jobId ? { job_id: jobId } : {}),
        ...(department ? { department } : {}),
        ...(location ? { location } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(search ? { search } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const result = data?.data;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtersActive = Boolean(
    stage || jobId || department || location || dateFrom || dateTo || search,
  );

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <p className="mt-1 text-sm text-gray-500">Every application across your open roles.</p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {/* Employee / job search */}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Candidate name, email or job…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Job role */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Job role</label>
            <select
              value={jobId}
              onChange={(e) => setFilter(setJobId)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-44"
            >
              <option value="">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Department</label>
            <select
              value={department}
              onChange={(e) => setFilter(setDepartment)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Location</label>
            <select
              value={location}
              onChange={(e) => setFilter(setLocation)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Stage</label>
            <select
              value={stage}
              onChange={(e) => setFilter(setStage)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-36"
            >
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Applied from</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setFilter(setDateFrom)(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Applied to</label>
            <input
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
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {total} application{total !== 1 ? "s" : ""}
          {filtersActive ? " match your filters" : ""}
        </p>
      </div>

      {isLoading && !result ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No applications found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((app) => (
            <Link
              key={app.id}
              to={app.candidate_id ? `/candidates/${app.candidate_id}` : `/jobs/${app.job_id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-200 hover:bg-gray-50"
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
                  {app.stage}
                </span>
                <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-gray-400 sm:inline-flex">
                  <Calendar className="h-3 w-3" />
                  {formatDate(app.applied_at)}
                </span>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

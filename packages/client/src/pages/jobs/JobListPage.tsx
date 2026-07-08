import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Briefcase, MapPin, Clock, ChevronRight } from "lucide-react";
import { apiGet, apiPatch } from "@/api/client";
import type { JobPosting, PaginatedResponse } from "@emp-recruit/shared";
import { JobStatus } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Open", value: "open" },
  { label: "Paused", value: "paused" },
  { label: "Closed", value: "closed" },
  { label: "Filled", value: "filled" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  closed: "bg-red-100 text-red-700",
  filled: "bg-blue-100 text-blue-700",
};

export function JobListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const statusFilter = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", { page, status: statusFilter, search }],
    queryFn: () =>
      apiGet<PaginatedResponse<JobPosting>>("/jobs", {
        page,
        perPage: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  const jobs = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Postings</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} job{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link
          to="/jobs/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Job
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter("status", tab.value)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              statusFilter === tab.value
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setFilter("search", search)}
          placeholder="Search by title, department, or location..."
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
          <p className="mt-2 text-sm font-medium text-gray-900">No jobs found</p>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new job posting.</p>
          <Link
            to="/jobs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create Job
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Job Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Visibility
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
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
                    <span className="block">{job.employment_type.replace(/_/g, " ")}</span>
                    {(job as any).remote_policy && (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 capitalize">
                        {(job as any).remote_policy === "onsite" ? "On-site" : (job as any).remote_policy}
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
                      {(job as any).is_internal ? "Internal" : "Public"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_BADGE[job.status] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {job.status}
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setFilter("page", String(page - 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setFilter("page", String(page + 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

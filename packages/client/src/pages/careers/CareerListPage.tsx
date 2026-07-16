import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  MapPin,
  Briefcase,
  Clock,
  Building2,
  Search,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import type { JobPosting, CareerPage } from "@emp-recruit/shared";

const PUBLIC_API = "/api/v1/public";
const PER_PAGE = 10;

interface PublicJobsResponse {
  data: (JobPosting & { applicant_count: number })[];
  total: number;
  page: number;
  perPage: number;
  departments: string[];
  locations: string[];
}

export function CareerListPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const careerQuery = useQuery({
    queryKey: ["public-career", slug],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}`);
      return data.data as { careerPage: CareerPage; orgName: string; orgLogo: string | null };
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["public-jobs", slug, { search, department, location, page }],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}/jobs`, {
        params: {
          page,
          perPage: PER_PAGE,
          search: search || undefined,
          department: department || undefined,
          location: location || undefined,
        },
      });
      return data.data as PublicJobsResponse;
    },
    // Keep the previous page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  if (careerQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (careerQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Building2 className="h-12 w-12 text-gray-300" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">{t("careers.list.notFoundTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("careers.list.notFoundDesc")}</p>
      </div>
    );
  }

  const career = careerQuery.data!;
  const result = jobsQuery.data;
  const jobs = result?.data ?? [];
  const total = result?.total ?? 0;
  const perPage = result?.perPage ?? PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const departments = result?.departments ?? [];
  const locations = result?.locations ?? [];
  const brand = career.careerPage.primary_color || "#4F46E5";
  const filtersActive = Boolean(search || department || location);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setDepartment("");
    setLocation("");
    setPage(1);
  }

  return (
    <div>
      {/* Hero */}
      <div className="mb-8 text-center">
        {career.orgLogo && (
          <img src={career.orgLogo} alt={career.orgName} className="mx-auto mb-4 h-16 w-auto" />
        )}
        <h1 className="text-3xl font-bold text-gray-900">
          {career.careerPage.title || career.orgName}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-gray-600">
          {(career.careerPage.description || "").replace(/<[^>]+>/g, "").trim() ||
            t("careers.list.explorePositions", { orgName: career.orgName })}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("careers.list.searchPlaceholder")}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full truncate pr-8 sm:w-auto sm:min-w-[12rem] sm:max-w-[18rem]"
        >
          <option value="">{t("careers.list.allDepartments")}</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-48"
        >
          <option value="">{t("careers.list.allLocations")}</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
            {t("careers.list.clear")}
          </button>
        )}
      </div>

      {/* Jobs list */}
      {jobsQuery.isLoading && !result ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            {filtersActive ? t("careers.list.noMatchingTitle") : t("careers.list.noOpenTitle")}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {filtersActive
              ? t("careers.list.noMatchingDesc")
              : t("careers.list.noOpenDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-500">
            {filtersActive
              ? t("careers.list.positionsFound", { count: total })
              : t("careers.list.positionsOpen", { count: total })}
          </p>

          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/careers/${slug}/jobs/${job.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    {job.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {job.department}
                      </span>
                    )}
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      {enumLabel(t, "employmentType", job.employment_type)}
                    </span>
                    {(job.experience_min != null || job.experience_max != null) && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {t("careers.list.experienceYears", {
                          min: job.experience_min ?? 0,
                          max: job.experience_max ?? "10+",
                        })}
                      </span>
                    )}
                  </div>

                  {/* Applicant count + publish date */}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t("careers.list.applicants", { count: job.applicant_count })}
                    </span>
                    {job.published_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {t("careers.list.posted", { date: formatDate(job.published_at) })}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: brand }}
                >
                  {t("careers.list.apply")}
                </span>
              </div>
              {(job.salary_min || job.salary_max) && (
                <p className="mt-3 text-sm font-medium text-green-700">
                  {job.salary_currency}{" "}
                  {job.salary_min ? (job.salary_min / 100000).toFixed(1) + "L" : ""} –{" "}
                  {job.salary_max ? (job.salary_max / 100000).toFixed(1) + "L" : ""}
                </p>
              )}
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
                <ChevronLeft className="h-4 w-4" />
                {t("careers.list.previous")}
              </button>
              <span className="text-sm text-gray-500">
                {t("careers.list.pageOf", { page, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("careers.list.next")}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

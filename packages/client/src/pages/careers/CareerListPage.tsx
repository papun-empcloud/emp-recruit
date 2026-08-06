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
  ArrowUpRight,
  Sparkles,
  Target,
  Compass,
  CheckCircle2,
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
  const companyDescription = (career.careerPage.description || "")
    .replace(/<[^>]+>/g, "")
    .trim();

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setDepartment("");
    setLocation("");
    setPage(1);
  }

  return (
    <div className="pb-8">
      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-slate-950 px-5 py-10 text-white shadow-xl shadow-slate-200 dark:shadow-none sm:px-10 sm:py-14 lg:px-14">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl">
        {career.orgLogo && (
          <img src={career.orgLogo} alt={`${career.orgName} logo`} width="160" height="48" className="mb-6 h-12 w-auto rounded-lg bg-white object-contain p-1" />
        )}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Join {career.orgName}
        </div>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          {career.careerPage.title || career.orgName}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-slate-300 sm:text-lg">
          {companyDescription ||
            t("careers.list.explorePositions", { orgName: career.orgName })}
        </p>
        </div>
      </section>

      <section aria-labelledby="about-company-heading" className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.75fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">About the Company</p>
          <h2 id="about-company-heading" className="mt-2 text-balance text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Build Your Career at {career.orgName}</h2>
          <p className="mt-3 max-w-3xl text-pretty text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {companyDescription || `${career.orgName} is growing its team. Explore current opportunities and find a role where your experience can make an impact.`}
          </p>
        </article>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7" aria-label={`${career.orgName} career highlights`}>
          <p className="text-sm font-bold text-slate-950 dark:text-white">Career Page at a Glance</p>
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Target className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{departments.length || 1} {departments.length === 1 ? "Team" : "Teams"} Hiring</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Explore roles across {departments.length ? departments.slice(0, 2).join(" & ") : "the organization"}.</p></div></div>
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><Compass className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{locations.length || 1} {locations.length === 1 ? "Location" : "Locations"}</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Filter openings to find the right workplace for you.</p></div></div>
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Simple Application</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Review the role details and apply directly online.</p></div></div>
          </div>
        </aside>
      </section>

      {/* Filters */}
      <section aria-label="Search open positions" className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-sm font-semibold text-slate-950 dark:text-white">Find Your Next Role</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search by title, team, or location.</p></div>
          <span className="hidden text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:block">{total} open {total === 1 ? "position" : "positions"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            name="job-search"
            aria-label={t("careers.list.searchPlaceholder")}
            autoComplete="off"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("careers.list.searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:border-slate-600"
          />
        </div>
        <select
          aria-label={t("careers.list.allDepartments")}
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          className="h-11 w-full truncate rounded-xl border border-slate-300 bg-white px-3 pr-8 text-sm text-slate-700 shadow-sm hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600"
        >
          <option value="">{t("careers.list.allDepartments")}</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          aria-label={t("careers.list.allLocations")}
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600"
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
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("careers.list.clear")}
          </button>
        )}
        </div>
      </section>

      {/* Jobs list */}
      {jobsQuery.isLoading && !result ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-12">
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
        <section aria-labelledby="open-positions-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
          <h2 id="open-positions-heading" className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">Open Positions</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtersActive
              ? t("careers.list.positionsFound", { count: total })
              : t("careers.list.positionsOpen", { count: total })}
          </p></div>

          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/careers/${slug}/jobs/${job.id}`}
              className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/50 dark:hover:shadow-none sm:p-6"
            >
              <div className="flex flex-col items-start justify-between gap-5 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <h3 className="text-balance text-lg font-bold text-slate-950 transition-colors group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300 sm:text-xl">{job.title}</h3>
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
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: brand }}
                >
                  {t("careers.list.apply")}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
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
        </section>
      )}
    </div>
  );
}

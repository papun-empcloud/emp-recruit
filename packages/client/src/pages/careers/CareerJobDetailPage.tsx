import { useParams, Link } from "react-router-dom";
import { sanitizeHtml } from "@/lib/sanitize";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  MapPin,
  Briefcase,
  Clock,
  Building2,
  ArrowLeft,
  DollarSign,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import type { JobPosting } from "@emp-recruit/shared";
import { enumLabel } from "@/lib/enums";
import { formatDate } from "@/lib/utils";

const PUBLIC_API = "/api/v1/public";

export function CareerJobDetailPage() {
  const { t } = useTranslation();
  const { slug, jobId } = useParams<{ slug: string; jobId: string }>();

  const jobQuery = useQuery({
    queryKey: ["public-job", slug, jobId],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}/jobs/${jobId}`);
      return data.data as JobPosting;
    },
  });

  if (jobQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Briefcase className="h-12 w-12 text-gray-300" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">{t("careers.detail.notFoundTitle")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("careers.detail.notFoundDesc")}</p>
        <Link
          to={`/careers/${slug}`}
          className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {t("careers.detail.backToAll")}
        </Link>
      </div>
    );
  }

  const job = jobQuery.data!;
  let skills: string[] = [];
  try {
    skills = job.skills ? JSON.parse(job.skills) : [];
  } catch {
    skills = [];
  }

  return (
    <div className="pb-8">
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link
          to={`/careers/${slug}`}
          className="inline-flex items-center gap-2 rounded-lg py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:text-indigo-300 dark:focus-visible:ring-offset-[#0b1120]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("careers.detail.backToAll")}
        </Link>
      </div>

      <section className="relative mb-8 overflow-hidden rounded-3xl bg-slate-950 px-5 py-8 text-white shadow-xl shadow-slate-200 dark:shadow-none sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/25 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-4xl">
          {job.department && <p className="mb-3 text-sm font-semibold text-indigo-300">{job.department}</p>}
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{job.title}</h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300">
            {job.location && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-indigo-300" aria-hidden="true" />{job.location}</span>}
            <span className="inline-flex items-center gap-2"><Briefcase className="h-4 w-4 text-indigo-300" aria-hidden="true" />{enumLabel(t, "employmentType", job.employment_type)}</span>
            {(job.experience_min != null || job.experience_max != null) && <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-indigo-300" aria-hidden="true" />{t("careers.detail.experienceYears", { min: job.experience_min ?? 0, max: job.experience_max ?? "10+" })}</span>}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main content */}
        <div className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Position Overview</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
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
                  {t("careers.detail.experienceYears", {
                    min: job.experience_min ?? 0,
                    max: job.experience_max ?? "10+",
                  })}
                </span>
              )}
            </div>

            {(job.salary_min || job.salary_max) && (
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-green-700">
                <DollarSign className="h-4 w-4" />
                {job.salary_currency}{" "}
                {job.salary_min ? (job.salary_min / 100000).toFixed(1) + "L" : ""} –{" "}
                {job.salary_max ? (job.salary_max / 100000).toFixed(1) + "L" : ""}
                <span className="text-gray-400 font-normal">{t("careers.detail.perYear")}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.jobDescription")}</h2>
            <div
              className="rte-content prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(job.description) }}
            />
          </div>

          {/* Requirements */}
          {job.requirements && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.requirements")}</h2>
              <div
                className="rte-content prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(job.requirements) }}
              />
            </div>
          )}

          {/* Benefits */}
          {job.benefits && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.benefits")}</h2>
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(job.benefits) }}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-6">
          {/* Apply card */}
          <div className="rounded-2xl bg-indigo-600 p-6 text-white shadow-xl shadow-indigo-200 dark:shadow-none">
            <CheckCircle2 className="mb-4 h-8 w-8 text-indigo-200" aria-hidden="true" />
            <h2 className="text-xl font-bold">{t("careers.detail.interested")}</h2>
            <p className="mt-2 text-sm leading-6 text-indigo-100">{t("careers.detail.applyPrompt")}</p>
            <Link
              to={`/careers/${slug}/jobs/${jobId}/apply`}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
            >
              {t("careers.detail.applyNow")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("careers.detail.skills")}</h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Job details summary */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("careers.detail.jobDetails")}</h3>
            <div className="text-sm">
              <span className="text-gray-500">{t("careers.detail.employmentType")}</span>
              <p className="font-medium text-gray-900 capitalize">{enumLabel(t, "employmentType", job.employment_type)}</p>
            </div>
            {job.location && (
              <div className="text-sm">
                <span className="text-gray-500">{t("careers.detail.location")}</span>
                <p className="font-medium text-gray-900">{job.location}</p>
              </div>
            )}
            {job.department && (
              <div className="text-sm">
                <span className="text-gray-500">{t("careers.detail.department")}</span>
                <p className="font-medium text-gray-900">{job.department}</p>
              </div>
            )}
            {job.closes_at && (
              <div className="text-sm">
                <span className="inline-flex items-center gap-1.5 text-gray-500"><CalendarDays className="h-4 w-4" aria-hidden="true" />{t("careers.detail.applyBefore")}</span>
                <p className="font-medium text-gray-900">
                  {formatDate(job.closes_at)}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

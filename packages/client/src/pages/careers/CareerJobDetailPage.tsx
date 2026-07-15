import { useParams, Link } from "react-router-dom";
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
} from "lucide-react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import type { JobPosting } from "@emp-recruit/shared";
import { enumLabel } from "@/lib/enums";

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
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          to={`/careers/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("careers.detail.backToAll")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
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
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.jobDescription")}</h2>
            <div
              className="rte-content prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: job.description }}
            />
          </div>

          {/* Requirements */}
          {job.requirements && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.requirements")}</h2>
              <div
                className="rte-content prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: job.requirements }}
              />
            </div>
          )}

          {/* Benefits */}
          {job.benefits && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("careers.detail.benefits")}</h2>
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: job.benefits }}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Apply card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">{t("careers.detail.interested")}</h3>
            <p className="mt-1 text-sm text-gray-500">{t("careers.detail.applyPrompt")}</p>
            <Link
              to={`/careers/${slug}/jobs/${jobId}/apply`}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {t("careers.detail.applyNow")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
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
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
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
                <span className="text-gray-500">{t("careers.detail.applyBefore")}</span>
                <p className="font-medium text-gray-900">
                  {new Date(job.closes_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

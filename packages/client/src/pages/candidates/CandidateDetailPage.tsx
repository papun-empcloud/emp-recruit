import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Clock,
  Globe,
  Linkedin,
  FileText,
  ExternalLink,
  Pencil,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "@/api/client";
import { resolveUploadUrl } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Candidate, Application, JobPosting, PaginatedResponse } from "@emp-recruit/shared";
import { cn, formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screened: "bg-indigo-100 text-indigo-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

interface AppWithJob extends Application {
  job_title?: string;
  job_department?: string;
}

export function CandidateDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: candidateData, isLoading: loadingCandidate } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => apiGet<Candidate>(`/candidates/${id}`),
    enabled: Boolean(id),
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["candidate-applications", id],
    queryFn: () => apiGet<Application[]>(`/candidates/${id}/applications`),
    enabled: Boolean(id),
  });

  const candidate = candidateData?.data;
  const applications = appsData?.data ?? [];

  const queryClient = useQueryClient();
  const [showApply, setShowApply] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");

  // Open jobs to apply this candidate to (loaded when the dialog opens).
  const { data: jobsData } = useQuery({
    queryKey: ["open-jobs-for-apply"],
    queryFn: () => apiGet<PaginatedResponse<JobPosting>>("/jobs", { status: "open", perPage: 100 }),
    enabled: showApply,
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiPost("/applications", {
        job_id: selectedJobId,
        candidate_id: id,
        source: candidate?.source || "direct",
      }),
    onSuccess: () => {
      toast.success(t("candidates.detail.appliedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["candidate-applications", id] });
      setShowApply(false);
      setSelectedJobId("");
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.error?.message ||
          t("candidates.detail.applyError"),
      );
    },
  });

  if (loadingCandidate) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">{t("candidates.detail.notFound")}</p>
      </div>
    );
  }

  // #15 — mysql2 returns JSON columns as already-parsed arrays. Calling
  // JSON.parse on an array throws, which crashed this page to blank after
  // clicking a candidate. Handle array | string | null defensively.
  const parseJsonArray = (v: unknown): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const skills = parseJsonArray(candidate.skills);
  const tags = parseJsonArray(candidate.tags);

  // Open jobs the candidate hasn't already applied to.
  const appliedJobIds = new Set(applications.map((a: any) => a.job_id));
  const availableJobs = ((jobsData?.data?.data ?? []) as JobPosting[]).filter(
    (j) => !appliedJobIds.has(j.id),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate("/candidates")}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {candidate.first_name} {candidate.last_name}
          </h1>
          {candidate.current_title && (
            <p className="mt-1 text-gray-500">
              {candidate.current_title}
              {candidate.current_company && ` at ${candidate.current_company}`}
            </p>
          )}
        </div>
        <Link
          to={`/candidates/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          {t("candidates.detail.edit")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Profile Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Contact Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t("candidates.detail.contactInformation")}</h2>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${candidate.email}`} className="text-brand-600 hover:underline">
                  {candidate.email}
                </a>
              </div>
              {candidate.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-700">{candidate.phone}</span>
                </div>
              )}
              {candidate.linkedin_url && (
                <div className="flex items-center gap-3 text-sm">
                  <Linkedin className="h-4 w-4 text-gray-400" />
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline inline-flex items-center gap-1"
                  >
                    {t("candidates.detail.linkedin")} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {candidate.portfolio_url && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <a
                    href={candidate.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline inline-flex items-center gap-1"
                  >
                    {t("candidates.detail.portfolio")} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Professional Details */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t("candidates.detail.professional")}</h2>

            <div className="space-y-3">
              {candidate.current_company && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-700">{candidate.current_company}</span>
                </div>
              )}
              {candidate.current_title && (
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-700">{candidate.current_title}</span>
                </div>
              )}
              {candidate.experience_years != null && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-700">
                    {t("candidates.detail.experienceYears", { count: Number(candidate.experience_years) })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-xs font-medium uppercase text-gray-400">{t("candidates.detail.source")}</span>
                <span className="capitalize text-gray-700">{enumLabel(t, "source", candidate.source)}</span>
              </div>
            </div>
          </div>

          {candidate.resume_path && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{t("candidates.detail.resume")}</h2>
              <a
                href={resolveUploadUrl(candidate.resume_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileText className="h-4 w-4" />
                {t("candidates.detail.viewResume")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{t("candidates.detail.skills")}</h2>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill: string) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{t("candidates.detail.tags")}</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Applications */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("candidates.detail.applicationsCount", { count: applications.length })}
            </h2>
            <button
              onClick={() => setShowApply(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> {t("candidates.detail.applyToJob")}
            </button>
          </div>

          {loadingApps ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
            </div>
          ) : applications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
              <FileText className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">{t("candidates.detail.noApplications")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app: any) => (
                <div
                  key={app.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        to={`/jobs/${app.job_id}`}
                        className="text-sm font-medium text-gray-900 hover:text-brand-600"
                      >
                        {app.job_title || t("candidates.detail.job")}
                      </Link>
                      {app.job_department && (
                        <p className="text-xs text-gray-500">{app.job_department}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STAGE_BADGE[app.stage] ?? "bg-gray-100 text-gray-700",
                      )}
                    >
                      {enumLabel(t, "stage", app.stage)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>{t("candidates.detail.appliedDate", { date: formatDate(app.applied_at) })}</span>
                    <span className="capitalize">{t("candidates.detail.sourceValue", { source: enumLabel(t, "source", app.source) })}</span>
                    {app.rating !== null && <span>{t("candidates.detail.ratingValue", { rating: app.rating })}</span>}
                    {app.expected_salary != null && (
                      <span>{t("candidates.detail.expectedSalary", { amount: Number(app.expected_salary).toLocaleString() })}</span>
                    )}
                  </div>
                  {app.cover_letter && (
                    <div className="mt-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("candidates.detail.coverLetter")}</p>
                      <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{app.cover_letter}</p>
                    </div>
                  )}
                  {app.notes && (
                    <p className="mt-2 text-xs text-gray-600 line-clamp-2">{app.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {candidate.notes && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">{t("candidates.detail.notes")}</h2>
              <p className="text-sm text-gray-700 whitespace-pre-line">{candidate.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Apply-to-job dialog */}
      {showApply && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowApply(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t("candidates.detail.applyDialogTitle")}</h3>
              <button
                onClick={() => setShowApply(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t("candidates.detail.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-500">
              {t("candidates.detail.applyDialogDescription", {
                name: `${candidate.first_name} ${candidate.last_name}`,
              })}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("candidates.detail.openPositions")}</label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">{t("candidates.detail.selectJob")}</option>
              {availableJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {j.department ? ` — ${j.department}` : ""}
                </option>
              ))}
            </select>
            {availableJobs.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">
                {t("candidates.detail.noOpenJobs")}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowApply(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("candidates.detail.cancel")}
              </button>
              <button
                onClick={() => applyMutation.mutate()}
                disabled={!selectedJobId || applyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {applyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("candidates.detail.apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

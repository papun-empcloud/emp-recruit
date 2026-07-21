import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Upload, FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, apiPost } from "@/api/client";
import type { Candidate } from "@emp-recruit/shared";
import toast from "react-hot-toast";

const SOURCES = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "naukri", label: "Naukri" },
  { value: "other", label: "Other" },
];

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  source: string;
  linkedin_url: string;
  portfolio_url: string;
  current_company: string;
  current_title: string;
  experience_years: string;
  experience_months: string;
  skills: string;
  notes: string;
  tags: string;
}

const INITIAL: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  source: "direct",
  linkedin_url: "",
  portfolio_url: "",
  current_company: "",
  current_title: "",
  experience_years: "",
  experience_months: "",
  skills: "",
  notes: "",
  tags: "",
};

export function CandidateCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // ?job_id=<uuid> opens the form pre-targeted at a specific job posting
  // (from JobDetailPage "Add Candidate" button). After creating the
  // candidate we POST an application to link them to that job.
  const targetJobId = searchParams.get("job_id") || "";
  const [form, setForm] = useState<FormData>(INITIAL);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const created = await apiPost<Candidate>("/candidates", data);
      const candId = created.data?.id;

      // Optional résumé upload — enables AI resume scoring later.
      if (candId && resumeFile) {
        try {
          const fd = new FormData();
          fd.append("resume", resumeFile);
          await api.post(`/candidates/${candId}/resume`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          toast.error(t("candidates.form.resumeUploadFailed"));
        }
      }

      if (targetJobId && candId) {
        try {
          await apiPost("/applications", {
            job_id: targetJobId,
            candidate_id: candId,
            source: data.source || "direct",
          });
        } catch {
          toast.error(t("candidates.form.jobLinkFailed"));
        }
      }
      return created;
    },
    onSuccess: (res) => {
      toast.success(targetJobId ? t("candidates.form.addedToJob") : t("candidates.form.addedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      if (targetJobId) {
        queryClient.invalidateQueries({ queryKey: ["job-applications", targetJobId] });
        navigate(`/jobs/${targetJobId}`);
      } else {
        navigate(`/candidates/${res.data?.id}`);
      }
    },
    onError: (err: any) => {
      // Surface the specific field-level error (e.g. "Experience (years) can't
      // exceed 50") instead of the generic "Invalid candidate data". BUG-14.
      const details = err.response?.data?.error?.details as Record<string, string[]> | undefined;
      const fieldMsg = details ? Object.values(details).flat().filter(Boolean)[0] : undefined;
      const msg = fieldMsg ?? err.response?.data?.error?.message ?? t("candidates.form.addError");
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const years = form.experience_years ? Number(form.experience_years) : 0;
    const months = form.experience_months ? Number(form.experience_months) : 0;
    if (!Number.isFinite(years) || years < 0) {
      toast.error(t("candidates.form.expYearsNegative"));
      return;
    }
    // Give the same clear, immediate feedback for the upper bound as the Months
    // field already does, instead of letting it hit the server. BUG-14.
    if (years > 50) {
      toast.error(t("candidates.form.expYearsMax"));
      return;
    }
    if (!Number.isFinite(months) || months < 0 || months > 11) {
      toast.error(t("candidates.form.expMonthsRange"));
      return;
    }

    const payload: Record<string, any> = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      source: form.source,
    };

    if (form.phone) payload.phone = form.phone;
    if (form.linkedin_url) payload.linkedin_url = form.linkedin_url;
    if (form.portfolio_url) payload.portfolio_url = form.portfolio_url;
    if (form.current_company) payload.current_company = form.current_company;
    if (form.current_title) payload.current_title = form.current_title;
    if (form.experience_years || form.experience_months) {
      payload.experience_years = Math.round((years + months / 12) * 10) / 10;
    }
    if (form.skills) payload.skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (form.notes) payload.notes = form.notes;
    if (form.tags) payload.tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);

    mutation.mutate(payload);
  }

  function field(label: string, name: keyof FormData, type = "text", opts?: { required?: boolean; placeholder?: string }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {opts?.required && <span className="text-red-500">*</span>}
        </label>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
          placeholder={opts?.placeholder}
          required={opts?.required}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{t("candidates.form.addCandidate")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Personal Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.personalInformation")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(t("candidates.form.firstName"), "first_name", "text", { required: true, placeholder: t("candidates.form.firstNamePlaceholder") })}
            {field(t("candidates.form.lastName"), "last_name", "text", { required: true, placeholder: t("candidates.form.lastNamePlaceholder") })}
          </div>
          {field(t("candidates.form.email"), "email", "email", { required: true, placeholder: t("candidates.form.emailPlaceholder") })}
          {field(t("candidates.form.phone"), "phone", "tel", { placeholder: t("candidates.form.phonePlaceholder") })}
        </div>

        {/* Professional Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.professionalDetails")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(t("candidates.form.currentCompany"), "current_company", "text", { placeholder: t("candidates.form.currentCompanyPlaceholder") })}
            {field(t("candidates.form.currentTitle"), "current_title", "text", { placeholder: t("candidates.form.currentTitlePlaceholder") })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.experienceYears")}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.experience_years}
                onChange={(e) => setForm((p) => ({ ...p, experience_years: e.target.value }))}
                placeholder="5"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.months")}</label>
              <input
                type="number"
                min={0}
                max={11}
                step={1}
                value={form.experience_months}
                onChange={(e) => setForm((p) => ({ ...p, experience_months: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.source")}</label>
              <select
                value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(`candidates.form.source_${s.value}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Links & Skills */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.linksSkills")}</h2>
          {field(t("candidates.form.linkedinUrl"), "linkedin_url", "url", { placeholder: "https://linkedin.com/in/..." })}
          {field(t("candidates.form.portfolioUrl"), "portfolio_url", "url", { placeholder: "https://..." })}
          {field(t("candidates.form.skillsCommaSeparated"), "skills", "text", { placeholder: "React, TypeScript, Node.js" })}
          {field(t("candidates.form.tagsCommaSeparated"), "tags", "text", { placeholder: t("candidates.form.tagsPlaceholder") })}
        </div>

        {/* Resume (optional) */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("candidates.form.resume")} <span className="text-sm font-normal text-gray-400">{t("candidates.form.optional")}</span>
          </h2>
          {resumeFile ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                <FileText className="h-4 w-4 flex-shrink-0 text-purple-600" />
                <span className="truncate">{resumeFile.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setResumeFile(null)}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
                aria-label={t("candidates.form.removeResume")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-brand-400 hover:bg-gray-50">
              <Upload className="h-5 w-5" />
              <span>{t("candidates.form.clickToUpload")}</span>
              <span className="text-xs text-gray-400">{t("candidates.form.fileTypes")}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
          <p className="text-xs text-gray-400">
            {t("candidates.form.resumeHint")}
          </p>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.notes")}</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={4}
            placeholder={t("candidates.form.notesPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("candidates.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("candidates.form.addCandidate")}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPut } from "@/api/client";
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

function parseTags(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return (value as string[]).join(", ");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.join(", ");
      return value;
    } catch {
      return value;
    }
  }
  return "";
}

export function CandidateEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(INITIAL);

  const { data, isLoading } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => apiGet<Candidate>(`/candidates/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    const c = data?.data;
    if (!c) return;
    const totalYears = (c as any).experience_years != null ? Number((c as any).experience_years) : 0;
    const wholeYears = Math.floor(totalYears);
    const months = Math.round((totalYears - wholeYears) * 12);
    setForm({
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      source: c.source ?? "direct",
      linkedin_url: (c as any).linkedin_url ?? "",
      portfolio_url: (c as any).portfolio_url ?? "",
      current_company: (c as any).current_company ?? "",
      current_title: (c as any).current_title ?? "",
      experience_years: totalYears > 0 ? String(wholeYears) : "",
      experience_months: months > 0 ? String(months) : "",
      skills: parseTags((c as any).skills),
      notes: (c as any).notes ?? "",
      tags: parseTags((c as any).tags),
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, any>) => apiPut<Candidate>(`/candidates/${id}`, payload),
    onSuccess: () => {
      toast.success(t("candidates.form.updatedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate(`/candidates/${id}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || t("candidates.form.updateError"));
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="py-12 text-center text-gray-500">{t("candidates.form.notFound")}</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/candidates/${id}`)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{t("candidates.form.editTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.personalInformation")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.firstName")} *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.lastName")} *</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.email")} *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.phone")}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.professionalDetails")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.currentCompany")}</label>
              <input
                type="text"
                value={form.current_company}
                onChange={(e) => setForm((p) => ({ ...p, current_company: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.currentTitle")}</label>
              <input
                type="text"
                value={form.current_title}
                onChange={(e) => setForm((p) => ({ ...p, current_title: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.linksSkills")}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.linkedinUrl")}</label>
            <input
              type="url"
              value={form.linkedin_url}
              onChange={(e) => setForm((p) => ({ ...p, linkedin_url: e.target.value }))}
              placeholder="https://linkedin.com/in/..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.portfolioUrl")}</label>
            <input
              type="url"
              value={form.portfolio_url}
              onChange={(e) => setForm((p) => ({ ...p, portfolio_url: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.skillsCommaSeparated")}</label>
            <input
              type="text"
              value={form.skills}
              onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
              placeholder="React, TypeScript, Node.js"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("candidates.form.tagsCommaSeparated")}</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("candidates.form.notes")}</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(`/candidates/${id}`)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("candidates.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("candidates.form.saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}

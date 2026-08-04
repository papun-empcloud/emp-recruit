import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Sparkles, Plus } from "lucide-react";
import { ScreeningQuestionsEditor } from "@/components/ScreeningQuestionsEditor";
import { apiGet, apiPost, apiPut } from "@/api/client";
import type { JobPosting } from "@emp-recruit/shared";
import toast from "react-hot-toast";
import { RichTextEditor } from "@/components/RichTextEditor";
import { DateInput } from "@/components/DateInput";

// Strip HTML tags and decode a couple of common entities so we can measure the
// actual text a rich-text description contains (validation counts characters,
// not markup).
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Today's date in YYYY-MM-DD for use as <input type="date" min> — #13.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", labelKey: "jobs.form.employmentType.fullTime" },
  { value: "part_time", labelKey: "jobs.form.employmentType.partTime" },
  { value: "contract", labelKey: "jobs.form.employmentType.contract" },
  { value: "internship", labelKey: "jobs.form.employmentType.internship" },
  { value: "freelance", labelKey: "jobs.form.employmentType.freelance" },
];

const REMOTE_POLICIES = [
  { value: "onsite", labelKey: "jobs.form.remotePolicy.onsite" },
  { value: "remote", labelKey: "jobs.form.remotePolicy.remote" },
  { value: "hybrid", labelKey: "jobs.form.remotePolicy.hybrid" },
];

// Seniority is a generation-only hint (not a stored job field) used by the
// AI job-description generator.
const SENIORITY_OPTIONS = [
  { value: "intern", labelKey: "jobs.form.seniority.intern" },
  { value: "junior", labelKey: "jobs.form.seniority.junior" },
  { value: "mid", labelKey: "jobs.form.seniority.mid" },
  { value: "senior", labelKey: "jobs.form.seniority.senior" },
  { value: "lead", labelKey: "jobs.form.seniority.lead" },
  { value: "director", labelKey: "jobs.form.seniority.director" },
  { value: "vp", labelKey: "jobs.form.seniority.vp" },
  { value: "c_level", labelKey: "jobs.form.seniority.cLevel" },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function toHtmlList(items?: string[]): string {
  if (!items?.length) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

interface FormData {
  title: string;
  description: string;
  department: string;
  location: string;
  employment_type: string;
  experience_min: string;
  experience_max: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  remote_policy: string;
  is_internal: boolean;
  requirements: string;
  benefits: string;
  skills: string;
  closes_at: string;
}

const INITIAL: FormData = {
  title: "",
  description: "",
  department: "",
  location: "",
  employment_type: "full_time",
  experience_min: "",
  experience_max: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "INR",
  remote_policy: "onsite",
  is_internal: false,
  requirements: "",
  benefits: "",
  skills: "",
  closes_at: "",
};

export function JobFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(INITIAL);
  // Seniority hint for the AI generator (generation-only, not persisted).
  const [seniority, setSeniority] = useState("mid");
  // Role-appropriate skills the AI suggested; click a chip to add it to the field.
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);

  const { data: existingJob, isLoading: loadingJob } = useQuery({
    queryKey: ["job", id],
    queryFn: () => apiGet<JobPosting>(`/jobs/${id}`),
    enabled: isEdit,
  });

  // #12 — departments & locations from the EmpCloud master DB so they render
  // as dropdowns instead of free-text. If either list is empty (org hasn't
  // set any up yet) the field gracefully falls back to a plain text input.
  const { data: departmentsData } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => apiGet<{ id: number; name: string }[]>("/organizations/departments"),
  });
  const { data: locationsData } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => apiGet<{ id: number; name: string }[]>("/organizations/locations"),
  });
  const departments = useMemo(() => departmentsData?.data ?? [], [departmentsData]);
  const locations = useMemo(() => locationsData?.data ?? [], [locationsData]);
  const minCloseDate = useMemo(() => todayIso(), []);

  useEffect(() => {
    if (existingJob?.data) {
      const j = existingJob.data;
      setForm({
        title: j.title,
        description: j.description,
        department: j.department ?? "",
        location: j.location ?? "",
        employment_type: j.employment_type,
        experience_min: j.experience_min?.toString() ?? "",
        experience_max: j.experience_max?.toString() ?? "",
        salary_min: j.salary_min?.toString() ?? "",
        salary_max: j.salary_max?.toString() ?? "",
        salary_currency: j.salary_currency,
        // #30 — preserve whatever the server has stored; default only if missing
        remote_policy: (j as any).remote_policy || "onsite",
        is_internal: Boolean((j as any).is_internal),
        requirements: j.requirements ?? "",
        benefits: j.benefits ?? "",
        skills: j.skills
          ? Array.isArray(j.skills)
            ? j.skills.join(", ")
            : typeof j.skills === "string"
              ? (() => { try { const p = JSON.parse(j.skills as string); return Array.isArray(p) ? p.join(", ") : j.skills; } catch { return j.skills; } })()
              : ""
          : "",
        closes_at: j.closes_at ? j.closes_at.slice(0, 10) : "",
      });
    }
  }, [existingJob]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPost<JobPosting>("/jobs", data),
    onSuccess: (res) => {
      toast.success(t("jobs.form.createdSuccess"));
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      navigate(`/jobs/${res.data?.id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("jobs.form.createFailed");
      const details = err?.response?.data?.error?.details;
      if (details) {
        const fieldErrors = Object.entries(details)
          .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
          .join("; ");
        toast.error(`${msg} — ${fieldErrors}`);
      } else {
        toast.error(msg);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPut<JobPosting>(`/jobs/${id}`, data),
    onSuccess: () => {
      toast.success(t("jobs.form.updatedSuccess"));
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", id] });
      navigate(`/jobs/${id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("jobs.form.updateFailed");
      const details = err?.response?.data?.error?.details;
      if (details) {
        const fieldErrors = Object.entries(details)
          .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
          .join("; ");
        toast.error(`${msg} — ${fieldErrors}`);
      } else {
        toast.error(msg);
      }
    },
  });

  // AI job-description generation: fills the description/requirements/benefits
  // editors from the configured provider (falls back to a template server-side).
  const generateMutation = useMutation({
    mutationFn: async () => {
      const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
      const body: Record<string, any> = { title: form.title.trim(), seniority, skills };
      if (form.department) body.department = form.department;
      if (form.location) body.location = form.location;
      if (form.employment_type) body.employment_type = form.employment_type;
      const res = await apiPost<any>("/jobs/generate-description", body);
      return res.data;
    },
    onSuccess: (jd: any) => {
      const descHtml = `${jd?.overview ? `<p>${escapeHtml(jd.overview)}</p>` : ""}${toHtmlList(jd?.responsibilities)}`;
      const reqHtml = `${toHtmlList(jd?.requirements)}${
        jd?.nice_to_have?.length
          ? `<p><strong>${t("jobs.form.niceToHave")}</strong></p>${toHtmlList(jd.nice_to_have)}`
          : ""
      }`;
      const benHtml = toHtmlList(jd?.benefits);
      setForm((p) => ({
        ...p,
        description: descHtml || p.description,
        requirements: reqHtml || p.requirements,
        benefits: benHtml || p.benefits,
      }));
      // Only suggest skills the field doesn't already contain.
      const have = new Set(
        form.skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      );
      setSuggestedSkills(
        (Array.isArray(jd?.suggested_skills) ? jd.suggested_skills : []).filter(
          (s: string) => s && !have.has(s.toLowerCase()),
        ),
      );
      toast.success(jd?.source === "ai" ? t("jobs.form.aiGenerated") : t("jobs.form.aiGeneratedTemplate"));
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("jobs.form.aiGenerateFailed")),
  });

  function generateWithAi() {
    const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (form.title.trim().length < 2 || skills.length === 0) {
      toast.error(t("jobs.form.aiNeedsTitleSkills"));
      return;
    }
    generateMutation.mutate();
  }

  // Append a suggested skill to the comma-separated skills field (dedup), and
  // drop it from the suggestion chips.
  function addSuggestedSkill(skill: string) {
    setForm((p) => {
      const existing = p.skills.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing.some((s) => s.toLowerCase() === skill.toLowerCase())) return p;
      return { ...p, skills: [...existing, skill].join(", ") };
    });
    setSuggestedSkills((prev) => prev.filter((s) => s.toLowerCase() !== skill.toLowerCase()));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // #13 — belt-and-braces past-date guard. The date input already has
    // `min` set, but users who paste the date or use devtools shouldn't
    // be able to slip a past deadline through.
    if (form.closes_at && form.closes_at < minCloseDate) {
      toast.error(t("jobs.form.deadlinePast"));
      return;
    }

    // #14 — description min length is 10 on the server. Fail fast with a
    // human-readable message instead of surfacing a zod error. The editor
    // stores HTML, so measure the visible text rather than the markup.
    if (htmlToText(form.description).length < 10) {
      toast.error(t("jobs.form.descriptionMin"));
      return;
    }

    const numericChecks: { field: keyof FormData; labelKey: string }[] = [
      { field: "experience_min", labelKey: "jobs.form.minExperience" },
      { field: "experience_max", labelKey: "jobs.form.maxExperience" },
      { field: "salary_min", labelKey: "jobs.form.minSalary" },
      { field: "salary_max", labelKey: "jobs.form.maxSalary" },
    ];
    for (const { field: name, labelKey } of numericChecks) {
      const raw = form[name];
      if (raw === "" || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t("jobs.form.negativeError", { label: t(labelKey) }));
        return;
      }
    }

    // Min must not exceed Max for experience and salary ranges (only check when
    // both ends are provided).
    if (
      form.experience_min !== "" &&
      form.experience_max !== "" &&
      Number(form.experience_min) > Number(form.experience_max)
    ) {
      toast.error(t("jobs.form.experienceOrder"));
      return;
    }
    if (
      form.salary_min !== "" &&
      form.salary_max !== "" &&
      Number(form.salary_min) > Number(form.salary_max)
    ) {
      toast.error(t("jobs.form.salaryOrder"));
      return;
    }

    const payload: Record<string, any> = {
      title: form.title,
      description: form.description,
      employment_type: form.employment_type,
      salary_currency: form.salary_currency,
      // #30 — always persist remote_policy; previously dropped on the floor.
      remote_policy: form.remote_policy,
      is_internal: form.is_internal,
    };

    if (form.department) payload.department = form.department;
    if (form.location) payload.location = form.location;
    if (form.experience_min) payload.experience_min = Number(form.experience_min);
    if (form.experience_max) payload.experience_max = Number(form.experience_max);
    if (form.salary_min) payload.salary_min = Number(form.salary_min);
    if (form.salary_max) payload.salary_max = Number(form.salary_max);
    // Only persist requirements when it has visible text — the rich editor can
    // leave empty markup (e.g. "<br>") behind after the user clears it.
    if (htmlToText(form.requirements).length > 0) payload.requirements = form.requirements;
    if (form.benefits) payload.benefits = form.benefits;
    if (form.skills) payload.skills = form.skills.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (form.closes_at) payload.closes_at = new Date(form.closes_at).toISOString();

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  // Only string-valued fields go through this generic text-input helper
  // (is_internal is a boolean rendered as a checkbox separately).
  type StringFieldKey = {
    [K in keyof FormData]: FormData[K] extends string ? K : never;
  }[keyof FormData];

  function field(
    label: string,
    name: StringFieldKey,
    type = "text",
    opts?: { required?: boolean; placeholder?: string; min?: number; sanitize?: (v: string) => string },
  ) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {opts?.required && <span className="text-red-500">*</span>}
        </label>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => {
            const v = opts?.sanitize ? opts.sanitize(e.target.value) : e.target.value;
            setForm((p) => ({ ...p, [name]: v }));
          }}
          placeholder={opts?.placeholder}
          required={opts?.required}
          min={opts?.min}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    );
  }

  if (isEdit && loadingJob) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? t("jobs.form.editTitle") : t("jobs.form.createTitle")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("jobs.form.basicInfo")}</h2>

          {/* Sanitize the title at input time: strip < and > so HTML/script
              markup can never be entered (the server also rejects it). */}
          {field(t("jobs.form.jobTitle"), "title", "text", {
            required: true,
            placeholder: t("jobs.form.jobTitlePlaceholder"),
            sanitize: (v) => v.replace(/[<>]/g, ""),
          })}

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="job-description" className="block text-sm font-medium text-gray-700">
                {t("jobs.form.description")} <span className="text-red-500">*</span>
              </label>
              {/* Generate the description/requirements/benefits with AI, using
                  the title, chosen seniority, department, location and skills. */}
              <div className="flex items-center gap-2">
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  title={t("jobs.form.seniorityLabel")}
                >
                  {SENIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={generateWithAi}
                  disabled={generateMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("jobs.form.generateWithAi")}
                </button>
              </div>
            </div>
            {/* #14 — backend enforces min length 10; handleSubmit measures the
                editor's visible text so the user gets immediate feedback
                instead of a confusing 400. */}
            <RichTextEditor
              id="job-description"
              aria-label={t("jobs.form.descriptionAria")}
              value={form.description}
              onChange={(html) => setForm((p) => ({ ...p, description: html }))}
              placeholder={t("jobs.form.descriptionPlaceholder")}
            />
            <p className="mt-1 text-xs text-gray-400">
              {t("jobs.form.descriptionHint")}
            </p>
          </div>

          {/* #12 — Department & Location. Dropdowns when the org has
              configured entries, free-text fallback otherwise. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.department")}</label>
              {departments.length > 0 ? (
                <select
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("jobs.form.selectDepartment")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder={t("jobs.form.departmentPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.location")}</label>
              {locations.length > 0 ? (
                <select
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("jobs.form.selectLocation")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder={t("jobs.form.locationPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.employmentTypeLabel")}</label>
              <select
                value={form.employment_type}
                onChange={(e) => setForm((p) => ({ ...p, employment_type: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {EMPLOYMENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>
                    {t(et.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.remotePolicyLabel")}</label>
              <select
                value={form.remote_policy}
                onChange={(e) => setForm((p) => ({ ...p, remote_policy: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {REMOTE_POLICIES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Internal-only visibility */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={form.is_internal}
              onChange={(e) => setForm((p) => ({ ...p, is_internal: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-800">{t("jobs.form.internalOnly")}</span>
              <span className="block text-xs text-gray-500">
                {t("jobs.form.internalOnlyHint")}
              </span>
            </span>
          </label>
        </div>

        {/* Experience & Salary */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("jobs.form.experienceComp")}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(t("jobs.form.minExperienceLabel"), "experience_min", "number", { placeholder: "0", min: 0 })}
            {field(t("jobs.form.maxExperienceLabel"), "experience_max", "number", { placeholder: "10", min: 0 })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {field(t("jobs.form.minSalaryLabel"), "salary_min", "number", { placeholder: t("jobs.form.minSalaryPlaceholder"), min: 0 })}
            {field(t("jobs.form.maxSalaryLabel"), "salary_max", "number", { placeholder: t("jobs.form.maxSalaryPlaceholder"), min: 0 })}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.currency")}</label>
              <select
                value={form.salary_currency}
                onChange={(e) => setForm((p) => ({ ...p, salary_currency: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requirements & Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("jobs.form.requirementsDetails")}</h2>

          <div>
            <label htmlFor="job-requirements" className="block text-sm font-medium text-gray-700 mb-1">
              {t("jobs.form.requirements")}
            </label>
            <RichTextEditor
              id="job-requirements"
              aria-label={t("jobs.form.requirementsAria")}
              value={form.requirements}
              onChange={(html) => setForm((p) => ({ ...p, requirements: html }))}
              placeholder={t("jobs.form.requirementsPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.benefits")}</label>
            <textarea
              value={form.benefits}
              onChange={(e) => setForm((p) => ({ ...p, benefits: e.target.value }))}
              rows={3}
              placeholder={t("jobs.form.benefitsPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {field(t("jobs.form.skillsLabel"), "skills", "text", { placeholder: t("jobs.form.skillsPlaceholder") })}
          {suggestedSkills.length > 0 && (
            <div className="-mt-2">
              <p className="mb-1.5 text-xs font-medium text-gray-500">{t("jobs.form.suggestedSkills")}</p>
              <div className="flex flex-wrap gap-2">
                {suggestedSkills.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addSuggestedSkill(s)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  >
                    <Plus className="h-3 w-3" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* #13 — can't pick a deadline in the past. Enforced client-side
              via the native min attribute; backend rejects Invalid dates too. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.form.applicationDeadline")}</label>
            <DateInput
              value={form.closes_at}
              onChange={(e) => setForm((p) => ({ ...p, closes_at: e.target.value }))}
              min={minCloseDate}
              max="9999-12-31"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("jobs.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? t("jobs.form.updateJob") : t("jobs.form.saveDraft")}
          </button>
        </div>
        {!isEdit && (
          <p className="text-right text-xs text-gray-500">
            {t("jobs.form.draftHint")}
          </p>
        )}
      </form>

      {/* Screening / knockout questions — managed separately, saved on their
          own, and only available once the job exists (needs a job id). */}
      {isEdit && id && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <ScreeningQuestionsEditor jobId={id} />
        </div>
      )}
    </div>
  );
}

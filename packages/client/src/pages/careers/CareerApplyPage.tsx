import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  Upload,
  FileText,
  X,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { JobPosting } from "@emp-recruit/shared";

const PUBLIC_API = "/api/v1/public";

// Upper bounds for the optional numeric fields (BUG-10). Negatives were already
// rejected; these cap unrealistic values like 999 years / 999,999,999 salary.
const MAX_EXPERIENCE_YEARS = 50;
const MAX_EXPECTED_SALARY = 100_000_000;

export function CareerApplyPage() {
  const { t } = useTranslation();
  const { slug, jobId } = useParams<{ slug: string; jobId: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cover_letter: "",
    current_company: "",
    experience_years: "",
    experience_months: "",
    expected_salary: "",
    skills: "",
  });
  const [resume, setResume] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const jobQuery = useQuery({
    queryKey: ["public-job", slug, jobId],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}/jobs/${jobId}`);
      return data.data as JobPosting;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("first_name", form.first_name);
      formData.append("last_name", form.last_name);
      formData.append("email", form.email);
      formData.append("job_id", jobId!);
      if (form.phone) formData.append("phone", form.phone);
      if (form.cover_letter) formData.append("cover_letter", form.cover_letter);
      if (form.current_company) formData.append("current_company", form.current_company);
      // Fold months into the decimal years the API already accepts (same
      // pattern as the internal candidate forms: 2y 6m -> 2.5).
      if (form.experience_years || form.experience_months) {
        const yrs = Number(form.experience_years || 0);
        const mos = Number(form.experience_months || 0);
        formData.append("experience_years", String(Math.round((yrs + mos / 12) * 10) / 10));
      }
      if (form.expected_salary) formData.append("expected_salary", form.expected_salary);
      if (form.skills.trim()) formData.append("skills", form.skills.trim());
      if (resume) formData.append("resume", resume);

      const { data } = await axios.post(`${PUBLIC_API}/careers/${slug}/apply`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      setSubmitError(null);
      navigate(`/careers/${slug}/jobs/${jobId}/success`);
    },
    onError: (err: any) => {
      const isDuplicate = err.response?.status === 409;
      const msg =
        err.response?.data?.error?.message ||
        (isDuplicate
          ? t("careers.apply.errorDuplicate")
          : t("careers.apply.errorSubmit"));
      // Show it both as a toast and as a persistent inline banner so the
      // applicant always sees why nothing happened. (BUG-03)
      setSubmitError(msg);
      toast.error(msg);
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    // Clear a field's error as soon as the applicant edits it. (BUG-06)
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
    // Phone: reject non-numeric input as it's typed — only digits and the usual
    // phone punctuation (+ - ( ) space) are kept. (BUG-02)
    if (name === "phone") {
      setForm((prev) => ({ ...prev, phone: value.replace(/[^\d+\-()\s]/g, "") }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Red border + focus ring for fields with a validation error. (BUG-06)
  function fieldClass(field: string) {
    const base =
      "mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1";
    return errors[field]
      ? `${base} border-red-400 focus:border-red-500 focus:ring-red-500`
      : `${base} border-gray-300 focus:border-brand-500 focus:ring-brand-500`;
  }

  // Validate the resume the moment it's picked, so the applicant gets immediate
  // feedback instead of only finding out after clicking Submit. (BUG-01)
  const ALLOWED_RESUME_EXT = [".pdf", ".doc", ".docx"];
  const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10MB, matches the server limit
  function handleResumeSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same (or a corrected) file re-fires.
    e.target.value = "";
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_RESUME_EXT.includes(ext)) {
      toast.error(t("careers.apply.errorResumeType"));
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      toast.error(t("careers.apply.errorResumeSize"));
      return;
    }
    setResume(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Collect per-field errors so invalid fields are highlighted inline (BUG-06),
    // in addition to the toast messages the flow already surfaced.
    const next: Record<string, string> = {};
    const emailInvalid =
      form.email.trim() !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());
    // Phone is optional. The input filter already strips letters/symbols
    // (BUG-02), so here we only reject clearly-non-phone input: something typed
    // that contains no digits at all, or an absurdly long string. A real phone
    // number of any reasonable length must never block submission (BUG-09).
    const phoneDigits = form.phone.replace(/\D/g, "");
    const phoneInvalid =
      form.phone.trim() !== "" && (phoneDigits.length === 0 || phoneDigits.length > 20);
    const yearsNegative = form.experience_years !== "" && Number(form.experience_years) < 0;
    const yearsTooHigh =
      form.experience_years !== "" && Number(form.experience_years) > MAX_EXPERIENCE_YEARS;
    const monthsOutOfRange =
      form.experience_months !== "" &&
      (Number(form.experience_months) < 0 || Number(form.experience_months) > 11);
    const salaryNegative = form.expected_salary !== "" && Number(form.expected_salary) < 0;
    const salaryTooHigh =
      form.expected_salary !== "" && Number(form.expected_salary) > MAX_EXPECTED_SALARY;

    if (!form.first_name.trim()) next.first_name = t("careers.apply.errorFirstNameRequired");
    if (!form.last_name.trim()) next.last_name = t("careers.apply.errorLastNameRequired");
    if (!form.email.trim()) next.email = t("careers.apply.errorEmailRequired");
    else if (emailInvalid) next.email = t("careers.apply.errorEmailInvalid");
    if (phoneInvalid) next.phone = t("careers.apply.errorPhoneInvalid");
    if (yearsNegative) next.experience_years = t("careers.apply.errorYearsNegative");
    else if (yearsTooHigh)
      next.experience_years = t("careers.apply.errorYearsMax", { max: MAX_EXPERIENCE_YEARS });
    if (monthsOutOfRange) next.experience_months = t("careers.apply.errorMonthsRange");
    if (salaryNegative) next.expected_salary = t("careers.apply.errorSalaryNegative");
    else if (salaryTooHigh) next.expected_salary = t("careers.apply.errorSalaryMax");
    setErrors(next);

    // Keep the exact toast messages/priority the QA verified (CHK-01/02/03).
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.error(t("careers.apply.errorNameEmailRequired"));
      return;
    }
    if (emailInvalid) {
      toast.error(t("careers.apply.errorEmailInvalid"));
      return;
    }
    if (phoneInvalid) {
      toast.error(t("careers.apply.errorPhoneInvalid"));
      return;
    }
    if (yearsNegative) {
      toast.error(t("careers.apply.errorYearsNegative"));
      return;
    }
    if (yearsTooHigh) {
      toast.error(t("careers.apply.errorYearsMax", { max: MAX_EXPERIENCE_YEARS }));
      return;
    }
    if (monthsOutOfRange) {
      toast.error(t("careers.apply.errorMonthsRange"));
      return;
    }
    if (salaryNegative) {
      toast.error(t("careers.apply.errorSalaryNegative"));
      return;
    }
    if (salaryTooHigh) {
      toast.error(t("careers.apply.errorSalaryMax"));
      return;
    }
    setSubmitError(null);
    applyMutation.mutate();
  }

  if (jobQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const job = jobQuery.data;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          to={`/careers/${slug}/jobs/${jobId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("careers.apply.backToJob")}
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("careers.apply.title", { title: job?.title || t("careers.apply.positionFallback") })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("careers.apply.subtitle")}
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                {t("careers.apply.firstNameLabel")}
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                required
                value={form.first_name}
                onChange={handleChange}
                className={fieldClass("first_name")}
              />
              {errors.first_name && <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>}
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                {t("careers.apply.lastNameLabel")}
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                value={form.last_name}
                onChange={handleChange}
                className={fieldClass("last_name")}
              />
              {errors.last_name && <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              {t("careers.apply.emailLabel")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className={fieldClass("email")}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              {t("careers.apply.phoneLabel")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              className={fieldClass("phone")}
            />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
          </div>

          {/* Resume upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("careers.apply.resumeLabel")}</label>
            {resume ? (
              <div className="mt-1 flex items-center gap-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                <FileText className="h-5 w-5 text-brand-600" />
                <span className="flex-1 text-sm text-gray-700 truncate">{resume.name}</span>
                <button
                  type="button"
                  onClick={() => setResume(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600">
                <Upload className="h-5 w-5" />
                <span>{t("careers.apply.uploadResume")}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleResumeSelect}
                />
              </label>
            )}
          </div>

          {/* Cover letter */}
          <div>
            <label htmlFor="cover_letter" className="block text-sm font-medium text-gray-700">
              {t("careers.apply.coverLetterLabel")}
            </label>
            <textarea
              id="cover_letter"
              name="cover_letter"
              rows={4}
              value={form.cover_letter}
              onChange={handleChange}
              placeholder={t("careers.apply.coverLetterPlaceholder")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Current company */}
          <div>
            <label htmlFor="current_company" className="block text-sm font-medium text-gray-700">
              {t("careers.apply.currentCompanyLabel")}
            </label>
            <input
              id="current_company"
              name="current_company"
              type="text"
              value={form.current_company}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Experience & salary row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="experience_years" className="block text-sm font-medium text-gray-700">
                {t("careers.apply.experienceLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    id="experience_years"
                    name="experience_years"
                    type="number"
                    min="0"
                    max="50"
                    value={form.experience_years}
                    onChange={handleChange}
                    className={fieldClass("experience_years")}
                    aria-label={t("careers.apply.experienceLabel")}
                  />
                </div>
                <div>
                  <input
                    id="experience_months"
                    name="experience_months"
                    type="number"
                    min="0"
                    max="11"
                    step="1"
                    value={form.experience_months}
                    onChange={handleChange}
                    placeholder={t("careers.apply.monthsLabel")}
                    className={fieldClass("experience_months")}
                    aria-label={t("careers.apply.monthsLabel")}
                  />
                </div>
              </div>
              {errors.experience_years && (
                <p className="mt-1 text-xs text-red-600">{errors.experience_years}</p>
              )}
              {errors.experience_months && (
                <p className="mt-1 text-xs text-red-600">{errors.experience_months}</p>
              )}
            </div>
            <div>
              <label htmlFor="expected_salary" className="block text-sm font-medium text-gray-700">
                {t("careers.apply.salaryLabel")}
              </label>
              <input
                id="expected_salary"
                name="expected_salary"
                type="number"
                min="0"
                value={form.expected_salary}
                onChange={handleChange}
                className={fieldClass("expected_salary")}
              />
              {errors.expected_salary && (
                <p className="mt-1 text-xs text-red-600">{errors.expected_salary}</p>
              )}
            </div>
          </div>

          {/* Skills — feed the ATS skills match (BUG-004) */}
          <div>
            <label htmlFor="skills" className="block text-sm font-medium text-gray-700">
              {t("careers.apply.skillsLabel")}
            </label>
            <input
              id="skills"
              name="skills"
              type="text"
              maxLength={2000}
              value={form.skills}
              onChange={handleChange}
              placeholder={t("careers.apply.skillsPlaceholder")}
              className={fieldClass("skills")}
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={applyMutation.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {applyMutation.isPending ? t("careers.apply.submitting") : t("careers.apply.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}

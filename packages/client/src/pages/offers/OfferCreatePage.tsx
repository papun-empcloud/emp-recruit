import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Search, FileText, Eye } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { DateInput } from "@/components/DateInput";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { Application, PaginatedResponse } from "@emp-recruit/shared";

interface DepartmentOption { id: number; name: string }
interface OfferLetterTemplate { id: string; name: string; content_template: string; is_default: boolean }

type ApplicationRow = Application & {
  candidate_name: string;
  job_title: string;
  job_department?: string | null;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FormData {
  application_id: string;
  job_title: string;
  department: string;
  salary_amount: string;
  salary_currency: string;
  joining_date: string;
  expiry_date: string;
  benefits: string;
  notes: string;
  template_id: string;
}

const INITIAL: FormData = {
  application_id: "",
  job_title: "",
  department: "",
  salary_amount: "",
  salary_currency: "INR",
  joining_date: "",
  expiry_date: "",
  benefits: "",
  notes: "",
  template_id: "",
};

export function OfferCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedAppId = searchParams.get("application_id") || "";

  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    application_id: preselectedAppId,
  });
  const [appSearch, setAppSearch] = useState("");

  // Fetch applications for selection
  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["applications-for-offer", appSearch],
    queryFn: () =>
      apiGet<PaginatedResponse<ApplicationRow>>("/applications", {
        page: 1,
        limit: 50,
        ...(appSearch && { search: appSearch }),
      }),
  });
  const applications = appsData?.data?.data || [];

  // #23 — department dropdown from the EmpCloud master DB. Falls back to
  // free-text if the org hasn't configured any departments (or if the
  // endpoint isn't available yet on the deployed backend).
  const { data: departmentsData } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () =>
      apiGet<DepartmentOption[]>("/organizations/departments").catch(() => ({ data: [] as DepartmentOption[] })),
    retry: false,
  });
  const departments = useMemo(() => departmentsData?.data ?? [], [departmentsData]);

  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ["offer-letter-templates"],
    queryFn: () => apiGet<OfferLetterTemplate[]>("/offer-letters/templates"),
  });
  const templates = templatesData?.data ?? [];
  useEffect(() => {
    if (!form.template_id && templates.length) {
      const preferred = templates.find((template) => template.is_default) ?? templates[0];
      setForm((current) => ({ ...current, template_id: preferred.id }));
    }
  }, [templates, form.template_id]);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const previewMutation = useMutation({
    mutationFn: (content_template: string) =>
      apiPost<{ content: string }>("/offer-letters/templates/preview", { content_template }),
    onSuccess: (res) => setPreviewHtml(res.data?.content ?? ""),
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Unable to preview the offer letter"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPost<{ id: string }>("/offers", data),
    onSuccess: (res) => {
      toast.success(t("offers.form.toastCreated"));
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      navigate(`/offers/${res.data?.id || ""}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("offers.form.toastCreateFailed");
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.application_id) {
      toast.error(t("offers.form.errSelectApplication"));
      return;
    }
    if (!form.salary_amount) {
      toast.error(t("offers.form.errEnterSalary"));
      return;
    }
    const salary = Number(form.salary_amount);
    if (!Number.isFinite(salary) || salary < 0) {
      toast.error(t("offers.form.errSalaryNegative"));
      return;
    }

    const today = todayIso();
    if (form.joining_date < today) {
      toast.error(t("offers.form.errJoiningPast"));
      return;
    }
    if (form.expiry_date < today) {
      toast.error(t("offers.form.errExpiryPast"));
      return;
    }
    // Offer expiry must be on or after the joining date — the offer must not
    // lapse before the candidate is due to join. (BUG-12)
    if (form.joining_date && form.expiry_date && form.expiry_date < form.joining_date) {
      toast.error(t("offers.form.errExpiryBeforeJoining"));
      return;
    }
    if (!form.joining_date) {
      toast.error(t("offers.form.errSelectJoining"));
      return;
    }
    if (!form.expiry_date) {
      toast.error(t("offers.form.errSelectExpiry"));
      return;
    }
    if (!form.job_title) {
      toast.error(t("offers.form.errEnterJobTitle"));
      return;
    }

    // Currencies stored in their smallest unit (paise for INR, cents for
    // USD/EUR/GBP). The form asks for the major unit (rupees, dollars) so
    // multiply by 100 before sending. Zero-decimal currencies (none in our
    // current list) would skip this step.
    const payload: Record<string, any> = {
      application_id: form.application_id,
      job_title: form.job_title,
      salary_amount: Math.round(Number(form.salary_amount) * 100),
      salary_currency: form.salary_currency,
      joining_date: form.joining_date,
      expiry_date: form.expiry_date,
    };

    if (form.department) payload.department = form.department;
    if (form.benefits) payload.benefits = form.benefits;
    if (form.notes) payload.notes = form.notes;
    if (form.template_id) payload.template_id = form.template_id;

    createMutation.mutate(payload);
  }

  const saving = createMutation.isPending;
  const selectedApp = applications.find((a) => a.id === form.application_id);
  const minDate = useMemo(() => todayIso(), []);

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
        <h1 className="text-2xl font-bold text-gray-900">{t("offers.form.createOffer")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Application Selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.selectApplication")}</h2>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t("offers.form.searchCandidatePlaceholder")}
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {loadingApps ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : applications.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              {t("offers.form.noApplications")}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-gray-200 p-2">
              {applications.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      application_id: app.id,
                      // Prefill from the applied job so the offer matches the role
                      // by default (still editable).
                      job_title: p.job_title || app.job_title || "",
                      department: p.department || app.job_department || "",
                    }))
                  }
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    form.application_id === app.id
                      ? "bg-brand-50 border border-brand-200 text-brand-800"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{app.candidate_name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {t("offers.form.jobStage", { job: app.job_title, stage: app.stage })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedApp && (
            <div className="rounded-md bg-brand-50 border border-brand-200 px-3 py-2 text-sm">
              <span className="font-medium text-brand-800">{t("offers.form.selected")}</span>{" "}
              <span className="text-brand-700">{selectedApp.candidate_name}</span>
              <span className="text-brand-500"> {t("offers.form.forJob", { job: selectedApp.job_title })}</span>
            </div>
          )}
        </div>

        {/* Offer Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.offerDetails")}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("offers.form.jobTitleLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.job_title}
                onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
                placeholder={t("offers.form.jobTitlePlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.department")}</label>
              {/* #23 — dropdown when the org has entries; free-text fallback
                  so new tenants (or older deploys without /organizations/
                  departments) aren't blocked. */}
              {departments.length > 0 ? (
                <select
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("offers.form.selectDepartment")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder={t("offers.form.departmentPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.compensation")}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("offers.form.annualSalary")} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.salary_amount}
                onChange={(e) => setForm((p) => ({ ...p, salary_amount: e.target.value }))}
                placeholder={form.salary_currency === "INR" ? t("offers.form.salaryPlaceholderInr") : t("offers.form.salaryPlaceholderOther")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("offers.form.salaryUnitNote", { unit: form.salary_currency === "INR" ? t("offers.form.unitRupees") : form.salary_currency === "USD" ? t("offers.form.unitDollars") : form.salary_currency === "EUR" ? t("offers.form.unitEuros") : form.salary_currency === "GBP" ? t("offers.form.unitPounds") : form.salary_currency })}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.currency")}</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.benefits")}</label>
            <textarea
              value={form.benefits}
              onChange={(e) => setForm((p) => ({ ...p, benefits: e.target.value }))}
              rows={3}
              placeholder={t("offers.form.benefitsPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.dates")}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("offers.form.joiningDate")} <span className="text-red-500">*</span>
              </label>
              <DateInput
                required
                value={form.joining_date}
                min={minDate}
                max="9999-12-31"
                onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("offers.form.offerExpiryDate")} <span className="text-red-500">*</span>
              </label>
              <DateInput
                required
                value={form.expiry_date}
                min={form.joining_date && form.joining_date > minDate ? form.joining_date : minDate}
                max="9999-12-31"
                onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <FileText className="h-5 w-5 text-brand-600" /> Offer letter template
              </h2>
              <p className="mt-1 text-sm text-gray-500">Select the document that will be generated with this draft offer.</p>
            </div>
          </div>
          {loadingTemplates ? (
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No active offer letter template exists. You can create the offer without a letter, then configure templates from Offer Letter Templates.
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Template</label>
                <select
                  value={form.template_id}
                  onChange={(e) => { setForm((p) => ({ ...p, template_id: e.target.value })); setPreviewHtml(null); }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}{template.is_default ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!form.template_id || previewMutation.isPending}
                onClick={() => {
                  const template = templates.find((item) => item.id === form.template_id);
                  if (template) previewMutation.mutate(template.content_template);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview
              </button>
            </div>
          )}
          {previewHtml !== null && (
            <iframe
              title="Selected offer letter preview"
              sandbox=""
              srcDoc={`<!doctype html><html><head><style>body{font-family:Arial,sans-serif;color:#111827;line-height:1.6;padding:40px;max-width:800px;margin:auto}</style></head><body>${previewHtml}</body></html>`}
              className="h-[480px] w-full rounded-lg border border-gray-200 bg-white"
            />
          )}
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.additionalNotes")}</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            placeholder={t("offers.form.notesPlaceholder")}
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
            {t("offers.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("offers.form.createOffer")}
          </button>
        </div>
      </form>
    </div>
  );
}

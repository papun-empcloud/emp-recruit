import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Search } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import type { Application, PaginatedResponse } from "@emp-recruit/shared";

interface DepartmentOption { id: number; name: string }

type ApplicationRow = Application & { candidate_name: string; job_title: string };

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
};

export function OfferCreatePage() {
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

  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPost<{ id: string }>("/offers", data),
    onSuccess: (res) => {
      toast.success("Offer created successfully");
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      navigate(`/offers/${res.data?.id || ""}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || "Failed to create offer";
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
      toast.error("Please select an application");
      return;
    }
    if (!form.salary_amount) {
      toast.error("Please enter salary amount");
      return;
    }
    const salary = Number(form.salary_amount);
    if (!Number.isFinite(salary) || salary < 0) {
      toast.error("Salary amount cannot be negative");
      return;
    }

    const today = todayIso();
    if (form.joining_date < today) {
      toast.error("Joining date cannot be in the past");
      return;
    }
    if (form.expiry_date < today) {
      toast.error("Expiry date cannot be in the past");
      return;
    }
    if (form.expiry_date < form.joining_date) {
      toast.error("Expiry date cannot be before joining date");
      return;
    }
    if (!form.joining_date) {
      toast.error("Please select a joining date");
      return;
    }
    if (!form.expiry_date) {
      toast.error("Please select an offer expiry date");
      return;
    }
    if (!form.job_title) {
      toast.error("Please enter a job title");
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
        <h1 className="text-2xl font-bold text-gray-900">Create Offer</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Application Selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Select Application</h2>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by candidate name..."
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
              No applications yet. An offer is extended for a candidate's
              application to a specific job — add a candidate to a job posting
              (or wait for a public application) first.
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
                      job_title: p.job_title || app.job_title || "",
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
                      {app.job_title} - Stage: {app.stage}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedApp && (
            <div className="rounded-md bg-brand-50 border border-brand-200 px-3 py-2 text-sm">
              <span className="font-medium text-brand-800">Selected:</span>{" "}
              <span className="text-brand-700">{selectedApp.candidate_name}</span>
              <span className="text-brand-500"> for {selectedApp.job_title}</span>
            </div>
          )}
        </div>

        {/* Offer Details */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Offer Details</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Title / Designation <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.job_title}
                onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
                placeholder="e.g. Senior Software Engineer"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              {/* #23 — dropdown when the org has entries; free-text fallback
                  so new tenants (or older deploys without /organizations/
                  departments) aren't blocked. */}
              {departments.length > 0 ? (
                <select
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder="e.g. Engineering"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Compensation</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Salary <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.salary_amount}
                onChange={(e) => setForm((p) => ({ ...p, salary_amount: e.target.value }))}
                placeholder={form.salary_currency === "INR" ? "e.g. 1500000" : "e.g. 75000"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                In {form.salary_currency === "INR" ? "rupees" : form.salary_currency === "USD" ? "dollars" : form.salary_currency === "EUR" ? "euros" : form.salary_currency === "GBP" ? "pounds" : form.salary_currency}.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Benefits</label>
            <textarea
              value={form.benefits}
              onChange={(e) => setForm((p) => ({ ...p, benefits: e.target.value }))}
              rows={3}
              placeholder="List benefits and perks offered..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Dates</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Joining Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.joining_date}
                min={minDate}
                onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offer Expiry Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.expiry_date}
                min={form.joining_date || minDate}
                onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            placeholder="Any additional notes about this offer..."
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create Offer
          </button>
        </div>
      </form>
    </div>
  );
}

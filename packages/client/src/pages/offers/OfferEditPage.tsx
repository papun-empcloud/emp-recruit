// #21 — there was no edit flow for draft offers. The Edit button on
// OfferDetailPage previously linked to itself (`/offers/:id`), which did
// nothing. This page loads the offer, renders the editable fields, and
// submits via PUT /offers/:id. Only draft offers can be edited (the
// server enforces this via `updateOffer`).

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import { DateInput } from "@/components/DateInput";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { Offer } from "@emp-recruit/shared";

interface FormData {
  job_title: string;
  department: string;
  salary_amount: string;
  salary_currency: string;
  joining_date: string;
  expiry_date: string;
  benefits: string;
  notes: string;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const INITIAL: FormData = {
  job_title: "",
  department: "",
  salary_amount: "",
  salary_currency: "INR",
  joining_date: "",
  expiry_date: "",
  benefits: "",
  notes: "",
};

export function OfferEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormData>(INITIAL);

  const { data: offerData, isLoading } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => apiGet<Offer>(`/offers/${id}`),
    enabled: Boolean(id),
  });

  // Pre-fill the form once the offer loads. salary_amount is stored in
  // smallest unit (paise/cents) on the server but the form edits in major
  // units, so divide by 100.
  useEffect(() => {
    const o = offerData?.data;
    if (!o) return;
    setForm({
      job_title: o.job_title ?? "",
      department: o.department ?? "",
      salary_amount: o.salary_amount != null ? String(o.salary_amount / 100) : "",
      salary_currency: o.salary_currency ?? "INR",
      joining_date: (o.joining_date ?? "").slice(0, 10),
      expiry_date: (o.expiry_date ?? "").slice(0, 10),
      benefits: o.benefits ?? "",
      notes: o.notes ?? "",
    });
  }, [offerData]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPut<Offer>(`/offers/${id}`, data),
    onSuccess: () => {
      toast.success(t("offers.form.toastUpdated"));
      queryClient.invalidateQueries({ queryKey: ["offer", id] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      navigate(`/offers/${id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("offers.form.toastUpdateFailed");
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.salary_amount) {
      const salary = Number(form.salary_amount);
      if (!Number.isFinite(salary) || salary < 0) {
        toast.error(t("offers.form.errSalaryNegativeShort"));
        return;
      }
    }
    const today = todayIso();
    if (form.joining_date && form.joining_date < today) {
      toast.error(t("offers.form.errJoiningPast"));
      return;
    }
    if (form.expiry_date && form.expiry_date < today) {
      toast.error(t("offers.form.errExpiryPast"));
      return;
    }
    // Expiry (accept-by deadline) must be on or before the joining date.
    if (form.joining_date && form.expiry_date && form.expiry_date > form.joining_date) {
      toast.error(t("offers.form.errExpiryAfterJoining"));
      return;
    }
    const payload: Record<string, any> = {
      job_title: form.job_title,
      salary_currency: form.salary_currency,
    };
    if (form.department) payload.department = form.department;
    if (form.salary_amount) payload.salary_amount = Math.round(Number(form.salary_amount) * 100);
    if (form.joining_date) payload.joining_date = form.joining_date;
    if (form.expiry_date) payload.expiry_date = form.expiry_date;
    if (form.benefits) payload.benefits = form.benefits;
    if (form.notes) payload.notes = form.notes;
    updateMutation.mutate(payload);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const minDate = useMemo(() => todayIso(), []);
  const offer = offerData?.data;
  if (!offer) {
    return (
      <div className="py-12 text-center text-gray-500">{t("offers.form.offerNotFound")}</div>
    );
  }

  if (offer.status !== "draft") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <button
          onClick={() => navigate(`/offers/${id}`)}
          className="inline-flex items-center gap-2 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" /> {t("offers.form.back")}
        </button>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          {t("offers.form.onlyDraftEditable")}
          <strong className="mx-1">{offer.status.replace("_", " ")}</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/offers/${id}`)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{t("offers.form.editTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("offers.form.offerDetails")}</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.jobTitleShort")} *</label>
            <input
              type="text"
              required
              value={form.job_title}
              onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.department")}</label>
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.annualSalary")} *</label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.salary_amount}
                onChange={(e) => setForm((p) => ({ ...p, salary_amount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.joiningDate")} *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.expiryDate")} *</label>
              <DateInput
                required
                value={form.expiry_date}
                min={minDate}
                max={form.joining_date || "9999-12-31"}
                onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.benefits")}</label>
            <textarea
              value={form.benefits}
              onChange={(e) => setForm((p) => ({ ...p, benefits: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("offers.form.notes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(`/offers/${id}`)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("offers.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("offers.form.saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}

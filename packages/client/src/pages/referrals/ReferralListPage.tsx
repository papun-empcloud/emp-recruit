import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Gift, Plus, X, Pencil, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api, apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { getUser } from "@/lib/auth-store";
import toast from "react-hot-toast";
import type { JobPosting, PaginatedResponse } from "@emp-recruit/shared";

const ADMIN_ROLES = ["super_admin", "org_admin", "hr_admin", "hr_manager"];

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
  { value: "bonus_eligible", label: "Bonus Eligible" },
  { value: "bonus_paid", label: "Bonus Paid" },
];

interface ReferralRow {
  id: string;
  job_id: string;
  referrer_id: number;
  candidate_id: string;
  application_id: string | null;
  status: string;
  relationship: string | null;
  notes: string | null;
  bonus_amount: number | null;
  bonus_paid_at: string | null;
  created_at: string;
  candidate_name: string;
  job_title: string;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  bonus_eligible: "bg-purple-100 text-purple-700",
  bonus_paid: "bg-emerald-100 text-emerald-700",
};

export function ReferralListPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRef, setEditingRef] = useState<ReferralRow | null>(null);
  const [editForm, setEditForm] = useState({ status: "", bonus_amount: "" });
  const user = getUser();
  const isAdmin = ADMIN_ROLES.includes((user?.role as string) || "");

  // List controls: search (candidate/job), status filter, pagination.
  const [listPage, setListPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [listSearchInput, setListSearchInput] = useState("");
  const [listSearch, setListSearch] = useState("");
  const perPage = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setListSearch(listSearchInput.trim());
      setListPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [listSearchInput]);

  const [form, setForm] = useState({
    job_id: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    relationship: "",
    notes: "",
  });
  // Pick from existing candidates so referrers don't have to retype
  // information already on file. Selected candidate's name/email/phone
  // auto-fill the form below.
  const [candidateSearch, setCandidateSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(candidateSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [candidateSearch]);

  const candidatesQuery = useQuery({
    queryKey: ["candidates-for-referral", debouncedSearch],
    queryFn: () =>
      apiGet<PaginatedResponse<{ id: string; first_name: string; last_name: string; email: string; phone: string | null }>>(
        "/candidates",
        { perPage: 10, search: debouncedSearch },
      ),
    // Only search when the user has actually typed something — otherwise an
    // empty term returns every candidate and the dropdown reopens after a pick.
    enabled: showForm && debouncedSearch.length > 0,
  });
  // Gate on an active search term so a stale cached result (or an empty-term
  // "all candidates" fetch) can't keep the dropdown open after a pick.
  const candidateOptions = debouncedSearch.length > 0 ? candidatesQuery.data?.data?.data ?? [] : [];

  // Fetch open jobs for the dropdown
  const jobsQuery = useQuery({
    queryKey: ["jobs-for-referral"],
    queryFn: async () => {
      const res = await apiGet<PaginatedResponse<JobPosting>>("/jobs", { status: "open", limit: 100 });
      return res.data?.data || [];
    },
  });
  const openJobs: JobPosting[] = jobsQuery.data || [];

  const referralsQuery = useQuery({
    queryKey: ["referrals", listPage, statusFilter, listSearch],
    queryFn: async () => {
      const params: Record<string, any> = { page: listPage, limit: perPage };
      if (statusFilter) params.status = statusFilter;
      if (listSearch) params.search = listSearch;
      const res = await apiGet<any>("/referrals", params);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const submitMutation = useMutation({
    mutationFn: (data: typeof form) => apiPost("/referrals", data),
    onSuccess: () => {
      toast.success("Referral submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setShowForm(false);
      setForm({ job_id: "", first_name: "", last_name: "", email: "", phone: "", relationship: "", notes: "" });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to submit referral");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: string; bonus_amount?: number }) =>
      api.patch(`/referrals/${payload.id}/status`, {
        status: payload.status,
        ...(payload.bonus_amount !== undefined ? { bonus_amount: payload.bonus_amount } : {}),
      }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Referral updated");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setEditingRef(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || "Failed to update referral");
    },
  });

  function openEdit(r: ReferralRow) {
    setEditingRef(r);
    setEditForm({
      status: r.status,
      bonus_amount: r.bonus_amount != null ? String(r.bonus_amount / 100) : "",
    });
  }

  function submitEdit() {
    if (!editingRef) return;
    if (!editForm.status) {
      toast.error("Pick a status");
      return;
    }
    const payload: { id: string; status: string; bonus_amount?: number } = {
      id: editingRef.id,
      status: editForm.status,
    };
    if (editForm.bonus_amount) {
      const amount = Number(editForm.bonus_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error("Bonus amount cannot be negative");
        return;
      }
      payload.bonus_amount = Math.round(amount * 100);
    }
    updateStatusMutation.mutate(payload);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.job_id) {
      toast.error("Please select a job position");
      return;
    }
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("Please enter the candidate's full name");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Please enter the candidate's email");
      return;
    }
    submitMutation.mutate(form);
  }

  const referrals: ReferralRow[] = referralsQuery.data?.data || [];
  const refTotal: number = referralsQuery.data?.total ?? 0;
  const refTotalPages: number = referralsQuery.data?.totalPages ?? 1;
  const filtersActive = Boolean(statusFilter || listSearch);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
          <p className="mt-1 text-sm text-gray-500">Track employee referrals and bonus eligibility.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Refer Someone"}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Submit a Referral</h3>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="block text-sm font-medium text-gray-700">Pick from existing candidates</label>
            <input
              type="text"
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {candidateOptions.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {candidateOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setForm((p) => ({
                        ...p,
                        first_name: c.first_name,
                        last_name: c.last_name,
                        email: c.email,
                        phone: c.phone || p.phone,
                      }));
                      // Clear both so the dropdown closes immediately (and the
                      // debounced effect doesn't briefly re-open it).
                      setCandidateSearch("");
                      setDebouncedSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-brand-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">{c.email}</p>
                    </div>
                    <span className="text-xs text-brand-600">Use</span>
                  </button>
                ))}
              </div>
            )}
            {debouncedSearch && candidateOptions.length === 0 && !candidatesQuery.isLoading && (
              <p className="mt-2 text-xs text-gray-500">No matching candidates. Fill the form below to refer a new person.</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Job Position *</label>
              <select
                required
                value={form.job_id}
                onChange={(e) => setForm((p) => ({ ...p, job_id: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select a job position...</option>
                {jobsQuery.isLoading ? (
                  <option disabled>Loading jobs...</option>
                ) : openJobs.length === 0 ? (
                  <option disabled>No open positions available</option>
                ) : (
                  openJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}{job.department ? ` — ${job.department}` : ""}{job.location ? ` (${job.location})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name *</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Relationship</label>
              <input
                type="text"
                value={form.relationship}
                onChange={(e) => setForm((p) => ({ ...p, relationship: e.target.value }))}
                placeholder="e.g. Former colleague"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Referral"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List controls: search + status filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={listSearchInput}
              onChange={(e) => setListSearchInput(e.target.value)}
              placeholder="Search candidate, email or job…"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setListPage(1);
            }}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              onClick={() => {
                setStatusFilter("");
                setListSearchInput("");
                setListSearch("");
                setListPage(1);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {refTotal} referral{refTotal !== 1 ? "s" : ""}
          {filtersActive ? " match your filters" : ""}
        </p>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {referralsQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              {filtersActive
                ? "No referrals match your filters."
                : "No referrals yet. Refer someone to get started!"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Referred Candidate</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Job Applied For</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Bonus Amount</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ref.candidate_name}</td>
                    <td className="px-4 py-3 text-gray-700">{ref.job_title}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ref.status] || "bg-gray-100 text-gray-700"}`}
                      >
                        {ref.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {ref.bonus_amount ? `INR ${(ref.bonus_amount / 100).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(ref.created_at)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(ref)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Update status / bonus"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {refTotalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setListPage((p) => Math.max(1, p - 1))}
            disabled={listPage <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {listPage} of {refTotalPages}
          </span>
          <button
            onClick={() => setListPage((p) => Math.min(refTotalPages, p + 1))}
            disabled={listPage >= refTotalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {editingRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Update Referral</h3>
              <button
                onClick={() => setEditingRef(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">{editingRef.candidate_name}</span>
                <span className="text-gray-400"> for {editingRef.job_title}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Bonus Amount (INR)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.bonus_amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, bonus_amount: e.target.value }))}
                  placeholder="e.g. 25000"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Leave blank to keep current amount. Stored as paise; entered value is multiplied by 100.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-xl">
              <button
                type="button"
                onClick={() => setEditingRef(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={updateStatusMutation.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {updateStatusMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

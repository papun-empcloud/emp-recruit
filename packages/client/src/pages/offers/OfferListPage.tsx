import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  AlertCircle,
  Search,
} from "lucide-react";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { Offer } from "@emp-recruit/shared";

type EnrichedOffer = Offer & { candidate_name: string; job_title_display: string };

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending Approval", value: "pending_approval" },
  { label: "Approved", value: "approved" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
  { label: "Revoked", value: "revoked" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700", icon: FileText },
  pending_approval: { label: "Pending Approval", className: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-700", icon: Send },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
  declined: { label: "Declined", className: "bg-red-100 text-red-700", icon: XCircle },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500", icon: AlertCircle },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-600", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const OFFER_COLUMNS: ExportColumn<EnrichedOffer>[] = [
  { header: "Candidate", value: (o) => o.candidate_name },
  { header: "Job", value: (o) => o.job_title_display },
  { header: "Department", value: (o) => (o as any).department ?? "" },
  {
    header: "Salary",
    value: (o) => (o.salary_amount != null ? formatCurrency(o.salary_amount, o.salary_currency) : ""),
  },
  { header: "Status", value: (o) => o.status },
  { header: "Created", value: (o) => (o.created_at ? formatDate(o.created_at) : "") },
];

export function OfferListPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box and reset to page 1 when the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { rows: offers, total, isLoading } = usePaginatedList<EnrichedOffer>(
    ["offers"],
    "/offers",
    { status: activeTab !== "all" ? activeTab : "", search },
    page,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage offer letters and approvals</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            baseName="offers"
            title="Offers"
            subtitle={`${total} offer${total !== 1 ? "s" : ""}${activeTab !== "all" ? ` (${activeTab.replace("_", " ")})` : ""}`}
            columns={OFFER_COLUMNS}
            fetchRows={() =>
              fetchAllRows<EnrichedOffer>("/offers", {
                status: activeTab !== "all" ? activeTab : "",
                search,
              })
            }
          />
          <Link
            to="/offers/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Offer
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by candidate or job title..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Status Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Offer status tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setPage(1); }}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : offers.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
          <FileText className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">No offers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {search
              ? "No offers match your search."
              : activeTab === "all"
                ? "Create your first offer to get started."
                : `No ${activeTab.replace("_", " ")} offers.`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Candidate</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Job / Designation</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Salary</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {offers.map((offer) => (
                <tr key={offer.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link to={`/offers/${offer.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                      {offer.candidate_name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    <div>{offer.job_title_display}</div>
                    {offer.department && (
                      <div className="text-xs text-gray-400">{offer.department}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {formatCurrency(offer.salary_amount, offer.salary_currency)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <StatusBadge status={offer.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(offer.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-gray-200 bg-white px-6 py-3">
            <Pagination
              page={page}
              perPage={DEFAULT_PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

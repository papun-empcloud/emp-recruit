import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Search, Users, ChevronRight, Mail, Building2, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { Candidate } from "@emp-recruit/shared";
import { formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";

const CANDIDATE_COLUMNS: ExportColumn<Candidate>[] = [
  { header: "First Name", value: (c) => c.first_name },
  { header: "Last Name", value: (c) => c.last_name },
  { header: "Email", value: (c) => c.email },
  { header: "Phone", value: (c) => c.phone },
  { header: "Current Company", value: (c) => c.current_company },
  { header: "Current Title", value: (c) => c.current_title },
  { header: "Experience (yrs)", value: (c) => c.experience_years },
  { header: "Source", value: (c) => c.source },
  { header: "Added", value: (c) => (c.created_at ? formatDate(c.created_at) : "") },
];

const SOURCE_BADGE: Record<string, string> = {
  direct: "bg-gray-100 text-gray-700",
  referral: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700",
  indeed: "bg-indigo-100 text-indigo-700",
  naukri: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-700",
};

export function CandidateListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const searchTerm = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(searchTerm);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  // Debounce the search box into the URL; changing the term resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== searchTerm) setFilter("search", searchInput.trim());
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { rows: candidates, total, isLoading } = usePaginatedList<Candidate>(
    ["candidates"],
    "/candidates",
    { search: searchTerm },
    page,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("candidates.list.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("candidates.list.subtitle", { count: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            baseName="candidates"
            title={t("candidates.list.title")}
            subtitle={t("candidates.list.subtitle", { count: total })}
            columns={CANDIDATE_COLUMNS}
            fetchRows={() => fetchAllRows<Candidate>("/candidates", { search: searchTerm })}
          />
          <Link
            to="/candidates/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("candidates.list.addCandidate")}
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("candidates.list.searchPlaceholder")}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">{t("candidates.list.emptyTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("candidates.list.emptyDescription")}</p>
          <Link
            to="/candidates/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            {t("candidates.list.addCandidate")}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colName")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colEmail")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colCurrentCompany")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colExperience")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colSource")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("candidates.list.colAdded")}
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/candidates/${c.id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <Link
                      to={`/candidates/${c.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {c.first_name} {c.last_name}
                    </Link>
                    {c.current_title && (
                      <p className="text-xs text-gray-500 mt-0.5">{c.current_title}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {c.email}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {c.current_company ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {c.current_company}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {c.experience_years != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {t("candidates.list.years", { count: Number(c.experience_years) })}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${SOURCE_BADGE[c.source] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {enumLabel(t, "source", c.source)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(c.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/candidates/${c.id}`} className="text-gray-400 hover:text-gray-600">
                      <ChevronRight className="h-5 w-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && candidates.length > 0 && (
        <Pagination
          page={page}
          perPage={DEFAULT_PAGE_SIZE}
          total={total}
          onPageChange={(p) => setFilter("page", String(p))}
        />
      )}
    </div>
  );
}

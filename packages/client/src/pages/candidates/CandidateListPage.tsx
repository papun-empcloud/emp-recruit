import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Search, Users, ChevronRight, Mail, Building2, Clock } from "lucide-react";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import type { Candidate } from "@emp-recruit/shared";
import { formatDate } from "@/lib/utils";

const SOURCE_BADGE: Record<string, string> = {
  direct: "bg-gray-100 text-gray-700",
  referral: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700",
  indeed: "bg-indigo-100 text-indigo-700",
  naukri: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-700",
};

export function CandidateListPage() {
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
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} candidate{total !== 1 ? "s" : ""} in your talent pool
          </p>
        </div>
        <Link
          to="/candidates/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name, email, or company..."
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
          <p className="mt-2 text-sm font-medium text-gray-900">No candidates found</p>
          <p className="mt-1 text-sm text-gray-500">Add candidates manually or they will appear when they apply.</p>
          <Link
            to="/candidates/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Current Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Experience
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Added
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
                    {c.experience_years !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {c.experience_years} yr{c.experience_years !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${SOURCE_BADGE[c.source] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {c.source}
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

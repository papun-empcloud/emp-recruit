import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  Brain,
  Loader2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Zap,
  Target,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { cn, formatDate } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import type { PaginatedResponse } from "@emp-recruit/shared";

interface ScoredApplication {
  id: string;
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  overall_score: number;
  skills_score: number;
  experience_score: number;
  recommendation: string;
  scored_at: string;
}

interface JobOption {
  id: string;
  title: string;
  status: string;
  application_count: number;
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_match: "bg-green-100 text-green-800",
  good_match: "bg-blue-100 text-blue-800",
  partial_match: "bg-yellow-100 text-yellow-800",
  weak_match: "bg-red-100 text-red-800",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_match: "scoring.recommendation.strongMatch",
  good_match: "scoring.recommendation.goodMatch",
  partial_match: "scoring.recommendation.partialMatch",
  weak_match: "scoring.recommendation.weakMatch",
};

export function ScoringPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedJobId, setSelectedJobId] = useState<string>(searchParams.get("job") || "");
  const queryClient = useQueryClient();

  useEffect(() => {
    const current = searchParams.get("job") || "";
    if (current !== selectedJobId) {
      const next = new URLSearchParams(searchParams);
      if (selectedJobId) next.set("job", selectedJobId);
      else next.delete("job");
      setSearchParams(next, { replace: true });
    }
  }, [selectedJobId, searchParams, setSearchParams]);

  // Fetch jobs, then show only PUBLISHED ones (any status except draft) —
  // internal OR public/external. Draft postings aren't scored.
  const { data: jobsData } = useQuery({
    queryKey: ["scoring-jobs"],
    queryFn: () => apiGet<PaginatedResponse<JobOption>>("/jobs", { limit: 100 }),
  });

  const jobs = (jobsData?.data?.data ?? []).filter((j) => j.status !== "draft");

  // Searchable "Select a Job" combobox — filter the (potentially long) job list
  // by typing instead of scrolling a native <select>.
  const [jobQuery, setJobQuery] = useState("");
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const jobSelectRef = useRef<HTMLDivElement>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const filteredJobs = jobs.filter((j) =>
    j.title.toLowerCase().includes(jobQuery.trim().toLowerCase()),
  );

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!jobDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (jobSelectRef.current && !jobSelectRef.current.contains(e.target as Node)) {
        setJobDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [jobDropdownOpen]);

  // Fetch ranked scores for the selected job (server-side paginated). Reset to
  // page 1 whenever the selected job changes.
  const [rankPage, setRankPage] = useState(1);
  useEffect(() => {
    setRankPage(1);
  }, [selectedJobId]);

  const {
    rows: rankings,
    total: rankTotal,
    isLoading: loadingRankings,
  } = usePaginatedList<ScoredApplication>(
    ["scoring-rankings", selectedJobId],
    `/scoring/jobs/${selectedJobId}/rankings`,
    {},
    rankPage,
    DEFAULT_PAGE_SIZE,
    { enabled: Boolean(selectedJobId) },
  );

  // Batch score mutation
  const batchScoreMutation = useMutation({
    mutationFn: () =>
      apiPost<{ scored: number; total: number; skipped: number }>(
        `/scoring/jobs/${selectedJobId}/batch-score`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoring-rankings", selectedJobId] });
    },
  });
  const batchResult = batchScoreMutation.data?.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("scoring.list.title")}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t("scoring.list.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Job Selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("scoring.list.selectJobLabel")}
            </label>
            <div className="relative" ref={jobSelectRef}>
              <button
                type="button"
                onClick={() => setJobDropdownOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <span className={`truncate ${selectedJob ? "text-gray-900" : "text-gray-400"}`}>
                  {selectedJob
                    ? `${selectedJob.title}${selectedJob.status && selectedJob.status !== "open" ? ` (${enumLabel(t, "jobStatus", selectedJob.status)})` : ""}`
                    : t("scoring.list.chooseJob")}
                </span>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
              </button>

              {jobDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="relative border-b border-gray-100 p-2">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      autoFocus
                      value={jobQuery}
                      onChange={(e) => setJobQuery(e.target.value)}
                      placeholder={t("scoring.list.searchJobs")}
                      className="w-full rounded-md border border-gray-200 py-1.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <ul className="max-h-60 overflow-auto py-1">
                    {filteredJobs.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">{t("scoring.list.noJobsMatch")}</li>
                    ) : (
                      filteredJobs.map((job) => (
                        <li key={job.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedJobId(job.id);
                              setJobDropdownOpen(false);
                              setJobQuery("");
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                              job.id === selectedJobId ? "bg-brand-50 text-brand-700" : "text-gray-700"
                            }`}
                          >
                            <span className="truncate">{job.title}</span>
                            {job.status && job.status !== "open" && (
                              <span className="ml-2 flex-shrink-0 text-xs capitalize text-gray-400">
                                {enumLabel(t, "jobStatus", job.status)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {selectedJobId && (
            <button
              onClick={() => batchScoreMutation.mutate()}
              disabled={batchScoreMutation.isPending}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {batchScoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {t("scoring.list.scoreAll")}
            </button>
          )}
        </div>

        {batchScoreMutation.isSuccess && batchResult && (
          <p
            className={`mt-3 text-sm ${
              batchResult.scored > 0 ? "text-green-600" : "text-amber-600"
            }`}
          >
            {batchResult.total === 0
              ? t("scoring.list.batchNoApplications")
              : batchResult.scored === 0
                ? t("scoring.list.batchNoResumes", { count: batchResult.total })
                : t("scoring.list.batchScored", {
                    scored: batchResult.scored,
                    count: batchResult.total,
                    skipped:
                      batchResult.skipped > 0
                        ? t("scoring.list.batchSkippedFragment", { skipped: batchResult.skipped })
                        : "",
                  })}
          </p>
        )}
        {batchScoreMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {t("scoring.list.scoringFailed")}
          </p>
        )}
      </div>

      {/* Results */}
      {!selectedJobId && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            {t("scoring.list.selectJobPrompt")}
          </p>
        </div>
      )}

      {selectedJobId && loadingRankings && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      )}

      {selectedJobId && !loadingRankings && rankings.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Brain className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            {t("scoring.list.noScoredCandidates")}
          </p>
        </div>
      )}

      {rankings.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnRank")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnCandidate")}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnOverall")}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnSkills")}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnExperience")}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnRecommendation")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("scoring.list.columnActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rankings.map((r, idx) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                      {(rankPage - 1) * DEFAULT_PAGE_SIZE + idx + 1}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {r.candidate_name || t("scoring.list.candidateFallback", { id: r.candidate_id })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t("scoring.list.scoredDate", { date: formatDate(r.scored_at) })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <ScoreBadge score={r.overall_score} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <span className="text-sm font-medium text-gray-700">
                      {r.skills_score}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <span className="text-sm font-medium text-gray-700">
                      {r.experience_score}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        RECOMMENDATION_COLORS[r.recommendation] ??
                          "bg-gray-100 text-gray-800",
                      )}
                    >
                      {RECOMMENDATION_LABELS[r.recommendation]
                        ? t(RECOMMENDATION_LABELS[r.recommendation]!)
                        : r.recommendation}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <Link
                      to={`/scoring/${r.application_id}`}
                      className="text-sm font-medium text-purple-600 hover:text-purple-800"
                    >
                      {t("scoring.list.viewReport")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination
            page={rankPage}
            perPage={DEFAULT_PAGE_SIZE}
            total={rankTotal}
            onPageChange={setRankPage}
          />
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800"
      : score >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold",
        color,
      )}
    >
      {score}
    </span>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Brain,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Zap,
  Target,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
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
  strong_match: "Strong Match",
  good_match: "Good Match",
  partial_match: "Partial Match",
  weak_match: "Weak Match",
};

export function ScoringPage() {
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

  // Fetch ranked scores for the selected job
  const { data: rankingsData, isLoading: loadingRankings } = useQuery({
    queryKey: ["scoring-rankings", selectedJobId],
    queryFn: () =>
      apiGet<ScoredApplication[]>(`/scoring/jobs/${selectedJobId}/rankings`),
    enabled: Boolean(selectedJobId),
  });

  const rankings = rankingsData?.data ?? [];

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
              AI Resume Scoring
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Score and rank candidates using AI-powered resume analysis.
            </p>
          </div>
        </div>
      </div>

      {/* Job Selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select a Job
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Choose a job posting...</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.status && job.status !== "open" ? ` (${job.status})` : ""}
                </option>
              ))}
            </select>
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
              Score All Candidates
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
              ? "No applications to score for this job yet."
              : batchResult.scored === 0
                ? `No candidates could be scored — none of the ${batchResult.total} applicant${
                    batchResult.total === 1 ? "" : "s"
                  } has a resume on file. Upload resumes to enable AI scoring.`
                : `Scored ${batchResult.scored} of ${batchResult.total} applicant${
                    batchResult.total === 1 ? "" : "s"
                  }${
                    batchResult.skipped > 0
                      ? ` (${batchResult.skipped} skipped — no resume on file)`
                      : ""
                  }. Rankings updated below.`}
          </p>
        )}
        {batchScoreMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Scoring failed. Please try again.
          </p>
        )}
      </div>

      {/* Results */}
      {!selectedJobId && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            Select a job posting above to view AI scores and candidate rankings.
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
            No scored candidates yet. Click "Score All Candidates" to run AI
            scoring.
          </p>
        </div>
      )}

      {rankings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Candidate
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Overall
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Skills
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Experience
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Recommendation
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rankings.map((r, idx) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                      {idx + 1}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {r.candidate_name || `Candidate #${r.candidate_id}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Scored {formatDate(r.scored_at)}
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
                      {RECOMMENDATION_LABELS[r.recommendation] ??
                        r.recommendation}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <Link
                      to={`/scoring/${r.application_id}`}
                      className="text-sm font-medium text-purple-600 hover:text-purple-800"
                    >
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

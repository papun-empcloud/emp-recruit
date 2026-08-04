import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Users,
  Star,
  Brain,
  Briefcase,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiPost, apiPatch } from "@/api/client";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/enums";
import toast from "react-hot-toast";

interface InterviewSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  overall_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  cultural_fit_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  weaknesses: string | null;
}

interface ComparisonCandidate {
  application_id: string;
  candidate_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_title: string | null;
  experience_years: number | null;
  skills: string[] | null;
  stage: string;
  rating: number | null;
  applied_at: string;
  job_title: string;
  overall_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  recommendation: string | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  interviews: InterviewSummary[];
}

function bestValue(candidates: ComparisonCandidate[], getValue: (c: ComparisonCandidate) => number | null): number | null {
  const values = candidates.map(getValue).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function ScoreCell({ value, best }: { value: number | null; best: number | null }) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-gray-400">--</span>;
  const isBest = best !== null && value === best;
  return (
    <span className={cn("text-sm font-semibold", isBest ? "text-green-700" : "text-gray-700")}>
      {value}
      {isBest && <span className="ml-1 text-xs text-green-500">{t("candidates.compare.best")}</span>}
    </span>
  );
}

const RECOMMENDATION_BADGE: Record<string, { label: string; className: string }> = {
  strong_match: { label: "Strong Match", className: "bg-green-100 text-green-800" },
  good_match: { label: "Good Match", className: "bg-blue-100 text-blue-800" },
  partial_match: { label: "Partial Match", className: "bg-yellow-100 text-yellow-800" },
  weak_match: { label: "Weak Match", className: "bg-red-100 text-red-800" },
  strong_yes: { label: "Strong Yes", className: "bg-green-100 text-green-800" },
  yes: { label: "Yes", className: "bg-blue-100 text-blue-800" },
  maybe: { label: "Maybe", className: "bg-yellow-100 text-yellow-800" },
  no: { label: "No", className: "bg-red-100 text-red-800" },
};

export function ComparisonPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const appIds = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare-candidates", appIds.join(",")],
    queryFn: async () => {
      const res = await apiPost<ComparisonCandidate[]>("/applications/compare", { applicationIds: appIds });
      return res.data || [];
    },
    enabled: appIds.length >= 2,
  });

  const moveStage = useMutation({
    mutationFn: ({ appId, stage }: { appId: string; stage: string }) =>
      apiPatch(`/applications/${appId}/stage`, { stage }),
    onSuccess: () => {
      toast.success(t("candidates.compare.stageUpdated"));
      queryClient.invalidateQueries({ queryKey: ["compare-candidates"] });
    },
    onError: () => toast.error(t("candidates.compare.stageUpdateFailed")),
  });

  const candidates = data || [];

  if (appIds.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Users className="h-12 w-12 text-gray-300" />
        <h2 className="mt-4 text-lg font-semibold text-gray-900">{t("candidates.compare.selectTitle")}</h2>
        <p className="mt-2 text-sm text-gray-500">
          {t("candidates.compare.selectDescription")}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <XCircle className="h-12 w-12 text-red-300" />
        <h2 className="mt-4 text-lg font-semibold text-gray-900">{t("candidates.compare.loadFailed")}</h2>
        <Link to="/jobs" className="mt-2 text-sm text-brand-600 hover:underline">{t("candidates.compare.backToJobs")}</Link>
      </div>
    );
  }

  const bestOverall = bestValue(candidates, (c) => c.overall_score);
  const bestSkills = bestValue(candidates, (c) => c.skills_score);
  const bestExperience = bestValue(candidates, (c) => c.experience_score);
  const bestExpYears = bestValue(candidates, (c) => c.experience_years);
  const bestInterviewScore = bestValue(candidates, (c) => {
    const scores = c.interviews.map((i) => i.overall_score).filter((s): s is number => s !== null);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.history.back()}
          className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("candidates.compare.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("candidates.compare.comparingSubtitle", {
              count: candidates.length,
              jobTitle: candidates[0]?.job_title,
            })}
          </p>
        </div>
      </div>

      {/* Side-by-side Cards */}
      <div className={cn("grid gap-6", candidates.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {candidates.map((c) => {
          const avgInterviewScore = (() => {
            const scores = c.interviews.map((i) => i.overall_score).filter((s): s is number => s !== null);
            return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          })();

          return (
            <div key={c.application_id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Candidate Header */}
              <div className="bg-gray-50 border-b border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {c.first_name} {c.last_name}
                </h3>
                <p className="text-sm text-gray-500">{c.email}</p>
                {c.current_title && c.current_company && (
                  <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {c.current_title} {t("common.at")} {c.current_company}
                  </p>
                )}
                <span className={cn(
                  "mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                  c.stage === "hired" ? "bg-green-100 text-green-700" :
                  c.stage === "rejected" ? "bg-red-100 text-red-700" :
                  "bg-blue-100 text-blue-700"
                )}>
                  {enumLabel(t, "stage", c.stage)}
                </span>
              </div>

              <div className="p-4 space-y-4">
                {/* Experience */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500">{t("candidates.compare.experience")}</h4>
                  <p className="mt-1">
                    <ScoreCell
                      value={c.experience_years}
                      best={bestExpYears}
                    />
                    <span className="ml-1 text-xs text-gray-500">{t("candidates.compare.years")}</span>
                  </p>
                </div>

                {/* Skills */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500">{t("candidates.compare.skills")}</h4>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(c.skills || []).slice(0, 8).map((skill) => {
                      const isMatched = c.matched_skills?.includes(skill);
                      return (
                        <span
                          key={skill}
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs",
                            isMatched ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {skill}
                        </span>
                      );
                    })}
                    {(c.skills?.length || 0) > 8 && (
                      <span className="text-xs text-gray-400">{t("candidates.compare.moreSkills", { count: (c.skills?.length || 0) - 8 })}</span>
                    )}
                  </div>
                </div>

                {/* AI Scores */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
                    <Brain className="h-3 w-3" /> {t("candidates.compare.aiScores")}
                  </h4>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">{t("candidates.compare.overall")}</span>
                      <ScoreCell value={c.overall_score} best={bestOverall} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">{t("candidates.compare.skills")}</span>
                      <ScoreCell value={c.skills_score} best={bestSkills} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">{t("candidates.compare.experience")}</span>
                      <ScoreCell value={c.experience_score} best={bestExperience} />
                    </div>
                  </div>
                  {c.recommendation && RECOMMENDATION_BADGE[c.recommendation] && (
                    <span className={cn(
                      "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      RECOMMENDATION_BADGE[c.recommendation].className,
                    )}>
                      {t(`candidates.compare.recommendation_${c.recommendation}`)}
                    </span>
                  )}
                </div>

                {/* Interview Feedback */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500">{t("candidates.compare.interviewRatings")}</h4>
                  {c.interviews.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-400">{t("candidates.compare.noInterviews")}</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {c.interviews.map((interview) => (
                        <div key={interview.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700">{interview.title}</span>
                            {interview.overall_score !== null && (
                              <span className="text-xs font-semibold text-gray-700">{t("candidates.compare.scoreOutOf5", { score: interview.overall_score })}</span>
                            )}
                          </div>
                          {interview.recommendation && RECOMMENDATION_BADGE[interview.recommendation] && (
                            <span className={cn(
                              "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              RECOMMENDATION_BADGE[interview.recommendation].className,
                            )}>
                              {t(`candidates.compare.recommendation_${interview.recommendation}`)}
                            </span>
                          )}
                          {interview.strengths && (
                            <p className="mt-1 text-xs text-green-700">
                              <span className="font-medium">{t("candidates.compare.strengths")}</span>
                              {interview.strengths}
                            </p>
                          )}
                          {interview.weaknesses && (
                            <p className="mt-1 text-xs text-red-600">
                              <span className="font-medium">{t("candidates.compare.weaknesses")}</span>
                              {interview.weaknesses}
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-gray-200 pt-1">
                        <span className="text-xs text-gray-500">{t("candidates.compare.avgInterviewScore")}</span>
                        <ScoreCell value={avgInterviewScore} best={bestInterviewScore} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => moveStage.mutate({ appId: c.application_id, stage: "screened" })}
                    disabled={moveStage.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {t("candidates.compare.shortlist")}
                  </button>
                  <button
                    onClick={() => moveStage.mutate({ appId: c.application_id, stage: "rejected" })}
                    disabled={moveStage.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-3 w-3" />
                    {t("candidates.compare.reject")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

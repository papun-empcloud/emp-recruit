import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Brain,
  Target,
  BarChart,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import type { CandidateScore } from "@emp-recruit/shared";
import { cn } from "@/lib/utils";

const RECOMMENDATION_CONFIG: Record<
  string,
  { label: string; className: string; description: string }
> = {
  strong_match: {
    label: "scoring.recommendation.strongMatch",
    className: "bg-green-100 text-green-800 border-green-200",
    description: "scoring.report.strongMatchDesc",
  },
  good_match: {
    label: "scoring.recommendation.goodMatch",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    description: "scoring.report.goodMatchDesc",
  },
  partial_match: {
    label: "scoring.recommendation.partialMatch",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    description: "scoring.report.partialMatchDesc",
  },
  weak_match: {
    label: "scoring.recommendation.weakMatch",
    className: "bg-red-100 text-red-800 border-red-200",
    description: "scoring.report.weakMatchDesc",
  },
};

function CircularProgress({
  score,
  size = 160,
  strokeWidth = 12,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const { t } = useTranslation();
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "#16a34a"
      : score >= 50
        ? "#ca8a04"
        : "#dc2626";

  const bgColor =
    score >= 80
      ? "#dcfce7"
      : score >= 50
        ? "#fef9c3"
        : "#fef2f2";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-sm text-gray-500">{t("scoring.report.outOf100")}</span>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const color =
    value >= 80
      ? "bg-green-500"
      : value >= 50
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-gray-900">{value}/100</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100">
        <div
          className={cn("h-3 rounded-full transition-all duration-700 ease-out", color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreReportPage() {
  const { t } = useTranslation();
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: scoreData, isLoading } = useQuery({
    queryKey: ["score-report", appId],
    queryFn: () => apiGet<CandidateScore>(`/scoring/applications/${appId}`),
    enabled: Boolean(appId),
  });

  const score = scoreData?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!score) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("scoring.report.back")}
        </button>
        <div className="py-12 text-center">
          <Brain className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">
            {t("scoring.report.notFound")}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {t("scoring.report.notFoundHint")}
          </p>
        </div>
      </div>
    );
  }

  let matchedSkills: string[] = [];
  try {
    matchedSkills = score.matched_skills
      ? Array.isArray(score.matched_skills)
        ? score.matched_skills
        : JSON.parse(score.matched_skills)
      : [];
  } catch { matchedSkills = []; }
  let missingSkills: string[] = [];
  try {
    missingSkills = score.missing_skills
      ? Array.isArray(score.missing_skills)
        ? score.missing_skills
        : JSON.parse(score.missing_skills)
      : [];
  } catch { missingSkills = []; }
  const rec = RECOMMENDATION_CONFIG[score.recommendation];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("scoring.report.back")}
      </button>

      {/* Page title */}
      <div className="flex items-center gap-3">
        <Brain className="h-7 w-7 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t("scoring.report.title")}</h1>
      </div>

      {/* Overall Score */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">
          {t("scoring.report.overallMatchScore")}
        </h2>
        <CircularProgress score={score.overall_score} />

        {/* Recommendation badge */}
        {rec && (
          <div className="mt-6">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold",
                rec.className,
              )}
            >
              {t(rec.label)}
            </span>
            <p className="mt-2 text-sm text-gray-500">{t(rec.description)}</p>
          </div>
        )}
      </div>

      {/* Score Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          {t("scoring.report.scoreBreakdown")}
        </h2>

        <ProgressBar
          label={t("scoring.report.skillsMatch")}
          value={score.skills_score}
          icon={<Target className="h-4 w-4 text-purple-500" />}
        />

        <ProgressBar
          label={t("scoring.report.experienceMatch")}
          value={score.experience_score}
          icon={<BarChart className="h-4 w-4 text-blue-500" />}
        />

        <p className="text-xs text-gray-400">
          {t("scoring.report.formula")}
        </p>
      </div>

      {/* Skills Analysis */}
      {(matchedSkills.length > 0 || missingSkills.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            {t("scoring.report.skillsAnalysis")}
          </h2>

          {matchedSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-green-700 mb-2">
                {t("scoring.report.matchedSkills", { num: matchedSkills.length })}
              </h3>
              <div className="flex flex-wrap gap-2">
                {matchedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-800"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-700 mb-2">
                {t("scoring.report.missingSkills", { num: missingSkills.length })}
              </h3>
              <div className="flex flex-wrap gap-2">
                {missingSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-1 text-sm text-red-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meta info */}
      <div className="text-xs text-gray-400 text-center pb-4">
        {t("scoring.report.scoredAt", { date: new Date(score.scored_at).toLocaleString() })}
      </div>
    </div>
  );
}

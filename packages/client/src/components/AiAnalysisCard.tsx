import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Sparkles, Loader2, ThumbsUp, ThumbsDown, Minus, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface AiEvaluation {
  id: string;
  overall_score: number;
  technical_score: number | null;
  communication_score: number | null;
  cultural_fit_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  weaknesses: string | null;
  summary: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

const REC: Record<string, { labelKey: string; cls: string; Icon: typeof ThumbsUp }> = {
  strong_yes: { labelKey: "components.aiAnalysis.recStrongYes", cls: "bg-green-100 text-green-800", Icon: ThumbsUp },
  yes: { labelKey: "components.aiAnalysis.recYes", cls: "bg-green-50 text-green-700", Icon: ThumbsUp },
  neutral: { labelKey: "components.aiAnalysis.recNeutral", cls: "bg-gray-100 text-gray-600", Icon: Minus },
  no: { labelKey: "components.aiAnalysis.recNo", cls: "bg-red-50 text-red-600", Icon: ThumbsDown },
  strong_no: { labelKey: "components.aiAnalysis.recStrongNo", cls: "bg-red-100 text-red-800", Icon: ThumbsDown },
};

function scoreColor(v: number): string {
  return v >= 75 ? "text-green-600" : v >= 50 ? "text-yellow-600" : "text-red-600";
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-lg font-bold", scoreColor(value))}>{value}</p>
    </div>
  );
}

export function AiAnalysisCard({
  interviewId,
  embedded = false,
}: {
  interviewId: string;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Lightweight transcript read (shares the cached query) so we know when a
  // completed transcript exists but the auto-analysis hasn't landed yet.
  const { data: transcript } = useQuery({
    queryKey: ["transcript", interviewId],
    queryFn: async () =>
      (await apiGet<{ status?: string } | null>(`/interviews/${interviewId}/transcript`)).data ??
      null,
  });

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ["ai-evaluation", interviewId],
    queryFn: async () =>
      (await apiGet<AiEvaluation | null>(`/interviews/${interviewId}/ai-evaluation`)).data ?? null,
    // After a recording, analysis is generated automatically a bit after the
    // transcript completes. Poll until it appears, then stop.
    refetchInterval: (query) =>
      !query.state.data && transcript?.status === "completed" ? 5000 : false,
  });

  const run = useMutation({
    mutationFn: () => apiPost<AiEvaluation>(`/interviews/${interviewId}/ai-evaluate`, {}),
    onSuccess: () => {
      toast.success(t("components.aiAnalysis.analysisComplete"));
      qc.invalidateQueries({ queryKey: ["ai-evaluation", interviewId] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("components.aiAnalysis.analysisFailed")),
  });

  const errMsg = (run.error as any)?.response?.data?.error?.message as string | undefined;
  const rec = evaluation?.recommendation ? REC[evaluation.recommendation] : undefined;

  return (
    <div
      className={
        embedded
          ? "border-t border-gray-200 pt-5 mt-5"
          : "rounded-lg border border-gray-200 bg-white p-5"
      }
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-500" /> {t("components.aiAnalysis.title")}
        </h3>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {run.isPending
            ? t("components.aiAnalysis.analyzing")
            : evaluation
              ? t("components.aiAnalysis.rerun")
              : t("components.aiAnalysis.run")}
        </button>
      </div>

      {/* Error guidance — distinguish "no model configured" from real errors
          (rate limits, upstream failures) so we don't wrongly tell the user to
          add a key that's already set. */}
      {errMsg && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          {/no ai provider|not configured/i.test(errMsg) ? (
            <p className="text-sm text-amber-800">
              {t("components.aiAnalysis.needModelText0")} <code>ANTHROPIC_API_KEY</code>{" "}
              {t("components.aiAnalysis.needModelText1")} <code>OPENAI_API_KEY</code>
              {t("components.aiAnalysis.needModelText2")} <code>AI_PROVIDER=compatible</code>
              {t("components.aiAnalysis.needModelText3")} <code>.env</code>{" "}
              {t("components.aiAnalysis.needModelText4")}
            </p>
          ) : (
            <p className="text-sm text-amber-800">{errMsg}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : !evaluation ? (
        <p className="text-sm text-gray-500">
          {t("components.aiAnalysis.emptyState")}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Score + recommendation */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-baseline gap-1">
              <span className={cn("text-4xl font-bold", scoreColor(evaluation.overall_score))}>
                {evaluation.overall_score}
              </span>
              <span className="text-sm text-gray-400">/100</span>
            </div>
            {rec && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium", rec.cls)}>
                <rec.Icon className="h-4 w-4" /> {t(rec.labelKey)}
              </span>
            )}
            <div className="ml-auto grid grid-cols-3 gap-2">
              <SubScore label={t("components.aiAnalysis.technical")} value={evaluation.technical_score} />
              <SubScore label={t("components.aiAnalysis.communication")} value={evaluation.communication_score} />
              <SubScore label={t("components.aiAnalysis.culturalFit")} value={evaluation.cultural_fit_score} />
            </div>
          </div>

          {/* Strengths / weaknesses */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {evaluation.strengths && (
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">{t("components.aiAnalysis.strengths")}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{evaluation.strengths}</p>
              </div>
            )}
            {evaluation.weaknesses && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">{t("components.aiAnalysis.concerns")}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{evaluation.weaknesses}</p>
              </div>
            )}
          </div>

          {/* Summary */}
          {evaluation.summary && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("components.aiAnalysis.summary")}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{evaluation.summary}</p>
            </div>
          )}

          <p className="text-xs text-gray-400">
            {t("components.aiAnalysis.generatedBy", {
              provider: evaluation.provider ?? t("components.aiAnalysis.providerFallback"),
            })}
            {evaluation.model ? ` · ${evaluation.model}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

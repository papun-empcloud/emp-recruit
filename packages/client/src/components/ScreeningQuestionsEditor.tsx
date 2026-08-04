import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Loader2, Save, ListChecks } from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import type { JobScreeningQuestion, ScreeningQuestionType } from "@emp-recruit/shared";
import toast from "react-hot-toast";

interface QuestionDraft {
  question: string;
  type: ScreeningQuestionType;
  optionsText: string; // comma-separated, for single_choice
  required: boolean;
  is_knockout: boolean;
  knockout_value: string;
}

const TYPES: ScreeningQuestionType[] = ["text", "number", "yes_no", "single_choice"];

function toDraft(q: JobScreeningQuestion): QuestionDraft {
  return {
    question: q.question,
    type: q.type,
    optionsText: (q.options ?? []).join(", "),
    required: q.required,
    is_knockout: q.is_knockout,
    knockout_value: q.knockout_value ?? "",
  };
}

export function ScreeningQuestionsEditor({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<QuestionDraft[] | null>(null);

  const { isLoading } = useQuery({
    queryKey: ["screening-questions", jobId],
    queryFn: async () => {
      const res = await apiGet<JobScreeningQuestion[]>(`/jobs/${jobId}/screening-questions`);
      // Initialise the editable drafts once from the server, then edit locally.
      if (drafts === null) setDrafts((res.data ?? []).map(toDraft));
      return res.data ?? [];
    },
  });

  const list = drafts ?? [];

  function update(i: number, patch: Partial<QuestionDraft>) {
    setDrafts((d) => (d ? d.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) : d));
  }
  function add() {
    setDrafts((d) => [
      ...(d ?? []),
      { question: "", type: "text", optionsText: "", required: true, is_knockout: false, knockout_value: "" },
    ]);
  }
  function remove(i: number) {
    setDrafts((d) => (d ? d.filter((_, idx) => idx !== i) : d));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const questions = list.map((q, i) => ({
        question: q.question.trim(),
        type: q.type,
        options:
          q.type === "single_choice"
            ? q.optionsText.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
        required: q.required,
        is_knockout: q.is_knockout,
        knockout_value: q.is_knockout ? q.knockout_value.trim() || undefined : undefined,
        sort_order: i,
      }));
      return apiPut(`/jobs/${jobId}/screening-questions`, { questions });
    },
    onSuccess: () => {
      toast.success(t("screening.editor.saved"));
      queryClient.invalidateQueries({ queryKey: ["screening-questions", jobId] });
    },
    onError: (err: any) => {
      const details = err?.response?.data?.error?.details;
      const first = details ? (Object.values(details).flat() as string[])[0] : undefined;
      toast.error(first || err?.response?.data?.error?.message || t("screening.editor.saveFailed"));
    },
  });

  if (isLoading && drafts === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-5 w-5 text-brand-600" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t("screening.editor.title")}</h3>
          <p className="text-xs text-gray-500">{t("screening.editor.subtitle")}</p>
        </div>
      </div>

      {list.length === 0 && <p className="text-sm text-gray-400">{t("screening.editor.empty")}</p>}

      <div className="space-y-3">
        {list.map((q, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <input
                value={q.question}
                onChange={(e) => update(i, { question: e.target.value })}
                placeholder={t("screening.editor.questionPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="mt-1 flex-shrink-0 text-gray-400 hover:text-red-600"
                title={t("screening.editor.remove")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value as ScreeningQuestionType })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`screening.type.${ty}`)}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1.5 text-gray-700">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                {t("screening.editor.required")}
              </label>
              <label className="inline-flex items-center gap-1.5 text-gray-700">
                <input
                  type="checkbox"
                  checked={q.is_knockout}
                  onChange={(e) => update(i, { is_knockout: e.target.checked })}
                />
                {t("screening.editor.knockout")}
              </label>
            </div>

            {q.type === "single_choice" && (
              <input
                value={q.optionsText}
                onChange={(e) => update(i, { optionsText: e.target.value })}
                placeholder={t("screening.editor.optionsPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            )}

            {q.is_knockout && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("screening.editor.knockoutValue")}
                </label>
                <input
                  value={q.knockout_value}
                  onChange={(e) => update(i, { knockout_value: e.target.value })}
                  placeholder={t("screening.editor.knockoutValuePlaceholder")}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          {t("screening.editor.addQuestion")}
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("screening.editor.save")}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, X, Search, Copy, Loader2, ChevronRight, ArrowLeft, Sparkles, Trash2, Briefcase, CalendarDays, UserRound } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination } from "@/components/Pagination";
import { ExportButtons } from "@/components/ExportButtons";
import { fetchAllRows, type ExportColumn } from "@/lib/export";
import type { PaginatedResponse } from "@emp-recruit/shared";
import toast from "react-hot-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface SessionRow {
  id: string;
  status: "draft" | "ready" | "pending" | "in_progress" | "completed";
  candidate_name: string;
  job_title: string | null;
  token: string;
  overall_score: number | null;
  recommendation: string | null;
  total_questions: number;
  created_at: string;
  completed_at: string | null;
}

interface AppRow {
  id: string;
  candidate_first_name: string;
  candidate_last_name: string;
  job_title: string;
  job_department: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  ready: "bg-indigo-100 text-indigo-700",
  pending: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

function candidateLink(token: string) {
  return `${window.location.origin}/ai-interview/${token}`;
}

const SESSION_COLUMNS: ExportColumn<SessionRow>[] = [
  { header: "Candidate", value: (s) => s.candidate_name },
  { header: "Role", value: (s) => s.job_title },
  { header: "Status", value: (s) => s.status.replace("_", " ") },
  { header: "Score", value: (s) => (s.overall_score != null ? `${s.overall_score}/100` : "") },
  { header: "Recommendation", value: (s) => s.recommendation },
  { header: "Questions", value: (s) => s.total_questions },
  { header: "Created", value: (s) => (s.created_at ? formatDate(s.created_at) : "") },
  { header: "Completed", value: (s) => (s.completed_at ? formatDate(s.completed_at) : "") },
];

export function AiInterviewsListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { rows: sessions, total, perPage, isLoading } = usePaginatedList<SessionRow>(
    ["ai-interviews"],
    "/ai-interviews",
    {},
    page,
  );

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => apiDelete(`/ai-interviews/${sessionId}`),
    onSuccess: () => { toast.success("Draft AI interview deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["ai-interviews"] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not delete draft AI interview"),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700"><Brain className="h-6 w-6" aria-hidden="true" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-balance text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{t("aiInterview.list.title")}</h1><span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">AI Powered</span></div>
            <p className="mt-1 text-sm text-gray-500">
              {t("aiInterview.list.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            baseName="ai-interviews"
            title={t("aiInterview.list.title")}
            subtitle={t("aiInterview.list.subtitle")}
            columns={SESSION_COLUMNS}
            fetchRows={() => fetchAllRows<SessionRow>("/ai-interviews", {})}
          />
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("aiInterview.list.newInterview")}
          </button>
        </div>
      </div>
      </section>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-16 text-center shadow-sm">
          <Brain className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">{t("aiInterview.list.empty")}</p>
        </div>
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {sessions.map((s) => (
            <article key={s.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-base font-bold text-gray-900">{s.candidate_name}</h2><p className="mt-1 truncate text-sm text-gray-500">{s.job_title || "No role assigned"}</p></div><span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[s.status]}`}>{t(`aiInterview.status.${s.status}`)}</span></div>
              <div className="mt-4 grid gap-2 text-sm text-gray-500 min-[430px]:grid-cols-2">
                <span className="inline-flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{s.total_questions} questions</span></span>
                <span className="inline-flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{formatDate(s.created_at)}</span></span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3"><span className="text-sm font-semibold tabular-nums text-gray-700">{s.overall_score != null ? `${s.overall_score}/100` : "Not scored"}</span><div className="flex items-center gap-2">{(s.status === "ready" || s.status === "in_progress") && <button type="button" onClick={() => { navigator.clipboard?.writeText(candidateLink(s.token)); toast.success(t("aiInterview.toasts.linkCopied")); }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{t("aiInterview.list.linkLabel")}</button>}{s.status === "draft" && <button type="button" onClick={() => setDeleteId(s.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" aria-label="Delete draft"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}<Link to={`/ai-interviews/${s.id}`} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`View interview for ${s.candidate_name}`}><ChevronRight className="h-5 w-5" aria-hidden="true" /></Link></div></div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
          <table className="min-w-[780px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t("aiInterview.list.colCandidate")}</th>
                <th className="px-6 py-3 font-medium">{t("aiInterview.list.colRole")}</th>
                <th className="px-6 py-3 font-medium">{t("aiInterview.list.colStatus")}</th>
                <th className="px-6 py-3 font-medium">{t("aiInterview.list.colScore")}</th>
                <th className="px-6 py-3 font-medium">{t("aiInterview.list.colCreated")}</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-purple-50/30">
                  <td className="px-6 py-4 font-semibold text-gray-900">{s.candidate_name}</td>
                  <td className="px-6 py-3 text-gray-600">{s.job_title || "—"}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                      {t(`aiInterview.status.${s.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-semibold tabular-nums text-gray-700">
                    {s.overall_score != null ? `${s.overall_score}/100` : "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {(s.status === "ready" || s.status === "in_progress") && (
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(candidateLink(s.token));
                            toast.success(t("aiInterview.toasts.linkCopied"));
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                          title={t("aiInterview.list.copyLinkTitle")}
                        >
                          <Copy className="h-3.5 w-3.5" /> {t("aiInterview.list.linkLabel")}
                        </button>
                      )}
                      {s.status === "draft" && <button onClick={() => setDeleteId(s.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" aria-label="Delete draft"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                      <Link to={`/ai-interviews/${s.id}`} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`View interview for ${s.candidate_name}`}>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {!isLoading && total > 0 && (
        <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />
      )}

      {showModal && (
        <NewInterviewModal
          onClose={() => setShowModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["ai-interviews"] })}
        />
      )}
      <ConfirmDialog open={deleteId !== null} title="Delete draft AI interview?" message="The generated questions and unused candidate link will be permanently removed." confirmLabel="Delete draft" variant="danger" loading={deleteMutation.isPending} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

type Step = "pick" | "config" | "review" | "done";

function NewInterviewModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("pick");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<AppRow | null>(null);
  const [objective, setObjective] = useState("");
  const [count, setCount] = useState("5");
  const [perQuestionSecs, setPerQuestionSecs] = useState("0"); // 0 = no limit
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isFetching } = useQuery({
    queryKey: ["applications-for-ai-interview", search],
    queryFn: () =>
      apiGet<PaginatedResponse<AppRow>>("/applications", {
        perPage: 8,
        sort: "applied_at",
        order: "desc",
        ...(search ? { search } : {}),
      }),
    enabled: step === "pick",
  });
  const apps = data?.data?.data ?? [];

  const generateMutation = useMutation({
    mutationFn: () =>
      apiPost<{ id: string; token: string; questions: { text: string }[] }>("/ai-interviews", {
        application_id: selectedApp!.id,
        objective: objective.trim() || undefined,
        question_count: Number(count) || 5,
        seconds_per_question: Number(perQuestionSecs) || undefined,
      }),
    onSuccess: (res) => {
      const d = res.data!;
      setSessionId(d.id);
      setToken(d.token);
      setQuestions((d.questions || []).map((q) => q.text));
      onCreated();
      setStep("review");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t("aiInterview.toasts.generateError")),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const clean = questions.map((q) => q.trim()).filter(Boolean);
      await apiPut(`/ai-interviews/${sessionId}/questions`, { questions: clean });
      await apiPost(`/ai-interviews/${sessionId}/approve`);
    },
    onSuccess: () => {
      onCreated();
      setStep("done");
      toast.success(t("aiInterview.toasts.approved"));
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t("aiInterview.toasts.approveError")),
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const clean = questions.map((q) => q.trim()).filter(Boolean);
      if (!sessionId || clean.length === 0) throw new Error("At least one question is required");
      await apiPut(`/ai-interviews/${sessionId}/questions`, { questions: clean });
    },
    onSuccess: () => {
      onCreated();
      toast.success(t("aiInterview.toasts.draftSaved"));
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || err?.message || t("aiInterview.toasts.draftSaveError")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            {step === "config" && (
              <button
                onClick={() => setStep("pick")}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-base font-semibold text-gray-900">
              {step === "review"
                ? t("aiInterview.modal.reviewTitle")
                : step === "done"
                  ? t("aiInterview.modal.readyTitle")
                  : t("aiInterview.list.newInterview")}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1 — pick an application */}
        {step === "pick" && (
          <div className="px-6 py-4">
            <p className="mb-3 text-sm text-gray-500">{t("aiInterview.modal.pickPrompt")}</p>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("aiInterview.modal.searchPlaceholder")}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="max-h-72 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200">
              {isFetching && apps.length === 0 ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                </div>
              ) : apps.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">{t("aiInterview.modal.noApplications")}</p>
              ) : (
                apps.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedApp(a);
                      setStep("config");
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {a.candidate_first_name} {a.candidate_last_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">{a.job_title}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2 — objective + count, generate */}
        {step === "config" && selectedApp && (
          <div className="px-6 py-4">
            <p className="text-sm font-medium text-gray-900">
              {selectedApp.candidate_first_name} {selectedApp.candidate_last_name}
            </p>
            <p className="text-xs text-gray-500">{selectedApp.job_title}</p>

            <label className="mt-4 block text-xs font-medium text-gray-500">{t("aiInterview.modal.objectiveLabel")}</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder={t("aiInterview.modal.objectivePlaceholder")}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <div className="mt-4 flex gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">{t("aiInterview.modal.questionCountLabel")}</label>
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">{t("aiInterview.modal.timePerQuestionLabel")}</label>
                <select
                  value={perQuestionSecs}
                  onChange={(e) => setPerQuestionSecs(e.target.value)}
                  className="mt-1 w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="0">{t("aiInterview.modal.noLimit")}</option>
                  <option value="30">{t("aiInterview.modal.secs30")}</option>
                  <option value="60">{t("aiInterview.modal.min1")}</option>
                  <option value="90">{t("aiInterview.modal.min1_5")}</option>
                  <option value="120">{t("aiInterview.modal.min2")}</option>
                  <option value="180">{t("aiInterview.modal.min3")}</option>
                  <option value="300">{t("aiInterview.modal.min5")}</option>
                </select>
              </div>
            </div>
            {perQuestionSecs !== "0" && (
              <p className="mt-1.5 text-xs text-gray-400">
                {t("aiInterview.modal.autoSubmitNote")}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("aiInterview.modal.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> {t("aiInterview.modal.generateQuestions")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — review / edit / approve */}
        {step === "review" && (
          <div className="px-6 py-4">
            <p className="mb-3 text-sm text-gray-500">
              {t("aiInterview.modal.reviewPrompt")}
            </p>
            <div className="max-h-80 space-y-2 overflow-auto">
              {questions.map((q, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-medium text-gray-400">{i + 1}.</span>
                  <textarea
                    value={q}
                    onChange={(e) =>
                      setQuestions((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="mt-1.5 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setQuestions((prev) => [...prev, ""])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> {t("aiInterview.modal.addQuestion")}
            </button>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => saveDraftMutation.mutate()}
                disabled={saveDraftMutation.isPending || questions.filter((q) => q.trim()).length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saveDraftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("aiInterview.modal.saveAsDraft")}
              </button>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || questions.filter((q) => q.trim()).length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("aiInterview.modal.approveGetLink")}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — share the link */}
        {step === "done" && token && (
          <div className="px-6 py-6">
            <p className="text-sm text-gray-600">
              {t("aiInterview.modal.doneShare")}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={candidateLink(token)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(candidateLink(token));
                  toast.success(t("aiInterview.toasts.copied"));
                }}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Copy className="h-4 w-4" /> {t("aiInterview.modal.copy")}
              </button>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("aiInterview.modal.done")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, X, Search, Copy, Loader2, ChevronRight, ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import type { PaginatedResponse } from "@emp-recruit/shared";
import toast from "react-hot-toast";

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

export function AiInterviewsListPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-interviews"],
    queryFn: () => apiGet<{ data: SessionRow[]; total: number }>("/ai-interviews", { limit: 50 }),
  });
  const sessions = data?.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Interviews</h1>
            <p className="mt-1 text-sm text-gray-500">
              Send candidates a resume-tailored AI interview and review the scored results.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New AI Interview
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Brain className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No AI interviews yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Candidate</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Score</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{s.candidate_name}</td>
                  <td className="px-6 py-3 text-gray-600">{s.job_title || "—"}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-700">
                    {s.overall_score != null ? `${s.overall_score}/100` : "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {(s.status === "ready" || s.status === "in_progress") && (
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(candidateLink(s.token));
                            toast.success("Candidate link copied");
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                          title="Copy candidate link"
                        >
                          <Copy className="h-3.5 w-3.5" /> Link
                        </button>
                      )}
                      <Link to={`/ai-interviews/${s.id}`} className="text-gray-400 hover:text-gray-600">
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewInterviewModal
          onClose={() => setShowModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["ai-interviews"] })}
        />
      )}
    </div>
  );
}

type Step = "pick" | "config" | "review" | "done";

function NewInterviewModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<AppRow | null>(null);
  const [objective, setObjective] = useState("");
  const [count, setCount] = useState("5");
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
      }),
    onSuccess: (res) => {
      const d = res.data!;
      setSessionId(d.id);
      setToken(d.token);
      setQuestions((d.questions || []).map((q) => q.text));
      onCreated();
      setStep("review");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Failed to generate questions"),
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
      toast.success("Interview approved");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Failed to approve"),
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
              {step === "review" ? "Review questions" : step === "done" ? "Interview ready" : "New AI Interview"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1 — pick an application */}
        {step === "pick" && (
          <div className="px-6 py-4">
            <p className="mb-3 text-sm text-gray-500">Pick the application to interview for:</p>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search candidate or job…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="max-h-72 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200">
              {isFetching && apps.length === 0 ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                </div>
              ) : apps.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">No applications found.</p>
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

            <label className="mt-4 block text-xs font-medium text-gray-500">Objective (optional)</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="e.g. Assess hands-on backend skills and problem-solving for this role."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <label className="mt-4 block text-xs font-medium text-gray-500">Number of questions</label>
            <input
              type="number"
              min={3}
              max={12}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate questions
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
              Review the AI-generated questions. Edit, remove, or add before approving.
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
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Save as draft
              </button>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || questions.filter((q) => q.trim()).length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Approve &amp; get link
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — share the link */}
        {step === "done" && token && (
          <div className="px-6 py-6">
            <p className="text-sm text-gray-600">
              Approved. Share this link with the candidate — they'll take the interview (voice or typed):
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
                  toast.success("Link copied");
                }}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

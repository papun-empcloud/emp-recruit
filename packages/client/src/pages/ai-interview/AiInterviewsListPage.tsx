import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Plus, X, Search, Copy, Loader2, ChevronRight } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import type { PaginatedResponse } from "@emp-recruit/shared";
import toast from "react-hot-toast";

interface SessionRow {
  id: string;
  status: "pending" | "in_progress" | "completed";
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
                      {s.status !== "completed" && (
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

function NewInterviewModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

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
  });
  const apps = data?.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<{ id: string; token: string }>("/ai-interviews", { application_id: applicationId }),
    onSuccess: (res) => {
      setCreatedToken(res.data!.token);
      onCreated();
      toast.success("AI interview created");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Failed to create"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">New AI Interview</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {createdToken ? (
          <div className="px-6 py-6">
            <p className="text-sm text-gray-600">
              Share this link with the candidate — they can take the interview by voice or by typing:
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={candidateLink(createdToken)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(candidateLink(createdToken));
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
        ) : (
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
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {a.candidate_first_name} {a.candidate_last_name}
                      </p>
                      <p className="truncate text-xs text-gray-500">{a.job_title}</p>
                    </div>
                    <button
                      onClick={() => createMutation.mutate(a.id)}
                      disabled={createMutation.isPending}
                      className="flex-shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {createMutation.isPending ? "Creating…" : "Create"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Brain, Copy, Loader2, MessageSquare, Mic, CheckCircle2 } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Transcript {
  question: string;
  answer: string | null;
}
interface SessionDetail {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  job_title: string | null;
  token: string;
  status: "draft" | "ready" | "pending" | "in_progress" | "completed";
  objective: string | null;
  total_questions: number;
  questions: string[];
  answered: number;
  overall_score: number | null;
  communication_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  concerns: string | null;
  summary: string | null;
  provider: string | null;
  created_at: string;
  completed_at: string | null;
  transcript: Transcript[];
  voice_transcript: string | null;
  recording_url: string | null;
}

const REC_LABEL: Record<string, { label: string; className: string }> = {
  strong_yes: { label: "Strong Yes", className: "bg-green-100 text-green-800" },
  yes: { label: "Yes", className: "bg-green-100 text-green-700" },
  neutral: { label: "Neutral", className: "bg-yellow-100 text-yellow-700" },
  no: { label: "No", className: "bg-red-100 text-red-700" },
  strong_no: { label: "Strong No", className: "bg-red-100 text-red-800" },
};

export function AiInterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-interview", id],
    queryFn: () => apiGet<SessionDetail>(`/ai-interviews/${id}`),
    enabled: Boolean(id),
  });
  const s = data?.data;

  const approveMutation = useMutation({
    mutationFn: () => apiPost(`/ai-interviews/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-interview", id] });
      toast.success("Interview approved");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Failed to approve"),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!s) {
    return <div className="py-12 text-center text-gray-500">AI interview not found.</div>;
  }

  const link = `${window.location.origin}/ai-interview/${s.token}`;
  const rec = s.recommendation ? REC_LABEL[s.recommendation] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/ai-interviews" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to AI Interviews
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100">
            <Brain className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{s.candidate_name}</h1>
            <p className="text-sm text-gray-500">{s.job_title || "—"}</p>
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600">
          {s.status.replace("_", " ")}
        </span>
      </div>

      {s.objective && (
        <p className="rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Objective:</span> {s.objective}
        </p>
      )}

      {/* Draft — needs recruiter approval before the candidate can take it */}
      {s.status === "draft" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">
            These questions haven't been approved yet — the candidate can't start until you approve.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            {s.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve &amp; activate
          </button>
        </div>
      )}

      {/* Approved but not completed — share the link */}
      {(s.status === "ready" || s.status === "in_progress" || s.status === "pending") && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600">
            Waiting for the candidate to complete the interview ({s.answered}/{s.total_questions} answered). Share
            the link:
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={link} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm" />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link);
                toast.success("Link copied");
              }}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
        </div>
      )}

      {/* Interview recording (voice interviews) */}
      {s.status === "completed" && s.recording_url && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Mic className="h-5 w-5 text-gray-400" /> Interview recording
          </h2>
          <audio controls preload="none" src={s.recording_url} className="w-full">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* Evaluation */}
      {s.status === "completed" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-4xl font-bold text-gray-900">
                {s.overall_score != null ? s.overall_score : "—"}
                <span className="text-lg font-medium text-gray-400">/100</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">Overall hiring score</p>
            </div>
            {s.communication_score != null && (
              <div>
                <p className="text-4xl font-bold text-gray-900">
                  {s.communication_score}
                  <span className="text-lg font-medium text-gray-400">/10</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">Communication</p>
              </div>
            )}
            {rec && (
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${rec.className}`}>{rec.label}</span>
            )}
          </div>

          {s.summary && <p className="mt-4 text-sm text-gray-700">{s.summary}</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.strengths && (
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Strengths</p>
                <p className="mt-1 text-sm text-gray-700">{s.strengths}</p>
              </div>
            )}
            {s.concerns && (
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Concerns</p>
                <p className="mt-1 text-sm text-gray-700">{s.concerns}</p>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-400">
            {s.provider === "heuristic"
              ? "Automated completion score (no AI provider configured)."
              : `Evaluated by ${s.provider}.`}
            {s.completed_at ? ` Completed ${formatDate(s.completed_at)}.` : ""}
          </p>
        </div>
      )}

      {/* Voice transcript (real-time interview) */}
      {s.voice_transcript && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <MessageSquare className="h-5 w-5 text-gray-400" /> Voice transcript
          </h2>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 font-sans text-sm text-gray-700">
            {s.voice_transcript}
          </pre>
        </div>
      )}

      {/* Planned questions / typed answers */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <MessageSquare className="h-5 w-5 text-gray-400" />
          {s.voice_transcript ? "Questions" : "Transcript"}
        </h2>
        <div className="mt-4 space-y-5">
          {s.transcript.map((t, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-gray-900">
                Q{i + 1}. {t.question}
              </p>
              {/* Voice interviews carry the answers in the voice transcript above. */}
              {!s.voice_transcript && (
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {t.answer && t.answer.trim() ? t.answer : <span className="text-gray-400">No answer</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

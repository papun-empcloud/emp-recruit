import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Share2,
  ExternalLink,
  Loader2,
  Rss,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";

interface Posting {
  id: string;
  board: string;
  status: string;
  external_url: string | null;
  error: string | null;
  posted_at: string | null;
}

const BOARDS = ["linkedin", "indeed", "naukri"] as const;
const BOARD_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
};

function StatusPill({ status }: { status: string | null }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    posted: { label: t("components.jobBoards.statusPosted"), cls: "bg-green-100 text-green-700", Icon: CheckCircle2 },
    feed: { label: t("components.jobBoards.statusFeed"), cls: "bg-green-100 text-green-700", Icon: Rss },
    pending: { label: t("components.jobBoards.statusPending"), cls: "bg-yellow-100 text-yellow-700", Icon: Loader2 },
    failed: { label: t("components.jobBoards.statusFailed"), cls: "bg-red-100 text-red-700", Icon: XCircle },
    skipped: { label: t("components.jobBoards.statusSkipped"), cls: "bg-gray-100 text-gray-500", Icon: MinusCircle },
  };
  const s = status ? map[status] : undefined;
  if (!s) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        <MinusCircle className="h-3 w-3" /> {t("components.jobBoards.statusNotPublished")}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

export function JobBoardsCard({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: postings = [], isLoading } = useQuery({
    queryKey: ["job-board-postings", jobId],
    queryFn: async () => (await apiGet<Posting[]>(`/job-boards/jobs/${jobId}/postings`)).data ?? [],
  });

  const publish = useMutation({
    mutationFn: () => apiPost(`/job-boards/jobs/${jobId}/publish`, {}),
    onSuccess: () => {
      toast.success(t("components.jobBoards.publishSuccess"));
      qc.invalidateQueries({ queryKey: ["job-board-postings", jobId] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("components.jobBoards.publishError")),
  });

  const byBoard = new Map(postings.map((p) => [p.board, p]));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <Share2 className="h-4 w-4 text-gray-400" /> {t("components.jobBoards.title")}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            title={t("components.jobBoards.connectTitle")}
          >
            <SettingsIcon className="h-3.5 w-3.5" /> {t("components.jobBoards.connect")}
          </Link>
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            {postings.length ? t("components.jobBoards.republish") : t("components.jobBoards.publishToBoards")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {BOARDS.map((board) => {
            const p = byBoard.get(board);
            return (
              <div key={board} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{BOARD_LABEL[board]}</span>
                  {p?.external_url && (
                    <a
                      href={p.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs text-brand-600 hover:text-brand-800"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("components.jobBoards.view")}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {p?.error && (
                    <span className="max-w-[16rem] truncate text-xs text-red-500" title={p.error}>
                      {p.error}
                    </span>
                  )}
                  <StatusPill status={p?.status ?? null} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        {t("components.jobBoards.footerNote")}
      </p>
    </div>
  );
}

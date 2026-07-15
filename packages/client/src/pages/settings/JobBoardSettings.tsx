import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Rss, Copy, CheckCircle } from "lucide-react";
import { apiGet, apiPut } from "@/api/client";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { CareerPage } from "@emp-recruit/shared";

interface BoardConfig {
  board: "linkedin" | "indeed" | "naukri";
  mode: "api" | "feed";
  enabled: boolean;
  auto_publish: boolean;
  configured: boolean;
  has_credentials: boolean;
  status: string;
  last_error: string | null;
}

const LABEL: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri" };

// Credential fields per API board (empty = feed board, no creds).
// `label`/`placeholder` hold i18n keys resolved with t() at render time.
const FIELDS: Record<string, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  linkedin: [
    { key: "accessToken", label: "settings.jobBoards.fields.linkedin.accessTokenLabel", placeholder: "settings.jobBoards.fields.linkedin.accessTokenPlaceholder", secret: true },
    { key: "companyId", label: "settings.jobBoards.fields.linkedin.companyIdLabel", placeholder: "settings.jobBoards.fields.linkedin.companyIdPlaceholder" },
    { key: "endpoint", label: "settings.jobBoards.fields.linkedin.endpointLabel", placeholder: "settings.jobBoards.fields.linkedin.endpointPlaceholder" },
  ],
  naukri: [
    { key: "endpoint", label: "settings.jobBoards.fields.naukri.endpointLabel", placeholder: "settings.jobBoards.fields.naukri.endpointPlaceholder" },
    { key: "apiKey", label: "settings.jobBoards.fields.naukri.apiKeyLabel", placeholder: "settings.jobBoards.fields.naukri.apiKeyPlaceholder", secret: true },
  ],
  indeed: [],
};

export function JobBoardSettings() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["job-board-config"],
    queryFn: async () => (await apiGet<{ boards: BoardConfig[] }>("/job-boards/config")).data?.boards ?? [],
  });

  const careerQuery = useQuery({
    queryKey: ["career-page-config"],
    queryFn: async () => (await apiGet<CareerPage | null>("/career-pages")).data,
  });
  const slug = careerQuery.data?.slug || "default";
  const feedUrl = `${window.location.origin}/api/v1/public/careers/${slug}/feed.xml`;

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t("settings.jobBoards.heading")}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("settings.jobBoards.description")}
        </p>
      </div>

      <FeedCard feedUrl={feedUrl} />

      {(data ?? []).map((b) => (
        <BoardCard key={b.board} board={b} feedUrl={feedUrl} />
      ))}
    </div>
  );
}

function FeedCard({ feedUrl }: { feedUrl: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
        <Rss className="h-4 w-4" /> {t("settings.jobBoards.feed.title")}
      </div>
      <p className="mt-1 text-xs text-brand-700">
        {t("settings.jobBoards.feed.description")}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-brand-200 bg-white px-2 py-1.5 text-xs text-gray-700">
          {feedUrl}
        </code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(feedUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("settings.jobBoards.feed.copied") : t("settings.jobBoards.feed.copy")}
        </button>
      </div>
    </div>
  );
}

function BoardCard({ board, feedUrl }: { board: BoardConfig; feedUrl: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(board.enabled);
  const [autoPublish, setAutoPublish] = useState(board.auto_publish);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const fields = FIELDS[board.board] ?? [];
  const isFeed = board.mode === "feed";

  const save = useMutation({
    mutationFn: () => {
      const hasCreds = Object.values(creds).some((v) => v.trim() !== "");
      return apiPut(`/job-boards/config/${board.board}`, {
        enabled,
        auto_publish: autoPublish,
        ...(hasCreds ? { config: creds } : {}),
      });
    },
    onSuccess: () => {
      toast.success(t("settings.jobBoards.saved", { board: LABEL[board.board] }));
      setCreds({});
      qc.invalidateQueries({ queryKey: ["job-board-config"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t("settings.jobBoards.saveFailed")),
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">{LABEL[board.board]}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{board.mode}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              board.configured ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {board.configured ? t("settings.jobBoards.ready") : t("settings.jobBoards.notConnected")}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
          />
          {t("settings.jobBoards.enabled")}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={autoPublish}
            onChange={(e) => setAutoPublish(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
          />
          {t("settings.jobBoards.autoPublish")}
        </label>
      </div>

      {isFeed ? (
        <p className="mt-3 text-xs text-gray-500">
          {t("settings.jobBoards.feedNote")}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600">{t(f.label)}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={creds[f.key] ?? ""}
                onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={board.has_credentials ? t("settings.jobBoards.savedPlaceholder") : t(f.placeholder)}
                autoComplete="off"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>
      )}

      {board.last_error && <p className="mt-2 text-xs text-red-500">{board.last_error}</p>}

      <div className="mt-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("settings.jobBoards.save")}
        </button>
      </div>
    </div>
  );
}

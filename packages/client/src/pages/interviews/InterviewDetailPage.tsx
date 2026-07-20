import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { enumLabel } from "@/lib/enums";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Users,
  Star,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  MapPin,
  Clock,
  ArrowLeft,
  Video,
  Mic,
  FileText,
  Link as LinkIcon,
  Mail,
  Upload,
  Trash2,
  Copy,
  CheckCircle,
  Download,
  Loader2,
  Play,
  X,
  UserPlus,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, apiGet, apiPost, apiPut, apiPatch, apiDelete } from "@/api/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AiAnalysisCard } from "@/components/AiAnalysisCard";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import type {
  Interview,
  InterviewPanelist,
  InterviewFeedback,
  InterviewStatus,
  Recommendation,
} from "@emp-recruit/shared";

interface InterviewDetail extends Interview {
  panelists: InterviewPanelist[];
  feedback: InterviewFeedback[];
  candidate_name: string;
  job_title: string;
  application: { id: string; candidate_id: string; job_id: string } | null;
}

interface Recording {
  id: string;
  interview_id: string;
  file_path: string;
  file_size: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  uploaded_by: number;
  uploaded_at: string;
  created_at: string;
}

interface Transcript {
  id: string;
  interview_id: string;
  recording_id: string | null;
  content: string;
  summary: string | null;
  status: "processing" | "completed" | "failed";
  generated_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-800",
};

const PROVIDER_LABELS: Record<string, string> = {
  jitsi: "Jitsi (in-app)",
  livekit: "LiveKit (in-app)",
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: "text-green-700 bg-green-50",
  yes: "text-green-600 bg-green-50",
  neutral: "text-gray-600 bg-gray-50",
  no: "text-red-600 bg-red-50",
  strong_no: "text-red-700 bg-red-50",
};

const RECOMMENDATION_ICONS: Record<string, typeof ThumbsUp> = {
  strong_yes: ThumbsUp,
  yes: ThumbsUp,
  neutral: Star,
  no: ThumbsDown,
  strong_no: ThumbsDown,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300",
          )}
        />
      ))}
      <span className="ml-1 text-sm text-gray-600">{value}/5</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline feedback form for panelists who haven't submitted yet
// ---------------------------------------------------------------------------
function InlineFeedbackForm({
  interviewId,
  onSuccess,
}: {
  interviewId: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [recommendation, setRecommendation] = useState<Recommendation | "">("");
  const [overallScore, setOverallScore] = useState(0);
  const [technicalScore, setTechnicalScore] = useState(0);
  const [communicationScore, setCommunicationScore] = useState(0);
  const [culturalFitScore, setCulturalFitScore] = useState(0);
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      return apiPost(`/interviews/${interviewId}/feedback`, {
        recommendation,
        overall_score: overallScore || undefined,
        technical_score: technicalScore || undefined,
        communication_score: communicationScore || undefined,
        cultural_fit_score: culturalFitScore || undefined,
        strengths: strengths || undefined,
        weaknesses: weaknesses || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess,
  });

  function ScoreSelector({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  i <= value
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300 hover:text-yellow-300",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-5 rounded-lg border border-brand-200 bg-brand-50/30 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900">{t("interviews.detail.submitYourFeedback")}</h3>

      {/* Recommendation */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("interviews.detail.recommendation")} <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "strong_yes", label: t("interviews.detail.recStrongYes") },
              { value: "yes", label: t("interviews.detail.recYes") },
              { value: "neutral", label: t("interviews.detail.recNeutral") },
              { value: "no", label: t("interviews.detail.recNo") },
              { value: "strong_no", label: t("interviews.detail.recStrongNo") },
            ] as { value: Recommendation; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecommendation(opt.value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                recommendation === opt.value
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-brand-400",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScoreSelector label={t("interviews.detail.overall")} value={overallScore} onChange={setOverallScore} />
        <ScoreSelector label={t("interviews.detail.technical")} value={technicalScore} onChange={setTechnicalScore} />
        <ScoreSelector
          label={t("interviews.detail.communication")}
          value={communicationScore}
          onChange={setCommunicationScore}
        />
        <ScoreSelector
          label={t("interviews.detail.culturalFit")}
          value={culturalFitScore}
          onChange={setCulturalFitScore}
        />
      </div>

      {/* Text areas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.detail.strengths")}</label>
          <textarea
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder={t("interviews.detail.strengthsPlaceholder")}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.detail.weaknesses")}</label>
          <textarea
            value={weaknesses}
            onChange={(e) => setWeaknesses(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder={t("interviews.detail.weaknessesPlaceholder")}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.detail.additionalNotes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder={t("interviews.detail.notesPlaceholder")}
        />
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-600">
          {(mutation.error as any)?.response?.data?.error?.message || t("interviews.detail.submitFeedbackError")}
        </p>
      )}

      <button
        type="submit"
        disabled={!recommendation || mutation.isPending}
        className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {mutation.isPending ? t("interviews.detail.submitting") : t("interviews.detail.submitFeedback")}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Meeting Link Section
// ---------------------------------------------------------------------------
function MeetingLinkSection({ interview }: { interview: InterviewDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [invitationSent, setInvitationSent] = useState(false);

  const generateMeetMutation = useMutation({
    mutationFn: async () => {
      return apiPost(`/interviews/${interview.id}/generate-meet`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview", interview.id] });
    },
  });

  const sendInvitationMutation = useMutation({
    mutationFn: async () => {
      return apiPost(`/interviews/${interview.id}/send-invitation`);
    },
    onSuccess: () => {
      setInvitationSent(true);
      setTimeout(() => setInvitationSent(false), 5000);
    },
  });

  const handleCopyLink = async () => {
    if (interview.meeting_link) {
      await navigator.clipboard.writeText(interview.meeting_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Video className="h-5 w-5 text-gray-400" /> {t("interviews.detail.meeting")}
        </h3>
        {interview.meeting_provider && (
          <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
            {PROVIDER_LABELS[interview.meeting_provider] || interview.meeting_provider}
          </span>
        )}
      </div>

      {!interview.meeting_link ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{t("interviews.detail.noMeetingLink")}</p>
          <button
            onClick={() => generateMeetMutation.mutate()}
            disabled={generateMeetMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <LinkIcon className="h-4 w-4" />
            {generateMeetMutation.isPending ? t("interviews.detail.generating") : t("interviews.detail.generateMeetingLink")}
          </button>
          {generateMeetMutation.isError && (
            <p className="text-sm text-red-600">{t("interviews.detail.generateLinkError")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Embedded providers (Jitsi/LiveKit): join inside the app. */}
            {interview.meeting_embeddable && (
              <Link
                to={`/interviews/${interview.id}/room`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
              >
                <Video className="h-4 w-4" />
                {t("interviews.detail.joinRoom")}
              </Link>
            )}
            <a
              href={interview.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors",
                interview.meeting_embeddable
                  ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  : "bg-brand-600 text-white hover:bg-brand-700",
              )}
            >
              {interview.meeting_embeddable ? (
                <ExternalLink className="h-4 w-4" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              {interview.meeting_embeddable ? t("interviews.detail.openExternally") : t("interviews.detail.joinMeeting")}
            </a>
            <a
              href={interview.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800 break-all"
            >
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              {interview.meeting_link}
            </a>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" /> {t("interviews.detail.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> {t("interviews.detail.copyLink")}
                </>
              )}
            </button>
            <button
              onClick={() => sendInvitationMutation.mutate()}
              disabled={sendInvitationMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              {sendInvitationMutation.isPending ? t("interviews.detail.sending") : t("interviews.detail.sendInvitation")}
            </button>
          </div>

          {invitationSent && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-800">{t("interviews.detail.invitationSent")}</p>
            </div>
          )}

          {sendInvitationMutation.isError && (
            <p className="text-sm text-red-600">
              {(sendInvitationMutation.error as any)?.response?.data?.error?.message || t("interviews.detail.sendInvitationError")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Links Section
// ---------------------------------------------------------------------------
function CalendarLinksSection({ interviewId }: { interviewId: string }) {
  const { t } = useTranslation();
  const { data: calendarLinks, isLoading } = useQuery({
    queryKey: ["calendar-links", interviewId],
    queryFn: async () => {
      const res = await apiGet<{ google: string; outlook: string; office365: string }>(
        `/interviews/${interviewId}/calendar-links`,
      );
      return res.data!;
    },
  });

  if (isLoading || !calendarLinks) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-gray-400" /> {t("interviews.detail.addToCalendar")}
      </h3>
      <div className="flex flex-wrap gap-2">
        <a
          href={calendarLinks.google}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <Calendar className="h-4 w-4" />
          {t("interviews.detail.googleCalendar")}
        </a>
        <a
          href={calendarLinks.outlook}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
        >
          <Calendar className="h-4 w-4" />
          {t("interviews.detail.outlook")}
        </a>
        <a
          href={calendarLinks.office365}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
        >
          <Calendar className="h-4 w-4" />
          {t("interviews.detail.office365")}
        </a>
        <a
          href={`/api/v1/interviews/${interviewId}/calendar.ics`}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Download className="h-4 w-4" />
          {t("interviews.detail.downloadIcs")}
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording Section
// ---------------------------------------------------------------------------
// Build a same-origin/API-anchored URL to stream a recording. A native media
// element can't send an auth header, so the in-memory access token rides in the
// query string when present (authenticate() accepts ?token=). After a reload
// the token is empty and the same-origin httpOnly auth cookie authenticates the
// request instead (audit H3).
function recordingFileUrl(interviewId: string, recId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "/api/v1";
  const token = useAuthStore.getState().accessToken || "";
  return `${apiBase}/interviews/${interviewId}/recordings/${recId}/file?token=${encodeURIComponent(token)}`;
}

function RecordingSection({ interviewId }: { interviewId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: recordings = [] } = useQuery({
    queryKey: ["recordings", interviewId],
    queryFn: async () => {
      const res = await apiGet<Recording[]>(`/interviews/${interviewId}/recordings`);
      return res.data || [];
    },
  });

  // The interview's current transcript — used to show per-recording status
  // (transcribing / ready / failed) right on the row. Polls while processing.
  const { data: transcript } = useQuery({
    queryKey: ["transcript", interviewId],
    queryFn: async () => {
      const res = await apiGet<Transcript | null>(`/interviews/${interviewId}/transcript`);
      return res.data ?? null;
    },
    refetchInterval: (query) =>
      (query.state.data as Transcript | null)?.status === "processing" ? 4000 : false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("recording", file);
      setUploadProgress(0);

      const res = await api.post(`/interviews/${interviewId}/recordings`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings", interviewId] });
      // Upload auto-starts transcription — refetch so the Transcript section
      // picks up the new "processing" row and polls until it completes.
      queryClient.invalidateQueries({ queryKey: ["transcript", interviewId] });
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: () => {
      setUploadProgress(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (recId: string) => {
      return apiDelete(`/interviews/${interviewId}/recordings/${recId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings", interviewId] });
      queryClient.invalidateQueries({ queryKey: ["transcript", interviewId] });
    },
  });
  const [recToDelete, setRecToDelete] = useState<string | null>(null);

  const transcribeMutation = useMutation({
    mutationFn: async (recId: string) => {
      return apiPost(`/interviews/${interviewId}/recordings/${recId}/transcribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transcript", interviewId] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Mic className="h-5 w-5 text-gray-400" /> {t("interviews.detail.recordings")} ({recordings.length})
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/mp4,video/webm"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {uploadMutation.isPending ? t("interviews.detail.uploading") : t("interviews.detail.uploadRecording")}
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {uploadProgress !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>{t("interviews.detail.uploading")}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-brand-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {uploadMutation.isError && (
        <p className="text-sm text-red-600 mb-3">
          {(uploadMutation.error as any)?.response?.data?.error?.message || t("interviews.detail.uploadRecordingError")}
        </p>
      )}

      {recordings.length === 0 && uploadProgress === null && (
        <p className="text-sm text-gray-500">{t("interviews.detail.noRecordings")}</p>
      )}

      {recordings.length > 0 && (
        <div className="divide-y divide-gray-100">
          {recordings.map((rec) => {
            const fileName = rec.file_path.split("/").pop() || "recording";
            const isVideo = rec.mime_type?.startsWith("video/") ?? true;
            const isOpen = previewId === rec.id;
            const fileUrl = recordingFileUrl(interviewId, rec.id);
            return (
              <div key={rec.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                      {isVideo ? (
                        <Video className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Mic className="h-4 w-4 text-purple-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-xs">{fileName}</p>
                      <p className="text-xs text-gray-500">
                        {rec.file_size ? formatFileSize(rec.file_size) : t("interviews.detail.unknownSize")}
                        {rec.duration_seconds ? ` \u00b7 ${Math.floor(rec.duration_seconds / 60)}m ${rec.duration_seconds % 60}s` : ""}
                        {" \u00b7 "}
                        {formatDate(rec.uploaded_at)}
                      </p>
                      {transcript?.recording_id === rec.id && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium">
                          {transcript.status === "processing" && (
                            <span className="inline-flex items-center gap-1 text-yellow-700">
                              <Loader2 className="h-3 w-3 animate-spin" /> {t("interviews.detail.transcribing")}
                            </span>
                          )}
                          {transcript.status === "completed" && (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <CheckCircle className="h-3 w-3" /> {t("interviews.detail.transcriptReady")}
                            </span>
                          )}
                          {transcript.status === "failed" && (
                            <span className="text-red-600">{t("interviews.detail.transcriptionFailed")}</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewId(isOpen ? null : rec.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {isOpen ? <X className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {isOpen ? t("interviews.detail.close") : t("interviews.detail.preview")}
                    </button>
                    <a
                      href={fileUrl}
                      download={fileName}
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                      title={t("interviews.detail.downloadRecording")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => transcribeMutation.mutate(rec.id)}
                      disabled={transcribeMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {transcribeMutation.isPending ? t("interviews.detail.generating") : t("interviews.detail.generateTranscript")}
                    </button>
                    <button
                      onClick={() => setRecToDelete(rec.id)}
                      disabled={deleteMutation.isPending}
                      className="inline-flex items-center rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline preview player. No autoPlay: Chrome blocks autoplay
                    with sound, which would leave the <video> paused on a black
                    frame. preload="auto" paints the first frame; the user hits
                    play for video + audio. */}
                {isOpen && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-black">
                    {isVideo ? (
                      <video
                        src={fileUrl}
                        controls
                        playsInline
                        preload="auto"
                        className="max-h-96 w-full bg-black"
                      />
                    ) : (
                      <audio src={fileUrl} controls preload="auto" className="w-full" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={recToDelete !== null}
        variant="danger"
        title={t("interviews.detail.deleteRecordingTitle")}
        message={t("interviews.detail.deleteRecordingMessage")}
        confirmLabel={t("interviews.detail.delete")}
        cancelLabel={t("interviews.detail.cancel")}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (recToDelete) {
            deleteMutation.mutate(recToDelete, { onSettled: () => setRecToDelete(null) });
          }
        }}
        onCancel={() => setRecToDelete(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript Section
// ---------------------------------------------------------------------------
function TranscriptSection({ interviewId }: { interviewId: string }) {
  const { t } = useTranslation();
  const { data: transcript } = useQuery({
    queryKey: ["transcript", interviewId],
    queryFn: async () => {
      const res = await apiGet<Transcript | null>(`/interviews/${interviewId}/transcript`);
      return res.data ?? null;
    },
    // While transcription runs in the background, poll until it's done.
    refetchInterval: (query) =>
      (query.state.data as Transcript | null)?.status === "processing" ? 4000 : false,
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-gray-400" /> {t("interviews.detail.transcript")}
      </h3>

      {!transcript ? (
        <p className="text-sm text-gray-500">
          {t("interviews.detail.transcriptEmpty")}
        </p>
      ) : transcript.status === "processing" ? (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
          <p className="text-sm text-yellow-800">
            {t("interviews.detail.transcriptProcessing")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status badge */}
          {transcript.status !== "completed" && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                "bg-red-100 text-red-800",
              )}
            >
              {transcript.status}
            </span>
          )}

          {/* Transcript content */}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {transcript.content}
            </pre>
          </div>

          {transcript.generated_at && (
            <p className="text-xs text-gray-400">
              {t("interviews.detail.generatedAt", { date: formatDate(transcript.generated_at) })}
            </p>
          )}

          {/* AI Analysis — score + feedback generated from this transcript */}
          <AiAnalysisCard interviewId={interviewId} embedded />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary (HR notes) — standalone card
// ---------------------------------------------------------------------------
function InterviewSummaryCard({ interview }: { interview: InterviewDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<string>(interview.summary || "");
  const [saveSummarySuccess, setSaveSummarySuccess] = useState(false);

  const saveSummaryMutation = useMutation({
    // HR notes live on the interview, so they can be saved before (or without)
    // any recording/transcript.
    mutationFn: async () => apiPut(`/interviews/${interview.id}/summary`, { summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview", interview.id] });
      setSaveSummarySuccess(true);
      setTimeout(() => setSaveSummarySuccess(false), 3000);
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-gray-400" /> {t("interviews.detail.summaryTitle")}
      </h3>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        placeholder={t("interviews.detail.summaryPlaceholder")}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => saveSummaryMutation.mutate()}
          disabled={saveSummaryMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saveSummaryMutation.isPending ? t("interviews.detail.saving") : t("interviews.detail.saveSummary")}
        </button>
        {saveSummarySuccess && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" /> {t("interviews.detail.saved")}
          </span>
        )}
        {saveSummaryMutation.isError && (
          <span className="text-sm text-red-600">{t("interviews.detail.saveSummaryError")}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function InterviewDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: interview, isLoading, isError } = useQuery({
    queryKey: ["interview", id],
    queryFn: async () => {
      const res = await apiGet<InterviewDetail>(`/interviews/${id}`);
      return res.data!;
    },
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: InterviewStatus) => {
      await apiPatch(`/interviews/${id}/status`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interview", id] }),
  });

  // Panelist management (Add / Remove).
  const [showAddPanelist, setShowAddPanelist] = useState(false);
  const [panelistUserId, setPanelistUserId] = useState("");
  const [panelistRole, setPanelistRole] = useState("interviewer");

  const { data: orgUsersData } = useQuery({
    queryKey: ["org-users", "panelist"],
    queryFn: () =>
      apiGet<{ id: number; first_name: string; last_name: string; email: string }[]>(
        "/organizations/users",
      ),
    enabled: !!id,
  });
  const orgUsers = orgUsersData?.data ?? [];

  const addPanelistMutation = useMutation({
    mutationFn: (body: { user_id: number; role: string }) =>
      apiPost(`/interviews/${id}/panelists`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview", id] });
      setShowAddPanelist(false);
      setPanelistUserId("");
      setPanelistRole("interviewer");
      toast.success(t("interviews.detail.panelistAdded"));
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("interviews.detail.addPanelistError")),
  });

  const removePanelistMutation = useMutation({
    mutationFn: (userId: number) => apiDelete(`/interviews/${id}/panelists/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview", id] });
      toast.success(t("interviews.detail.panelistRemoved"));
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("interviews.detail.removePanelistError")),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        {t("interviews.detail.loading")}
      </div>
    );
  }

  if (isError || !interview) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        {t("interviews.detail.loadError")}
      </div>
    );
  }

  const currentUserId = user?.empcloudUserId;
  const isPanelist = interview.panelists.some((p) => p.user_id === currentUserId);
  const hasSubmittedFeedback = interview.feedback.some((f) => f.panelist_id === currentUserId);
  const showFeedbackForm = isPanelist && !hasSubmittedFeedback;

  const panelistName = (uid: number) => {
    const u = orgUsers.find((x) => x.id === uid);
    return u ? `${u.first_name} ${u.last_name}`.trim() || u.email : `User #${uid}`;
  };
  // Users not already on the panel — candidates for the Add Panelist picker.
  const availablePanelistUsers = orgUsers.filter(
    (u) => !interview.panelists.some((p) => p.user_id === u.id),
  );

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={() => navigate("/interviews")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("interviews.detail.backToInterviews")}
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{interview.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {interview.candidate_name} &mdash; {interview.job_title}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium capitalize",
              STATUS_COLORS[interview.status] || "bg-gray-100 text-gray-800",
            )}
          >
            {enumLabel(t, "interviewStatus", interview.status)}
          </span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Calendar className="h-4 w-4" /> {t("interviews.detail.schedule")}
          </div>
          <p className="text-sm font-medium text-gray-900">{formatDate(interview.scheduled_at)}</p>
          <p className="text-xs text-gray-500">{formatTime(interview.scheduled_at)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Clock className="h-4 w-4" /> {t("interviews.detail.duration")}
          </div>
          <p className="text-sm font-medium text-gray-900">{t("interviews.detail.durationMinutes", { minutes: interview.duration_minutes })}</p>
          <p className="text-xs text-gray-500 capitalize">{interview.type} &middot; {t("interviews.detail.round", { round: interview.round })}</p>
        </div>
        {interview.location && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <MapPin className="h-4 w-4" /> {t("interviews.detail.location")}
            </div>
            <p className="text-sm font-medium text-gray-900">{interview.location}</p>
          </div>
        )}
        {interview.meeting_link && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ExternalLink className="h-4 w-4" /> {t("interviews.detail.meetingLink")}
            </div>
            {interview.meeting_embeddable ? (
              /* Embedded providers (Jitsi/LiveKit): join in-app. */
              <Link
                to={`/interviews/${interview.id}/room`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-800"
              >
                <Video className="h-4 w-4" /> {t("interviews.detail.joinRoom")}
              </Link>
            ) : (
              <a
                href={interview.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand-600 hover:text-brand-800 break-all"
              >
                {t("interviews.detail.joinMeeting")}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Status actions */}
      {interview.status !== "completed" && interview.status !== "cancelled" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{t("interviews.detail.changeStatus")}</span>
          {(["in_progress", "completed", "cancelled", "no_show"] as InterviewStatus[])
            .filter((s) => s !== interview.status)
            .map((status) => (
              <button
                key={status}
                onClick={() => statusMutation.mutate(status)}
                disabled={statusMutation.isPending}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 capitalize disabled:opacity-50"
              >
                {status.replace("_", " ")}
              </button>
            ))}
        </div>
      )}

      {/* Meeting Link Section */}
      <MeetingLinkSection interview={interview} />

      {/* Calendar Links Section */}
      <CalendarLinksSection interviewId={interview.id} />

      {/* Notes */}
      {interview.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-1">{t("interviews.detail.notes")}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{interview.notes}</p>
        </div>
      )}

      {/* Panelists */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" /> {t("interviews.detail.panelists")} ({interview.panelists.length})
          </h2>
          {!showAddPanelist && (
            <button
              onClick={() => setShowAddPanelist(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              <UserPlus className="h-4 w-4" /> {t("interviews.detail.addPanelist")}
            </button>
          )}
        </div>

        {showAddPanelist && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500">{t("interviews.detail.teamMember")}</label>
                <select
                  value={panelistUserId}
                  onChange={(e) => setPanelistUserId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t("interviews.detail.selectPerson")}</option>
                  {availablePanelistUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {`${u.first_name} ${u.last_name}`.trim() || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t("interviews.detail.role")}</label>
                <select
                  value={panelistRole}
                  onChange={(e) => setPanelistRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:w-40"
                >
                  <option value="interviewer">{t("interviews.detail.roleInterviewer")}</option>
                  <option value="lead">{t("interviews.detail.roleLead")}</option>
                  <option value="observer">{t("interviews.detail.roleObserver")}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!panelistUserId) {
                      toast.error(t("interviews.detail.selectTeamMember"));
                      return;
                    }
                    addPanelistMutation.mutate({ user_id: Number(panelistUserId), role: panelistRole });
                  }}
                  disabled={addPanelistMutation.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {addPanelistMutation.isPending ? t("interviews.detail.adding") : t("interviews.detail.add")}
                </button>
                <button
                  onClick={() => {
                    setShowAddPanelist(false);
                    setPanelistUserId("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t("interviews.detail.cancel")}
                </button>
              </div>
            </div>
            {availablePanelistUsers.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">{t("interviews.detail.everyoneOnPanel")}</p>
            )}
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {interview.panelists.length === 0 && (
            <p className="px-6 py-4 text-sm text-gray-500">{t("interviews.detail.noPanelists")}</p>
          )}
          {interview.panelists.map((panelist) => {
            const fb = interview.feedback.find((f) => f.panelist_id === panelist.user_id);
            const name = panelistName(panelist.user_id);
            const initials = name.startsWith("User #")
              ? String(panelist.user_id)
              : name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
            return (
              <div key={panelist.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-700">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{name}</p>
                    <p className="text-xs text-gray-500 capitalize">{panelist.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {fb ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      {t("interviews.detail.feedbackSubmitted")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {t("interviews.detail.pending")}
                    </span>
                  )}
                  <button
                    onClick={() => removePanelistMutation.mutate(panelist.user_id)}
                    disabled={removePanelistMutation.isPending}
                    title={t("interviews.detail.removePanelist")}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recording Section */}
      <RecordingSection interviewId={interview.id} />

      {/* Transcript Section (includes Summary + AI Analysis) */}
      <TranscriptSection interviewId={interview.id} />

      {/* Feedback form (if current user is panelist and hasn't submitted) */}
      {showFeedbackForm && (
        <InlineFeedbackForm
          interviewId={interview.id}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["interview", id] })}
        />
      )}

      {/* Submitted feedback */}
      {interview.feedback.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("interviews.detail.submittedFeedback")} ({interview.feedback.length})
          </h2>
          {interview.feedback.map((fb) => {
            const RecIcon = RECOMMENDATION_ICONS[fb.recommendation] || Star;
            return (
              <div
                key={fb.id}
                className="rounded-lg border border-gray-200 bg-white p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {fb.panelist_id}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {t("interviews.detail.panelistNumber", { id: fb.panelist_id })}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      RECOMMENDATION_COLORS[fb.recommendation] || "bg-gray-50 text-gray-600",
                    )}
                  >
                    <RecIcon className="h-3 w-3" />
                    {fb.recommendation.replace("_", " ")}
                  </span>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {fb.overall_score != null && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{t("interviews.detail.overall")}</p>
                      <StarRating value={fb.overall_score} />
                    </div>
                  )}
                  {fb.technical_score != null && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{t("interviews.detail.technical")}</p>
                      <StarRating value={fb.technical_score} />
                    </div>
                  )}
                  {fb.communication_score != null && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{t("interviews.detail.communication")}</p>
                      <StarRating value={fb.communication_score} />
                    </div>
                  )}
                  {fb.cultural_fit_score != null && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{t("interviews.detail.culturalFit")}</p>
                      <StarRating value={fb.cultural_fit_score} />
                    </div>
                  )}
                </div>

                {/* Text feedback */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {fb.strengths && (
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-0.5">{t("interviews.detail.strengths")}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.strengths}</p>
                    </div>
                  )}
                  {fb.weaknesses && (
                    <div>
                      <p className="text-xs font-medium text-red-700 mb-0.5">{t("interviews.detail.weaknesses")}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.weaknesses}</p>
                    </div>
                  )}
                </div>

                {fb.notes && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-0.5">{t("interviews.detail.notes")}</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{fb.notes}</p>
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  {t("interviews.detail.submittedAt", { date: formatDate(fb.submitted_at) })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Link to standalone feedback form */}
      {showFeedbackForm && (
        <div className="text-center">
          <Link
            to={`/interviews/${interview.id}/feedback`}
            className="text-sm text-brand-600 hover:text-brand-800 font-medium"
          >
            {t("interviews.detail.openFullFeedbackForm")}
          </Link>
        </div>
      )}

      {/* Summary (HR notes) — standalone card, last */}
      <InterviewSummaryCard interview={interview} />
    </div>
  );
}

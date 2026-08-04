import { useState } from "react";
import { useTranslation } from "react-i18next";
import { enumLabel } from "@/lib/enums";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Loader2,
  Search,
  Users,
  Check,
  CheckCircle2,
  CalendarClock,
  MapPin,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { DateInput } from "@/components/DateInput";
import { cn, getInitials } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Application, PaginatedResponse, InterviewType } from "@emp-recruit/shared";

type ApplicationRow = Application & { candidate_name: string; job_title: string };

const STAGE_BADGE: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screened: "bg-indigo-100 text-indigo-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-600",
};

const INTERVIEW_TYPES: { value: InterviewType; labelKey: string }[] = [
  { value: "phone" as InterviewType, labelKey: "interviews.schedule.typePhone" },
  { value: "video" as InterviewType, labelKey: "interviews.schedule.typeVideo" },
  { value: "onsite" as InterviewType, labelKey: "interviews.schedule.typeOnsite" },
  { value: "assignment" as InterviewType, labelKey: "interviews.schedule.typeAssignment" },
  { value: "panel" as InterviewType, labelKey: "interviews.schedule.typePanel" },
];

// #18 — keep `round` and `duration_minutes` as strings so the user can
// clear the field (empty string) without the input snapping back to "0"
// via Number(""). Converted to int in handleSubmit.
interface FormData {
  application_id: string;
  type: string;
  round: string;
  title: string;
  scheduled_at: string;
  scheduled_time: string;
  duration_minutes: string;
  location: string;
  meeting_link: string;
  notes: string;
}

const INITIAL: FormData = {
  application_id: "",
  type: "video",
  round: "1",
  title: "",
  scheduled_at: "",
  scheduled_time: "10:00",
  duration_minutes: "60",
  location: "",
  meeting_link: "",
  notes: "",
};

// Today in YYYY-MM-DD for the date picker min (#17).
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InterviewSchedulePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedAppId = searchParams.get("application_id") || "";

  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    application_id: preselectedAppId,
  });
  const [appSearch, setAppSearch] = useState("");

  // Fetch applications for the dropdown. #16 — the backend returns
  // `candidate_name` (via a new SELECT on application.service.ts) so the
  // picker row displays the name correctly.
  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["applications-for-schedule", appSearch],
    queryFn: () =>
      apiGet<PaginatedResponse<ApplicationRow>>("/applications", {
        page: 1,
        perPage: 50,
        ...(appSearch && { search: appSearch }),
      }),
  });
  const applications = appsData?.data?.data || [];

  const scheduleMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiPost("/interviews", data),
    onSuccess: () => {
      toast.success(t("interviews.schedule.scheduleSuccess"));
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      navigate("/interviews");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t("interviews.schedule.scheduleError");
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.application_id) {
      toast.error(t("interviews.schedule.errorSelectApplication"));
      return;
    }
    if (!form.scheduled_at) {
      toast.error(t("interviews.schedule.errorSelectDate"));
      return;
    }
    if (!form.title) {
      toast.error(t("interviews.schedule.errorEnterTitle"));
      return;
    }

    // #17 — no past dates. Backend currently accepts any ISO date so
    // the guard lives here.
    const today = todayIso();
    if (form.scheduled_at < today) {
      toast.error(t("interviews.schedule.errorDatePast"));
      return;
    }

    // #19 — backend requires round and duration_minutes to be non-zero
    // positive integers; `!round` in the route handler rejects 0 with a
    // "Missing required fields" error. Fail fast with a clearer message.
    const round = parseInt(form.round, 10);
    const durationMinutes = parseInt(form.duration_minutes, 10);
    if (!Number.isFinite(round) || round < 1) {
      toast.error(t("interviews.schedule.errorRoundPositive"));
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
      toast.error(t("interviews.schedule.errorDurationMin"));
      return;
    }

    // Combine date and time into ISO datetime
    const dateTime = new Date(`${form.scheduled_at}T${form.scheduled_time || "10:00"}:00`);

    // The date-only check above passes when the date is today, so also reject a
    // combined date+time that is already in the past (e.g. today at 8:00 AM when
    // it's now afternoon).
    if (dateTime.getTime() < Date.now()) {
      toast.error(t("interviews.schedule.errorTimePast"));
      return;
    }

    const payload: Record<string, any> = {
      application_id: form.application_id,
      type: form.type,
      round,
      title: form.title,
      scheduled_at: dateTime.toISOString(),
      duration_minutes: durationMinutes,
    };

    if (form.location) payload.location = form.location;
    if (form.meeting_link) payload.meeting_link = form.meeting_link;
    if (form.notes) payload.notes = form.notes;

    scheduleMutation.mutate(payload);
  }

  const saving = scheduleMutation.isPending;

  // Find selected application for display
  const selectedApp = applications.find((a) => a.id === form.application_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("interviews.schedule.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("interviews.schedule.subtitle")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Application Selection */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Users className="h-5 w-5 text-brand-600" />
              {t("interviews.schedule.selectApplication")}
            </h2>
            {!loadingApps && applications.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                {applications.length}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t("interviews.schedule.searchCandidatePlaceholder")}
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {loadingApps ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" /> {t("interviews.schedule.loadingApplications")}
            </div>
          ) : applications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
              <Users className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-700">{t("interviews.schedule.noApplicationsTitle")}</p>
              <p className="mt-1 text-xs text-gray-500">{t("interviews.schedule.noApplications")}</p>
            </div>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {applications.map((app) => {
                const selected = form.application_id === app.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, application_id: app.id }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-brand-400 bg-brand-50 ring-1 ring-brand-400"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        selected ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {getInitials(app.candidate_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          selected ? "text-brand-900" : "text-gray-900",
                        )}
                      >
                        {app.candidate_name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-xs text-gray-500">{app.job_title}</span>
                        <span
                          className={cn(
                            "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                            STAGE_BADGE[app.stage] ?? "bg-gray-100 text-gray-600",
                          )}
                        >
                          {enumLabel(t, "stage", app.stage)}
                        </span>
                      </div>
                    </div>
                    {selected && (
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {selectedApp && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-600" />
              <span className="min-w-0 truncate text-brand-800">
                <span className="font-medium">{selectedApp.candidate_name}</span>
                <span className="text-brand-600"> · {selectedApp.job_title}</span>
              </span>
            </div>
          )}
        </div>

        {/* Interview Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            {t("interviews.schedule.interviewDetails")}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("interviews.schedule.titleLabel")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder={t("interviews.schedule.titlePlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.typeLabel")}</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {INTERVIEW_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {t(type.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.roundLabel")}</label>
              {/* #18 — store as string so the user can clear the field
                  with backspace without Number("") snapping back to 0. */}
              <input
                type="number"
                min={1}
                value={form.round}
                onChange={(e) => setForm((p) => ({ ...p, round: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("interviews.schedule.dateLabel")} <span className="text-red-500">*</span>
              </label>
              {/* #17 — can't schedule in the past. */}
              <DateInput
                max="9999-12-31"
                required
                value={form.scheduled_at}
                min={todayIso()}
                onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("interviews.schedule.timeLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={form.scheduled_time}
                onChange={(e) => setForm((p) => ({ ...p, scheduled_time: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.durationLabel")}</label>
              {/* #18 — same string-state pattern as Round. */}
              <input
                type="number"
                min={15}
                max={480}
                value={form.duration_minutes}
                onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Location & Meeting */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <MapPin className="h-5 w-5 text-brand-600" />
            {t("interviews.schedule.locationMeeting")}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.locationLabel")}</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder={t("interviews.schedule.locationPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.meetingLinkLabel")}</label>
            <input
              type="url"
              value={form.meeting_link}
              onChange={(e) => setForm((p) => ({ ...p, meeting_link: e.target.value }))}
              placeholder="https://meet.google.com/..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("interviews.schedule.notesLabel")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder={t("interviews.schedule.notesPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("interviews.schedule.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("interviews.schedule.title")}
          </button>
        </div>
      </form>
    </div>
  );
}

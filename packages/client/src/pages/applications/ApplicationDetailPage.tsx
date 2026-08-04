import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Save, UserCircle, CalendarClock, Activity, ListChecks, Mail } from "lucide-react";
import { apiGet, apiPatch } from "@/api/client";
import { ApplicationStage } from "@emp-recruit/shared";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface OrgUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}
interface ActivityItem {
  id: string;
  type: string;
  message: string;
  actor_id: number | null;
  actor_name?: string | null;
  created_at: string;
}
interface ScreeningAnswer {
  id: string;
  question_text: string;
  answer: string | null;
  knockout_failed: boolean;
}
interface AppDetail {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: string;
  candidate_first_name?: string;
  candidate_last_name?: string;
  candidate_email?: string;
  job_title?: string;
  assigned_to: number | null;
  sla_due_date: string | null;
  assignee_name: string | null;
}

const STAGES = Object.values(ApplicationStage);

export function ApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: appData, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: () => apiGet<AppDetail>(`/applications/${id}`),
    enabled: Boolean(id),
  });
  const app = appData?.data;

  const { data: usersData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => apiGet<OrgUser[]>("/organizations/users"),
  });
  const users = usersData?.data ?? [];

  const { data: activityData } = useQuery({
    queryKey: ["application-activity", id],
    queryFn: () => apiGet<ActivityItem[]>(`/applications/${id}/activity`),
    enabled: Boolean(id),
  });
  const activity = activityData?.data ?? [];

  const { data: answersData } = useQuery({
    queryKey: ["application-screening", id],
    queryFn: () => apiGet<ScreeningAnswer[]>(`/applications/${id}/screening-answers`),
    enabled: Boolean(id),
  });
  const answers = answersData?.data ?? [];

  // Local editable assignment state, seeded from the loaded application.
  const [assignee, setAssignee] = useState<string>("");
  const [sla, setSla] = useState<string>("");
  useEffect(() => {
    if (app) {
      setAssignee(app.assigned_to != null ? String(app.assigned_to) : "");
      setSla(app.sla_due_date ? app.sla_due_date.slice(0, 10) : "");
    }
  }, [app]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["application", id] });
    queryClient.invalidateQueries({ queryKey: ["application-activity", id] });
    // The applications list renders a stage badge from cached rows; without
    // this it stays stale (up to the global staleTime) after a stage change.
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const assignMutation = useMutation({
    mutationFn: () =>
      apiPatch(`/applications/${id}/assign`, {
        assigned_to: assignee === "" ? null : Number(assignee),
        sla_due_date: sla === "" ? null : sla,
      }),
    onSuccess: () => {
      toast.success(t("applications.detail.assignmentSaved"));
      invalidate();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("applications.detail.assignmentFailed")),
  });

  const stageMutation = useMutation({
    mutationFn: (stage: string) => apiPatch(`/applications/${id}/stage`, { stage }),
    onSuccess: () => {
      toast.success(t("applications.detail.stageMoved"));
      invalidate();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || t("applications.detail.stageFailed")),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!app) {
    return <div className="py-12 text-center text-gray-500">{t("applications.detail.notFound")}</div>;
  }

  const candidateName = `${app.candidate_first_name ?? ""} ${app.candidate_last_name ?? ""}`.trim() || "—";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("applications.detail.back")}
      </button>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{candidateName}</h1>
            {app.candidate_email && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500">
                <Mail className="h-4 w-4" /> {app.candidate_email}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">{app.job_title ?? "—"}</p>
          </div>
          <Link
            to={`/candidates/${app.candidate_id}`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t("applications.detail.viewCandidate")}
          </Link>
        </div>

        {/* Stage */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t("applications.detail.stage")}
          </span>
          <select
            value={app.stage}
            onChange={(e) => stageMutation.mutate(e.target.value)}
            disabled={stageMutation.isPending}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`applications.stage.${s}`, s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignment + SLA */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserCircle className="h-5 w-5 text-brand-600" />
          {t("applications.detail.ownership")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("applications.detail.assignee")}
            </label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t("applications.detail.unassigned")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {`${u.first_name} ${u.last_name}`.trim() || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <CalendarClock className="h-3.5 w-3.5" /> {t("applications.detail.slaDate")}
            </label>
            <input
              type="date"
              value={sla}
              onChange={(e) => setSla(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("applications.detail.save")}
          </button>
        </div>
      </div>

      {/* Screening answers */}
      {answers.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ListChecks className="h-5 w-5 text-brand-600" />
            {t("applications.detail.screeningAnswers")}
          </h2>
          <ul className="space-y-2">
            {answers.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="font-medium text-gray-700">{a.question_text}</p>
                <p className={a.knockout_failed ? "text-red-600" : "text-gray-600"}>
                  {a.answer || "—"}
                  {a.knockout_failed && ` · ${t("applications.detail.knockoutFailed")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity feed */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Activity className="h-5 w-5 text-brand-600" />
          {t("applications.detail.activity")}
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400">{t("applications.detail.noActivity")}</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-400" />
                <div>
                  <p className="text-gray-700">{ev.message}</p>
                  <p className="text-xs text-gray-400">
                    {ev.actor_name ? `${ev.actor_name} · ` : ""}
                    {formatDate(ev.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

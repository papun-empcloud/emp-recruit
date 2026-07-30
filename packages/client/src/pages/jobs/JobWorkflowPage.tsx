import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Plus, Trash2, UserPlus, Users, ListTodo, CheckCircle2, Circle } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api/client";
import { ApplicationStage, HiringTeamRole, RecruitmentTaskStatus } from "@emp-recruit/shared";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface OrgUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}
interface TeamMember {
  id: string;
  user_id: number;
  role: string;
  user_name: string | null;
  user_email: string | null;
}
interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: number | null;
  due_date: string | null;
  status: string;
  assignee_name: string | null;
}
interface AppRow {
  id: string;
  stage: string;
  candidate_name?: string;
  candidate_first_name?: string;
  candidate_last_name?: string;
}

const STAGES = Object.values(ApplicationStage);
const ROLES = Object.values(HiringTeamRole);
const STAGE_HEADER: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800",
  screened: "bg-indigo-100 text-indigo-800",
  interview: "bg-purple-100 text-purple-800",
  offer: "bg-amber-100 text-amber-800",
  hired: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-800",
};

export function JobWorkflowPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const userName = (u: OrgUser) => `${u.first_name} ${u.last_name}`.trim() || u.email;
  const candidateName = (a: AppRow) =>
    a.candidate_name || `${a.candidate_first_name ?? ""} ${a.candidate_last_name ?? ""}`.trim() || "—";

  const { data: jobData } = useQuery({
    queryKey: ["job", id],
    queryFn: () => apiGet<{ title: string }>(`/jobs/${id}`),
    enabled: Boolean(id),
  });
  const job = jobData?.data;

  const { data: usersData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => apiGet<OrgUser[]>("/organizations/users"),
  });
  const users = usersData?.data ?? [];

  const { data: appsData } = useQuery({
    queryKey: ["job-applications", id],
    queryFn: () => apiGet<{ data: AppRow[] }>(`/jobs/${id}/applications`, { perPage: 100 }),
    enabled: Boolean(id),
  });
  const applications = appsData?.data?.data ?? [];

  const { data: teamData } = useQuery({
    queryKey: ["job-hiring-team", id],
    queryFn: () => apiGet<TeamMember[]>(`/jobs/${id}/hiring-team`),
    enabled: Boolean(id),
  });
  const team = teamData?.data ?? [];

  const { data: tasksData } = useQuery({
    queryKey: ["job-tasks", id],
    queryFn: () => apiGet<Task[]>(`/jobs/${id}/tasks`),
    enabled: Boolean(id),
  });
  const tasks = tasksData?.data ?? [];

  // --- Hiring team mutations ---
  const [newMemberUser, setNewMemberUser] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<string>(ROLES[0]);
  const invalidateTeam = () => qc.invalidateQueries({ queryKey: ["job-hiring-team", id] });

  const addMember = useMutation({
    mutationFn: () => apiPost(`/jobs/${id}/hiring-team`, { user_id: Number(newMemberUser), role: newMemberRole }),
    onSuccess: () => {
      toast.success(t("jobs.workflow.memberAdded"));
      setNewMemberUser("");
      invalidateTeam();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.memberFailed")),
  });
  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      apiPatch(`/jobs/${id}/hiring-team/${memberId}`, { role }),
    onSuccess: invalidateTeam,
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.memberFailed")),
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) => apiDelete(`/jobs/${id}/hiring-team/${memberId}`),
    onSuccess: () => {
      toast.success(t("jobs.workflow.memberRemoved"));
      invalidateTeam();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.memberFailed")),
  });

  // --- Task mutations ---
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const invalidateTasks = () => qc.invalidateQueries({ queryKey: ["job-tasks", id] });

  const addTask = useMutation({
    mutationFn: () =>
      apiPost(`/jobs/${id}/tasks`, {
        title: newTaskTitle.trim(),
        assigned_to: newTaskAssignee === "" ? null : Number(newTaskAssignee),
        due_date: newTaskDue || null,
      }),
    onSuccess: () => {
      toast.success(t("jobs.workflow.taskAdded"));
      setNewTaskTitle("");
      setNewTaskAssignee("");
      setNewTaskDue("");
      invalidateTasks();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.taskFailed")),
  });
  const updateTask = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Record<string, any> }) =>
      apiPatch(`/jobs/${id}/tasks/${taskId}`, patch),
    onSuccess: invalidateTasks,
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.taskFailed")),
  });
  const deleteTask = useMutation({
    mutationFn: (taskId: string) => apiDelete(`/jobs/${id}/tasks/${taskId}`),
    onSuccess: () => {
      toast.success(t("jobs.workflow.taskDeleted"));
      invalidateTasks();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || t("jobs.workflow.taskFailed")),
  });

  const grouped: Record<string, AppRow[]> = {};
  for (const s of STAGES) grouped[s] = [];
  for (const a of applications) if (grouped[a.stage]) grouped[a.stage].push(a);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/jobs/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("jobs.workflow.backToJob")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{t("jobs.workflow.title")}</h1>
        <p className="text-sm text-gray-500">{job?.title ?? ""}</p>
      </div>

      {/* Pipeline */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("jobs.workflow.pipeline")}</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((s) => (
            <div key={s} className="min-w-[180px] flex-1">
              <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold ${STAGE_HEADER[s] ?? "bg-gray-100 text-gray-800"}`}>
                <span>{t(`applications.stage.${s}`, s)}</span>
                <span>{grouped[s].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[s].map((a) => (
                  <Link
                    key={a.id}
                    to={`/applications/${a.id}`}
                    className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:border-brand-300 hover:bg-brand-50"
                  >
                    {candidateName(a)}
                  </Link>
                ))}
                {grouped[s].length === 0 && <p className="px-1 text-xs text-gray-300">—</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hiring team */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Users className="h-5 w-5 text-brand-600" />
            {t("jobs.workflow.hiringTeam")}
          </h2>

          <ul className="space-y-2">
            {team.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{m.user_name || m.user_email || `#${m.user_id}`}</p>
                  {m.user_email && <p className="truncate text-xs text-gray-400">{m.user_email}</p>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole.mutate({ memberId: m.id, role: e.target.value })}
                    className="rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`jobs.workflow.roles.${r}`, r)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMember.mutate(m.id)}
                    title={t("jobs.workflow.remove")}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
            {team.length === 0 && <li className="text-sm text-gray-400">{t("jobs.workflow.noMembers")}</li>}
          </ul>

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <select
              value={newMemberUser}
              onChange={(e) => setNewMemberUser(e.target.value)}
              className="min-w-[9rem] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t("jobs.workflow.selectUser")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userName(u)}
                </option>
              ))}
            </select>
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`jobs.workflow.roles.${r}`, r)}
                </option>
              ))}
            </select>
            <button
              onClick={() => newMemberUser && addMember.mutate()}
              disabled={!newMemberUser || addMember.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {t("jobs.workflow.addMember")}
            </button>
          </div>
        </section>

        {/* Tasks */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ListTodo className="h-5 w-5 text-brand-600" />
            {t("jobs.workflow.tasks")}
          </h2>

          <ul className="space-y-2">
            {tasks.map((task) => {
              const done = task.status === RecruitmentTaskStatus.DONE;
              return (
                <li key={task.id} className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2">
                  <button
                    onClick={() =>
                      updateTask.mutate({
                        taskId: task.id,
                        patch: { status: done ? RecruitmentTaskStatus.TODO : RecruitmentTaskStatus.DONE },
                      })
                    }
                    title={t("jobs.workflow.toggleDone")}
                    className={done ? "mt-0.5 text-green-600" : "mt-0.5 text-gray-300 hover:text-gray-500"}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${done ? "text-gray-400 line-through" : "text-gray-800"}`}>{task.title}</p>
                    <p className="text-xs text-gray-400">
                      {task.assignee_name || t("jobs.workflow.unassigned")}
                      {task.due_date ? ` · ${formatDate(task.due_date)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTask.mutate(task.id)}
                    title={t("jobs.workflow.delete")}
                    className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
            {tasks.length === 0 && <li className="text-sm text-gray-400">{t("jobs.workflow.noTasks")}</li>}
          </ul>

          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              maxLength={300}
              placeholder={t("jobs.workflow.taskTitlePlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                className="min-w-[9rem] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">{t("jobs.workflow.unassigned")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userName(u)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={() => newTaskTitle.trim() && addTask.mutate()}
                disabled={!newTaskTitle.trim() || addTask.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {t("jobs.workflow.addTask")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

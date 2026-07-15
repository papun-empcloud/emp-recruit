import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  User,
  Calendar,
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { api } from "@/api/client";
import type { OnboardingChecklist, OnboardingTask, OnboardingStatus } from "@emp-recruit/shared";

interface ChecklistDetail extends OnboardingChecklist {
  tasks: OnboardingTask[];
  candidate_name: string;
  job_title: string;
  progress: { total: number; completed: number; percentage: number };
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: "onboarding.status.notStarted", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "onboarding.status.inProgress", className: "bg-blue-100 text-blue-700" },
  completed: { label: "onboarding.status.completed", className: "bg-green-100 text-green-700" },
};

const TASK_STATUS_ICON: Record<string, { icon: typeof Circle; className: string }> = {
  not_started: { icon: Circle, className: "text-gray-300" },
  in_progress: { icon: Clock, className: "text-blue-500" },
  completed: { icon: CheckCircle2, className: "text-green-500" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "---";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "completed") return false;
  return new Date(dueDate) < new Date();
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 rounded-full bg-gray-200">
        <div
          className={`h-3 rounded-full transition-all ${
            percentage >= 100 ? "bg-green-500" : percentage > 0 ? "bg-brand-500" : "bg-gray-300"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 tabular-nums">{percentage}%</span>
    </div>
  );
}

function groupTasksByCategory(tasks: OnboardingTask[]): Record<string, OnboardingTask[]> {
  const groups: Record<string, OnboardingTask[]> = {};
  for (const task of tasks) {
    const cat = task.category || "general";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(task);
  }
  return groups;
}

export function OnboardingDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["onboarding-checklist", id],
    queryFn: () => apiGet<ChecklistDetail>(`/onboarding/checklists/${id}`),
    enabled: !!id,
  });

  const checklist = data?.data;

  const updateTaskStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.patch(`/onboarding/tasks/${taskId}`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-checklist", id] });
    },
  });

  function toggleTask(task: OnboardingTask) {
    const newStatus = task.status === "completed" ? "not_started" : "completed";
    updateTaskStatus.mutate({ taskId: task.id, status: newStatus });
  }

  function cycleStatus(task: OnboardingTask) {
    const order = ["not_started", "in_progress", "completed"] as OnboardingStatus[];
    const currentIdx = order.indexOf(task.status);
    const nextStatus = order[(currentIdx + 1) % order.length];
    updateTaskStatus.mutate({ taskId: task.id, status: nextStatus });
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !checklist) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-sm font-medium text-gray-900">{t("onboarding.detail.notFound")}</h3>
        <Link to="/onboarding" className="mt-2 text-sm text-brand-600 hover:underline">
          {t("onboarding.detail.backToOnboarding")}
        </Link>
      </div>
    );
  }

  const sConfig = STATUS_CONFIG[checklist.status] || STATUS_CONFIG.not_started;
  const groupedTasks = groupTasksByCategory(checklist.tasks);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/onboarding")} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{t("onboarding.detail.title")}</h1>
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${sConfig.className}`}>
              {t(sConfig.label)}
            </span>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">{t("onboarding.detail.candidate")}</p>
            <p className="text-sm font-semibold text-gray-900">{checklist.candidate_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">{t("onboarding.detail.position")}</p>
            <p className="text-sm font-semibold text-gray-900">{checklist.job_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">{t("onboarding.detail.started")}</p>
            <p className="text-sm font-semibold text-gray-900">{formatDate(checklist.started_at)}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{t("onboarding.detail.progress")}</h2>
          <p className="text-sm text-gray-500">
            {t("onboarding.detail.tasksCompleted", {
              completed: checklist.progress.completed,
              total: checklist.progress.total,
            })}
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar percentage={checklist.progress.percentage} />
        </div>
      </div>

      {/* Tasks by Category */}
      <div className="space-y-4">
        {Object.entries(groupedTasks).map(([category, categoryTasks]) => (
          <div key={category} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase">
                {category.replace(/_/g, " ")}
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {categoryTasks.map((task) => {
                const taskIcon = TASK_STATUS_ICON[task.status] || TASK_STATUS_ICON.not_started;
                const TaskIcon = taskIcon.icon;
                const overdue = isOverdue(task.due_date, task.status);

                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-4 px-6 py-4 ${
                      task.status === "completed" ? "bg-gray-50/50" : ""
                    }`}
                  >
                    {/* Checkbox / Status Toggle */}
                    <button
                      onClick={() => toggleTask(task)}
                      disabled={updateTaskStatus.isPending}
                      className="mt-0.5 flex-shrink-0 disabled:opacity-50"
                      title={t("onboarding.detail.markAsTitle", {
                        status:
                          task.status === "completed"
                            ? t("onboarding.detail.markStatusNotStarted")
                            : t("onboarding.detail.markStatusCompleted"),
                      })}
                    >
                      <TaskIcon className={`h-5 w-5 ${taskIcon.className} transition-colors hover:text-brand-500`} />
                    </button>

                    {/* Task Details */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{task.description}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 flex-wrap">
                        {task.due_date && (
                          <span className={`inline-flex items-center gap-1 text-xs ${overdue ? "font-medium text-red-600" : "text-gray-500"}`}>
                            <Calendar className="h-3 w-3" />
                            {overdue
                              ? t("onboarding.detail.overdueDate", { date: formatDate(task.due_date) })
                              : t("onboarding.detail.dueDate", { date: formatDate(task.due_date) })}
                          </span>
                        )}
                        {task.assignee_id && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <User className="h-3 w-3" />
                            {t("onboarding.detail.assigneeUser", { id: task.assignee_id })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Cycle Button */}
                    <button
                      onClick={() => cycleStatus(task)}
                      disabled={updateTaskStatus.isPending}
                      className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        STATUS_CONFIG[task.status]?.className || "bg-gray-100 text-gray-700"
                      } hover:opacity-80`}
                      title={t("onboarding.detail.cycleStatus")}
                    >
                      {STATUS_CONFIG[task.status]?.label
                        ? t(STATUS_CONFIG[task.status]!.label)
                        : task.status}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

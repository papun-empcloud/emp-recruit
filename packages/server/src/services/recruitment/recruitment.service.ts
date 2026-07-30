// ============================================================================
// HIRING TEAM & RECRUITMENT TASKS SERVICE (031)
// Both attach to a job; assignees/members must be active members of the
// caller's organization (users live in the separate EmpCloud master DB, so
// membership is validated explicitly — there is no FK to enforce it).
// ============================================================================

import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  JobHiringTeamMember,
  RecruitmentTask,
  HiringTeamRole,
  RecruitmentTaskStatus,
} from "@emp-recruit/shared";

// Ensure the job exists in this org (throws 404 otherwise).
async function assertJob(orgId: number, jobId: string): Promise<void> {
  const db = getDB();
  const job = await db.findOne("job_postings", { id: jobId, organization_id: orgId });
  if (!job) throw new NotFoundError("Job posting", jobId);
}

// Resolve an assignee/member that MUST be an active member of this org.
async function assertOrgMember(orgId: number, userId: number) {
  const user = await findUserById(userId).catch(() => null);
  if (!user || user.organization_id !== orgId || user.status !== 1) {
    throw new ValidationError("User must be an active member of your organization");
  }
  return user;
}

function fullName(u: { first_name?: string | null; last_name?: string | null } | null): string | null {
  if (!u) return null;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null;
}

// Resolve display names/emails for a set of EmpCloud user ids (deduped), only
// exposing users that belong to THIS org (defense-in-depth against stale ids).
async function resolveUsers(orgId: number, ids: number[]) {
  const unique = [...new Set(ids.filter((x): x is number => x != null))];
  const map = new Map<number, { name: string | null; email: string | null }>();
  await Promise.all(
    unique.map(async (id) => {
      const u = await findUserById(id).catch(() => null);
      if (u && u.organization_id === orgId) map.set(id, { name: fullName(u), email: u.email ?? null });
    }),
  );
  return map;
}

// ---------------------------------------------------------------------------
// Hiring team
// ---------------------------------------------------------------------------

export async function listHiringTeam(orgId: number, jobId: string): Promise<JobHiringTeamMember[]> {
  const db = getDB();
  await assertJob(orgId, jobId);
  const result = await db.findMany<JobHiringTeamMember>("job_hiring_team", {
    filters: { organization_id: orgId, job_id: jobId },
    sort: { field: "created_at", order: "asc" },
    limit: 200,
  });
  const users = await resolveUsers(orgId, result.data.map((m) => m.user_id));
  return result.data.map((m) => ({
    ...m,
    user_name: users.get(m.user_id)?.name ?? null,
    user_email: users.get(m.user_id)?.email ?? null,
  }));
}

export async function addHiringTeamMember(
  orgId: number,
  jobId: string,
  data: { user_id: number; role: HiringTeamRole },
): Promise<JobHiringTeamMember> {
  const db = getDB();
  await assertJob(orgId, jobId);
  const user = await assertOrgMember(orgId, data.user_id);

  // One membership per (job, user): update the role if they're already on the team.
  const existing = await db.findOne<JobHiringTeamMember>("job_hiring_team", {
    organization_id: orgId,
    job_id: jobId,
    user_id: data.user_id,
  });
  const saved = existing
    ? await db.update<JobHiringTeamMember>("job_hiring_team", existing.id, { role: data.role })
    : await db.create<JobHiringTeamMember>("job_hiring_team", {
        organization_id: orgId,
        job_id: jobId,
        user_id: data.user_id,
        role: data.role,
      });
  return { ...saved, user_name: fullName(user), user_email: user.email ?? null };
}

export async function updateHiringTeamMember(
  orgId: number,
  memberId: string,
  data: { role: HiringTeamRole },
): Promise<JobHiringTeamMember> {
  const db = getDB();
  const member = await db.findOne<JobHiringTeamMember>("job_hiring_team", {
    id: memberId,
    organization_id: orgId,
  });
  if (!member) throw new NotFoundError("Hiring team member", memberId);
  const saved = await db.update<JobHiringTeamMember>("job_hiring_team", memberId, { role: data.role });
  const users = await resolveUsers(orgId, [saved.user_id]);
  return {
    ...saved,
    user_name: users.get(saved.user_id)?.name ?? null,
    user_email: users.get(saved.user_id)?.email ?? null,
  };
}

export async function removeHiringTeamMember(orgId: number, memberId: string): Promise<void> {
  const db = getDB();
  const member = await db.findOne<JobHiringTeamMember>("job_hiring_team", {
    id: memberId,
    organization_id: orgId,
  });
  if (!member) throw new NotFoundError("Hiring team member", memberId);
  await db.delete("job_hiring_team", memberId);
}

// ---------------------------------------------------------------------------
// Recruitment tasks
// ---------------------------------------------------------------------------

interface TaskInput {
  title: string;
  description?: string | null;
  assigned_to?: number | null;
  due_date?: string | null;
  application_id?: string | null;
  status?: RecruitmentTaskStatus;
}

export async function listJobTasks(orgId: number, jobId: string): Promise<RecruitmentTask[]> {
  const db = getDB();
  await assertJob(orgId, jobId);
  const result = await db.findMany<RecruitmentTask>("recruitment_tasks", {
    filters: { organization_id: orgId, job_id: jobId },
    sort: { field: "created_at", order: "desc" },
    limit: 500,
  });
  const users = await resolveUsers(orgId, result.data.map((task) => task.assigned_to as number).filter(Boolean));
  return result.data.map((task) => ({
    ...task,
    assignee_name: task.assigned_to != null ? users.get(task.assigned_to)?.name ?? null : null,
  }));
}

export async function createJobTask(
  orgId: number,
  userId: number,
  jobId: string,
  data: TaskInput,
): Promise<RecruitmentTask> {
  const db = getDB();
  await assertJob(orgId, jobId);
  if (data.assigned_to != null) await assertOrgMember(orgId, data.assigned_to);

  const saved = await db.create<RecruitmentTask>("recruitment_tasks", {
    organization_id: orgId,
    job_id: jobId,
    application_id: data.application_id ?? null,
    title: data.title,
    description: data.description ?? null,
    assigned_to: data.assigned_to ?? null,
    due_date: data.due_date ? String(data.due_date).slice(0, 10) : null,
    status: data.status ?? ("todo" as RecruitmentTaskStatus),
    created_by: userId,
  });
  const users = await resolveUsers(orgId, saved.assigned_to != null ? [saved.assigned_to] : []);
  return { ...saved, assignee_name: saved.assigned_to != null ? users.get(saved.assigned_to)?.name ?? null : null };
}

export async function updateTask(
  orgId: number,
  taskId: string,
  data: Partial<TaskInput>,
): Promise<RecruitmentTask> {
  const db = getDB();
  const task = await db.findOne<RecruitmentTask>("recruitment_tasks", { id: taskId, organization_id: orgId });
  if (!task) throw new NotFoundError("Task", taskId);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description ?? null;
  if (data.due_date !== undefined) updates.due_date = data.due_date ? String(data.due_date).slice(0, 10) : null;
  if (data.status !== undefined) updates.status = data.status;
  if (data.assigned_to !== undefined) {
    if (data.assigned_to != null) await assertOrgMember(orgId, data.assigned_to);
    updates.assigned_to = data.assigned_to ?? null;
  }

  const saved = await db.update<RecruitmentTask>("recruitment_tasks", taskId, updates);
  const users = await resolveUsers(orgId, saved.assigned_to != null ? [saved.assigned_to] : []);
  return { ...saved, assignee_name: saved.assigned_to != null ? users.get(saved.assigned_to)?.name ?? null : null };
}

export async function deleteTask(orgId: number, taskId: string): Promise<void> {
  const db = getDB();
  const task = await db.findOne<RecruitmentTask>("recruitment_tasks", { id: taskId, organization_id: orgId });
  if (!task) throw new NotFoundError("Task", taskId);
  await db.delete("recruitment_tasks", taskId);
}

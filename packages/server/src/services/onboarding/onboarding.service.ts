// ============================================================================
// ONBOARDING SERVICE
// Business logic for onboarding templates, checklists, and task management.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  OnboardingTemplate,
  OnboardingTemplateTask,
  OnboardingChecklist,
  OnboardingTask,
  OnboardingStatus,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateTemplateData {
  name: string;
  description?: string;
  department?: string;
  is_default?: boolean;
}

interface UpdateTemplateData {
  name?: string;
  description?: string;
  department?: string;
  is_default?: boolean;
}

interface CreateTemplateTaskData {
  title: string;
  description?: string;
  category: string;
  assignee_role?: string;
  due_days: number;
  order: number;
  is_required?: boolean;
}

interface UpdateTemplateTaskData {
  title?: string;
  description?: string;
  category?: string;
  assignee_role?: string;
  due_days?: number;
  order?: number;
  is_required?: boolean;
}

interface ListChecklistsParams {
  status?: OnboardingStatus;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

export async function createTemplate(
  orgId: number,
  data: CreateTemplateData,
): Promise<OnboardingTemplate> {
  const db = getDB();

  // If setting as default, unset any existing default for this org (+ department)
  if (data.is_default) {
    const filters: Record<string, any> = { organization_id: orgId, is_default: true };
    if (data.department) {
      filters.department = data.department;
    }
    await db.updateMany("onboarding_templates", filters, { is_default: false });
  }

  return db.create<OnboardingTemplate>("onboarding_templates", {
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    department: data.department || null,
    is_default: data.is_default ?? false,
  });
}

export async function updateTemplate(
  orgId: number,
  id: string,
  data: UpdateTemplateData,
): Promise<OnboardingTemplate> {
  const db = getDB();

  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", id);
  }

  if (data.is_default) {
    const filters: Record<string, any> = { organization_id: orgId, is_default: true };
    const dept = data.department ?? template.department;
    if (dept) {
      filters.department = dept;
    }
    await db.updateMany("onboarding_templates", filters, { is_default: false });
  }

  return db.update<OnboardingTemplate>("onboarding_templates", id, data);
}

export async function listTemplates(orgId: number) {
  const db = getDB();

  const result = await db.findMany<OnboardingTemplate>("onboarding_templates", {
    filters: { organization_id: orgId },
    sort: { field: "name", order: "asc" },
    limit: 100,
  });

  // Enrich with task count
  const enriched = await Promise.all(
    result.data.map(async (template) => {
      const taskCount = await db.count("onboarding_template_tasks", {
        template_id: template.id,
      });
      return { ...template, task_count: taskCount };
    }),
  );

  return enriched;
}

// ---------------------------------------------------------------------------
// Template Task Management
// ---------------------------------------------------------------------------

export async function listTemplateTasks(
  orgId: number,
  templateId: string,
): Promise<OnboardingTemplateTask[]> {
  const db = getDB();

  // Verify template belongs to org
  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", templateId);
  }

  const result = await db.findMany<OnboardingTemplateTask>("onboarding_template_tasks", {
    filters: { template_id: templateId },
    sort: { field: "order", order: "asc" },
    limit: 200,
  });

  return result.data;
}

export async function addTemplateTask(
  orgId: number,
  templateId: string,
  data: CreateTemplateTaskData,
): Promise<OnboardingTemplateTask> {
  const db = getDB();

  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", templateId);
  }

  return db.create<OnboardingTemplateTask>("onboarding_template_tasks", {
    template_id: templateId,
    title: data.title,
    description: data.description || null,
    category: data.category,
    assignee_role: data.assignee_role || null,
    due_days: data.due_days,
    order: data.order,
    is_required: data.is_required ?? true,
  });
}

export async function updateTemplateTask(
  orgId: number,
  templateId: string,
  taskId: string,
  data: UpdateTemplateTaskData,
): Promise<OnboardingTemplateTask> {
  const db = getDB();

  // Verify template belongs to org
  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", templateId);
  }

  const task = await db.findOne<OnboardingTemplateTask>("onboarding_template_tasks", {
    id: taskId,
    template_id: templateId,
  });
  if (!task) {
    throw new NotFoundError("OnboardingTemplateTask", taskId);
  }

  return db.update<OnboardingTemplateTask>("onboarding_template_tasks", taskId, data);
}

export async function removeTemplateTask(
  orgId: number,
  templateId: string,
  taskId: string,
): Promise<void> {
  const db = getDB();

  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", templateId);
  }

  const deleted = await db.delete("onboarding_template_tasks", taskId);
  if (!deleted) {
    throw new NotFoundError("OnboardingTemplateTask", taskId);
  }
}

// ---------------------------------------------------------------------------
// Checklist Generation & Management
// ---------------------------------------------------------------------------

/**
 * Auto-generate an onboarding checklist when an offer is accepted. Picks the
 * most appropriate template for the new hire, preferring a department-specific
 * default, then an org-wide default, then — so a misconfigured org that never
 * flagged a template as default still gets a checklist — any template for the
 * department, and finally any template at all. Best-effort: returns null and
 * does nothing if there are no templates or a checklist already exists — it
 * must never block the offer acceptance that triggers it.
 */
export async function autoGenerateOnAcceptance(
  orgId: number,
  applicationId: string,
  joiningDate: string,
  department: string | null,
): Promise<(OnboardingChecklist & { tasks: OnboardingTask[] }) | null> {
  const db = getDB();

  // Don't duplicate a checklist that already exists for this application.
  const existing = await db.findOne<OnboardingChecklist>("onboarding_checklists", {
    application_id: applicationId,
    organization_id: orgId,
  });
  if (existing) return null;

  const all = await db.findMany<OnboardingTemplate>("onboarding_templates", {
    filters: { organization_id: orgId },
    limit: 100,
  });
  const templates = all.data;
  if (templates.length === 0) return null; // nothing configured — nothing to do

  const dept = department || null;
  const template =
    // a department-specific default is the best match
    (dept ? templates.find((t) => t.is_default && t.department === dept) : undefined) ||
    // then an org-wide (department-less) default
    templates.find((t) => t.is_default && !t.department) ||
    // then any default
    templates.find((t) => t.is_default) ||
    // then a department match even if it isn't flagged default
    (dept ? templates.find((t) => t.department === dept) : undefined) ||
    // finally, any template so a checklist is still generated
    templates[0];
  if (!template) return null;

  return generateChecklist(orgId, applicationId, template.id, joiningDate);
}

export async function generateChecklist(
  orgId: number,
  applicationId: string,
  templateId: string,
  joiningDate: string,
): Promise<OnboardingChecklist & { tasks: OnboardingTask[] }> {
  const db = getDB();

  // Verify application
  const application = await db.findOne<any>("applications", {
    id: applicationId,
    organization_id: orgId,
  });
  if (!application) {
    throw new NotFoundError("Application", applicationId);
  }

  // Verify template
  const template = await db.findOne<OnboardingTemplate>("onboarding_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("OnboardingTemplate", templateId);
  }

  // Check no active checklist exists for this application
  const existing = await db.findOne<OnboardingChecklist>("onboarding_checklists", {
    application_id: applicationId,
    organization_id: orgId,
  });
  if (existing && existing.status !== "completed") {
    throw new ValidationError("An active onboarding checklist already exists for this application");
  }

  // Get template tasks
  const templateTasksResult = await db.findMany<OnboardingTemplateTask>(
    "onboarding_template_tasks",
    {
      filters: { template_id: templateId },
      sort: { field: "order", order: "asc" },
      limit: 200,
    },
  );

  // Create checklist
  const checklist = await db.create<OnboardingChecklist>("onboarding_checklists", {
    organization_id: orgId,
    application_id: applicationId,
    candidate_id: application.candidate_id,
    template_id: templateId,
    status: "not_started" as OnboardingStatus,
  });

  // Create tasks from template with calculated due dates
  const joiningDateObj = new Date(joiningDate);
  const tasks: OnboardingTask[] = [];

  for (const tt of templateTasksResult.data) {
    const dueDate = new Date(joiningDateObj);
    dueDate.setDate(dueDate.getDate() + tt.due_days);

    const task = await db.create<OnboardingTask>("onboarding_tasks", {
      checklist_id: checklist.id,
      template_task_id: tt.id,
      title: tt.title,
      description: tt.description,
      category: tt.category,
      due_date: dueDate.toISOString().split("T")[0],
      status: "not_started" as OnboardingStatus,
    });
    tasks.push(task);
  }

  return { ...checklist, tasks };
}

export async function getChecklist(
  orgId: number,
  id: string,
): Promise<
  OnboardingChecklist & {
    tasks: OnboardingTask[];
    candidate_name: string;
    job_title: string;
    progress: { total: number; completed: number; percentage: number };
  }
> {
  const db = getDB();

  const checklist = await db.findOne<OnboardingChecklist>("onboarding_checklists", {
    id,
    organization_id: orgId,
  });
  if (!checklist) {
    throw new NotFoundError("OnboardingChecklist", id);
  }

  // Get tasks
  const tasksResult = await db.findMany<OnboardingTask>("onboarding_tasks", {
    filters: { checklist_id: id },
    sort: { field: "due_date", order: "asc" },
    limit: 200,
  });

  // Get candidate info
  const candidate = await db.findById<any>("candidates", checklist.candidate_id);
  const application = await db.findById<any>("applications", checklist.application_id);
  const job = application ? await db.findById<any>("job_postings", application.job_id) : null;

  // Calculate progress
  const total = tasksResult.data.length;
  const completed = tasksResult.data.filter((t) => t.status === "completed").length;

  return {
    ...checklist,
    tasks: tasksResult.data,
    candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
    job_title: job?.title || "Unknown",
    progress: {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  };
}

export async function listChecklists(orgId: number, params: ListChecklistsParams) {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) {
    filters.status = params.status;
  }

  const result = await db.findMany<OnboardingChecklist>("onboarding_checklists", {
    filters,
    page: params.page || 1,
    limit: params.limit || 20,
    sort: { field: "created_at", order: "desc" },
  });

  // Enrich with candidate info and progress
  const enriched = await Promise.all(
    result.data.map(async (cl) => {
      const candidate = await db.findById<any>("candidates", cl.candidate_id);
      const application = await db.findById<any>("applications", cl.application_id);
      const job = application ? await db.findById<any>("job_postings", application.job_id) : null;

      const totalTasks = await db.count("onboarding_tasks", { checklist_id: cl.id });
      const completedTasks = await db.count("onboarding_tasks", {
        checklist_id: cl.id,
        status: "completed",
      });

      // Determine joining date from related offer
      const offer = await db.findOne<any>("offers", {
        application_id: cl.application_id,
        organization_id: orgId,
        status: "accepted",
      });

      return {
        ...cl,
        candidate_name: candidate
          ? `${candidate.first_name} ${candidate.last_name}`
          : "Unknown",
        job_title: job?.title || "Unknown",
        joining_date: offer?.joining_date || null,
        progress: {
          total: totalTasks,
          completed: completedTasks,
          percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        },
      };
    }),
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function updateTaskStatus(
  orgId: number,
  taskId: string,
  status: "not_started" | "in_progress" | "completed",
  userId: number,
): Promise<OnboardingTask> {
  const db = getDB();

  const task = await db.findById<OnboardingTask>("onboarding_tasks", taskId);
  if (!task) {
    throw new NotFoundError("OnboardingTask", taskId);
  }

  // Verify checklist belongs to org
  const checklist = await db.findOne<OnboardingChecklist>("onboarding_checklists", {
    id: task.checklist_id,
    organization_id: orgId,
  });
  if (!checklist) {
    throw new NotFoundError("OnboardingChecklist", task.checklist_id);
  }

  const updateData: Record<string, any> = { status };
  if (status === "completed") {
    updateData.completed_at = new Date();
    updateData.assignee_id = userId;
  } else {
    updateData.completed_at = null;
  }

  const updatedTask = await db.update<OnboardingTask>("onboarding_tasks", taskId, updateData);

  // Update checklist status based on task progress
  const totalTasks = await db.count("onboarding_tasks", { checklist_id: checklist.id });
  const completedTasks = await db.count("onboarding_tasks", {
    checklist_id: checklist.id,
    status: "completed",
  });

  let checklistStatus: OnboardingStatus;
  if (completedTasks === 0) {
    checklistStatus = "not_started" as OnboardingStatus;
  } else if (completedTasks >= totalTasks) {
    checklistStatus = "completed" as OnboardingStatus;
  } else {
    checklistStatus = "in_progress" as OnboardingStatus;
  }

  const checklistUpdate: Record<string, any> = { status: checklistStatus };
  if (checklistStatus === "in_progress" && !checklist.started_at) {
    checklistUpdate.started_at = new Date();
  }
  if (checklistStatus === "completed") {
    checklistUpdate.completed_at = new Date();
  }

  await db.update("onboarding_checklists", checklist.id, checklistUpdate);

  return updatedTask;
}

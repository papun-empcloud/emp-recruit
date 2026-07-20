// ============================================================================
// ONBOARDING SERVICE
// Business logic for onboarding templates, checklists, and task management.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
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

// A sensible standard onboarding checklist, seeded automatically when an org has
// no template that actually contains tasks — otherwise auto-generated checklists
// come out empty ("No tasks in this template yet").
const DEFAULT_ONBOARDING_TASKS: CreateTemplateTaskData[] = [
  { title: "Send welcome email and first-day details", category: "Pre-boarding", assignee_role: "hr", due_days: 0, order: 0 },
  { title: "Prepare workstation and equipment", category: "IT Setup", assignee_role: "it", due_days: 1, order: 1 },
  { title: "Create accounts and system access", category: "IT Setup", assignee_role: "it", due_days: 1, order: 2 },
  { title: "Collect signed documents and ID proofs", category: "Documentation", assignee_role: "hr", due_days: 2, order: 3 },
  { title: "Complete HR and payroll paperwork", category: "Documentation", assignee_role: "hr", due_days: 3, order: 4 },
  { title: "Office tour and team introductions", category: "Orientation", assignee_role: "manager", due_days: 1, order: 5 },
  { title: "Review role, goals and expectations", category: "Orientation", assignee_role: "manager", due_days: 5, order: 6 },
  { title: "Assign an onboarding buddy", category: "Orientation", assignee_role: "manager", due_days: 1, order: 7 },
  { title: "Set up required training", category: "Training", assignee_role: "hr", due_days: 7, order: 8 },
  { title: "30-day check-in", category: "Follow-up", assignee_role: "manager", due_days: 30, order: 9 },
];

/**
 * Ensure the org has at least one onboarding template that actually contains
 * tasks. If none do, seed a standard "Standard Onboarding" template so
 * auto-generated checklists are useful instead of empty. Best-effort.
 */
async function ensureUsableTemplate(orgId: number): Promise<void> {
  const db = getDB();
  const all = await db.findMany<OnboardingTemplate>("onboarding_templates", {
    filters: { organization_id: orgId },
    limit: 100,
  });
  for (const t of all.data) {
    const count = await db.count("onboarding_template_tasks", { template_id: t.id });
    if (count > 0) return; // already have a usable template
  }
  const hasDefault = all.data.some((t) => t.is_default);
  const template = await createTemplate(orgId, {
    name: "Standard Onboarding",
    description: "Default onboarding checklist seeded automatically.",
    is_default: !hasDefault,
  });
  for (const task of DEFAULT_ONBOARDING_TASKS) {
    await addTemplateTask(orgId, template.id, task);
  }
  logger.info(`Seeded default onboarding template ${template.id} for org ${orgId}`);
}

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

  // Seed a standard template (with tasks) if the org has none that are usable.
  await ensureUsableTemplate(orgId);

  const all = await db.findMany<OnboardingTemplate>("onboarding_templates", {
    filters: { organization_id: orgId },
    limit: 100,
  });
  const templates = all.data;
  if (templates.length === 0) return null; // nothing configured — nothing to do

  // Prefer templates that actually contain tasks, so the generated checklist is
  // never empty. Fall back to any template only if none has tasks.
  const counts = await Promise.all(
    templates.map(async (t) => ({ t, tasks: await db.count("onboarding_template_tasks", { template_id: t.id }) })),
  );
  const withTasks = counts.filter((x) => x.tasks > 0).map((x) => x.t);
  const pool = withTasks.length > 0 ? withTasks : templates;

  const dept = department || null;
  const template =
    // a department-specific default is the best match
    (dept ? pool.find((t) => t.is_default && t.department === dept) : undefined) ||
    // then an org-wide (department-less) default
    pool.find((t) => t.is_default && !t.department) ||
    // then any default
    pool.find((t) => t.is_default) ||
    // then a department match even if it isn't flagged default
    (dept ? pool.find((t) => t.department === dept) : undefined) ||
    // finally, any template so a checklist is still generated
    pool[0];
  if (!template) return null;

  return generateChecklist(orgId, applicationId, template.id, joiningDate);
}

/**
 * Ensure every accepted offer has an onboarding checklist. Offers that were
 * accepted before auto-generation existed (or any accept that slipped through)
 * never got one, so the onboarding page showed "No checklists found" despite the
 * promise that checklists are created on acceptance. This idempotently backfills
 * them. Best-effort — never throws. Returns how many were created.
 */
export async function backfillAcceptedOfferChecklists(orgId: number): Promise<number> {
  const db = getDB();

  const offers = await db.findMany<{
    id: string;
    application_id: string;
    job_id: string | null;
    joining_date: any;
  }>("offers", {
    filters: { organization_id: orgId, status: "accepted" },
    limit: 500,
  });

  let created = 0;
  for (const offer of offers.data) {
    if (!offer.application_id) continue;
    try {
      let department: string | null = null;
      if (offer.job_id) {
        const job = await db.findOne<{ department: string | null }>("job_postings", {
          id: offer.job_id,
          organization_id: orgId,
        });
        department = job?.department ?? null;
      }
      const joining = offer.joining_date
        ? String(offer.joining_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const checklist = await autoGenerateOnAcceptance(
        orgId,
        offer.application_id,
        joining,
        department,
      );
      if (checklist) created++;
    } catch (err) {
      logger.error(`Backfill onboarding checklist failed for offer ${offer.id}:`, err);
    }
  }

  if (created > 0) {
    logger.info(`Backfilled ${created} onboarding checklist(s) for accepted offers in org ${orgId}`);
  }
  return created;
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

  // Make the "checklists are generated when an offer is accepted" promise hold
  // retroactively: ensure any accepted offer without a checklist gets one before
  // we return the list. Idempotent and best-effort.
  await backfillAcceptedOfferChecklists(orgId);

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

  // Recompute the checklist status atomically from the current task counts in a
  // single statement (audit L14). The previous count-then-update was a
  // read-modify-write: concurrent task updates could each read stale counts and
  // leave the checklist status inconsistent.
  await db.raw(
    `UPDATE onboarding_checklists c
        LEFT JOIN (
          SELECT checklist_id,
                 COUNT(*) AS total,
                 SUM(status = 'completed') AS done
            FROM onboarding_tasks
           WHERE checklist_id = ?
           GROUP BY checklist_id
        ) t ON t.checklist_id = c.id
        SET c.status = CASE
              WHEN COALESCE(t.done, 0) = 0 THEN 'not_started'
              WHEN t.done >= t.total THEN 'completed'
              ELSE 'in_progress'
            END,
            c.started_at = CASE
              WHEN c.started_at IS NULL AND COALESCE(t.done, 0) > 0 THEN NOW()
              ELSE c.started_at
            END,
            c.completed_at = CASE
              WHEN COALESCE(t.total, 0) > 0 AND t.done >= t.total THEN NOW()
              ELSE c.completed_at
            END
      WHERE c.id = ?`,
    [checklist.id, checklist.id],
  );

  return updatedTask;
}

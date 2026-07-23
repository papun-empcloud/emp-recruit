// ============================================================================
// CAREER PAGE SERVICE
// Manages career page configuration, public job listings, and applications.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findOrgById } from "../../db/empcloud";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { CareerPage, JobPosting, Candidate, Application } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Admin: Career page configuration
// ---------------------------------------------------------------------------

export async function getConfig(orgId: number): Promise<CareerPage | null> {
  const db = getDB();
  return db.findOne<CareerPage>("career_pages", { organization_id: orgId });
}

export async function updateConfig(
  orgId: number,
  data: Partial<Pick<CareerPage, "title" | "description" | "logo_url" | "banner_url" | "primary_color" | "custom_css" | "slug">>,
): Promise<CareerPage> {
  const db = getDB();
  let page = await db.findOne<CareerPage>("career_pages", { organization_id: orgId });

  if (!page) {
    // Create default career page for this org
    const slug = data.slug || `org-${orgId}`;
    page = await db.create<CareerPage>("career_pages", {
      organization_id: orgId,
      slug,
      title: data.title || "Careers",
      description: data.description || null,
      logo_url: data.logo_url || null,
      banner_url: data.banner_url || null,
      primary_color: data.primary_color || "#4F46E5",
      is_active: true,
      custom_css: data.custom_css || null,
    } as Partial<CareerPage>);
    return page;
  }

  return db.update<CareerPage>("career_pages", page.id, data as Partial<CareerPage>);
}

export async function publishCareerPage(orgId: number): Promise<CareerPage> {
  const db = getDB();
  const page = await db.findOne<CareerPage>("career_pages", { organization_id: orgId });
  if (!page) {
    throw new NotFoundError("Career page");
  }
  return db.update<CareerPage>("career_pages", page.id, { is_active: true } as Partial<CareerPage>);
}

// ---------------------------------------------------------------------------
// Admin: choose which jobs appear on the public career page
// ---------------------------------------------------------------------------

/**
 * Every open, public (non-internal) job — the candidates for the career page —
 * each carrying its `show_on_career_page` flag so HR can toggle visibility.
 * Internal and draft/closed jobs are never eligible, so they're excluded.
 */
export async function getManagedJobs(orgId: number): Promise<JobPosting[]> {
  const db = getDB();
  const result = await db.findMany<JobPosting>("job_postings", {
    filters: { organization_id: orgId, status: "open", is_internal: false },
    sort: { field: "published_at", order: "desc" },
    limit: 200,
  });
  return result.data;
}

/**
 * Set the exact set of jobs shown on the career page: every eligible (open,
 * non-internal) job in `jobIds` is turned on, all others are turned off. Only
 * changed rows are written. Returns the refreshed eligible-job list.
 */
export async function setCareerJobs(orgId: number, jobIds: string[]): Promise<JobPosting[]> {
  const db = getDB();
  const eligible = await db.findMany<JobPosting>("job_postings", {
    filters: { organization_id: orgId, status: "open", is_internal: false },
    limit: 500,
  });

  const selected = new Set(jobIds);
  for (const job of eligible.data) {
    const show = selected.has(job.id);
    if (Boolean(job.show_on_career_page) !== show) {
      await db.update<JobPosting>("job_postings", job.id, {
        show_on_career_page: show,
      } as Partial<JobPosting>);
    }
  }

  return getManagedJobs(orgId);
}

// ---------------------------------------------------------------------------
// Public: Career page access (NO auth)
// ---------------------------------------------------------------------------

export async function getPublicCareerPage(slug: string): Promise<{
  careerPage: CareerPage;
  orgName: string;
  orgLogo: string | null;
}> {
  const db = getDB();
  const page = await db.findOne<CareerPage>("career_pages", { slug, is_active: true });
  if (!page) {
    throw new NotFoundError("Career page", slug);
  }

  const org = await findOrgById(page.organization_id);
  if (!org || !org.is_active) {
    throw new NotFoundError("Organization");
  }

  return {
    careerPage: page,
    orgName: org.name,
    orgLogo: (org as any).logo || null,
  };
}

export type PublicJob = JobPosting & { applicant_count: number };

export interface PublicJobsResult {
  data: PublicJob[];
  total: number;
  page: number;
  perPage: number;
  departments: string[];
  locations: string[];
}

// Only these job-posting fields are exposed on the public career site. Internal
// columns (created_by, hiring_manager_id, is_internal, max_applications, etc.)
// must never reach unauthenticated visitors / competitors (audit M4).
const PUBLIC_JOB_FIELDS = [
  "id", "organization_id", "title", "slug", "description", "requirements", "benefits",
  "location", "department", "employment_type", "remote_policy",
  "experience_min", "experience_max", "salary_min", "salary_max", "salary_currency",
  "published_at", "closes_at", "created_at",
] as const;

function pickPublicJob(job: any): any {
  const out: any = {};
  for (const k of PUBLIC_JOB_FIELDS) if (k in job) out[k] = job[k];
  return out;
}

export async function getPublicJobs(
  slug: string,
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    department?: string;
    location?: string;
  } = {},
): Promise<PublicJobsResult> {
  const db = getDB();
  const page = await db.findOne<CareerPage>("career_pages", { slug, is_active: true });
  if (!page) {
    throw new NotFoundError("Career page", slug);
  }

  const orgId = page.organization_id;
  const pageNum = Math.max(1, Number(params.page) || 1);
  const perPage = Math.min(50, Math.max(1, Number(params.perPage) || 10));
  const offset = (pageNum - 1) * perPage;

  // Base filter: open, public (non-internal), HR-selected jobs for this org.
  const where: string[] = [
    "jp.organization_id = ?",
    "jp.status = 'open'",
    "jp.is_internal = 0",
    "jp.show_on_career_page = 1",
  ];
  const args: any[] = [orgId];

  if (params.department) {
    where.push("jp.department = ?");
    args.push(params.department);
  }
  if (params.location) {
    where.push("jp.location = ?");
    args.push(params.location);
  }
  if (params.search) {
    where.push("(jp.title LIKE ? OR jp.description LIKE ? OR jp.department LIKE ? OR jp.location LIKE ?)");
    const s = `%${params.search}%`;
    args.push(s, s, s, s);
  }
  const whereSql = where.join(" AND ");

  // Total (for pagination)
  const countRows = await db.raw<any[][]>(
    `SELECT COUNT(*) AS total FROM job_postings jp WHERE ${whereSql}`,
    args,
  );
  const total = Number(countRows[0]?.[0]?.total ?? 0);

  // Page of jobs, each with its applicant count.
  const dataRows = await db.raw<any[][]>(
    `SELECT jp.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = jp.id) AS applicant_count
     FROM job_postings jp
     WHERE ${whereSql}
     ORDER BY jp.published_at DESC, jp.created_at DESC
     LIMIT ? OFFSET ?`,
    [...args, perPage, offset],
  );
  const data = ((dataRows[0] as any[]) || []).map((j) => ({
    ...pickPublicJob(j),
    applicant_count: Number(j.applicant_count ?? 0),
  })) as PublicJob[];

  // Facets: every department/location across this org's public jobs (unfiltered,
  // so the filter dropdowns always show all available options).
  const facetRows = await db.raw<any[][]>(
    `SELECT DISTINCT department, location FROM job_postings
     WHERE organization_id = ? AND status = 'open' AND is_internal = 0 AND show_on_career_page = 1`,
    [orgId],
  );
  const facets = (facetRows[0] as any[]) || [];
  const departments = Array.from(new Set(facets.map((r) => r.department).filter(Boolean))).sort();
  const locations = Array.from(new Set(facets.map((r) => r.location).filter(Boolean))).sort();

  return { data, total, page: pageNum, perPage, departments, locations };
}

export async function getPublicJobDetail(slug: string, jobId: string): Promise<JobPosting> {
  const db = getDB();
  const page = await db.findOne<CareerPage>("career_pages", { slug, is_active: true });
  if (!page) {
    throw new NotFoundError("Career page", slug);
  }

  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: page.organization_id,
    status: "open",
    is_internal: false, // can't deep-link to an internal job from the public page
    show_on_career_page: true, // de-selected jobs are hidden from the public page
  });
  if (!job) {
    throw new NotFoundError("Job posting", jobId);
  }

  return pickPublicJob(job) as JobPosting;
}

export async function submitPublicApplication(
  slug: string,
  jobId: string,
  data: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    cover_letter?: string;
    current_company?: string;
    experience_years?: number;
    expected_salary?: number;
    skills?: string[];
  },
  resumePath?: string,
): Promise<{ candidate: Candidate; application: Application }> {
  const db = getDB();

  // Validate career page
  const page = await db.findOne<CareerPage>("career_pages", { slug, is_active: true });
  if (!page) {
    throw new NotFoundError("Career page", slug);
  }

  // Validate job exists, is open, isn't internal-only, and is on the career page
  const job = await db.findOne<JobPosting>("job_postings", {
    id: jobId,
    organization_id: page.organization_id,
    status: "open",
    is_internal: false, // can't apply to an internal job via the public form
    show_on_career_page: true, // can't apply to a job that isn't on the career page
  });
  if (!job) {
    throw new NotFoundError("Job posting", jobId);
  }

  // Check max applications
  if (job.max_applications) {
    const appCount = await db.count("applications", {
      job_id: jobId,
      organization_id: page.organization_id,
    });
    if (appCount >= job.max_applications) {
      throw new ValidationError("This position is no longer accepting applications");
    }
  }

  // Check if candidate already applied to this job
  const existingCandidate = await db.findOne<Candidate>("candidates", {
    organization_id: page.organization_id,
    email: data.email,
  });

  let candidate: Candidate;
  if (existingCandidate) {
    candidate = existingCandidate;
    // Check for duplicate application
    const existingApp = await db.findOne<Application>("applications", {
      job_id: jobId,
      candidate_id: existingCandidate.id,
    });
    if (existingApp) {
      // 409 so the client can recognise a duplicate specifically and show a
      // clear message instead of silently doing nothing. (BUG-03)
      throw new ConflictError(
        "You've already applied for this job with this email address.",
      );
    }
  } else {
    candidate = await db.create<Candidate>("candidates", {
      organization_id: page.organization_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      source: "direct",
      resume_path: resumePath || null,
      current_company: data.current_company || null,
      experience_years: data.experience_years ?? null,
      skills: data.skills?.length ? JSON.stringify(data.skills) : null,
    } as Partial<Candidate>);
  }

  // Create application
  const application = await db.create<Application>("applications", {
    organization_id: page.organization_id,
    job_id: jobId,
    candidate_id: candidate.id,
    stage: "applied",
    source: "direct",
    cover_letter: data.cover_letter || null,
    expected_salary: data.expected_salary ?? null, // BUG-04: was collected but never stored
    resume_path: resumePath || candidate.resume_path || null,
  } as Partial<Application>);

  // Log stage history
  await db.create("application_stage_history", {
    application_id: application.id,
    from_stage: null,
    to_stage: "applied",
    changed_by: 0, // system
    notes: "Applied via career page",
  });

  logger.info(`Public application submitted: ${data.email} for job ${job.title} (org: ${page.organization_id})`);

  return { candidate, application };
}

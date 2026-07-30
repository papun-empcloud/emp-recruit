// ============================================================================
// EMP-RECRUIT SHARED VALIDATORS (Zod schemas)
// ============================================================================

import { z } from "zod";
import {
  JobStatus,
  ApplicationStage,
  InterviewType,
  InterviewStatus,
  OfferStatus,
  OnboardingStatus,
  ReferralStatus,
  Recommendation,
  CandidateSource,
} from "../types";

// ---------------------------------------------------------------------------
// Common / Reusable
// ---------------------------------------------------------------------------

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().optional(),
  })
  .transform((val) => ({
    ...val,
    perPage: val.perPage ?? val.per_page ?? 20,
  }));

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// Strip HTML/script markup from plain-text fields so raw tags (e.g. a
// "<script>alert(1)</script>" job title) are never stored. Tags are removed and
// whitespace collapsed *before* the length checks, so "<script></script>" fails
// the min-length requirement rather than being stored as an empty string.
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const plainText = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" ? stripTags(v) : v), schema);

// The job title is the most user-visible field, so rather than silently
// stripping markup we reject it outright with a clear error — the tester (and
// any real user) gets told to remove the tags. BUG-08.
const noMarkupTitle = z
  .string()
  .trim()
  .min(2)
  .max(200)
  .refine((s) => !/[<>]/.test(s), {
    message: "Title cannot contain HTML or script tags (the characters < or >)",
  });

// Base object (no refinements) — so both create and update can derive cleanly.
const jobBaseSchema = z.object({
  title: noMarkupTitle,
  department: plainText(z.string().max(100)).optional(),
  location: plainText(z.string().max(200)).optional(),
  employment_type: z.string().max(50).default("full_time"),
  experience_min: z.number().int().min(0).optional(),
  experience_max: z.number().int().min(0).optional(),
  salary_min: z.number().int().min(0).optional(),
  salary_max: z.number().int().min(0).optional(),
  salary_currency: z.string().length(3).default("INR"),
  description: z.string().min(10),
  requirements: z.string().optional(),
  benefits: z.string().optional(),
  skills: z.array(z.string()).optional(),
  hiring_manager_id: z.number().int().optional(),
  max_applications: z.number().int().min(1).optional(),
  // #30 — remote policy (onsite / remote / hybrid). The frontend form has
  // always had this select; now it actually gets stored.
  remote_policy: z.enum(["onsite", "remote", "hybrid"]).default("onsite"),
  // Internal-only job — appears on Internal Jobs but not the public career page.
  is_internal: z.boolean().optional(),
  // #1354 — Accept both ISO datetime and YYYY-MM-DD date strings
  closes_at: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    })
    .optional(),
});

// Min must not exceed Max for the experience and salary ranges (checked only
// when both ends are present). Applied to both create and update.
const withRangeChecks = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine(
      (d: any) =>
        d.experience_min == null ||
        d.experience_max == null ||
        d.experience_min <= d.experience_max,
      { message: "Min experience cannot be greater than max experience", path: ["experience_max"] },
    )
    .refine(
      (d: any) => d.salary_min == null || d.salary_max == null || d.salary_min <= d.salary_max,
      { message: "Min salary cannot be greater than max salary", path: ["salary_max"] },
    );

export const createJobSchema = withRangeChecks(jobBaseSchema);
export const updateJobSchema = withRangeChecks(jobBaseSchema.partial());

export const changeJobStatusSchema = z.object({
  status: z.nativeEnum(JobStatus),
});

// Bulk import: one job row. Same required fields as creating a single job
// (title + description) with the rest optional, and the same min/max range
// checks. Each row is validated independently so one bad row can't fail the
// whole import.
export const bulkImportJobRowSchema = withRangeChecks(
  z.object({
    title: noMarkupTitle,
    description: z.string().trim().min(10, "Description must be at least 10 characters"),
    department: plainText(z.string().max(100)).optional(),
    location: plainText(z.string().max(200)).optional(),
    employment_type: z.string().max(50).optional(),
    experience_min: z.number().int().min(0).optional(),
    experience_max: z.number().int().min(0).optional(),
    salary_min: z.number().int().min(0).optional(),
    salary_max: z.number().int().min(0).optional(),
    salary_currency: z.string().length(3).optional(),
    remote_policy: z.enum(["onsite", "remote", "hybrid"]).optional(),
    is_internal: z.boolean().optional(),
    skills: z.array(z.string()).optional(),
    requirements: z.string().optional(),
    benefits: z.string().optional(),
  }),
);

export type BulkImportJobRow = z.infer<typeof bulkImportJobRowSchema>;

// The import request: a batch of up to 200 rows. Rows are left as `unknown`
// here and validated one-by-one server-side (via bulkImportJobRowSchema) so a
// single invalid row is reported, not fatal to the whole batch.
export const bulkImportJobsSchema = z.object({
  jobs: z
    .array(z.unknown())
    .min(1, "At least one job is required")
    .max(200, "You can import at most 200 jobs at once"),
});

// Bulk update: one row identified by the job `id`. Every field is optional —
// only the fields present are changed (an omitted field is left as-is). `status`
// is applied through the normal status-transition rules. Range checks apply to
// whichever ends are present. Rows are validated independently.
export const bulkUpdateJobRowSchema = withRangeChecks(
  z.object({
    id: z.string().uuid("A valid job id is required"),
    title: noMarkupTitle.optional(),
    description: z.string().trim().min(10, "Description must be at least 10 characters").optional(),
    department: plainText(z.string().max(100)).optional(),
    location: plainText(z.string().max(200)).optional(),
    employment_type: z.string().max(50).optional(),
    experience_min: z.number().int().min(0).optional(),
    experience_max: z.number().int().min(0).optional(),
    salary_min: z.number().int().min(0).optional(),
    salary_max: z.number().int().min(0).optional(),
    salary_currency: z.string().length(3).optional(),
    remote_policy: z.enum(["onsite", "remote", "hybrid"]).optional(),
    is_internal: z.boolean().optional(),
    skills: z.array(z.string()).optional(),
    requirements: z.string().optional(),
    benefits: z.string().optional(),
    status: z.nativeEnum(JobStatus).optional(),
  }),
);

export type BulkUpdateJobRow = z.infer<typeof bulkUpdateJobRowSchema>;

export const bulkUpdateJobsSchema = z.object({
  jobs: z
    .array(z.unknown())
    .min(1, "At least one job is required")
    .max(200, "You can update at most 200 jobs at once"),
});

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

// Optional phone: when present, allow only digits and common phone punctuation
// and require an E.164-reasonable digit count (7 to 15). Previously this was
// z.string().max(20) — a character cap that never checked the digit count, so a
// 20-digit string sailed straight through (BUG-019). 15 (E.164 max) is used
// rather than a hard 10 so international numbers with a country code still pass.
const optionalPhone = z
  .string()
  .max(20)
  .refine(
    (v) => {
      if (!v.trim()) return true;
      if (/[^\d+\-()\s]/.test(v)) return false;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
    { message: "Enter a valid phone number (7 to 15 digits)" },
  )
  .optional();

export const createCandidateSchema = z.object({
  first_name: z.string().trim().min(1).max(64),
  last_name: z.string().trim().min(1).max(64),
  email: z.string().email().max(128),
  phone: optionalPhone,
  source: z.nativeEnum(CandidateSource).default(CandidateSource.DIRECT),
  linkedin_url: z.string().url().optional(),
  portfolio_url: z.string().url().optional(),
  current_company: z.string().max(200).optional(),
  current_title: z.string().max(200).optional(),
  experience_years: z
    .number()
    .min(0, "Experience (years) cannot be negative")
    .max(50, "Experience (years) can't exceed 50")
    .optional(),
  skills: z.array(z.string()).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial();

// Bulk import: one CSV row (a subset of createCandidate — no notes/tags/urls).
export const bulkImportCandidateRowSchema = z.object({
  first_name: z.string().trim().min(1).max(64),
  last_name: z.string().trim().min(1).max(64),
  email: z.string().email().max(128),
  phone: optionalPhone,
  source: z.nativeEnum(CandidateSource).optional(),
  current_company: z.string().max(200).optional(),
  current_title: z.string().max(200).optional(),
  experience_years: z.number().min(0).max(50).optional(),
  skills: z.array(z.string()).optional(),
});

// Bulk import candidates into a job's pipeline in a single request.
export const bulkImportCandidatesSchema = z.object({
  job_id: z.string().uuid(),
  candidates: z.array(bulkImportCandidateRowSchema).min(1).max(500),
});

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const createApplicationSchema = z.object({
  job_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  source: z.nativeEnum(CandidateSource).default(CandidateSource.DIRECT),
  cover_letter: z.string().optional(),
});

export const moveStageSchema = z.object({
  stage: z.nativeEnum(ApplicationStage),
  notes: z.string().optional(),
  rejection_reason: z.string().optional(),
});

export const addNoteSchema = z.object({
  notes: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export const scheduleInterviewSchema = z.object({
  application_id: z.string().uuid(),
  type: z.nativeEnum(InterviewType),
  round: z.number().int().min(1).default(1),
  title: z.string().trim().min(2).max(200),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  location: z.string().max(500).optional(),
  meeting_link: z.string().url().optional(),
  panelist_ids: z.array(z.number().int()).min(1),
  notes: z.string().optional(),
});

export const submitFeedbackSchema = z.object({
  recommendation: z.nativeEnum(Recommendation),
  technical_score: z.number().int().min(1).max(5).optional(),
  communication_score: z.number().int().min(1).max(5).optional(),
  cultural_fit_score: z.number().int().min(1).max(5).optional(),
  overall_score: z.number().int().min(1).max(5).optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

// A generous but finite upper bound so an obviously-bogus salary (a data-entry
// error like ₹7,80,00,00,00,00,00,000) is rejected instead of stored. 10 billion
// comfortably exceeds any real annual salary in any supported currency.
const MAX_SALARY = 10_000_000_000;
const salaryAmount = z
  .number()
  .int()
  .min(0)
  .max(MAX_SALARY, { message: "Salary exceeds the maximum allowed value" });

// An offer's expiry date must be on or after the joining date — the offer must
// not lapse before the candidate is due to join. Returns true when the
// relationship holds or either date is missing/unparseable (base string
// validation handles those). Enforced client-side already; added here so a
// direct API call can't create an inconsistent offer either. BUG-12.
export function expiryOnOrAfterJoining(joining?: string, expiry?: string): boolean {
  if (!joining || !expiry) return true;
  const j = new Date(joining).getTime();
  const e = new Date(expiry).getTime();
  if (Number.isNaN(j) || Number.isNaN(e)) return true;
  return e >= j;
}

export const OFFER_DATE_ORDER_MESSAGE = "Offer expiry date must be on or after the joining date";

export const createOfferSchema = z
  .object({
    application_id: z.string().uuid(),
    salary_amount: salaryAmount,
    salary_currency: z.string().length(3).default("INR"),
    joining_date: z.string(),
    expiry_date: z.string(),
    // Optional — defaults from the applied job's title/department server-side.
    job_title: z.string().trim().min(2).max(200).optional(),
    department: z.string().max(100).optional(),
    benefits: z.string().optional(),
    notes: z.string().optional(),
    approver_ids: z.array(z.number().int()).optional(),
  })
  .refine((d) => expiryOnOrAfterJoining(d.joining_date, d.expiry_date), {
    message: OFFER_DATE_ORDER_MESSAGE,
    path: ["expiry_date"],
  });

// Kept as a plain object (the route calls `.omit({ status })` on it). The
// expiry-vs-joining relationship on update is enforced in the offer service,
// which can also compare an incoming date against the stored one. BUG-12.
export const updateOfferSchema = z.object({
  salary_amount: salaryAmount.optional(),
  salary_currency: z.string().length(3).optional(),
  joining_date: z.string().optional(),
  expiry_date: z.string().optional(),
  job_title: z.string().trim().min(2).max(200).optional(),
  department: z.string().max(100).optional(),
  benefits: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(OfferStatus).optional(),
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const createOnboardingTemplateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().optional(),
  department: z.string().max(100).optional(),
  is_default: z.boolean().default(false),
});

export const addTemplateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().optional(),
  category: z.string().min(1).max(50),
  assignee_role: z.string().max(50).optional(),
  due_days: z.number().int().min(0).default(0),
  order: z.number().int().min(0).default(0),
  is_required: z.boolean().default(true),
});

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(OnboardingStatus),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const createReferralSchema = z.object({
  job_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  relationship: z.string().max(200).optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  trigger: z.string().min(1).max(50),
  subject: z.string().trim().min(2).max(500),
  body: z.string().min(10),
  is_active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Career Page
// ---------------------------------------------------------------------------

export const updateCareerPageSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().optional(),
  logo_url: z.string().url().optional().nullable(),
  banner_url: z.string().url().optional().nullable(),
  primary_color: z.string().max(7).optional(),
  is_active: z.boolean().optional(),
  custom_css: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Public Application (Career Page — no auth)
// ---------------------------------------------------------------------------

export const publicApplicationSchema = z.object({
  job_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(64),
  last_name: z.string().trim().min(1).max(64),
  email: z.string().email().max(128),
  phone: z.string().max(20).optional(),
  cover_letter: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  portfolio_url: z.string().url().optional(),
  source: z.nativeEnum(CandidateSource).default(CandidateSource.DIRECT),
});

// ---------------------------------------------------------------------------
// Background Checks
// ---------------------------------------------------------------------------

const BackgroundCheckProvider = z.enum(["checkr", "sterling", "hireright", "manual"]);
const BackgroundCheckType = z.enum(["criminal", "employment", "education", "credit", "reference", "identity"]);
const BackgroundCheckResult = z.enum(["clear", "consider", "adverse", "pending"]);

export const initiateBackgroundCheckSchema = z.object({
  candidate_id: z.string().uuid(),
  provider: BackgroundCheckProvider,
  check_type: BackgroundCheckType,
});

export const createBackgroundCheckPackageSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().optional(),
  checks_included: z.array(BackgroundCheckType).min(1),
  provider: BackgroundCheckProvider,
  estimated_days: z.number().int().min(1).optional(),
  cost: z.number().int().min(0).optional(),
  is_default: z.boolean().default(false),
});

export const updateBackgroundCheckResultSchema = z.object({
  result: BackgroundCheckResult,
  result_details: z.record(z.any()).optional(),
  report_url: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// AI Job Description Generator
// ---------------------------------------------------------------------------

export const generateJobDescriptionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  department: z.string().max(100).optional(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "director", "vp", "c_level"]),
  skills: z.array(z.string()).min(1),
  location: z.string().max(200).optional(),
  employment_type: z.string().max(50).optional(),
  salary_range: z.string().max(100).optional(),
  company_description: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Candidate Surveys / NPS
// ---------------------------------------------------------------------------

const SurveyType = z.enum(["post_interview", "post_offer", "post_rejection"]);

export const sendSurveySchema = z.object({
  candidate_id: z.string().uuid(),
  application_id: z.string().uuid(),
  survey_type: SurveyType,
});

export const submitSurveyResponseSchema = z.object({
  responses: z.array(
    z.object({
      question_key: z.string().min(1).max(100),
      rating: z.number().int().min(1).max(10).optional(),
      text_response: z.string().max(5000).optional(),
    }),
  ).min(1).max(200),
});

// ---------------------------------------------------------------------------
// Psychometric Assessments
// ---------------------------------------------------------------------------

const AssessmentType = z.enum(["behavioral", "cognitive", "personality", "situational"]);
const QuestionType = z.enum(["multiple_choice", "true_false", "text", "scale"]);

export const createAssessmentTemplateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().optional(),
  assessment_type: AssessmentType,
  time_limit_minutes: z.number().int().min(1).max(480).optional(),
  questions: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.string()).default([]),
      type: QuestionType,
      correct_answer: z.string().nullable().optional(),
    }),
  ).min(1),
});

export const inviteCandidateAssessmentSchema = z.object({
  candidate_id: z.string().uuid(),
  template_id: z.string().uuid(),
});

export const submitAssessmentSchema = z.object({
  answers: z.array(
    z.object({
      question_index: z.number().int().min(0),
      answer: z.string().min(1).max(10000),
      time_taken_seconds: z.number().int().min(0).optional(),
    }),
  ).min(1).max(500),
});

// ---------------------------------------------------------------------------
// Screening / Knockout Questions (029)
// ---------------------------------------------------------------------------

export const screeningQuestionTypeEnum = z.enum(["text", "number", "yes_no", "single_choice"]);

export const screeningQuestionInputSchema = z
  .object({
    question: z.string().trim().min(2).max(500),
    type: screeningQuestionTypeEnum.default("text"),
    options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    required: z.boolean().default(true),
    is_knockout: z.boolean().default(false),
    knockout_value: z.string().max(255).optional(),
    sort_order: z.number().int().min(0).default(0),
  })
  .refine((d) => d.type !== "single_choice" || (d.options != null && d.options.length >= 2), {
    message: "Single-choice questions need at least two options",
    path: ["options"],
  });

// Replace the full ordered set of screening questions on a job in one request.
export const setScreeningQuestionsSchema = z.object({
  questions: z.array(screeningQuestionInputSchema).max(30),
});

// A candidate's answers submitted with a public application.
export const screeningAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string().max(2000).optional(),
});
export const screeningAnswersSchema = z.array(screeningAnswerSchema).max(30);

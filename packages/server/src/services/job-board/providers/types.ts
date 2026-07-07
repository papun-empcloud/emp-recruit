// ============================================================================
// JOB BOARD PROVIDER — adapter interface
// ============================================================================
// One interface, one adapter per board. Two publish modes:
//   - "feed": the job is exposed in a crawlable feed the board ingests (Indeed,
//     Google Jobs). No per-post API call; the org registers the feed URL once.
//   - "api":  the job is POSTed to the board's API (LinkedIn, Naukri). Requires
//     per-org partner/enterprise credentials — approval-gated, not self-serve.
// ============================================================================

export type JobBoardKey = "linkedin" | "indeed" | "naukri";
export type PublishMode = "api" | "feed";

export interface JobBoardConfig {
  enabled: boolean;
  auto_publish: boolean;
  /** Per-board settings/credentials (endpoint, token, company id, …). */
  config: Record<string, any> | null;
}

/** Normalized job passed to every adapter. */
export interface JobForPublish {
  id: string;
  title: string;
  description: string;
  requirements?: string | null;
  location?: string | null;
  department?: string | null;
  employment_type?: string | null;
  remote_policy?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  /** Public apply/detail URL on the career page. */
  applyUrl: string;
  companyName: string;
}

export interface PublishResult {
  externalId: string | null;
  url: string | null;
  status: "posted" | "feed";
}

export interface JobBoardProvider {
  key: JobBoardKey;
  mode: PublishMode;
  /** True when the board can accept this org's jobs (feed = always). */
  isConfigured(cfg: JobBoardConfig | null): boolean;
  publishJob(job: JobForPublish, cfg: JobBoardConfig | null): Promise<PublishResult>;
  removeJob?(externalId: string, cfg: JobBoardConfig | null): Promise<void>;
}

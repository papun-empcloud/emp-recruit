// ============================================================================
// LINKEDIN PROVIDER (api mode)
// ============================================================================
// Posts jobs via the LinkedIn Job Posting API (Talent Solutions). This requires
// the org to be an approved LinkedIn partner — it is NOT self-serve. Credentials
// live in the org's job_board_configs.config:
//   { accessToken, endpoint?, companyId? }
// endpoint defaults to LinkedIn's job posting endpoint but can be overridden to
// match the partner contract.
// ============================================================================

import type { JobBoardConfig, JobBoardProvider, JobForPublish, PublishResult } from "./types";
import { normalizeJob, postJob } from "./publish-http";

const DEFAULT_ENDPOINT = "https://api.linkedin.com/v2/simpleJobPostings";

export const linkedinProvider: JobBoardProvider = {
  key: "linkedin",
  mode: "api",

  isConfigured(cfg: JobBoardConfig | null): boolean {
    return !!cfg?.config?.accessToken;
  },

  async publishJob(job: JobForPublish, cfg: JobBoardConfig | null): Promise<PublishResult> {
    const c = cfg?.config ?? {};
    const endpoint = (c.endpoint as string) || DEFAULT_ENDPOINT;
    const payload = {
      ...normalizeJob(job),
      integrationContext: c.companyId ? `urn:li:organization:${c.companyId}` : undefined,
    };

    const result = await postJob("LinkedIn", endpoint, {
      Authorization: `Bearer ${c.accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    }, payload);

    const externalId = result?.id ?? result?.jobPostingId ?? null;
    return {
      externalId: externalId ? String(externalId) : null,
      url: result?.jobPostingUrl ?? result?.url ?? null,
      status: "posted",
    };
  },
};

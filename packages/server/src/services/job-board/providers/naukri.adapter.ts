// ============================================================================
// NAUKRI PROVIDER (api mode)
// ============================================================================
// Posts jobs via Naukri's RMS / Hot-Vacancy API. Requires an enterprise Naukri
// account with API access (partner-gated, not self-serve). Credentials live in
// the org's job_board_configs.config:
//   { endpoint, apiKey, authHeader? }   (authHeader defaults to "Authorization")
// ============================================================================

import type { JobBoardConfig, JobBoardProvider, JobForPublish, PublishResult } from "./types";
import { normalizeJob, postJob } from "./publish-http";

export const naukriProvider: JobBoardProvider = {
  key: "naukri",
  mode: "api",

  isConfigured(cfg: JobBoardConfig | null): boolean {
    return !!(cfg?.config?.apiKey && cfg?.config?.endpoint);
  },

  async publishJob(job: JobForPublish, cfg: JobBoardConfig | null): Promise<PublishResult> {
    const c = cfg?.config ?? {};
    const authHeader = (c.authHeader as string) || "Authorization";

    const result = await postJob("Naukri", c.endpoint as string, {
      [authHeader]: String(c.apiKey),
    }, normalizeJob(job));

    const externalId = result?.jobId ?? result?.id ?? null;
    return {
      externalId: externalId ? String(externalId) : null,
      url: result?.jobUrl ?? result?.url ?? null,
      status: "posted",
    };
  },
};

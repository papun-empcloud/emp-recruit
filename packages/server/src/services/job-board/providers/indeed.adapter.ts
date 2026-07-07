// ============================================================================
// INDEED PROVIDER (feed mode)
// ============================================================================
// Indeed ingests jobs by crawling an XML job feed, not via per-post API calls
// (its direct posting API is partner-gated). So "publishing" to Indeed means
// the job is present in our public feed — which Indeed indexes once the org has
// registered the feed URL with Indeed. Nothing to POST here.
// ============================================================================

import type { JobBoardProvider, JobForPublish, PublishResult } from "./types";

export const indeedProvider: JobBoardProvider = {
  key: "indeed",
  mode: "feed",

  isConfigured(): boolean {
    // The feed is public — Indeed can always index open jobs from it.
    return true;
  },

  async publishJob(job: JobForPublish): Promise<PublishResult> {
    // The job is exposed in /public/careers/:slug/jobs.xml (Indeed XML format).
    return { externalId: job.id, url: job.applyUrl, status: "feed" };
  },
};

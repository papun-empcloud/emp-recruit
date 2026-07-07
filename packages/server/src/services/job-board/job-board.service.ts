// ============================================================================
// JOB BOARD SERVICE
// ============================================================================
// Per-org board config + the auto-publish orchestrator. On job publish, pushes
// the job to each configured board (LinkedIn/Naukri via API, Indeed via feed)
// and records the outcome in job_board_postings.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { findOrgById } from "../../db/empcloud";
import { logger } from "../../utils/logger";
import { ValidationError } from "../../utils/errors";
import { ALL_BOARDS, getBoard, isBoardKey } from "./providers";
import type { JobBoardConfig, JobBoardKey, JobForPublish } from "./providers/types";

interface ConfigRow {
  id: string;
  organization_id: number;
  board: string;
  enabled: boolean | number;
  auto_publish: boolean | number;
  config: string | Record<string, any> | null;
  status: string;
  last_error: string | null;
}

export interface JobBoardPosting {
  id: string;
  organization_id: number;
  job_id: string;
  board: string;
  status: string;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  posted_at: Date | null;
}

function parseJson(raw: ConfigRow["config"]): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function toBoardConfig(row: ConfigRow | null): JobBoardConfig | null {
  if (!row) return null;
  return {
    enabled: !!row.enabled,
    auto_publish: !!row.auto_publish,
    config: parseJson(row.config),
  };
}

// --- Config CRUD -----------------------------------------------------------

export async function getBoardConfigs(orgId: number) {
  const db = getDB();
  const out = [];
  for (const board of ALL_BOARDS) {
    const row = await db.findOne<ConfigRow>("job_board_configs", {
      organization_id: orgId,
      board,
    });
    const provider = getBoard(board)!;
    const cfg = toBoardConfig(row);
    out.push({
      board,
      mode: provider.mode,
      enabled: row ? !!row.enabled : provider.mode === "feed", // feed on by default
      auto_publish: row ? !!row.auto_publish : provider.mode === "feed",
      configured: provider.isConfigured(cfg),
      has_credentials: !!cfg?.config,
      status: row?.status ?? (provider.mode === "feed" ? "ready" : "not_configured"),
      last_error: row?.last_error ?? null,
    });
  }
  return out;
}

export async function setBoardConfig(
  orgId: number,
  board: string,
  input: { enabled?: boolean; auto_publish?: boolean; config?: Record<string, any> | null },
) {
  if (!isBoardKey(board)) throw new ValidationError(`Unknown job board: ${board}`);
  const db = getDB();
  const provider = getBoard(board)!;

  const existing = await db.findOne<ConfigRow>("job_board_configs", {
    organization_id: orgId,
    board,
  });

  const merged: JobBoardConfig = {
    enabled: input.enabled ?? (existing ? !!existing.enabled : true),
    auto_publish: input.auto_publish ?? (existing ? !!existing.auto_publish : true),
    config: input.config !== undefined ? input.config : parseJson(existing?.config ?? null),
  };
  const status = provider.isConfigured(merged) ? "ready" : "not_configured";

  const patch: Record<string, unknown> = {
    enabled: merged.enabled,
    auto_publish: merged.auto_publish,
    status,
    last_error: null,
  };
  if (input.config !== undefined) patch.config = JSON.stringify(input.config);

  if (existing) {
    await db.update("job_board_configs", existing.id, patch);
  } else {
    await db.create("job_board_configs", {
      id: uuidv4(),
      organization_id: orgId,
      board,
      ...patch,
      config: input.config !== undefined ? JSON.stringify(input.config) : null,
    });
  }
  return getBoardConfigs(orgId);
}

// --- Postings --------------------------------------------------------------

export async function getPostings(orgId: number, jobId: string): Promise<JobBoardPosting[]> {
  const db = getDB();
  const result = await db.findMany<JobBoardPosting>("job_board_postings", {
    filters: { organization_id: orgId, job_id: jobId },
    limit: 20,
  });
  return result.data;
}

// --- Publish orchestration -------------------------------------------------

async function buildJobForPublish(orgId: number, job: any): Promise<JobForPublish> {
  const db = getDB();

  // Career page slug for the public apply URL (first active page for the org).
  const page = await db.findOne<{ slug: string; title: string }>("career_pages", {
    organization_id: orgId,
    is_active: true,
  });
  const slug = page?.slug || "default";

  let companyName = page?.title || "Company";
  try {
    const org = await findOrgById(orgId);
    if (org?.name) companyName = org.name;
  } catch {
    /* best-effort */
  }

  return {
    id: job.id,
    title: job.title,
    description: job.description ?? "",
    requirements: job.requirements ?? null,
    location: job.location ?? null,
    department: job.department ?? null,
    employment_type: job.employment_type ?? null,
    remote_policy: job.remote_policy ?? null,
    salary_min: job.salary_min ?? null,
    salary_max: job.salary_max ?? null,
    salary_currency: job.salary_currency ?? null,
    applyUrl: `${config.clientUrl}/careers/${slug}/jobs/${job.id}`,
    companyName,
  };
}

/**
 * Publish a job to its target boards and record each outcome. `auto` limits to
 * boards with auto_publish on; a manual call publishes to every enabled board.
 * Never throws — each board's failure is captured on its posting row.
 */
export async function publishJobToBoards(
  orgId: number,
  jobId: string,
  opts: { auto?: boolean; boards?: JobBoardKey[] } = {},
): Promise<JobBoardPosting[]> {
  const db = getDB();
  const job = await db.findOne<any>("job_postings", { id: jobId, organization_id: orgId });
  if (!job) return [];

  const targets = opts.boards ?? ALL_BOARDS;
  const ctx = await buildJobForPublish(orgId, job);
  const results: JobBoardPosting[] = [];

  for (const board of targets) {
    const provider = getBoard(board);
    if (!provider) continue;

    const row = await db.findOne<ConfigRow>("job_board_configs", {
      organization_id: orgId,
      board,
    });
    const cfg = toBoardConfig(row);

    // Feed boards default to enabled; API boards need an explicit config row.
    const enabled = row ? !!row.enabled : provider.mode === "feed";
    if (!enabled) continue;
    if (opts.auto && !(row ? !!row.auto_publish : provider.mode === "feed")) continue;
    if (!provider.isConfigured(cfg)) {
      results.push(
        await upsertPosting(orgId, jobId, board, {
          status: "skipped",
          error: `${board} is not connected (credentials required)`,
        }),
      );
      continue;
    }

    try {
      const r = await provider.publishJob(ctx, cfg);
      results.push(
        await upsertPosting(orgId, jobId, board, {
          status: r.status,
          external_id: r.externalId,
          external_url: r.url,
          error: null,
          posted_at: new Date(),
        }),
      );
      logger.info(`Job ${jobId} published to ${board} (${r.status})`);
    } catch (err: any) {
      results.push(
        await upsertPosting(orgId, jobId, board, {
          status: "failed",
          error: (err?.message || "Unknown error").slice(0, 500),
        }),
      );
      logger.warn(`Job ${jobId} failed to publish to ${board}: ${err?.message}`);
    }
  }
  return results;
}

async function upsertPosting(
  orgId: number,
  jobId: string,
  board: string,
  patch: Partial<JobBoardPosting> & { status: string },
): Promise<JobBoardPosting> {
  const db = getDB();
  const existing = await db.findOne<JobBoardPosting>("job_board_postings", {
    job_id: jobId,
    board,
  });
  if (existing) {
    return db.update<JobBoardPosting>("job_board_postings", existing.id, patch);
  }
  try {
    return await db.create<JobBoardPosting>("job_board_postings", {
      id: uuidv4(),
      organization_id: orgId,
      job_id: jobId,
      board,
      external_id: null,
      external_url: null,
      error: null,
      posted_at: null,
      ...patch,
    } as Partial<JobBoardPosting>);
  } catch {
    // Lost an insert race on the (job_id, board) unique key (auto-publish and a
    // manual publish can run concurrently) — the row now exists, so update it.
    const now = await db.findOne<JobBoardPosting>("job_board_postings", {
      job_id: jobId,
      board,
    });
    if (now) return db.update<JobBoardPosting>("job_board_postings", now.id, patch);
    throw new Error(`Failed to record posting for ${board}`);
  }
}

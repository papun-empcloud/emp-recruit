// ============================================================================
// JOB BOARD PROVIDER REGISTRY
// ============================================================================

import type { JobBoardKey, JobBoardProvider } from "./types";
import { indeedProvider } from "./indeed.adapter";
import { linkedinProvider } from "./linkedin.adapter";
import { naukriProvider } from "./naukri.adapter";

export const ALL_BOARDS: JobBoardKey[] = ["linkedin", "indeed", "naukri"];

const registry: Record<JobBoardKey, JobBoardProvider> = {
  linkedin: linkedinProvider,
  indeed: indeedProvider,
  naukri: naukriProvider,
};

export function getBoard(key: JobBoardKey): JobBoardProvider | undefined {
  return registry[key];
}

export function isBoardKey(key: string): key is JobBoardKey {
  return key in registry;
}

export function listBoards(): JobBoardProvider[] {
  return ALL_BOARDS.map((k) => registry[k]);
}

import { AppError } from "../../../utils/errors";
import type { JobForPublish } from "./types";

/** A neutral job payload most boards accept or can be mapped from. */
export function normalizeJob(job: JobForPublish): Record<string, unknown> {
  return {
    externalReference: job.id,
    title: job.title,
    description: job.description,
    requirements: job.requirements ?? undefined,
    company: job.companyName,
    location: job.location ?? undefined,
    department: job.department ?? undefined,
    employmentType: job.employment_type ?? undefined,
    remotePolicy: job.remote_policy ?? undefined,
    salaryMin: job.salary_min ?? undefined,
    salaryMax: job.salary_max ?? undefined,
    salaryCurrency: job.salary_currency ?? undefined,
    applyUrl: job.applyUrl,
  };
}

/**
 * Reject SSRF targets: the board endpoint is org-configurable, so block private/
 * link-local/loopback hosts (incl. the 169.254.169.254 cloud-metadata address)
 * and non-http(s) schemes before making the server-side request (audit M3).
 */
function assertSafeEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new AppError(400, "INVALID_ENDPOINT", "Invalid job board endpoint URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError(400, "INVALID_ENDPOINT", "Job board endpoint must use http(s)");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local");
  if (blocked) {
    throw new AppError(400, "INVALID_ENDPOINT", "Job board endpoint host is not allowed");
  }
}

/** POST a JSON payload to a board endpoint; maps non-2xx to a 502 AppError. */
export async function postJob(
  board: string,
  endpoint: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<any> {
  assertSafeEndpoint(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || json?.error || `HTTP ${res.status}`;
    throw new AppError(502, "JOB_BOARD_ERROR", `${board} rejected the job: ${msg}`);
  }
  return json;
}

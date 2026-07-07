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

/** POST a JSON payload to a board endpoint; maps non-2xx to a 502 AppError. */
export async function postJob(
  board: string,
  endpoint: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<any> {
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

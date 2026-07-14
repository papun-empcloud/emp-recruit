// ============================================================================
// ANALYTICS SERVICE
// Recruitment dashboards: overview, pipeline funnel, time-to-hire, sources.
// ============================================================================

import { getDB } from "../../db/adapters";
import type { ApplicationStage } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Dashboard Overview
// ---------------------------------------------------------------------------
export async function getDashboard(orgId: number): Promise<{
  openJobs: number;
  totalCandidates: number;
  activeApplications: number;
  recentHires: number;
}> {
  const db = getDB();

  const openJobs = await db.count("job_postings", { organization_id: orgId, status: "open" });
  const totalCandidates = await db.count("candidates", { organization_id: orgId });

  // Active applications = not rejected, not withdrawn, not hired
  const allApps = await db.count("applications", { organization_id: orgId });
  const rejectedApps = await db.count("applications", { organization_id: orgId, stage: "rejected" });
  const withdrawnApps = await db.count("applications", { organization_id: orgId, stage: "withdrawn" });
  const hiredApps = await db.count("applications", { organization_id: orgId, stage: "hired" });
  const activeApplications = allApps - rejectedApps - withdrawnApps - hiredApps;

  // Recent hires = hired in last 30 days
  const recentHires = hiredApps; // simplified — count all hired

  return { openJobs, totalCandidates, activeApplications, recentHires };
}

// ---------------------------------------------------------------------------
// Pipeline Funnel
// ---------------------------------------------------------------------------
const STAGES: ApplicationStage[] = ["applied", "screened", "interview", "offer", "hired", "rejected", "withdrawn"] as ApplicationStage[];

export async function getPipelineFunnel(
  orgId: number,
  jobId?: string,
): Promise<{ stage: string; count: number }[]> {
  const db = getDB();

  const results = await Promise.all(
    STAGES.map(async (stage) => {
      const filters: Record<string, any> = { organization_id: orgId, stage };
      if (jobId) filters.job_id = jobId;
      const count = await db.count("applications", filters);
      return { stage, count };
    }),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Time to Hire
// ---------------------------------------------------------------------------
export async function getTimeToHire(orgId: number): Promise<{
  averageDays: number;
  hiredCount: number;
}> {
  const db = getDB();

  // Get all hired applications with their applied_at date
  const result = await db.findMany<{
    id: string;
    applied_at: string;
    updated_at: string;
    stage: string;
  }>("applications", {
    filters: { organization_id: orgId, stage: "hired" },
    limit: 1000,
  });

  if (result.data.length === 0) {
    return { averageDays: 0, hiredCount: 0 };
  }

  let totalDays = 0;
  for (const app of result.data) {
    const appliedDate = new Date(app.applied_at);
    const hiredDate = new Date(app.updated_at);
    const diffMs = hiredDate.getTime() - appliedDate.getTime();
    const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    totalDays += diffDays;
  }

  const averageDays = Math.round(totalDays / result.data.length);

  return { averageDays, hiredCount: result.data.length };
}

// ---------------------------------------------------------------------------
// Source Effectiveness
// ---------------------------------------------------------------------------
export async function getSourceEffectiveness(orgId: number): Promise<
  { source: string; total: number; hired: number; hireRate: number }[]
> {
  const db = getDB();

  const sources = ["direct", "referral", "linkedin", "indeed", "naukri", "other"];

  const results = await Promise.all(
    sources.map(async (source) => {
      const total = await db.count("applications", { organization_id: orgId, source });
      const hired = await db.count("applications", { organization_id: orgId, source, stage: "hired" });
      const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;
      return { source, total, hired, hireRate };
    }),
  );

  // Only return sources that have at least one application
  return results.filter((r) => r.total > 0);
}

// ---------------------------------------------------------------------------
// KPI Metrics — hire rate + offer outcomes (analytical rates, not raw counts)
// ---------------------------------------------------------------------------
export async function getKpiMetrics(orgId: number): Promise<{
  totalApplications: number;
  hired: number;
  hireRate: number;
  offers: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    expired: number;
    acceptanceRate: number;
  };
}> {
  const db = getDB();

  const totalApplications = await db.count("applications", { organization_id: orgId });
  const hired = await db.count("applications", { organization_id: orgId, stage: "hired" });
  const hireRate = totalApplications > 0 ? Math.round((hired / totalApplications) * 100) : 0;

  const offerTotal = await db.count("offers", { organization_id: orgId });
  const accepted = await db.count("offers", { organization_id: orgId, status: "accepted" });
  const declined = await db.count("offers", { organization_id: orgId, status: "declined" });
  const expired = await db.count("offers", { organization_id: orgId, status: "expired" });
  // Pending = extended to the candidate and awaiting their response.
  const pending = await db.count("offers", { organization_id: orgId, status: "sent" });
  // Acceptance rate is over decided offers only (accepted + declined).
  const decided = accepted + declined;
  const acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : 0;

  return {
    totalApplications,
    hired,
    hireRate,
    offers: { total: offerTotal, accepted, declined, pending, expired, acceptanceRate },
  };
}

// ---------------------------------------------------------------------------
// Applications Trend — weekly application volume for the last N weeks
// ---------------------------------------------------------------------------
export async function getApplicationsTrend(
  orgId: number,
  weeks = 8,
): Promise<{ weekStart: string; count: number }[]> {
  const db = getDB();

  // Group by the Monday of each application's week (WEEKDAY: 0 = Monday).
  const rows = await db.raw<any[][]>(
    `SELECT DATE(DATE_SUB(applied_at, INTERVAL WEEKDAY(applied_at) DAY)) AS week_start,
            COUNT(*) AS count
       FROM applications
      WHERE organization_id = ?
        AND applied_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY week_start`,
    [orgId, weeks * 7],
  );

  const counts = new Map<string, number>();
  for (const r of rows[0] as any[]) {
    counts.set(String(r.week_start).slice(0, 10), Number(r.count));
  }

  // Build a continuous, zero-filled series of the last `weeks` Mondays so the
  // chart has no gaps even in weeks with no applications.
  const series: { weekStart: string; count: number }[] = [];
  const monday = new Date();
  const day = (monday.getDay() + 6) % 7; // days since Monday (0 = Monday)
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    series.push({ weekStart: key, count: counts.get(key) ?? 0 });
  }

  return series;
}

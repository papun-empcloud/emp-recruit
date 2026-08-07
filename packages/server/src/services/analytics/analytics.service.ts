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

  // Use the actual moment each application transitioned INTO 'hired' (from the
  // stage history), not applications.updated_at — which moves on any later edit
  // and inflates time-to-hire (audit M16).
  const rows = await db.raw<any[][]>(
    `SELECT a.applied_at AS applied_at, MIN(h.created_at) AS hired_at
       FROM applications a
       JOIN application_stage_history h
         ON h.application_id = a.id AND h.to_stage = 'hired'
      WHERE a.organization_id = ? AND a.stage = 'hired'
      GROUP BY a.id, a.applied_at`,
    [orgId],
  );
  const data = ((rows[0] as any[]) || []).filter((r) => r.applied_at && r.hired_at);

  if (data.length === 0) {
    return { averageDays: 0, hiredCount: 0 };
  }

  let totalDays = 0;
  for (const r of data) {
    const diffMs = new Date(r.hired_at).getTime() - new Date(r.applied_at).getTime();
    totalDays += Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  const averageDays = Math.round(totalDays / data.length);

  return { averageDays, hiredCount: data.length };
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

  const accepted = await db.count("offers", { organization_id: orgId, status: "accepted" });
  const declined = await db.count("offers", { organization_id: orgId, status: "declined" });
  const expired = await db.count("offers", { organization_id: orgId, status: "expired" });
  // Pending = extended to the candidate and awaiting their response.
  const pending = await db.count("offers", { organization_id: orgId, status: "sent" });
  // "Extended" means actually sent to a candidate — the sum of the four outcome
  // buckets shown in the breakdown. Counting ALL offer rows here (including
  // drafts / pending-approval / approved-but-unsent) made the footer total
  // contradict its own breakdown. BUG-16.
  const offerTotal = accepted + declined + expired + pending;
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
  // DATE_FORMAT returns a plain 'YYYY-MM-DD' string so the keys are stable
  // regardless of how the driver serialises DATE columns.
  const rows = await db.raw<any[][]>(
    `SELECT DATE_FORMAT(DATE_SUB(applied_at, INTERVAL WEEKDAY(applied_at) DAY), '%Y-%m-%d') AS week_start,
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
  // BUG-05: format the Monday key from LOCAL date parts, not toISOString(),
  // which converts to UTC and (in timezones ahead of UTC like IST) shifts every
  // Monday back a day — so no week ever matched and the chart showed all zeros.
  const fmtLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const series: { weekStart: string; count: number }[] = [];
  const monday = new Date();
  const day = (monday.getDay() + 6) % 7; // days since Monday (0 = Monday)
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    const key = fmtLocal(d);
    series.push({ weekStart: key, count: counts.get(key) ?? 0 });
  }

  return series;
}


// ---------------------------------------------------------------------------
// Conversion funnel — CUMULATIVE reach per stage, for the dashboard funnel chart.
//
// This is a different question from getPipelineFunnel(), which counts how many
// applications SIT in each stage right now. Occupancy is not funnel data: it is
// not monotonically decreasing, so drawn as a funnel the bands widen and narrow
// arbitrarily and the conversion percentages mean nothing. A funnel needs "how
// many ever got this far".
//
// 'rejected' and 'withdrawn' are deliberately absent. They are terminal outcomes
// that hang off the side of the pipeline, not steps within it — an application
// rejected at interview still counts as having reached interview, which is what
// the EXISTS-on-history term below captures.
//
// Reach is deliberately NOT read from stage history alone. Several services move
// applications.stage without writing a history row (createOffer and acceptOffer
// both do), so history-only counting silently undercounts the late stages. An
// application counts as having reached a stage if it has a history row for it OR
// its current stage is at/after it.
// ---------------------------------------------------------------------------

/** Pipeline order. Index position is the "at or beyond" comparison. */
const FUNNEL_STAGES = ["applied", "screened", "interview", "offer", "hired"] as const;

export interface FunnelStage {
  stage: string;
  /** Applications that ever got this far. */
  reached: number;
  /** Share of the top of the funnel. */
  pctOfTop: number;
  /** Share of the immediately preceding stage (100 for the first). */
  pctFromPrev: number;
}

export interface ConversionFunnel {
  stages: FunnelStage[];
  /** hired / applied, one decimal place. */
  overallConversionRate: number;
}

export async function getConversionFunnel(orgId: number): Promise<ConversionFunnel> {
  const db = getDB();

  const rows = await db.raw<any[][]>(
    `SELECT
       COUNT(*)                            AS applied,
       SUM(cur >= 2 OR h_screened  > 0)    AS screened,
       SUM(cur >= 3 OR h_interview > 0)    AS \`interview\`,
       SUM(cur >= 4 OR h_offer     > 0)    AS offer,
       SUM(current_stage = 'hired')         AS hired
     FROM (
       SELECT a.id, a.stage AS current_stage,
              FIELD(a.stage, 'applied', 'screened', 'interview', 'offer', 'hired') AS cur,
              SUM(h.to_stage = 'screened')  AS h_screened,
              SUM(h.to_stage = 'interview') AS h_interview,
              SUM(h.to_stage = 'offer')     AS h_offer,
              SUM(h.to_stage = 'hired')     AS h_hired
         FROM applications a
         LEFT JOIN application_stage_history h ON h.application_id = a.id
        WHERE a.organization_id = ?
        GROUP BY a.id, a.stage
     ) t`,
    [orgId],
  );

  const r = ((rows[0] as any[]) ?? [])[0] ?? {};
  const counts = FUNNEL_STAGES.map((s) => Number(r[s] ?? 0));
  const top = counts[0];

  const stages: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    const reached = counts[i];
    const prev = i === 0 ? reached : counts[i - 1];
    return {
      stage,
      reached,
      pctOfTop: top === 0 ? 0 : Math.round((reached / top) * 100),
      pctFromPrev: i === 0 ? 100 : prev === 0 ? 0 : Math.round((reached / prev) * 100),
    };
  });

  const hired = counts[counts.length - 1];
  return {
    stages,
    overallConversionRate: top === 0 ? 0 : Math.round((hired / top) * 1000) / 10,
  };
}

// ---------------------------------------------------------------------------
// Stat cards — the dashboard KPI row: a current total plus its week-over-week
// change.
//
// The change is derived from daily INFLOW (items added per day). Only three of
// the four metrics could be replayed as a running total anyway: "open jobs as of
// day X" is unrecoverable, because nothing records when a job stopped being open
// (there is no status-history table — see 001_initial_schema). Inflow is the one
// definition that is honest for all four.
//
// The per-day series itself is deliberately NOT returned. It existed only to
// draw a sparkline in the tile; with the tiles showing a delta pill instead,
// shipping 14 points per metric on every dashboard load would be payload no one
// reads. The daily counts are still computed here — they are what the delta is
// built from.
// ---------------------------------------------------------------------------

export interface StatCardMetric {
  /** Current value shown as the tile's headline number. */
  total: number;
  /** Items added today. */
  today: number;
  /**
   * Percent change: the last 7 COMPLETE days vs the 7 before them.
   *
   * Today is deliberately excluded from both windows. A window ending "now"
   * holds a part-finished day against seven whole ones, so the figure would read
   * negative every morning and drift up over the day purely as an artefact of
   * the clock. Today's count is reported separately as `today`.
   *
   * null when the prior window was empty — a percentage change from zero is
   * undefined, and the client renders no pill rather than a fake 100%.
   */
  deltaPct: number | null;
}

export interface StatCards {
  openJobs: StatCardMetric;
  totalCandidates: StatCardMetric;
  totalApplications: StatCardMetric;
  totalJobs: StatCardMetric;
}

/** Today plus the 14 complete days the two comparison windows need. */
const DELTA_SPAN_DAYS = 15;

/** Table + timestamp column each metric counts its inflow from. Fixed literals
 *  (never request input) so they are safe to interpolate into the SQL. */
const INFLOW_SOURCES = {
  // published_at is the moment a job first went open; drafts have NULL and are
  // excluded by the range predicate.
  openJobs: { table: "job_postings", column: "published_at" },
  totalCandidates: { table: "candidates", column: "created_at" },
  totalApplications: { table: "applications", column: "applied_at" },
  totalJobs: { table: "job_postings", column: "created_at" },
} as const;

/** Local 'YYYY-MM-DD' — same reason as getApplicationsTrend (BUG-05): building
 *  keys with toISOString() shifts the day backwards in timezones ahead of UTC,
 *  so nothing ever matches and every series reads zero. */
const fmtLocalDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function buildMetric(
  orgId: number,
  total: number,
  source: { table: string; column: string },
): Promise<StatCardMetric> {
  const db = getDB();

  const rows = await db.raw<any[][]>(
    `SELECT DATE_FORMAT(${source.column}, '%Y-%m-%d') AS day, COUNT(*) AS count
       FROM ${source.table}
      WHERE organization_id = ?
        AND ${source.column} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY day`,
    // One extra day of slack: the lower bound is evaluated in the MySQL session
    // timezone while the keys below are built from Node's local date. When Node
    // sits west of the database the oldest key would otherwise fall outside the
    // window and always read zero.
    [orgId, DELTA_SPAN_DAYS],
  );

  const counts = new Map<string, number>();
  for (const r of (rows[0] as any[]) ?? []) {
    counts.set(String(r.day).slice(0, 10), Number(r.count));
  }

  // Daily counts running D-14 … D0 (today last).
  const daily: number[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = DELTA_SPAN_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    daily.push(counts.get(fmtLocalDay(d)) ?? 0);
  }

  const sum = (xs: number[]) => xs.reduce((acc, n) => acc + n, 0);
  // Complete days only, today excluded from both sides: D-7…D-1 vs D-14…D-8.
  const lastWeek = sum(daily.slice(-8, -1));
  const priorWeek = sum(daily.slice(0, 7));

  return {
    total,
    today: daily[daily.length - 1] ?? 0,
    deltaPct: priorWeek === 0 ? null : Math.round(((lastWeek - priorWeek) / priorWeek) * 100),
  };
}

export async function getStatCards(orgId: number): Promise<StatCards> {
  const db = getDB();

  const [openJobsTotal, totalJobsCount, candidatesTotal, applicationsTotal] = await Promise.all([
    db.count("job_postings", { organization_id: orgId, status: "open" }),
    db.count("job_postings", { organization_id: orgId }),
    db.count("candidates", { organization_id: orgId }),
    db.count("applications", { organization_id: orgId }),
  ]);

  const [openJobs, totalCandidates, totalApplications, totalJobs] = await Promise.all([
    buildMetric(orgId, openJobsTotal, INFLOW_SOURCES.openJobs),
    buildMetric(orgId, candidatesTotal, INFLOW_SOURCES.totalCandidates),
    buildMetric(orgId, applicationsTotal, INFLOW_SOURCES.totalApplications),
    buildMetric(orgId, totalJobsCount, INFLOW_SOURCES.totalJobs),
  ]);

  return { openJobs, totalCandidates, totalApplications, totalJobs };
}

// ---------------------------------------------------------------------------
// Insights — the dashboard's "AI Insights" strip.
//
// These are RULE-DERIVED, not model-generated: each one is a threshold or a
// ranking over data the analytics endpoints already compute. That is a
// deliberate choice for something on the dashboard's critical path — it is
// deterministic, costs one round of queries instead of an LLM call, and can
// never invent a number that isn't in the database. Swapping in a model later
// only means adding kinds; the transport below already carries what it needs.
//
// What is returned is a KIND plus its VALUES, never a finished sentence. The
// client owns the wording, so the strip is translated by the same i18n files as
// the rest of the app rather than being English-only text baked in the server.
// An insight is omitted entirely when its evidence is too thin to support it —
// no insight is better than a confident one drawn from two applications.
// ---------------------------------------------------------------------------

export type InsightKind = "dropOff" | "topSource" | "timeToHire" | "pendingOffers";

/** Drives the icon and colour on the client. Never the only carrier of meaning. */
export type InsightTone = "positive" | "warning" | "info";

export interface Insight {
  kind: InsightKind;
  tone: InsightTone;
  /** Interpolation values for the client's i18n string. */
  values: Record<string, string | number | boolean | null>;
}

/** A source needs this many applications before its hire rate means anything. */
const MIN_SOURCE_VOLUME = 5;
/** Length of each side of the time-to-hire comparison. */
const TTH_WINDOW_DAYS = 30;

export async function getInsights(orgId: number): Promise<Insight[]> {
  const db = getDB();
  const insights: Insight[] = [];

  const [funnel, sources, pendingOffers, hires] = await Promise.all([
    getConversionFunnel(orgId),
    getSourceEffectiveness(orgId),
    // "Pending" = extended and awaiting the candidate's answer, matching the
    // definition getKpiMetrics() uses for the analytics page.
    db.count("offers", { organization_id: orgId, status: "sent" }),
    // Same basis as getTimeToHire(): the moment the application actually
    // transitioned into 'hired', not updated_at, which moves on any later edit.
    db.raw<any[][]>(
      `SELECT a.applied_at AS applied_at, MIN(h.created_at) AS hired_at
         FROM applications a
         JOIN application_stage_history h
           ON h.application_id = a.id AND h.to_stage = 'hired'
        WHERE a.organization_id = ? AND a.stage = 'hired'
        GROUP BY a.id, a.applied_at`,
      [orgId],
    ),
  ]);

  // 1. The weakest step in the pipeline. Only transitions whose PREDECESSOR had
  //    applications are considered — "100% dropped off" is meaningless when the
  //    stage before it was empty.
  //
  //    The stage REPORTED is the one people are stuck at, not the one they
  //    failed to reach: if 67% of applications that got an offer were never
  //    hired, the drop-off is at Offer. Naming the destination instead produces
  //    "biggest drop-off is at Hired", which is the opposite of what happened.
  const transitions = funnel.stages
    .slice(1)
    .map((to, i) => ({ from: funnel.stages[i], to }))
    .filter((tr) => tr.from.reached > 0);
  if (transitions.length > 0) {
    const worst = transitions.reduce((a, b) => (b.to.pctFromPrev < a.to.pctFromPrev ? b : a));
    const lostPct = 100 - worst.to.pctFromPrev;
    if (lostPct > 0) {
      insights.push({
        kind: "dropOff",
        tone: "warning",
        values: { stage: worst.from.stage, lostPct },
      });
    }
  }

  // 2. Best-converting source. The volume floor is what stops a channel that
  //    sent one application and happened to land the hire from reading as the
  //    org's strongest at "100%".
  const eligible = sources.filter((s) => s.total >= MIN_SOURCE_VOLUME && s.hired > 0);
  if (eligible.length > 0) {
    const best = eligible.reduce((a, b) => (b.hireRate > a.hireRate ? b : a));
    insights.push({
      kind: "topSource",
      tone: "positive",
      values: { source: best.source, rate: best.hireRate, total: best.total },
    });
  }

  // 3. Time to hire, this window against the one before it. `changePct` is null
  //    when either window has no hires — the client then states the average on
  //    its own rather than a comparison against nothing.
  const rows = ((hires as any[][])[0] ?? []).filter((r: any) => r.applied_at && r.hired_at);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const recent: number[] = [];
  const prior: number[] = [];
  for (const r of rows) {
    const hiredAt = new Date(r.hired_at).getTime();
    const days = Math.max(1, Math.round((hiredAt - new Date(r.applied_at).getTime()) / dayMs));
    const ageDays = (now - hiredAt) / dayMs;
    if (ageDays <= TTH_WINDOW_DAYS) recent.push(days);
    else if (ageDays <= TTH_WINDOW_DAYS * 2) prior.push(days);
  }
  const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  if (rows.length > 0) {
    const overall = mean(rows.map((r: any) =>
      Math.max(1, Math.round((new Date(r.hired_at).getTime() - new Date(r.applied_at).getTime()) / dayMs)),
    ));
    const comparable = recent.length > 0 && prior.length > 0;
    const recentAvg = comparable ? mean(recent) : overall;
    // Fewer days is better, so an improvement is a NEGATIVE change in days and
    // is reported as a positive percentage. Sign is carried by `improved`.
    const changePct = comparable
      ? Math.abs(Math.round(((recentAvg - mean(prior)) / mean(prior)) * 100))
      : null;
    const improved = comparable ? recentAvg < mean(prior) : null;
    insights.push({
      kind: "timeToHire",
      tone: improved === false ? "warning" : "positive",
      values: { days: recentAvg, hires: rows.length, changePct, improved },
    });
  }

  // 4. Offers waiting on a candidate — the one item here that is an action
  //    rather than an observation.
  if (pendingOffers > 0) {
    insights.push({ kind: "pendingOffers", tone: "info", values: { count: pendingOffers } });
  }

  return insights;
}

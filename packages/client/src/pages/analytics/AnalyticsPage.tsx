import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  TrendingUp,
  CheckCircle2,
  UserCheck,
  Send,
  Clock,
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from "recharts";
import { apiGet } from "@/api/client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { enumLabel } from "@/lib/enums";
import { activeLocale } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { printReport, downloadCsvSections, type ReportSection } from "@/lib/export";

// The Analytics page intentionally does NOT repeat the Dashboard's entity counts
// (open jobs / candidates / applications) or its pipeline-stage distribution.
// It focuses on analytical rates and outcomes the Dashboard doesn't surface:
// hire rate, offer acceptance, application volume trend, offer outcomes, time to
// hire, and source effectiveness.

interface KpiMetrics {
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
}

interface TrendPoint {
  weekStart: string;
  count: number;
}

interface TimeToHireData {
  averageDays: number;
  hiredCount: number;
}

interface SourceData {
  source: string;
  total: number;
  hired: number;
  hireRate: number;
}

// Distinct colors for the source donut (cycled).
const SOURCE_COLORS = ["#6366F1", "#06B6D4", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#64748B"];

const OFFER_OUTCOMES: { key: keyof KpiMetrics["offers"]; labelKey: string; color: string }[] = [
  { key: "accepted", labelKey: "analytics.offerAccepted", color: "bg-green-500" },
  { key: "declined", labelKey: "analytics.offerDeclined", color: "bg-red-500" },
  { key: "pending", labelKey: "analytics.offerPending", color: "bg-amber-500" },
  { key: "expired", labelKey: "analytics.offerExpired", color: "bg-gray-400" },
];

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(activeLocale(), { day: "numeric", month: "short" });
}

// Theme-aware chart tooltip. Recharts' default tooltip uses inline styles (a
// hardcoded white box) that the dark theme can't remap, so its text was almost
// invisible in dark mode. Using Tailwind classes lets the theme recolor it.
function ChartTooltip({ active, payload, label, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-gray-700">{t("analytics.weekOf", { week: label })}</p>
      <p className="mt-0.5 text-brand-600">{t("analytics.applications")}: {payload[0].value}</p>
    </div>
  );
}

export function AnalyticsPage() {
  const { t } = useTranslation();
  const metricsQuery = useQuery({
    queryKey: ["analytics", "metrics"],
    queryFn: async () => (await apiGet<KpiMetrics>("/analytics/metrics")).data!,
  });
  const trendQuery = useQuery({
    queryKey: ["analytics", "trend"],
    queryFn: async () => (await apiGet<TrendPoint[]>("/analytics/trend")).data!,
  });
  const timeToHireQuery = useQuery({
    queryKey: ["analytics", "time-to-hire"],
    queryFn: async () => (await apiGet<TimeToHireData>("/analytics/time-to-hire")).data!,
  });
  const sourcesQuery = useQuery({
    queryKey: ["analytics", "sources"],
    queryFn: async () => (await apiGet<SourceData[]>("/analytics/sources")).data!,
  });

  const metrics = metricsQuery.data;
  const trend = trendQuery.data || [];
  const timeToHire = timeToHireQuery.data;
  const sources = sourcesQuery.data || [];

  const sourcesTotal = sources.reduce((sum, s) => sum + s.total, 0);
  const trendData = trend.map((t) => ({ label: weekLabel(t.weekStart), count: t.count }));
  const trendTotal = trend.reduce((sum, t) => sum + t.count, 0);

  // Assemble the analytics data into report sections for CSV/PDF export.
  function buildSections(): ReportSection[] {
    const sections: ReportSection[] = [];
    if (metrics) {
      const metricRows: (string | number)[][] = [
        ["Hire Rate", `${metrics.hireRate}%`],
        ["Hired", metrics.hired],
        ["Total Applications", metrics.totalApplications],
        ["Offer Acceptance Rate", `${metrics.offers.acceptanceRate}%`],
        ["Offers — Total", metrics.offers.total],
        ["Offers — Accepted", metrics.offers.accepted],
        ["Offers — Declined", metrics.offers.declined],
        ["Offers — Pending", metrics.offers.pending],
        ["Offers — Expired", metrics.offers.expired],
      ];
      if (timeToHire) {
        metricRows.push(["Avg Time to Hire (days)", timeToHire.averageDays]);
        metricRows.push(["Hires counted", timeToHire.hiredCount]);
      }
      sections.push({
        heading: "Key Metrics",
        columns: [{ header: "Metric" }, { header: "Value" }],
        rows: metricRows,
      });
    }
    sections.push({
      heading: "Applications Trend (last 8 weeks)",
      columns: [{ header: "Week Starting" }, { header: "Applications" }],
      rows: trend.map((t) => [t.weekStart, t.count]),
    });
    sections.push({
      heading: "Source Effectiveness",
      columns: [{ header: "Source" }, { header: "Total" }, { header: "Hired" }, { header: "Hire Rate" }],
      rows: sources.map((s) => [s.source, s.total, s.hired, `${s.hireRate}%`]),
    });
    return sections;
  }

  const anyLoaded = Boolean(metrics) || trend.length > 0 || sources.length > 0;
  const offerMax = metrics
    ? Math.max(
        metrics.offers.accepted,
        metrics.offers.declined,
        metrics.offers.pending,
        metrics.offers.expired,
        1,
      )
    : 1;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-8 sm:space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><BarChart3 className="h-6 w-6" aria-hidden="true" /></span>
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-balance text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{t("analytics.title")}</h1><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Live Reporting</span></div>
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-6 text-gray-500">
            {t("analytics.subtitle")}
          </p>
        </div>
        </div>
        <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-1 [&>div>button]:min-h-10 [&>div>button]:rounded-lg [&>div>button]:border-0 [&>div>button]:bg-white [&>div>button]:font-semibold [&>div>button]:shadow-sm"><ExportMenu
          disabled={!anyLoaded}
          onCsv={() => downloadCsvSections("recruitment-analytics", buildSections())}
          onPdf={() =>
            printReport({
              title: "Recruitment Analytics",
              subtitle: "Conversion rates, offer outcomes, hiring velocity, and source effectiveness.",
              sections: buildSections(),
            })
          }
        /></div>
        </div>
      </section>

      {/* KPI cards — analytical rates, not the Dashboard's entity counts */}
      {metricsQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-gray-200 bg-white" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : metrics ? (
        <section aria-label="Key analytics metrics" className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label={t("analytics.hireRate")}
            value={`${metrics.hireRate}%`}
            sub={t("analytics.hireRateSub", {
              hired: metrics.hired,
              total: metrics.totalApplications,
            })}
            accent="green"
          />
          <StatCard
            icon={CheckCircle2}
            label={t("analytics.offerAcceptance")}
            value={`${metrics.offers.acceptanceRate}%`}
            sub={t("analytics.offerAcceptanceSub", {
              accepted: metrics.offers.accepted,
              total: metrics.offers.accepted + metrics.offers.declined,
            })}
            accent="blue"
          />
          <StatCard
            icon={UserCheck}
            label={t("analytics.totalHires")}
            value={metrics.hired}
            sub={t("analytics.candidatesHired")}
            accent="purple"
            to="/applications?stage=hired"
          />
          <StatCard
            icon={Send}
            label={t("analytics.pendingOffers")}
            value={metrics.offers.pending}
            sub={t("analytics.awaitingResponse")}
            accent="amber"
            to="/offers?status=pending_approval"
          />
        </section>
      ) : null}

      {/* Row 2: Applications trend + Source effectiveness */}
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        {/* Applications Trend */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-gray-100 p-5 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <LineIcon className="h-5 w-5 text-brand-600" />
            {t("analytics.applicationsTrend")}
          </h2>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">{t("analytics.last8Weeks")}</span>
          </div>
          <div className="p-4 sm:p-6">
          {trendQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : trendTotal === 0 ? (
            <EmptyState message={t("analytics.noApplications8Weeks")} />
          ) : (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} content={<ChartTooltip t={t} />} />
                  <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          </div>
        </section>

        {/* Source Effectiveness */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 p-5 sm:px-6"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><PieIcon className="h-5 w-5" aria-hidden="true" /></span><h2 className="text-lg font-bold text-gray-900">
            {t("analytics.sourceEffectiveness")}
          </h2></div><div className="p-5 sm:p-6">
          {sourcesQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : sources.length === 0 || sourcesTotal === 0 ? (
            <EmptyState message={t("analytics.noSources")} compact />
          ) : (
            <div className="mt-5 flex flex-col gap-6 min-[430px]:flex-row min-[430px]:items-center xl:flex-col xl:items-stretch 2xl:flex-row 2xl:items-center">
              <div className="relative mx-auto h-36 w-36 flex-shrink-0 min-[430px]:mx-0 xl:mx-auto 2xl:mx-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sources}
                      dataKey="total"
                      nameKey="source"
                      innerRadius={38}
                      outerRadius={60}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {sources.map((_, i) => (
                        <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-gray-900">{sourcesTotal}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{t("analytics.total")}</span>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                {sources.map((src, i) => (
                  <div key={src.source} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                      />
                      <span className="truncate capitalize text-gray-700">{enumLabel(t, "source", src.source)}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {src.hired}/{src.total}
                      </span>
                      <span
                        className={`inline-flex w-12 justify-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          src.hireRate >= 30
                            ? "bg-green-100 text-green-700"
                            : src.hireRate >= 10
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {src.hireRate}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}</div>
        </section>
      </div>

      {/* Row 3: Offer outcomes + Time to hire */}
      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        {/* Offer Outcomes */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 p-5 sm:px-6"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><FileText className="h-5 w-5" aria-hidden="true" /></span><h2 className="text-lg font-bold text-gray-900">
            {t("analytics.offerOutcomes")}
          </h2></div><div className="p-5 sm:p-6">
          {metricsQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : !metrics || metrics.offers.total === 0 ? (
            <EmptyState message={t("analytics.noOffers")} />
          ) : (
            <div className="mt-5 space-y-4">
              {OFFER_OUTCOMES.map(({ key, labelKey, color }) => {
                const count = metrics.offers[key] as number;
                const width = Math.max((count / offerMax) * 100, count > 0 ? 4 : 0);
                return (
                  <div key={key}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{t(labelKey)}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={t(labelKey)} aria-valuenow={count} aria-valuemin={0} aria-valuemax={offerMax}>
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-gray-400">
                {t("analytics.offersExtendedTotal", { count: metrics.offers.total })}
              </p>
            </div>
          )}</div>
        </section>

        {/* Time to Hire */}
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="pointer-events-none absolute -bottom-16 -right-12 h-48 w-48 rounded-full bg-brand-50" aria-hidden="true" />
          <div className="relative flex items-center gap-2 border-b border-gray-100 p-5 sm:px-6"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700"><Clock className="h-5 w-5" aria-hidden="true" /></span><h2 className="text-lg font-bold text-gray-900">
            {t("analytics.timeToHire")}
          </h2></div><div className="relative p-5 sm:p-6">
          {timeToHireQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : timeToHire && timeToHire.hiredCount > 0 ? (
            <div className="relative flex min-h-48 flex-col justify-center">
              <div className="flex items-end gap-2">
                <span className="text-6xl font-bold tracking-tight text-gray-900 tabular-nums">{timeToHire.averageDays}</span>
                <span className="mb-2 text-sm text-gray-500">{t("analytics.daysOnAverage")}</span>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                {t("analytics.timeToHireBasis", { count: timeToHire.hiredCount })}
              </p>
            </div>
          ) : (
            <EmptyState message={t("analytics.noHires")} />
          )}</div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-12"}`}
    >
      <BarChart3 className="h-8 w-8 text-gray-200" aria-hidden="true" />
      <p className="mt-2 text-sm text-gray-400">{message}</p>
    </div>
  );
}

const ACCENTS: Record<string, { color: string; bg: string }> = {
  blue: { color: "text-blue-600", bg: "bg-blue-50" },
  purple: { color: "text-purple-600", bg: "bg-purple-50" },
  amber: { color: "text-amber-600", bg: "bg-amber-50" },
  green: { color: "text-green-600", bg: "bg-green-50" },
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  to,
}: {
  icon: any;
  label: string;
  value: number | string;
  sub?: string;
  accent: keyof typeof ACCENTS;
  to?: string;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.blue;
  const displayValue = typeof value === "number" ? value.toLocaleString(activeLocale()) : value;
  const content = (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-[transform,border-color,box-shadow] group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 ${a.bg}`}>
          <Icon className={`h-5 w-5 ${a.color}`} aria-hidden="true" />
        </div>
        {to && <ArrowUpRight className="h-4 w-4 text-gray-400 transition-colors group-hover:text-brand-600" aria-hidden="true" />}
      </div>
      <p className="mt-4 truncate text-sm font-medium text-gray-500" title={label}>{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{displayValue}</p>
      {sub && <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-400">{sub}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
      {content}
    </Link>
  ) : content;
}

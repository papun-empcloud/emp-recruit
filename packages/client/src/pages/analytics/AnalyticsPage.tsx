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
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("analytics.subtitle")}
        </p>
      </div>

      {/* KPI cards — analytical rates, not the Dashboard's entity counts */}
      {metricsQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          />
          <StatCard
            icon={Send}
            label={t("analytics.pendingOffers")}
            value={metrics.offers.pending}
            sub={t("analytics.awaitingResponse")}
            accent="amber"
          />
        </div>
      ) : null}

      {/* Row 2: Applications trend + Source effectiveness */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Applications Trend */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <LineIcon className="h-5 w-5 text-brand-600" />
            {t("analytics.applicationsTrend")}
            <span className="ml-auto text-xs font-normal text-gray-400">{t("analytics.last8Weeks")}</span>
          </h2>
          {trendQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : trendTotal === 0 ? (
            <EmptyState message={t("analytics.noApplications8Weeks")} />
          ) : (
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.06)" }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                    labelFormatter={(l) => t("analytics.weekOf", { week: l })}
                    formatter={(v: number) => [v, t("analytics.applications")]}
                  />
                  <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Source Effectiveness */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <PieIcon className="h-5 w-5 text-brand-600" />
            {t("analytics.sourceEffectiveness")}
          </h2>
          {sourcesQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : sources.length === 0 || sourcesTotal === 0 ? (
            <EmptyState message={t("analytics.noSources")} compact />
          ) : (
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative h-32 w-32 flex-shrink-0">
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

              <div className="min-w-0 flex-1 space-y-2">
                {sources.map((src, i) => (
                  <div key={src.source} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                      />
                      <span className="truncate capitalize text-gray-700">{src.source}</span>
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
          )}
        </div>
      </div>

      {/* Row 3: Offer outcomes + Time to hire */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Offer Outcomes */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-brand-600" />
            {t("analytics.offerOutcomes")}
          </h2>
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
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${color} transition-all duration-500`}
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
          )}
        </div>

        {/* Time to Hire */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Clock className="h-5 w-5 text-brand-600" />
            {t("analytics.timeToHire")}
          </h2>
          {timeToHireQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : timeToHire && timeToHire.hiredCount > 0 ? (
            <div className="flex h-40 flex-col justify-center">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold text-gray-900">{timeToHire.averageDays}</span>
                <span className="mb-2 text-sm text-gray-500">{t("analytics.daysOnAverage")}</span>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                {t("analytics.timeToHireBasis", { count: timeToHire.hiredCount })}
              </p>
            </div>
          ) : (
            <EmptyState message={t("analytics.noHires")} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-12"}`}
    >
      <BarChart3 className="h-8 w-8 text-gray-200" />
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
}: {
  icon: any;
  label: string;
  value: number | string;
  sub?: string;
  accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.blue;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${a.bg}`}>
          <Icon className={`h-5 w-5 ${a.color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
      {sub && <p className="mt-3 truncate text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

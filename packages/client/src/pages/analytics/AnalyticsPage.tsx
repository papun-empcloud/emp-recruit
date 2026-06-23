import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Loader2,
  Briefcase,
  Users,
  UserCheck,
  TrendingUp,
  Clock,
  BarChart3,
  PieChart as PieIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { apiGet } from "@/api/client";

interface OverviewData {
  openJobs: number;
  totalCandidates: number;
  activeApplications: number;
  recentHires: number;
}

interface PipelineStage {
  stage: string;
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

const STAGE_COLORS: Record<string, string> = {
  applied: "from-blue-400 to-blue-500",
  screened: "from-cyan-400 to-cyan-500",
  interview: "from-yellow-400 to-yellow-500",
  offer: "from-purple-400 to-purple-500",
  hired: "from-green-400 to-green-500",
  rejected: "from-red-300 to-red-400",
  withdrawn: "from-gray-300 to-gray-400",
};

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screened: "Screened",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

// Distinct colors for the source donut (cycled).
const SOURCE_COLORS = ["#6366F1", "#06B6D4", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#64748B"];

export function AnalyticsPage() {
  const overviewQuery = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: async () => (await apiGet<OverviewData>("/analytics/overview")).data!,
  });
  const pipelineQuery = useQuery({
    queryKey: ["analytics", "pipeline"],
    queryFn: async () => (await apiGet<PipelineStage[]>("/analytics/pipeline")).data!,
  });
  const timeToHireQuery = useQuery({
    queryKey: ["analytics", "time-to-hire"],
    queryFn: async () => (await apiGet<TimeToHireData>("/analytics/time-to-hire")).data!,
  });
  const sourcesQuery = useQuery({
    queryKey: ["analytics", "sources"],
    queryFn: async () => (await apiGet<SourceData[]>("/analytics/sources")).data!,
  });

  const overview = overviewQuery.data;
  const pipeline = pipelineQuery.data || [];
  const timeToHire = timeToHireQuery.data;
  const sources = sourcesQuery.data || [];

  const maxPipelineCount = Math.max(...pipeline.map((s) => s.count), 1);
  // Top-of-funnel count to compute stage conversion %.
  const topCount =
    pipeline.find((s) => s.stage === "applied")?.count ?? pipeline[0]?.count ?? 0;
  const sourcesTotal = sources.reduce((sum, s) => sum + s.total, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recruitment Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hiring funnel, time-to-hire, and source effectiveness.
        </p>
      </div>

      {/* Stat cards */}
      {overviewQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Briefcase} label="Open Jobs" value={overview.openJobs} accent="blue" href="/jobs?status=open" />
          <StatCard icon={Users} label="Total Candidates" value={overview.totalCandidates} accent="purple" href="/candidates" />
          <StatCard icon={TrendingUp} label="Active Applications" value={overview.activeApplications} accent="amber" href="/candidates" />
          <StatCard icon={UserCheck} label="Hires" value={overview.recentHires} accent="green" href="/offers?status=accepted" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            Pipeline Funnel
          </h2>
          {pipelineQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : pipeline.length === 0 || topCount === 0 ? (
            <EmptyState message="No candidates in the pipeline yet." />
          ) : (
            <div className="mt-5 space-y-4">
              {pipeline.map((stage) => {
                const pct = topCount > 0 ? Math.round((stage.count / topCount) * 100) : 0;
                const barWidth = Math.max((stage.count / maxPipelineCount) * 100, stage.count > 0 ? 3 : 0);
                return (
                  <div key={stage.stage}>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {STAGE_LABELS[stage.stage] || stage.stage}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold text-gray-900">{stage.count}</span>
                        {stage.stage !== "applied" && (
                          <span className="text-xs text-gray-400">{pct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-7 w-full overflow-hidden rounded-lg bg-gray-100">
                      <div
                        className={`h-full rounded-lg bg-gradient-to-r transition-all duration-500 ${
                          STAGE_COLORS[stage.stage] || "from-gray-300 to-gray-400"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Time to Hire + Source breakdown */}
        <div className="space-y-6">
          {/* Time to Hire */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5 text-brand-600" />
              Time to Hire
            </h2>
            {timeToHireQuery.isLoading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : timeToHire && timeToHire.hiredCount > 0 ? (
              <>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900">{timeToHire.averageDays}</span>
                  <span className="mb-1 text-sm text-gray-500">days average</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Based on {timeToHire.hiredCount} hire{timeToHire.hiredCount !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <EmptyState message="No hires yet to measure time-to-hire." compact />
            )}
          </div>

          {/* Source Effectiveness */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <PieIcon className="h-5 w-5 text-brand-600" />
              Source Effectiveness
            </h2>
            {sourcesQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : sources.length === 0 || sourcesTotal === 0 ? (
              <EmptyState message="No candidate sources tracked yet." compact />
            ) : (
              <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
                {/* Donut: share of candidates by source */}
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
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">total</span>
                  </div>
                </div>

                {/* Legend + hire rate */}
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
  accent,
  href,
}: {
  icon: any;
  label: string;
  value: number;
  accent: keyof typeof ACCENTS;
  href?: string;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.blue;
  const content = (
    <div className="flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${a.bg}`}>
        <Icon className={`h-5 w-5 ${a.color}`} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        {content}
      </Link>
    );
  }
  return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">{content}</div>;
}

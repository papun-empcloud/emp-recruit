import { useTranslation } from "react-i18next";
import { FileText, Search, Users, Mail, CheckCircle2, XCircle } from "lucide-react";
import { usePipelineStages, stageColor } from "@/lib/pipeline-stages";

export interface FunnelStageDatum {
  stage: string;
  reached: number;
  pctOfTop: number;
  pctFromPrev: number;
}

interface PipelineFunnelProps {
  stages: FunnelStageDatum[];
  overallConversionRate: number;
}

const STAGE_ICONS = {
  applied: FileText,
  screened: Search,
  interview: Users,
  offer: Mail,
  hired: CheckCircle2,
  rejected: XCircle,
} as const;

export function PipelineFunnel({ stages }: PipelineFunnelProps) {
  const { t } = useTranslation();
  const pipelineStages = usePipelineStages();

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-[880px] overflow-hidden rounded-xl border border-gray-100 bg-gray-50/60">
        {stages.map((item, index) => {
          const Icon = STAGE_ICONS[item.stage as keyof typeof STAGE_ICONS] ?? FileText;
          const color = stageColor(item.stage, pipelineStages);
          const isFirst = index === 0;
          return (
            <div
              key={item.stage}
              className="dashboard-pipeline-stage relative -ml-px flex min-h-32 flex-1 flex-col items-center justify-center px-7 py-5 text-center first:ml-0"
              style={{
                ["--stage-color" as string]: color,
                backgroundColor: `${color}14`,
                borderColor: `${color}2e`,
                clipPath: isFirst
                  ? "polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%)"
                  : "polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%, 24px 50%)",
              }}
            >
              <span
                className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1"
                style={{ color, boxShadow: `0 4px 14px ${color}1f`, borderColor: `${color}30` }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-gray-700">{t(`dashboard.stages.${item.stage}`)}</span>
              <span className="mt-1 text-2xl font-bold tracking-tight" style={{ color }}>{item.reached}</span>
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>{t("dashboard.funnel.tableCaption")}</caption>
        <thead><tr><th>{t("dashboard.funnel.colStage")}</th><th>{t("dashboard.funnel.colReached")}</th></tr></thead>
        <tbody>{stages.map((item) => <tr key={item.stage}><th>{t(`dashboard.stages.${item.stage}`)}</th><td>{item.reached}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

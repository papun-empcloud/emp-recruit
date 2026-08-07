/**
 * AiInsights — the dashboard's insight card.
 *
 * The server sends a KIND and its VALUES, never a finished sentence, so every
 * line here is written by the app's own i18n files and reads in whichever of the
 * six languages the user has selected. That is the whole reason the endpoint
 * doesn't just return prose.
 *
 * The insights are rule-derived rather than model-generated — see the comment on
 * getInsights() in analytics.service.ts for why. Each is a threshold or ranking
 * over data the analytics endpoints already compute, so none of these sentences
 * can contain a number that isn't in the database.
 *
 * The card renders NOTHING when there are no insights, rather than an empty
 * shell announcing it has nothing to say. A new org with three applications
 * genuinely has no findings worth a card.
 *
 * Tone colours the bullet, but never carries meaning by itself: every item is a
 * full sentence, so the colour is emphasis only. The dots use 500-level steps
 * because those pass through unchanged in dark mode — the remaps in globals.css
 * only cover the 50/100 tints, which would vanish against the dark surface.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { apiGet } from "@/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InsightKind = "dropOff" | "topSource" | "timeToHire" | "pendingOffers";
type InsightTone = "positive" | "warning" | "info";

interface Insight {
  kind: InsightKind;
  tone: InsightTone;
  values: Record<string, string | number | boolean | null>;
}

const DOTS: Record<InsightTone, string> = {
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const SURFACES: Record<InsightTone, string> = {
  positive: "border-emerald-100 bg-emerald-50/60",
  warning: "border-amber-100 bg-amber-50/60",
  info: "border-blue-100 bg-blue-50/60",
};

/** Kinds this build can render. Anything else is dropped — see below. */
const KINDS: InsightKind[] = ["dropOff", "topSource", "timeToHire", "pendingOffers"];

export function AiInsights() {
  const { t } = useTranslation();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["analytics", "insights"],
    queryFn: async () => (await apiGet<Insight[]>("/analytics/insights")).data ?? [],
  });

  /**
   * Kind → sentence. `stage` and `source` are re-translated through the enum
   * dictionaries the rest of the app uses, so a stage is worded the same here as
   * it is in the funnel and on the applications table.
   */
  const sentence = (insight: Insight): string => {
    const v = insight.values;
    switch (insight.kind) {
      case "dropOff":
        return t("dashboard.insights.dropOff", {
          stage: t(`dashboard.stages.${v.stage}`),
          pct: v.lostPct,
        });
      case "topSource":
        return t("dashboard.insights.topSource", {
          source: t(`enums.source.${v.source}`),
          pct: v.rate,
        });
      case "timeToHire":
        // No comparison window means no comparison claim — the average is stated
        // on its own instead of against a period that has no hires in it.
        if (v.changePct === null) {
          return Number(v.days) === 1
            ? t("dashboard.insights.timeToHire_one", { days: v.days })
            : t("dashboard.insights.timeToHire_other", { days: v.days });
        }
        return t(
          v.improved
            ? "dashboard.insights.timeToHireBetter"
            : "dashboard.insights.timeToHireWorse",
          { days: v.days, pct: v.changePct },
        );
      case "pendingOffers":
        return t("dashboard.insights.pendingOffers", { count: Number(v.count) });
    }
  };

  const header = (
    <CardHeader className="flex-row items-center gap-3 space-y-0 pb-4">
      <span className="inline-flex shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 p-2.5 shadow-sm">
        <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <div>
        <CardTitle>{t("dashboard.insights.title")}</CardTitle>
        <p className="mt-1 text-xs text-gray-500">{t("dashboard.insights.subtitle")}</p>
      </div>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card className="flex h-full flex-col">
        {header}
        <CardContent className="flex flex-1 flex-col space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
          <Skeleton className="!mt-5 h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  // A kind this build has no wording for is dropped rather than rendered: a
  // server ahead of the client would otherwise put an empty bullet on the card.
  const known = (insights ?? []).filter((i) => KINDS.includes(i.kind));
  if (known.length === 0) {
    return (
      <Card className="flex h-full flex-col">
        {header}
        <CardContent className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-5 py-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-brand-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-gray-900">{t("dashboard.insights.emptyTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{t("dashboard.insights.emptyDescription")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {header}
      <CardContent className="flex flex-1 flex-col">
        <ul className="flex flex-1 flex-col justify-evenly gap-3">
          {known.map((insight) => (
            <li key={insight.kind} className={cn("flex gap-2.5 rounded-xl border p-3", SURFACES[insight.tone])}>
              <span
                className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", DOTS[insight.tone])}
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed text-gray-600">{sentence(insight)}</p>
            </li>
          ))}
        </ul>

        {/* The numbers behind every line above live on the analytics page. */}
        <Link
          to="/analytics"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t("dashboard.insights.viewAll")}
        </Link>
      </CardContent>
    </Card>
  );
}

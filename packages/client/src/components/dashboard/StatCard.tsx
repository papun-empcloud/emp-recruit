/**
 * StatCard — one tile of the dashboard KPI row.
 *
 * Follows the stat-tile contract: label (sentence case) · value · signed delta
 * against a NAMED period. The period is not printed under the number (a deliberate
 * call for a quieter tile) so it rides on the pill instead, as `title` + an
 * `aria-label` — a bare "+18%" states no period, and the reader is left to guess
 * what it is 18% of. The value uses proportional figures on purpose: `tabular-nums` gives
 * every digit the width of a zero, which makes a number like 121 look loose at
 * display sizes.
 *
 * ACCENT COLOURS are validated, not chosen by eye. The four accents were run
 * through the data-viz palette validator all-pairs against this app's real
 * surfaces (#ffffff light, #141c31 dark — the .dark remap of bg-white):
 *
 *   light  #4F46E5 #B0338C #0E9F6E #EB6834
 *          CVD ΔE 8.3 · normal-vision ΔE 22.2 · all ≥ 3:1 contrast — PASS
 *   dark   #7078F4 #C0468A #20A87A #D95926
 *          CVD ΔE 7.8 · normal-vision ΔE 15.3 · all ≥ 3:1 contrast — PASS
 *
 * The palette this replaced put brand indigo (#4F46E5) next to purple
 * (#9333EA): ΔE 11.8 in NORMAL vision, below the 15 floor, i.e. two tiles that
 * full-colour-vision readers could not reliably tell apart, and effectively
 * identical (ΔE 0.9) under protanopia.
 *
 * Colour here is wayfinding, not encoding — each tile also carries an icon and
 * a text label, so nothing is ever communicated by hue alone.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatAccent = "indigo" | "magenta" | "aqua" | "orange" | "slate";

/**
 * Validated accents. The light/dark pair is carried as a CSS custom property so
 * the swap is pure CSS: the theme toggle flips a class on <html> imperatively
 * (lib/theme.ts) and never re-renders React, so a hex resolved in JS at render
 * time would go stale until something else happened to re-render the tile.
 */
const ACCENTS: Record<StatAccent, { vars: string; chip: string }> = {
  indigo: {
    vars: "[--accent:#4F46E5] dark:[--accent:#7078F4]",
    chip: "bg-brand-50 text-brand-600",
  },
  magenta: {
    vars: "[--accent:#B0338C] dark:[--accent:#C0468A]",
    chip: "bg-pink-50 text-pink-700",
  },
  aqua: {
    vars: "[--accent:#0E9F6E] dark:[--accent:#20A87A]",
    chip: "bg-emerald-50 text-emerald-700",
  },
  orange: {
    vars: "[--accent:#EB6834] dark:[--accent:#D95926]",
    chip: "bg-orange-50 text-orange-700",
  },
  slate: {
    vars: "[--accent:#64748B] dark:[--accent:#94A3B8]",
    chip: "bg-slate-100 text-slate-700",
  },
};

/**
 * Auto-compact per the stat-tile contract: 1,284 → "1,284", 12,900 → "12.9K".
 *
 * The rounded string decides the unit, not the raw value: picking the unit first
 * renders 999,600 as "1000K" instead of rolling over to "1M". `locale` follows
 * the app's language rather than the browser's, which can differ.
 */
function formatValue(n: number, locale: string): string {
  if (n < 10_000) return n.toLocaleString(locale);
  const scaled = (value: number, digits: number) =>
    Number(value.toFixed(digits)).toLocaleString(locale);
  const asK = Number((n / 1_000).toFixed(n < 100_000 ? 1 : 0));
  if (asK < 1_000) return `${scaled(n / 1_000, n < 100_000 ? 1 : 0)}K`;
  return `${scaled(n / 1_000_000, 1)}M`;
}

export interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: StatAccent;
  to: string;
  /** Percent change, last 7 complete days vs the 7 before. null renders no pill. */
  deltaPct?: number | null;
  isLoading?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  to,
  deltaPct,
  isLoading,
}: StatCardProps) {
  const { t, i18n } = useTranslation();
  const tone = ACCENTS[accent];
  const locale = i18n.language;

  // Three states, not two: an unchanged week is neither good nor bad, so 0 gets
  // a neutral pill and a flat icon rather than a green upward arrow.
  const hasDelta = typeof deltaPct === "number";
  const direction: "up" | "down" | "flat" = !hasDelta
    ? "flat"
    : (deltaPct as number) > 0
      ? "up"
      : (deltaPct as number) < 0
        ? "down"
        : "flat";
  const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const signed = `${direction === "up" ? "+" : ""}${deltaPct}%`;
  const period = t("dashboard.trend.period");

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-2xl transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-500",
        "border-l-4",
        tone.vars,
      )}
      /**
       * The accent edge is an inline style, not a `border-l-[color:var(--accent)]`
       * utility, because two other rules outrank a bare utility class and would
       * win: `.dark .border-gray-200` in globals.css (which flattened all four
       * stripes to the same slate grey in dark mode) and the `hover:border-*`
       * above (which sets all four sides). Reading `var(--accent)` rather than a
       * JS-resolved hex is still what keeps the light/dark swap working — the
       * theme toggle flips a class on <html> and never re-renders React.
       */
      style={{ borderLeftColor: "var(--accent)" }}
    >
      <Link to={to} className="block min-h-[148px] p-4 focus:outline-none sm:min-h-[164px] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11", tone.chip)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-brand-500"
            aria-hidden="true"
          />
        </div>

        <div className="mt-4 min-w-0">
          <span className="block truncate text-sm font-medium leading-5 text-gray-500" title={label}>{label}</span>
          <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-x-2 gap-y-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="min-w-0 text-2xl font-semibold leading-none tracking-tight text-gray-900 tabular-nums sm:text-3xl">
                {formatValue(value, locale)}
              </p>
            )}
            {!isLoading && hasDelta && (
              <Badge
                variant={direction === "up" ? "success" : direction === "down" ? "destructive" : "secondary"}
                className="shrink-0 font-semibold tabular-nums"
                title={period}
                aria-label={`${signed} ${period}`}
              >
                <DirectionIcon className="h-3 w-3" aria-hidden="true" />
                {signed}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}

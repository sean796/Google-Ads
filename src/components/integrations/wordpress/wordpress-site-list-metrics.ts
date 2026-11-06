import { parseQuarterLabelToQuarterYear } from "@/lib/quarter-bounds";
import type { QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import { getPropertyListRowBlackMetricFrameClass } from "./cyberpunk-theme";

export function nextEditorialPeriodTooltipText(isoExclusiveEnd: string): string {
  const boundary = new Date(isoExclusiveEnd);
  const d = boundary.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `Next editorial period starts ${d}. Plan a full republish for the new window.`;
}


/** Metric cells in a row; flush black bar, no gaps between count frames. */
export const PROPERTY_METRICS_CLUSTER_CLASS = "inline-flex shrink-0 items-stretch gap-0";

/** Fixed width for 2-digit counts so columns align across rows. */
export const PROPERTY_METRIC_COUNT_SLOT_CLASS =
  "inline-block min-w-[1.5rem] text-center tabular-nums";

export function propertyMetricCellClass(compact: boolean): string {
  return getPropertyListRowBlackMetricFrameClass(compact);
}

export function propertyMetricCellWidths(rowDisplay: WordPressPropertyRowDisplay) {
  const c = rowDisplay === "compact";
  return {
    opt: c ? "min-w-[6.5rem] w-[6.5rem]" : "min-w-[7rem] w-[7rem]",
    q: c ? "min-w-[4rem] w-[4rem]" : "min-w-[4.5rem] w-[4.5rem]",
    posts: c ? "min-w-[3.75rem] w-[3.75rem]" : "min-w-[4.25rem] w-[4.25rem]",
    ent: c ? "min-w-[3.75rem] w-[3.75rem]" : "min-w-[4.25rem] w-[4.25rem]",
  };
}

export function quarterPairTotalForStrip(
  a: number | null,
  b: number | null,
  loading: boolean,
): number | null {
  if (typeof a === "number" && Number.isFinite(a) && typeof b === "number" && Number.isFinite(b)) {
    return a + b;
  }
  if (loading) return null;
  if (a === null || b === null) return null;
  return a + b;
}

export function formatQuarterCountCell(n: number | null, loading: boolean): string {
  if (loading && (n === null || !Number.isFinite(n))) return "â€”";
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return "0";
}

export function formatScheduledVsQuota(
  total: number | null,
  quota: number,
  loading: boolean,
): string {
  if (loading && total === null) return "â€”";
  const n = typeof total === "number" && Number.isFinite(total) ? total : 0;
  return `${n}/${quota}`;
}

export function quarterStripTooltip(stats: QuarterEditorialTileStats, postsLoading?: boolean): string {
  const postL = postsLoading ?? stats.loading;
  const postsTotal = quarterPairTotalForStrip(stats.postsLive, stats.postsScheduled, postL);
  const entitiesTotal =
    stats.entityConfigured && stats.entityCountsAvailable
      ? quarterPairTotalForStrip(stats.entityLive, stats.entityScheduled, stats.loading)
      : null;
  const parsed = parseQuarterLabelToQuarterYear(stats.quarterLabel.trim());
  const qShort = parsed ? `Q${parsed.quarter}` : stats.quarterLabel.replace(/\s+\d{4}\b/, "").trim();
  let line = `${qShort}: ${formatQuarterCountCell(postsTotal, postL)} posts`;
  if (stats.entityConfigured && stats.entityCountsAvailable) {
    line += `, ${formatQuarterCountCell(entitiesTotal, stats.loading)} entities`;
  }
  return stats.errorTitle ? `${stats.errorTitle}. ${line}` : line;
}


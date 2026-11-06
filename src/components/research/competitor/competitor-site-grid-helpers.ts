import type { CompetitorTierGroup } from "@/lib/competitor-research/types";
import { formatCompetitorMetricCell } from "@/lib/competitor-research/competitor-report-number-format";

export function fmtNum(n: number | null | undefined): string {
  return formatCompetitorMetricCell(n);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function fmtAiRelevance(score: number | undefined): string {
  if (score == null || !Number.isFinite(score)) return "-";
  return `${Math.round(Math.min(100, Math.max(0, score)))}`;
}

export const UNTIERED_FILTER_KEY = "__untiered__";

/** Authority Score band vs seed site when "AS near site" filter is on. */
export const DEFAULT_AS_BAND = 25;

export function tierGroupKey(g: CompetitorTierGroup): string {
  return `${g.tier}::${g.label}`;
}

export function tierMetaKey(meta: { tier: string; label: string } | undefined): string | null {
  if (!meta) return null;
  return `${meta.tier}::${meta.label}`;
}

export function tierBadgeClass(tier: string | undefined): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("high")) return "border-semantic-warning/40 bg-semantic-warning/30 text-semantic-warning-foreground";
  if (t.includes("low")) return "border-border/40 bg-black/40 text-foreground";
  return "border-primary/35 bg-primary/10 text-primary";
}

/** Direct / same-niche competitors: schema tier `high`, or label contains "direct" but not "indirect". */
export function isDirectCompetitorTier(g: CompetitorTierGroup): boolean {
  if ((g.tier || "").toLowerCase() === "high") return true;
  const label = (g.label || "").toLowerCase();
  if (/\bindirect\b/.test(label)) return false;
  return /\bdirect\b/.test(label);
}


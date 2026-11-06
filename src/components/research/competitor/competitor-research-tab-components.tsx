import type { CompetitorSeedMetrics, CompetitorSeedOverview, GscCompetitorDateRange } from "@/lib/competitor-research/types";
import { fmtSeedMoney, fmtSeedNum } from "@/components/research/competitor/competitor-research-tab-helpers";

export function GscStatusLabel({
  dateRange,
  queryCount,
  errorMessage,
  skippedNotInList = false,
  demandSource = "gsc",
}: {
  dateRange: GscCompetitorDateRange | null;
  queryCount: number;
  errorMessage: string | null;
  /** GSC not linked for this site - same one-line label as an error, no long tooltip. */
  skippedNotInList?: boolean;
  /** Temp seed: `gq` rows are Labs/Semrush demand proxies, not Search Console. */
  demandSource?: "gsc" | "dfs_seed";
}) {
  if (!dateRange && !errorMessage && queryCount === 0 && !skippedNotInList) return null;

  const rangeLabel =
    dateRange != null ? `${dateRange.startDate} → ${dateRange.endDate}` : " - ";

  const label =
    demandSource === "dfs_seed"
      ? queryCount === 0
        ? `Organic demand (seed keywords) · 0 rows · ${rangeLabel}`
        : `Organic demand (seed ranked keywords) · ${queryCount.toLocaleString()} rows · ${rangeLabel} · not Search Console`
      : skippedNotInList || errorMessage
        ? "GSC unavailable · Semrush only"
        : queryCount === 0
          ? `GSC · 0 queries · ${rangeLabel}`
          : `GSC · ${queryCount.toLocaleString()} queries stored · ${rangeLabel}`;

  const titleAttr =
    demandSource === "dfs_seed"
      ? `Organic demand proxies from seed ranked keywords (${rangeLabel})`
      : skippedNotInList
        ? undefined
        : errorMessage ?? `Search Console data for this run (${rangeLabel})`;

  return (
    <div className="mt-2 px-2 sm:px-0">
      <span
        className="inline-flex min-h-[1rem] max-w-full items-center rounded-sm px-2.5 py-1 text-base font-semibold uppercase leading-normal tracking-wide neo-pulse-frame-primary bg-black/40 text-primary"
        title={titleAttr}
      >
        {label}
      </span>
    </div>
  );
}


export function SeedMetricsStrip({ metrics }: { metrics: CompetitorSeedMetrics }) {
  return (
    <div className="neo-pulse-zone-tile--data mt-2 px-2 py-2 sm:px-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Organic keywords
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(metrics.organicKeywords)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Organic traffic
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(metrics.organicTraffic)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Traffic value
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedMoney(metrics.trafficCost)}</div>
        </div>
      </div>
    </div>
  );
}

export function SeedOverviewStrip({ overview }: { overview: CompetitorSeedOverview }) {
  return (
    <div className="neo-pulse-zone-tile--data mt-2 px-2 py-2 sm:px-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Authority Score
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(overview.authorityScore)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Backlinks
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(overview.backlinksTotal)}</div>
        </div>
      </div>
    </div>
  );
}

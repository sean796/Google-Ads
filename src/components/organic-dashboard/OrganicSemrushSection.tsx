import { useMemo, useState } from "react";
import { ExternalLink, TrendingUp } from "lucide-react";
import { OrganicMetricDelta } from "@/components/organic-dashboard/OrganicMetricDelta";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBoxReady } from "@/components/ui/chart-box-ready";
import type {
  OrganicChartPoint,
  OrganicDashboardPeriodLabels,
  OrganicSemrushKeywordRow,
  OrganicSemrushSummary,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { formatCanadianCompactNumber } from "@/lib/gsc-reporting/gsc-number-format";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
  ORGANIC_GSC_CHART_CLASS,
  ORGANIC_GSC_METRIC_INACTIVE_CLASS,
  ORGANIC_SEMRUSH_COST_COLOR,
  ORGANIC_SEMRUSH_KEYWORDS_COLOR,
  ORGANIC_SEMRUSH_TRAFFIC_COLOR,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { cn } from "@/lib/utils";

type SemrushChartSeries = "traffic" | "keywords" | "trafficCost";

type SemrushTrendRange = "1M" | "6M" | "1Y" | "2Y" | "all";

const RANGE_MONTHS: Record<Exclude<SemrushTrendRange, "all">, number> = {
  "1M": 1,
  "6M": 6,
  "1Y": 12,
  "2Y": 24,
};

const CHART_METRIC_DEFS: Array<{
  id: SemrushChartSeries;
  label: string;
  summaryKey: "keywords" | "traffic" | "trafficCost";
  compareKey: "compareKeywords" | "compareTraffic" | "compareTrafficCost";
  deltaKey: "keywordsDelta" | "trafficDelta" | "trafficCostDelta";
  color: string;
  dataKey: keyof OrganicChartPoint;
}> = [
  {
    id: "keywords",
    label: "Keywords",
    summaryKey: "keywords",
    compareKey: "compareKeywords",
    deltaKey: "keywordsDelta",
    color: ORGANIC_SEMRUSH_KEYWORDS_COLOR,
    dataKey: "semrushKeywords",
  },
  {
    id: "traffic",
    label: "Traffic",
    summaryKey: "traffic",
    compareKey: "compareTraffic",
    deltaKey: "trafficDelta",
    color: ORGANIC_SEMRUSH_TRAFFIC_COLOR,
    dataKey: "semrushTraffic",
  },
  {
    id: "trafficCost",
    label: "Traffic cost",
    summaryKey: "trafficCost",
    compareKey: "compareTrafficCost",
    deltaKey: "trafficCostDelta",
    color: ORGANIC_SEMRUSH_COST_COLOR,
    dataKey: "semrushTrafficCost",
  },
];

const BRANDED_TILE_DEFS: Array<{
  label: string;
  summaryKey: "brandedTraffic" | "nonBrandedTraffic";
  compareKey: "compareBrandedTraffic" | "compareNonBrandedTraffic";
  deltaKey: "brandedDelta" | "nonBrandedDelta";
}> = [
  {
    label: "Branded traffic",
    summaryKey: "brandedTraffic",
    compareKey: "compareBrandedTraffic",
    deltaKey: "brandedDelta",
  },
  {
    label: "Non-branded traffic",
    summaryKey: "nonBrandedTraffic",
    compareKey: "compareNonBrandedTraffic",
    deltaKey: "nonBrandedDelta",
  },
];

function formatAxisTick(value: number): string {
  return formatCanadianCompactNumber(value);
}

function formatChartValue(value: number): string {
  return formatCanadianCompactNumber(value);
}

function monthKeyToIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return y * 12 + (m - 1);
}

function filterTrendByRange(trend: OrganicChartPoint[], range: SemrushTrendRange): OrganicChartPoint[] {
  if (range === "all" || trend.length === 0) return trend;
  const last = trend[trend.length - 1]?.label ?? "";
  const endIdx = monthKeyToIndex(last);
  const startIdx = endIdx - RANGE_MONTHS[range] + 1;
  return trend.filter((p) => monthKeyToIndex(p.label) >= startIdx);
}

export type OrganicSemrushSectionProps = {
  summary: OrganicSemrushSummary | null;
  keywords: OrganicSemrushKeywordRow[];
  trend: OrganicChartPoint[];
  overviewUrl: string;
  periodLabels: OrganicDashboardPeriodLabels;
  showCompare: boolean;
};

export function OrganicSemrushSection({
  summary,
  keywords,
  trend,
  overviewUrl,
  periodLabels,
  showCompare,
}: OrganicSemrushSectionProps) {
  const { boxRef, ready } = useBoxReady();
  const [trendRange, setTrendRange] = useState<SemrushTrendRange>("2Y");
  const [activeSeries, setActiveSeries] = useState<Set<SemrushChartSeries>>(
    () => new Set<SemrushChartSeries>(["traffic"]),
  );

  const showBrandedTiles = summary?.hasBrandedMetrics === true;

  const toggleSeries = (id: SemrushChartSeries) => {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const trendChart = useMemo(() => filterTrendByRange(trend, trendRange), [trend, trendRange]);

  const chartLines = useMemo(
    () => CHART_METRIC_DEFS.filter((m) => activeSeries.has(m.id)),
    [activeSeries],
  );

  const showChart = ready && trendChart.length > 0 && chartLines.length > 0;

  const tileCount = CHART_METRIC_DEFS.length + (showBrandedTiles ? BRANDED_TILE_DEFS.length : 0);

  return (
    <section className={cn(ORGANIC_DASHBOARD_SECTION_PANEL_CLASS, "gap-4 p-0")}>
      <div className="flex flex-col gap-4 p-4 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>Semrush</h2>
            {overviewUrl ? (
              <a
                href={overviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 px-2 text-base text-primary hover:underline"
              >
                Open in Semrush
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              </a>
            ) : null}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 gap-1">
              {(["1M", "6M", "1Y", "2Y", "all"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={trendRange === mode}
                  disabled={trend.length === 0}
                  onClick={() => setTrendRange(mode)}
                  className={cn(
                    "h-8 min-w-[2.75rem] px-2 text-base",
                    trendRange === mode
                      ? "bg-zinc-800 text-white"
                      : cn(ORGANIC_GSC_METRIC_INACTIVE_CLASS, "text-muted-foreground"),
                  )}
                >
                  {mode === "all" ? "All" : mode}
                </button>
              ))}
            </div>
            {periodLabels.primary !== "Current period" ? (
              <p className="text-base text-muted-foreground tabular-nums">
                {showCompare ? (
                  <>
                    {periodLabels.compare}
                    <span className="px-1.5">→</span>
                    {periodLabels.primary}
                  </>
                ) : (
                  periodLabels.primary
                )}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-base text-muted-foreground">Estimated organic visibility from Semrush (regional database).</p>

        <div
          className={cn(
            "grid w-full gap-2",
            tileCount >= 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3",
          )}
        >
          {CHART_METRIC_DEFS.map((metric) => {
            const on = activeSeries.has(metric.id);
            const value = summary?.[metric.summaryKey] ?? "—";
            const compareValue = summary?.[metric.compareKey] ?? "—";
            const delta = summary?.[metric.deltaKey] ?? { deltaPercent: null, deltaPositive: null };
            return (
              <button
                key={metric.label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSeries(metric.id)}
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 rounded-none px-3 py-2 text-left transition-colors",
                  on ? "text-white" : ORGANIC_GSC_METRIC_INACTIVE_CLASS,
                )}
                style={on ? { backgroundColor: metric.color } : undefined}
              >
                <span className="text-base leading-tight">{metric.label}</span>
                {showCompare ? (
                  <span className="flex items-baseline gap-2 tabular-nums leading-tight">
                    <span className={cn("text-base", on ? "text-white/70" : "text-muted-foreground")}>
                      {compareValue}
                    </span>
                    <OrganicMetricDelta delta={delta} />
                    <span className="text-xl font-semibold">{value}</span>
                  </span>
                ) : (
                  <span className="text-xl font-semibold tabular-nums leading-tight">{value}</span>
                )}
              </button>
            );
          })}
          {showBrandedTiles
            ? BRANDED_TILE_DEFS.map((metric) => {
                const value = summary?.[metric.summaryKey] ?? "—";
                const compareValue = summary?.[metric.compareKey] ?? "—";
                const delta = summary?.[metric.deltaKey] ?? { deltaPercent: null, deltaPositive: null };
                return (
                  <div
                    key={metric.label}
                    className={cn(
                      "flex min-w-0 flex-col gap-0.5 rounded-none px-3 py-2 text-left",
                      ORGANIC_GSC_METRIC_INACTIVE_CLASS,
                    )}
                  >
                    <span className="text-base leading-tight">{metric.label}</span>
                    {showCompare ? (
                      <span className="flex items-baseline gap-2 tabular-nums leading-tight">
                        <span className="text-base text-muted-foreground">{compareValue}</span>
                        <OrganicMetricDelta delta={delta} />
                        <span className="text-xl font-semibold text-white">{value}</span>
                      </span>
                    ) : (
                      <span className="text-xl font-semibold tabular-nums leading-tight text-white">{value}</span>
                    )}
                  </div>
                );
              })
            : null}
        </div>

        <h3 className="text-base font-semibold text-white">Estimated traffic trend</h3>
      </div>

      {showChart ? (
        <div ref={boxRef} className={cn(ORGANIC_GSC_CHART_CLASS, "px-2 pb-2")}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendChart} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(0 0% 70%)", fontSize: 16 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(0 0% 100% / 0.08)" }}
              />
              <YAxis
                width={56}
                tick={{ fill: ORGANIC_SEMRUSH_TRAFFIC_COLOR, fontSize: 16 }}
                tickFormatter={formatAxisTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(0 0% 7%)",
                  border: "0",
                  fontSize: "1rem",
                }}
                formatter={(val: number, name: string) => [formatChartValue(val), name]}
              />
              {activeSeries.has("traffic") ? (
                <Area
                  type="monotone"
                  dataKey="semrushTraffic"
                  name="Traffic"
                  stroke={ORGANIC_SEMRUSH_TRAFFIC_COLOR}
                  fill={ORGANIC_SEMRUSH_TRAFFIC_COLOR}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {chartLines
                .filter((m) => m.id !== "traffic")
                .map((metric) => (
                  <Line
                    key={metric.id}
                    type="monotone"
                    dataKey={metric.dataKey}
                    name={metric.label}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div ref={boxRef} className="px-4 pb-2 text-base text-muted-foreground tabular-nums">
          {summary ? "—" : "No Semrush data for this property"}
        </div>
      )}

      <div className="border-t border-white/5">
        <div className="border-b border-white/5 px-4">
          <div
            className="inline-flex border-b-2 border-white py-2.5 text-base font-normal uppercase tracking-wide text-white"
            aria-current="page"
          >
            Top organic keywords
          </div>
        </div>

        {keywords.length > 0 ? (
          <div className="overflow-x-auto px-4 pb-4 pt-1">
            <table className="w-full min-w-[24rem] text-base">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Keyword</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Volume</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Est. traffic</th>
                  <th className="pb-2 font-normal tabular-nums">Position</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((row, idx) => (
                  <tr key={`${row.phrase}-${idx}`} className="border-t border-white/5">
                    <td className="max-w-[20rem] truncate py-2.5 pr-4 text-white">{row.phrase}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">{row.volume}</td>
                    <td
                      className="py-2.5 pr-4 tabular-nums font-medium"
                      style={{ color: ORGANIC_SEMRUSH_TRAFFIC_COLOR }}
                    >
                      {row.traffic}
                    </td>
                    <td className="py-2.5 tabular-nums text-white">{row.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 pt-2 text-base text-muted-foreground">
            {summary ? "No keywords returned for this domain." : "—"}
          </p>
        )}
      </div>
    </section>
  );
}

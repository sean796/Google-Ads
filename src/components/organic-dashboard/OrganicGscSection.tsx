import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { OrganicMetricDelta } from "@/components/organic-dashboard/OrganicMetricDelta";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBoxReady } from "@/components/ui/chart-box-ready";
import type {
  OrganicChartPoint,
  OrganicDashboardPeriodLabels,
  OrganicGscMetricDelta,
  OrganicGscQueryRow,
  OrganicGscSummary,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { formatCanadianCompactNumber } from "@/lib/gsc-reporting/gsc-number-format";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
  ORGANIC_GSC_CHART_CLASS,
  ORGANIC_GSC_CLICKS_COLOR,
  ORGANIC_GSC_IMPRESSIONS_COLOR,
  ORGANIC_GSC_METRIC_INACTIVE_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { cn } from "@/lib/utils";

type GscChartSeries = "clicks" | "impressions" | "ctr" | "position";

const METRIC_DEFS: Array<{
  id: GscChartSeries;
  label: string;
  summaryKey: "clicks" | "impressions" | "ctr" | "avgPosition";
  compareKey: "compareClicks" | "compareImpressions" | "compareCtr" | "compareAvgPosition";
  deltaKey: "clicksDelta" | "impressionsDelta" | "ctrDelta" | "positionDelta";
  color: string;
  dataKey?: keyof OrganicChartPoint;
  yAxisId?: "clicks" | "impressions" | "rate";
}> = [
  {
    id: "clicks",
    label: "Total clicks",
    summaryKey: "clicks",
    compareKey: "compareClicks",
    deltaKey: "clicksDelta",
    color: ORGANIC_GSC_CLICKS_COLOR,
    dataKey: "gscClicks",
    yAxisId: "clicks",
  },
  {
    id: "impressions",
    label: "Total impressions",
    summaryKey: "impressions",
    compareKey: "compareImpressions",
    deltaKey: "impressionsDelta",
    color: ORGANIC_GSC_IMPRESSIONS_COLOR,
    dataKey: "gscImpressions",
    yAxisId: "impressions",
  },
  {
    id: "ctr",
    label: "Average CTR",
    summaryKey: "ctr",
    compareKey: "compareCtr",
    deltaKey: "ctrDelta",
    color: "hsl(142 70% 45%)",
  },
  {
    id: "position",
    label: "Average position",
    summaryKey: "avgPosition",
    compareKey: "compareAvgPosition",
    deltaKey: "positionDelta",
    color: "hsl(0 0% 65%)",
  },
];

function formatAxisTick(value: number): string {
  return formatCanadianCompactNumber(value);
}

function formatChartValue(value: number): string {
  return formatCanadianCompactNumber(value);
}

type GscGranularity = "daily" | "monthly";

export type OrganicGscSectionProps = {
  summary: OrganicGscSummary | null;
  queries: OrganicGscQueryRow[];
  trendDaily: OrganicChartPoint[];
  trendMonthly: OrganicChartPoint[];
  periodLabels: OrganicDashboardPeriodLabels;
  showCompare: boolean;
};

export function OrganicGscSection({
  summary,
  queries,
  trendDaily,
  trendMonthly,
  periodLabels,
  showCompare,
}: OrganicGscSectionProps) {
  const { boxRef, ready } = useBoxReady();
  const [granularity, setGranularity] = useState<GscGranularity>(() =>
    trendDaily.length > 0 ? "daily" : "monthly",
  );
  const [activeSeries, setActiveSeries] = useState<Set<GscChartSeries>>(
    () => new Set<GscChartSeries>(["clicks", "impressions"]),
  );

  const trendChart = granularity === "daily" ? trendDaily : trendMonthly;

  const toggleSeries = (id: GscChartSeries) => {
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

  const chartLines = useMemo(
    () => METRIC_DEFS.filter((m) => m.dataKey && activeSeries.has(m.id)),
    [activeSeries],
  );

  const showChart = ready && trendChart.length > 0 && chartLines.length > 0;

  return (
    <section className={cn(ORGANIC_DASHBOARD_SECTION_PANEL_CLASS, "gap-4 p-0")}>
      <div className="flex flex-col gap-4 p-4 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
              <Search className="h-4 w-4" aria-hidden />
            </span>
            <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>Google Search Console</h2>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 gap-1">
              {(["daily", "monthly"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={granularity === mode}
                  disabled={mode === "daily" ? trendDaily.length === 0 : trendMonthly.length === 0}
                  onClick={() => setGranularity(mode)}
                  className={cn(
                    "h-8 min-w-[4.5rem] px-2 text-base capitalize",
                    granularity === mode
                      ? "bg-zinc-800 text-white"
                      : cn(ORGANIC_GSC_METRIC_INACTIVE_CLASS, "text-muted-foreground"),
                  )}
                >
                  {mode === "daily" ? "Daily" : "Monthly"}
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

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          {METRIC_DEFS.map((metric) => {
            const on = activeSeries.has(metric.id);
            const value = summary?.[metric.summaryKey] ?? "—";
            const compareValue = summary?.[metric.compareKey] ?? "—";
            const delta = summary?.[metric.deltaKey] ?? { deltaPercent: null, deltaPositive: null };
            return (
              <button
                key={metric.id}
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
        </div>
      </div>

      {showChart ? (
        <div ref={boxRef} className={cn(ORGANIC_GSC_CHART_CLASS, "px-2 pb-2")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendChart} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(0 0% 70%)", fontSize: 16 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(0 0% 100% / 0.08)" }}
              />
              {activeSeries.has("clicks") ? (
                <YAxis
                  yAxisId="clicks"
                  orientation="left"
                  width={56}
                  tick={{ fill: ORGANIC_GSC_CLICKS_COLOR, fontSize: 16 }}
                  tickFormatter={formatAxisTick}
                  tickLine={false}
                  axisLine={false}
                />
              ) : null}
              {activeSeries.has("impressions") ? (
                <YAxis
                  yAxisId="impressions"
                  orientation="right"
                  width={56}
                  tick={{ fill: ORGANIC_GSC_IMPRESSIONS_COLOR, fontSize: 16 }}
                  tickFormatter={formatAxisTick}
                  tickLine={false}
                  axisLine={false}
                />
              ) : null}
              <Tooltip
                contentStyle={{
                  background: "hsl(0 0% 7%)",
                  border: "0",
                  fontSize: "1rem",
                }}
                formatter={(val: number, name: string) => [formatChartValue(val), name]}
              />
              {chartLines.map((metric) => (
                <Line
                  key={metric.id}
                  yAxisId={metric.yAxisId}
                  type="monotone"
                  dataKey={metric.dataKey!}
                  name={metric.label}
                  stroke={metric.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div ref={boxRef} className="px-4 pb-2 text-base text-muted-foreground tabular-nums">
          {summary ? "—" : "No Search Console data for this period"}
        </div>
      )}

      <div className="border-t border-white/5">
        <div className="border-b border-white/5 px-4">
          <div
            className="inline-flex border-b-2 border-white py-2.5 text-base font-normal uppercase tracking-wide text-white"
            aria-current="page"
          >
            Queries
          </div>
        </div>

        {queries.length > 0 ? (
          <div className="overflow-x-auto px-4 pb-4 pt-1">
            <table className="w-full min-w-[24rem] text-base">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Top queries</th>
                  {showCompare ? (
                    <>
                      <th className="pb-2 pr-4 font-normal tabular-nums">{periodLabels.compare}</th>
                      <th className="pb-2 pr-4 font-normal tabular-nums">Change</th>
                      <th className="pb-2 pr-4 font-normal tabular-nums">{periodLabels.primary}</th>
                      <th className="pb-2 pr-4 font-normal tabular-nums">{periodLabels.compare}</th>
                      <th className="pb-2 pr-4 font-normal tabular-nums">Change</th>
                      <th className="pb-2 font-normal tabular-nums">{periodLabels.primary}</th>
                    </>
                  ) : (
                    <>
                      <th className="pb-2 pr-4 font-normal tabular-nums">Clicks</th>
                      <th className="pb-2 font-normal tabular-nums">Impressions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {queries.map((row, idx) => (
                  <tr key={`${row.query}-${idx}`} className="border-t border-white/5">
                    <td className="max-w-[20rem] truncate py-2.5 pr-4 text-white">{row.query}</td>
                    {showCompare ? (
                      <>
                        <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">{row.previousClicks}</td>
                        <td className="py-2.5 pr-4">
                          <OrganicMetricDelta delta={row.clicksDelta} />
                        </td>
                        <td
                          className="py-2.5 pr-4 tabular-nums font-medium"
                          style={{ color: ORGANIC_GSC_CLICKS_COLOR }}
                        >
                          {row.clicks}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">{row.previousImpressions}</td>
                        <td className="py-2.5 pr-4">
                          <OrganicMetricDelta delta={row.impressionsDelta} />
                        </td>
                        <td
                          className="py-2.5 tabular-nums font-medium"
                          style={{ color: ORGANIC_GSC_IMPRESSIONS_COLOR }}
                        >
                          {row.impressions}
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className="py-2.5 pr-4 tabular-nums font-medium"
                          style={{ color: ORGANIC_GSC_CLICKS_COLOR }}
                        >
                          {row.clicks}
                        </td>
                        <td
                          className="py-2.5 tabular-nums font-medium"
                          style={{ color: ORGANIC_GSC_IMPRESSIONS_COLOR }}
                        >
                          {row.impressions}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 pt-2 text-base text-muted-foreground">
            {summary ? "No queries returned for this period." : "—"}
          </p>
        )}
      </div>
    </section>
  );
}

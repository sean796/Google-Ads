import { useMemo, useState } from "react";
import { AlertCircle, Check, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PageIndexingReport } from "@/lib/organic-dashboard/page-indexing-report-types";
import { resolvePagesSitemapUrl } from "@/lib/organic-dashboard/resolve-pages-sitemap-url";
import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";
import {
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_GSC_CHART_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { cn } from "@/lib/utils";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { WordPressSite } from "@/components/integrations/types";
import { Button, useBoxReady } from "@/ui";

type ChartFocus = "indexed" | "notIndexed";

export type OrganicReportingIndexingSectionProps = {
  site: WordPressSite;
  loading: boolean;
  report: PageIndexingReport | null;
  errorMessage?: string | null;
  onRefreshSitemaps?: () => void;
  isRefreshingSitemaps?: boolean;
};

function TrendSparkline({ trend }: { trend: "flat" | "down" | "up" }) {
  const path =
    trend === "down"
      ? "M0 6 L12 4 L24 2"
      : trend === "up"
        ? "M0 4 L12 5 L24 6"
        : "M0 5 L24 5";
  return (
    <svg width={28} height={10} viewBox="0 0 24 8" className="text-muted-foreground" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function formatChartDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${m}/${d}/${String(y).slice(-2)}`;
}

export function OrganicReportingIndexingSection({
  site,
  loading,
  report,
  errorMessage,
  onRefreshSitemaps,
  isRefreshingSitemaps = false,
}: OrganicReportingIndexingSectionProps) {
  const [chartFocus, setChartFocus] = useState<ChartFocus>("indexed");
  const { boxRef: chartRef, ready: chartReady } = useBoxReady();

  const pagesSitemapUrl = useMemo(() => resolvePagesSitemapUrl(site), [site]);
  const propertyUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();

  const chartData = report?.chart ?? [];
  const indexedCount = report?.indexedCount ?? 0;
  const notIndexedCount = report?.notIndexedCount ?? 0;
  const reasonCount = report?.reasonCount ?? 0;

  const sampleCaption =
    report != null
      ? `Sample: ${formatCanadianNumber(report.sampleSize, 0)} of ${formatCanadianNumber(report.sitemapTotalUrls, 0)} URLs from pages sitemap via URL Inspection.`
      : pagesSitemapUrl
        ? "Use Refresh to run a URL Inspection sample from your pages sitemap."
        : "Detect sitemaps on Integrations, then Refresh here.";

  return (
    <div className="flex flex-col gap-4">
      <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Page indexing</h2>
            <p className="text-base text-muted-foreground tabular-nums">{propertyUrl}</p>
            <p className="text-base text-muted-foreground">{sampleCaption}</p>
          </div>
          {onRefreshSitemaps ? (
            <Button
              variant="quiet"
              disabled={loading || isRefreshingSitemaps}
              onClick={onRefreshSitemaps}
            >
              Detect sitemaps
            </Button>
          ) : null}
        </div>

        {!pagesSitemapUrl && !loading ? (
          <p className="text-base text-muted-foreground">No pages sitemap available for this property.</p>
        ) : null}

        {errorMessage ? (
          <p className="whitespace-pre-wrap text-base text-destructive">{errorMessage}</p>
        ) : null}

        {loading && !report ? (
          <p className="flex min-h-[12rem] items-center justify-center text-base text-muted-foreground">
            Inspecting sample URLs…
          </p>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                pressed={chartFocus === "notIndexed"}
                onClick={() => setChartFocus("notIndexed")}
              >
                <span className="flex items-center justify-between text-base text-muted-foreground">
                  Not indexed
                  {chartFocus === "notIndexed" ? (
                    <Check className="h-4 w-4 text-white" aria-hidden />
                  ) : null}
                </span>
                <span className="text-3xl font-normal tabular-nums text-white">
                  {formatCanadianNumber(notIndexedCount, 0)}
                </span>
                <span className="text-base text-muted-foreground">
                  {formatCanadianNumber(reasonCount, 0)} reason{reasonCount === 1 ? "" : "s"}
                </span>
              </Button>
              <Button
                pressed={chartFocus === "indexed"}
                onClick={() => setChartFocus("indexed")}
              >
                <span className="flex items-center justify-between text-base text-primary/90">
                  Indexed
                  {chartFocus === "indexed" ? (
                    <Check className="h-4 w-4 text-primary" aria-hidden />
                  ) : null}
                </span>
                <span className="text-3xl font-normal tabular-nums text-white">
                  {formatCanadianNumber(indexedCount, 0)}
                </span>
                <span className="text-base text-muted-foreground">In sample</span>
              </Button>
            </div>

            <div ref={chartRef} className={cn(ORGANIC_GSC_CHART_CLASS, !chartReady && "invisible")}>
              {chartReady && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tick={{ fill: "hsl(0 0% 65%)", fontSize: 16 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "hsl(0 0% 65%)", fontSize: 16 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(240 6% 10%)",
                        border: "none",
                        fontSize: "1rem",
                      }}
                      labelFormatter={(label) => formatChartDate(String(label))}
                    />
                    <Bar
                      dataKey="notIndexed"
                      stackId="index"
                      fill={chartFocus === "notIndexed" ? "hsl(0 0% 55%)" : "hsl(0 0% 35%)"}
                      name="Not indexed"
                    />
                    <Bar
                      dataKey="indexed"
                      stackId="index"
                      fill={chartFocus === "indexed" ? "hsl(142 55% 42%)" : "hsl(142 35% 28%)"}
                      name="Indexed"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      {report && report.reasons.length > 0 ? (
        <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
          <div>
            <h3 className="text-lg font-semibold text-white">Why pages aren&apos;t indexed</h3>
            <p className="text-base text-muted-foreground">
              Pages that aren&apos;t indexed can&apos;t be served on Google (sample breakdown).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-base">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Reason</th>
                  <th className="pb-2 pr-4 font-normal">Source</th>
                  <th className="pb-2 pr-4 font-normal">Validation</th>
                  <th className="pb-2 pr-4 font-normal">Trend</th>
                  <th className="pb-2 font-normal text-right">Pages</th>
                </tr>
              </thead>
              <tbody>
                {report.reasons.map((row) => (
                  <tr key={row.reason} className="border-t border-white/5">
                    <td className="max-w-[20rem] py-3 pr-4 text-white">{row.reason}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.source}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                        {row.validation}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <TrendSparkline trend={row.trend} />
                    </td>
                    <td className="py-3 text-right tabular-nums text-white">
                      {formatCanadianNumber(row.pages, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : report && notIndexedCount === 0 && !loading ? (
        <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
          <p className="inline-flex items-center gap-2 text-base text-muted-foreground">
            <Minus className="h-4 w-4" aria-hidden />
            All sampled URLs are indexed.
          </p>
        </section>
      ) : null}
    </div>
  );
}

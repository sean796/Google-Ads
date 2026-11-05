import { useMemo, type ReactNode } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  formatGoogleAdsCustomerId,
  googleAdsCampaignUrl,
  microsToSpend,
} from "@/lib/ads-reporting/ads-reporting-metrics";
import { ExternalLink } from "lucide-react";
import { GoogleAdsEntityStatusIcon } from "@/components/ppc/google/GoogleAdsEntityStatusIcon";
import { GoogleAdsInsightsScopeControls } from "@/components/ppc/google/GoogleAdsInsightsScopeControls";
import type { AdsMetrics } from "@/lib/ads-reporting/ads-reporting-types";
import {
  ppcCampaignInsightsCpcLabel,
  ppcCampaignInsightsDateRangeLabel,
  ppcCampaignInsightsPerformanceAdGroups,
  ppcCampaignInsightsPerformanceKeywords,
  ppcCampaignInsightsPerformanceSearchTerms,
  ppcCampaignInsightsAverageCpcMicros,
  ppcCampaignStatusLabel,
  ppcCampaignStatusTone,
} from "@/lib/ppc/ppc-campaign-insights-display";
import {
  PPC_INSIGHTS_SCOPE_CAMPAIGN,
  resolvePpcInsightsScopeView,
  type PpcInsightsScope,
} from "@/lib/ppc/ppc-campaign-insights-scope";
import { ppcCampaignInsightsHasActivity, type PpcCampaignInsights } from "@/lib/ppc/ppc-campaign-insights-types";
import { cn } from "@/lib/utils";

const METRIC_WELL =
  "flex min-h-[3.25rem] min-w-0 flex-col justify-center gap-0.5 rounded-none bg-ui-field px-3 py-2.5";

const METRIC_WELL_GROW = cn(METRIC_WELL, "flex-1");

const META_METRICS_GRID = "grid w-full grid-cols-2 gap-2 lg:grid-cols-4";

const PERFORMANCE_METRICS_ROW =
  "flex w-full min-w-0 flex-wrap gap-2 sm:flex-nowrap";

const PERFORMANCE_METRIC_CELL = "min-w-[calc(50%-0.25rem)] sm:min-w-0 sm:flex-1";

const PANEL_SECTION = "w-full min-w-0 bg-ui-field/40 px-3 py-3";

const TRAFFIC_TABLE_ROW =
  "grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_4.25rem_5rem_5.25rem_4.75rem] items-center gap-x-3";

const TRAFFIC_TABLE_HEAD = cn(TRAFFIC_TABLE_ROW, "border-b border-border/80 pb-2 text-muted-foreground");

const TRAFFIC_TABLE_BODY_ROW = cn(
  TRAFFIC_TABLE_ROW,
  "border-b border-border/50 py-2.5 text-base last:border-b-0",
);

const INSIGHTS_CHART_CONFIG = {
  spend: { label: "Spend", color: "hsl(var(--primary))" },
  clicks: { label: "Clicks", color: "hsl(var(--semantic-data))" },
} as const;

function TrafficMetricCells({ row }: { row: AdsMetrics }) {
  const cpcMicros = ppcCampaignInsightsAverageCpcMicros(row);
  return (
    <>
      <span className="text-right tabular-nums text-foreground">{row.clicks}</span>
      <span className="text-right tabular-nums text-foreground">{row.impressions}</span>
      <span className="text-right tabular-nums text-foreground">{formatSpend(row.costMicros)}</span>
      <span className="text-right tabular-nums text-muted-foreground">
        {cpcMicros > 0 ? `${ppcCampaignInsightsCpcLabel(cpcMicros)}` : "—"}
      </span>
    </>
  );
}

function TrafficTableHeader() {
  return (
    <div className={TRAFFIC_TABLE_HEAD} role="row">
      <span aria-hidden />
      <span className="min-w-0">Name</span>
      <span className="text-right tabular-nums">Clicks</span>
      <span className="text-right tabular-nums">Impressions</span>
      <span className="text-right tabular-nums">Spend</span>
      <span className="text-right tabular-nums">CPC</span>
    </div>
  );
}

function TrafficMetricsSection({
  title,
  emptyCopy,
  children,
}: {
  title: string;
  emptyCopy: string;
  children: ReactNode;
}) {
  return (
    <div className={PANEL_SECTION}>
      <p className="pb-2 text-base font-medium text-white">{title}</p>
      {children ?? <p className="text-base text-muted-foreground">{emptyCopy}</p>}
    </div>
  );
}

function formatSpend(micros: number): string {
  return microsToSpend(micros).toFixed(2);
}

function formatPct(ctr: number): string {
  const pct = ctr <= 1 && ctr >= 0 ? ctr * 100 : ctr;
  return `${pct.toFixed(1)}%`;
}

function scopedChartEmptyCopy(scope: PpcInsightsScope, missingSeries: boolean): string {
  if (scope.level === "campaign") {
    return "Chart appears when this campaign has spend or clicks in the selected range.";
  }
  if (scope.level === "ad_group") {
    return missingSeries
      ? `No daily metrics for ad group "${scope.label}" in this range.`
      : "No impressions or clicks for this ad group in the selected range.";
  }
  if (scope.level === "ad") {
    return missingSeries
      ? `No daily metrics for ad "${scope.label}" in this range.`
      : "No impressions or clicks for this ad in the selected range.";
  }
  return missingSeries
    ? `No daily metrics for keyword "${scope.label}" in this range.`
    : "No impressions or clicks for this keyword in the selected range.";
}

export type GoogleAdsCampaignInsightsPanelProps = {
  insights: PpcCampaignInsights;
  scope?: PpcInsightsScope;
  onScopeChange?: (scope: PpcInsightsScope) => void;
  periodHint?: string;
  tableLimit?: number;
  showCompare?: boolean;
};

export function GoogleAdsCampaignInsightsPanel({
  insights,
  scope = PPC_INSIGHTS_SCOPE_CAMPAIGN,
  onScopeChange,
  periodHint,
  tableLimit = 10,
  showCompare = false,
}: GoogleAdsCampaignInsightsPanelProps) {
  const scopeView = useMemo(() => resolvePpcInsightsScopeView(insights, scope), [insights, scope]);
  const campaignHasActivity = ppcCampaignInsightsHasActivity(insights);
  const statusTone = ppcCampaignStatusTone(insights.campaignStatus);
  const topKeywords = ppcCampaignInsightsPerformanceKeywords(insights, tableLimit);
  const topTerms = ppcCampaignInsightsPerformanceSearchTerms(insights, tableLimit);
  const topAdGroups = ppcCampaignInsightsPerformanceAdGroups(insights, tableLimit);
  const summaryCpcMicros = ppcCampaignInsightsAverageCpcMicros(scopeView.summary);

  const adGroupStatusById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of insights.structureAdGroups) {
      if (group.id) map.set(group.id, group.status);
    }
    return map;
  }, [insights.structureAdGroups]);

  const chartData = useMemo(() => {
    return scopeView.dailySeries.map((point) => ({
      date: point.date.slice(5),
      spend: microsToSpend(point.costMicros),
      clicks: point.clicks,
    }));
  }, [scopeView.dailySeries]);

  const showPerformanceTables =
    campaignHasActivity && (topKeywords.length > 0 || topTerms.length > 0 || topAdGroups.length > 0);
  const adsCampaignHref = googleAdsCampaignUrl(insights.customerId, insights.campaignId);
  const dailyBudget =
    insights.dailyBudgetMicros != null && insights.dailyBudgetMicros > 0
      ? microsToSpend(insights.dailyBudgetMicros)
      : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {insights.campaignName ? (
          <p className="min-w-0 flex-1 text-base font-medium text-white">{insights.campaignName}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
          {insights.campaignStatus ? (
            <span
              className={cn(
                "rounded-none px-2 py-0.5 text-base tabular-nums",
                statusTone === "ok" && "bg-primary/20 text-primary",
                statusTone === "warn" && "bg-semantic-warning/15 text-semantic-warning-foreground",
                statusTone === "muted" && "bg-ui-field-hover text-muted-foreground",
              )}
            >
              {ppcCampaignStatusLabel(insights.campaignStatus)}
            </span>
          ) : null}
          <span className="text-base text-muted-foreground">
            {periodHint ?? ppcCampaignInsightsDateRangeLabel(insights)}
          </span>
          <span className="rounded-none bg-ui-field-hover px-2 py-0.5 text-base text-foreground">
            {scopeView.scopeLabel}
          </span>
        </div>
      </div>

      {onScopeChange ? (
        <GoogleAdsInsightsScopeControls insights={insights} scope={scope} onScopeChange={onScopeChange} />
      ) : null}

      <div className={META_METRICS_GRID}>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Campaign ID</span>
          <span className="flex min-w-0 items-center gap-1.5 tabular-nums text-base text-white">
            <GoogleAdsEntityStatusIcon status={insights.campaignStatus} />
            <span className="break-words">{insights.campaignId}</span>
          </span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Customer ID</span>
          <span className="break-words tabular-nums text-base text-white">
            {formatGoogleAdsCustomerId(insights.customerId)}
          </span>
        </div>
        {dailyBudget != null ? (
          <div className={METRIC_WELL}>
            <span className="text-base text-muted-foreground">Ads daily budget</span>
            <span className="tabular-nums text-base text-white">{dailyBudget.toFixed(2)}/day</span>
          </div>
        ) : null}
        {adsCampaignHref ? (
          <a
            href={adsCampaignHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              METRIC_WELL,
              "flex-row items-center justify-between gap-2 text-semantic-analysis-foreground no-underline hover:text-semantic-analysis-foreground",
            )}
          >
            <span className="text-base">Open in Google Ads</span>
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        ) : null}
      </div>

      {insights.structureAdGroups.length > 0 ? (
        <div className={PANEL_SECTION}>
          <p className="pb-2 text-base font-medium text-white">Ad groups in Google Ads</p>
          <ul className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insights.structureAdGroups.map((row) => (
              <li
                key={row.id || row.name}
                className="flex min-w-0 items-center justify-between gap-2 bg-ui-field/80 px-3 py-2 text-base"
              >
                <span className="min-w-0 break-words text-foreground">{row.name}</span>
                <span className="shrink-0 text-muted-foreground">{ppcCampaignStatusLabel(row.status)}</span>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-base text-muted-foreground">
            Responsive ad approval and eligibility (for example Under review) are shown in Google Ads while the
            campaign is paused.
          </p>
        </div>
      ) : null}

      {scope.level === "campaign" && !campaignHasActivity ? (
        <p className="text-base text-muted-foreground">
          {insights.campaignStatus?.toUpperCase() === "PAUSED"
            ? "Campaign is paused in Google Ads. Enable it in Ads to collect impressions and clicks in this range."
            : "No impressions or clicks in this date range."}
        </p>
      ) : null}

      <div className={PERFORMANCE_METRICS_GRID}>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Impressions</span>
          <span className="tabular-nums text-base text-white">{scopeView.summary.impressions}</span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Clicks</span>
          <span className="tabular-nums text-base text-white">{scopeView.summary.clicks}</span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Spend</span>
          <span className="tabular-nums text-base text-white">{formatSpend(scopeView.summary.costMicros)}</span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Conv.</span>
          <span className="tabular-nums text-base text-white">{scopeView.summary.conversions}</span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">CTR</span>
          <span className="tabular-nums text-base text-white">{formatPct(scopeView.summary.ctr)}</span>
        </div>
        <div className={METRIC_WELL}>
          <span className="text-base text-muted-foreground">Avg. CPC</span>
          <span className="tabular-nums text-base text-white">
            {summaryCpcMicros > 0 ? `${ppcCampaignInsightsCpcLabel(summaryCpcMicros)}` : "—"}
          </span>
        </div>
        {showCompare && insights.compareSummary && scope.level === "campaign" ? (
          <div className={METRIC_WELL}>
            <span className="text-base text-muted-foreground">Prev. clicks</span>
            <span className="tabular-nums text-base text-white">{insights.compareSummary.clicks}</span>
          </div>
        ) : null}
      </div>

      <div className="min-h-48 w-full bg-ui-field/50 px-2 py-3">
        {chartData.length > 0 && scopeView.hasActivity ? (
          <ChartContainer config={INSIGHTS_CHART_CONFIG} className="aspect-[3/1] h-48 w-full">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted-foreground" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="spend" tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="clicks" orientation="right" tickLine={false} axisLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                yAxisId="spend"
                type="monotone"
                dataKey="spend"
                stroke="var(--color-spend)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="clicks"
                stroke="var(--color-clicks)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex h-48 items-center justify-center px-4">
            <p className="text-center text-base text-muted-foreground">
              {scopedChartEmptyCopy(scope, scopeView.missingSeries)}
            </p>
          </div>
        )}
      </div>

      <div className={PANEL_SECTION}>
        {insights.recommendations.length > 0 ? (
          <>
            <p className="pb-2 text-base font-medium text-white">Google Ads recommendations</p>
            <ul className="grid w-full grid-cols-1 gap-2 lg:grid-cols-2">
              {insights.recommendations.map((rec) => (
                <li
                  key={rec.resourceName || `${rec.type}-${rec.detail}`}
                  className="min-w-0 bg-ui-field/80 px-3 py-2 text-base"
                >
                  <p className="font-medium text-foreground">{rec.title}</p>
                  <p className="text-muted-foreground">{rec.detail}</p>
                  {rec.impact && rec.impact.potentialClicks > rec.impact.baseClicks ? (
                    <p className="tabular-nums text-muted-foreground">
                      Est. clicks {rec.impact.baseClicks} → {rec.impact.potentialClicks}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-base text-muted-foreground">No open Google Ads recommendations for this campaign.</p>
        )}
      </div>

      {showPerformanceTables ? (
        <div className="flex w-full min-w-0 flex-col gap-3">
          <TrafficMetricsSection
            title="Ad groups with traffic"
            emptyCopy="No ad group traffic in this range."
          >
            {topAdGroups.length > 0 ? (
              <div className="max-h-72 min-h-0 overflow-auto" role="table" aria-label="Ad groups with traffic">
                <TrafficTableHeader />
                <ul className="min-w-0">
                  {topAdGroups.map((row) => (
                    <li key={row.id || row.name} className={TRAFFIC_TABLE_BODY_ROW} role="row">
                      <GoogleAdsEntityStatusIcon status={adGroupStatusById.get(row.id)} />
                      <span className="min-w-0 break-words text-foreground">{row.name}</span>
                      <TrafficMetricCells row={row} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </TrafficMetricsSection>

          <TrafficMetricsSection
            title="Keywords with traffic"
            emptyCopy="No keyword traffic in this range."
          >
            {topKeywords.length > 0 ? (
              <div className="max-h-80 min-h-0 overflow-auto" role="table" aria-label="Keywords with traffic">
                <TrafficTableHeader />
                <ul className="min-w-0">
                  {topKeywords.map((row) => (
                    <li
                      key={`${row.adGroupName}:${row.text}:${row.matchType}`}
                      className={TRAFFIC_TABLE_BODY_ROW}
                      role="row"
                    >
                      <span aria-hidden />
                      <span className="min-w-0 text-foreground">
                        <span className="block break-words">{row.text}</span>
                        {row.adGroupName ? (
                          <span className="block break-words text-muted-foreground">{row.adGroupName}</span>
                        ) : null}
                      </span>
                      <TrafficMetricCells row={row} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </TrafficMetricsSection>

          <TrafficMetricsSection
            title="Search terms with traffic"
            emptyCopy="No search term traffic in this range."
          >
            {topTerms.length > 0 ? (
              <div className="max-h-72 min-h-0 overflow-auto" role="table" aria-label="Search terms with traffic">
                <TrafficTableHeader />
                <ul className="min-w-0">
                  {topTerms.map((row) => (
                    <li key={row.searchTerm} className={TRAFFIC_TABLE_BODY_ROW} role="row">
                      <span aria-hidden />
                      <span className="min-w-0 break-words text-foreground">{row.searchTerm}</span>
                      <TrafficMetricCells row={row} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </TrafficMetricsSection>
        </div>
      ) : null}
    </div>
  );
}

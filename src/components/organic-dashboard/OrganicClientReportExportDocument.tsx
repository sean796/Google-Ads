import { useMemo, type ReactNode } from "react";
import { OrganicClientReportCover } from "@/components/organic-dashboard/OrganicClientReportCover";
import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import { OrganicClientReportGoogleAdsAccountPanel } from "@/components/organic-dashboard/OrganicClientReportGoogleAdsAccountPanel";
import { OrganicClientReportLocalGridSection } from "@/components/organic-dashboard/OrganicClientReportLocalGridSection";
import { OrganicPeriodProgressTable } from "@/components/organic-dashboard/OrganicPeriodProgressTable";
import {
  EXPORT_BODY_CLASS,
  EXPORT_BODY_MUTED_CLASS,
  EXPORT_COVER_PAGE_CLASS,
  EXPORT_H3_CLASS,
  EXPORT_H4_CLASS,
  EXPORT_KPI_ACCENT_CLICKS,
  EXPORT_KPI_ACCENT_IMPRESSIONS,
  EXPORT_KPI_ACCENT_NEUTRAL,
  EXPORT_KPI_ITEM_CLASS,
  EXPORT_KPI_LIST_CLASS,
  EXPORT_LABEL_CLASS,
  EXPORT_METRIC_TABLE_CLASS,
  EXPORT_NARRATIVE_WELL_CLASS,
  EXPORT_OPPORTUNITY_CLASS,
  EXPORT_PAGE_BREAK_CLASS,
  EXPORT_PAGE_CLASS,
  EXPORT_QUERY_ITEM_CLASS,
  EXPORT_QUERY_LIST_CLASS,
  EXPORT_SECTION_BODY_CLASS,
  EXPORT_SECTION_CLASS,
  EXPORT_SECTION_HEAD_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import "@/components/organic-dashboard/organic-client-report-export.css";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  clientReportHighlightMetricLabel,
  parseDeckCountDisplay,
  type DeckHighlightAccent,
  type DeckHighlightStat,
  type DeckSummaryRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { OrganicDeckOpportunity } from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { OrganicPeriodProgressTables } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { planOpportunityExportTable } from "@/lib/organic-dashboard/organic-opportunity-export-tables";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  formatClientReportSemrushKeywordMeta,
  formatClientReportTopQueryMeta,
  toExportTitleCase,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { cn } from "@/lib/utils";

export type OrganicClientReportExportDocumentProps = {
  content: OrganicClientReportContent;
  highlightsLoading?: boolean;
  localGridNarrativeLoading?: boolean;
  highlightsError?: string | null;
  onToggleLogoBoxTheme?: () => void;
};

function ExportSection({
  title,
  pageBreak,
  children,
}: {
  title: string;
  pageBreak?: boolean;
  children: ReactNode;
}) {
  const slug = title.replace(/\s+/g, "-").toLowerCase();
  const sectionId = `export-section-${slug}`;
  return (
    <section
      id={sectionId}
      className={cn(EXPORT_SECTION_CLASS, pageBreak && EXPORT_PAGE_BREAK_CLASS)}
      aria-labelledby={`${sectionId}-heading`}
    >
      <h2 id={`${sectionId}-heading`} className={EXPORT_SECTION_HEAD_CLASS}>
        {toExportTitleCase(title)}
      </h2>
      <div className={EXPORT_SECTION_BODY_CLASS}>{children}</div>
    </section>
  );
}

function kpiAccentClass(accent: DeckHighlightAccent): string {
  if (accent === "clicks") return EXPORT_KPI_ACCENT_CLICKS;
  if (accent === "impressions") return EXPORT_KPI_ACCENT_IMPRESSIONS;
  return EXPORT_KPI_ACCENT_NEUTRAL;
}

function ExportDelta({ delta }: { delta: DeckSummaryRow["delta"] }) {
  if (delta.deltaPercent == null) {
    return <span className="text-[#52525b]">{CLIENT_REPORT_DELTA_EMPTY}</span>;
  }
  const positive = delta.deltaPositive;
  return (
    <span
      className={cn(
        "text-base tabular-nums",
        positive ? "organic-client-report-export__delta-positive" : "organic-client-report-export__delta-negative",
      )}
    >
      {positive ? "↑" : "↓"} {delta.deltaPercent.toFixed(1)}%
    </span>
  );
}

function ExportKpiStrip({ stats, showCompare }: { stats: DeckHighlightStat[]; showCompare: boolean }) {
  if (stats.length === 0) return null;
  return (
    <ul className={EXPORT_KPI_LIST_CLASS}>
      {stats.map((stat, idx) => (
        <li key={`${stat.label}-${idx}`} className={cn(EXPORT_KPI_ITEM_CLASS, kpiAccentClass(stat.accent))}>
          <p className={EXPORT_LABEL_CLASS}>{toExportTitleCase(stat.label)}</p>
          <p className="organic-client-report-export__kpi-value tabular-nums">{stat.value}</p>
          {showCompare ? <ExportDelta delta={stat.delta} /> : null}
        </li>
      ))}
    </ul>
  );
}

function ExportMetricStack({
  groupTitle,
  rows,
  showCompare,
  comparePeriodLabel,
  primaryPeriodLabel,
}: {
  groupTitle: string;
  rows: DeckSummaryRow[];
  showCompare: boolean;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
}) {
  if (rows.length === 0) return null;
  const titledGroup = groupTitle.trim();
  return (
    <div className="organic-client-report-export__metric-stack">
      {titledGroup ? (
        <h3 className={EXPORT_H3_CLASS}>{toExportTitleCase(titledGroup)}</h3>
      ) : null}
      <table className={EXPORT_METRIC_TABLE_CLASS}>
        <thead>
          <tr>
            <th scope="col">{toExportTitleCase("Metric")}</th>
            {showCompare ? (
              <>
                <th scope="col">{comparePeriodLabel}</th>
                <th scope="col">{toExportTitleCase("Change")}</th>
                <th scope="col">{primaryPeriodLabel}</th>
              </>
            ) : (
              <th scope="col">{primaryPeriodLabel}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.label}-${idx}`}>
              <td>{row.label}</td>
              {showCompare ? (
                <>
                  <td className="tabular-nums">{row.earlier}</td>
                  <td>
                    <ExportDelta delta={row.delta} />
                  </td>
                  <td className="tabular-nums font-semibold">{row.later}</td>
                </>
              ) : (
                <td className="tabular-nums font-semibold">{row.later}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportOpportunityMetrics({
  item,
  showCompare,
  comparePeriodLabel,
  primaryPeriodLabel,
  periodProgressTables,
}: {
  item: OrganicDeckOpportunity;
  showCompare: boolean;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
  periodProgressTables: OrganicPeriodProgressTables | null;
}) {
  const plan = planOpportunityExportTable(item, showCompare, periodProgressTables);

  if (plan.kind === "legacy") {
    if (!plan.metrics.trim()) return null;
    return (
      <p className={EXPORT_BODY_CLASS}>
        <OrganicClientReportInlineText text={plan.metrics} />
      </p>
    );
  }

  if (plan.kind === "period") {
    return (
      <OrganicPeriodProgressTable
        table={plan.table}
        exportMode
        showTotalRow={false}
        className="organic-client-report-export__metric-stack"
      />
    );
  }

  if (plan.kind === "query-primary") {
    return (
      <>
        <table
          className={cn(
            EXPORT_METRIC_TABLE_CLASS,
            "organic-client-report-export__period-progress-table",
          )}
        >
          <thead>
            <tr>
              <th scope="col" className="organic-period-progress-table__month-col">
                {toExportTitleCase("Query")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {toExportTitleCase("Clicks")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {toExportTitleCase("Impressions")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {toExportTitleCase("Avg. position")}
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.queryRows.queryRows.map((q) => (
              <tr key={q.query}>
                <td className="organic-period-progress-table__month-col whitespace-nowrap">{q.query}</td>
                <td className="organic-period-progress-table__metric-col tabular-nums">{q.clicks.primary}</td>
                <td className="organic-period-progress-table__metric-col tabular-nums">{q.impressions.primary}</td>
                <td className="organic-period-progress-table__metric-col tabular-nums">{q.avgPosition.primary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.sitePeriodTable ? (
          <OrganicPeriodProgressTable
            table={plan.sitePeriodTable}
            exportMode
            showTotalRow={false}
            className="organic-client-report-export__metric-stack mt-3"
          />
        ) : null}
      </>
    );
  }

  const rows = plan.rows;
  const isPrimaryFlat = plan.kind === "primary-flat";
  const tableClass = cn(
    EXPORT_METRIC_TABLE_CLASS,
    isPrimaryFlat && "organic-client-report-export__highlight-metric-table",
  );

  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th
            scope="col"
            className={isPrimaryFlat ? "organic-client-report-export__highlight-metric-label" : undefined}
          >
            {toExportTitleCase("Metric")}
          </th>
          {plan.kind === "compare-flat" ? (
            <>
              <th scope="col">{comparePeriodLabel}</th>
              <th scope="col">{primaryPeriodLabel}</th>
            </>
          ) : (
            <th
              scope="col"
              className={isPrimaryFlat ? "organic-client-report-export__highlight-metric-value" : undefined}
            >
              {toExportTitleCase("Value")}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.metric}-${row.comparePeriodValue}-${idx}`}>
            <td
              className={
                isPrimaryFlat ? "organic-client-report-export__highlight-metric-label whitespace-nowrap" : undefined
              }
            >
              {toExportTitleCase(clientReportHighlightMetricLabel(row.metric))}
            </td>
            {plan.kind === "compare-flat" ? (
              <>
                <td className="tabular-nums">{row.comparePeriodValue}</td>
                <td className="tabular-nums font-semibold">{row.primaryPeriodValue}</td>
              </>
            ) : (
              <td
                className={cn(
                  "tabular-nums font-semibold",
                  isPrimaryFlat && "organic-client-report-export__highlight-metric-value",
                )}
              >
                {row.primaryPeriodValue}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExportKeywordList({
  queries,
  primaryPeriodLabel,
}: {
  queries: OrganicClientReportContent["topQueries"];
  primaryPeriodLabel: string;
}) {
  const values = queries.map((q) => parseDeckCountDisplay(q.clicks));
  const max = Math.max(...values, 1);
  return (
    <ul className={EXPORT_QUERY_LIST_CLASS}>
      {queries.map((q, i) => {
        const wPct = Math.max(8, (values[i]! / max) * 100);
        return (
          <li key={`${q.query}-${i}`} className={EXPORT_QUERY_ITEM_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className={EXPORT_H4_CLASS}>{q.query}</h4>
              <p className="tabular-nums text-base text-[#52525b]">
                {formatClientReportTopQueryMeta(q.clicks, primaryPeriodLabel)}
              </p>
            </div>
            <div className="organic-client-report-export__bar-track" aria-hidden>
              <div className="organic-client-report-export__bar-fill" style={{ width: `${wPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ExportOpportunityCard({
  item,
  showCompare,
  comparePeriodLabel,
  primaryPeriodLabel,
  periodProgressTables,
}: {
  item: OrganicDeckOpportunity;
  showCompare: boolean;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
  periodProgressTables: OrganicPeriodProgressTables | null;
}) {
  return (
    <li className={EXPORT_OPPORTUNITY_CLASS}>
      <h3 className={EXPORT_H3_CLASS}>{toExportTitleCase(item.label)}</h3>
      <ExportOpportunityMetrics
        item={item}
        showCompare={showCompare}
        comparePeriodLabel={comparePeriodLabel}
        primaryPeriodLabel={primaryPeriodLabel}
        periodProgressTables={periodProgressTables}
      />
      <p className={EXPORT_BODY_CLASS}>
        <OrganicClientReportInlineText text={item.why} />
      </p>
    </li>
  );
}

export function OrganicClientReportExportDocument({
  content,
  highlightsLoading = false,
  localGridNarrativeLoading = false,
  highlightsError = null,
  onToggleLogoBoxTheme,
}: OrganicClientReportExportDocumentProps) {
  const {
    siteName,
    siteUrl,
    showCompare,
    preparedOn,
    periodLine,
    highlights,
    comparePeriodLabel,
    primaryPeriodLabel,
    performanceNarrative,
    keywordNarrative,
    traffic,
    search,
    topQueries,
    semrushDeckRows,
    topSemrushKeywords,
    highlightStats,
    opportunities,
    showPerformanceSection,
    showSemrushSection,
    showKeywordSection,
    showHighlightsSection,
    showGoogleAdsSection,
    showLocalGridSection,
    localGridSection,
    localGridNarrative,
    googleAdsAccountCard,
    googleAdsNarrative,
    googleAdsDeckRows,
    googleAdsLoadError,
    periodProgressTables,
    clientLogoUrl,
    clientLogoBoxTheme,
    agencyLogoUrl,
  } = content;

  const ga4PeriodTable = periodProgressTables?.ga4;
  const gscPeriodTable = periodProgressTables?.gsc;
  const rawSemrushPeriodTable = periodProgressTables?.semrush;
  const semrushPeriodTable = useMemo(() => {
    if (!rawSemrushPeriodTable || rawSemrushPeriodTable.monthLabels.length === 0) return null;
    const targetMonthLabels = gscPeriodTable?.monthLabels ?? ga4PeriodTable?.monthLabels;
    if (targetMonthLabels && targetMonthLabels.length > 0) {
      const matchIndices: number[] = [];
      targetMonthLabels.forEach((targetLabel) => {
        for (let i = rawSemrushPeriodTable.monthLabels.length - 1; i >= 0; i--) {
          if (rawSemrushPeriodTable.monthLabels[i] === targetLabel && !matchIndices.includes(i)) {
            matchIndices.push(i);
            break;
          }
        }
      });
      matchIndices.sort((a, b) => a - b);
      if (matchIndices.length > 0) {
        return {
          ...rawSemrushPeriodTable,
          monthLabels: matchIndices.map((i) => rawSemrushPeriodTable.monthLabels[i]!),
          rows: rawSemrushPeriodTable.rows.map((r) => ({
            ...r,
            values: matchIndices.map((i) => r.values[i] ?? "—"),
          })),
        };
      }
    }
    if (rawSemrushPeriodTable.monthLabels.length > 3) {
      const count = 3;
      const startIdx = rawSemrushPeriodTable.monthLabels.length - count;
      return {
        ...rawSemrushPeriodTable,
        monthLabels: rawSemrushPeriodTable.monthLabels.slice(startIdx),
        rows: rawSemrushPeriodTable.rows.map((r) => ({
          ...r,
          values: r.values.slice(startIdx),
        })),
      };
    }
    return rawSemrushPeriodTable;
  }, [rawSemrushPeriodTable, gscPeriodTable?.monthLabels, ga4PeriodTable?.monthLabels]);

  const showGa4PeriodTable = Boolean(ga4PeriodTable && ga4PeriodTable.monthLabels.length > 0);
  const showGscPeriodTable = Boolean(gscPeriodTable && gscPeriodTable.monthLabels.length > 0);
  const showSemrushPeriodTable = Boolean(semrushPeriodTable && semrushPeriodTable.monthLabels.length > 0);

  let totalPages = 1;
  if (showPerformanceSection) totalPages += 1;
  if (showSemrushSection) totalPages += 1;
  if (showKeywordSection) totalPages += 1;
  if (showHighlightsSection) totalPages += 1;
  if (showLocalGridSection) totalPages += 1;
  if (showGoogleAdsSection) totalPages += 1;

  return (
    <article className={EXPORT_PAGE_CLASS}>
      <section
        id="report-cover"
        className={cn(EXPORT_COVER_PAGE_CLASS, EXPORT_PAGE_BREAK_CLASS)}
        aria-label="Executive cover and insights"
      >
        <OrganicClientReportCover
          siteName={siteName}
          siteUrl={siteUrl}
          periodLine={periodLine}
          preparedOn={preparedOn}
          agencyLogoUrl={agencyLogoUrl}
          clientLogoUrl={clientLogoUrl}
          clientLogoBoxTheme={clientLogoBoxTheme}
          onToggleTheme={onToggleLogoBoxTheme}
          executiveSummary={highlights.executiveSummary}
          keyTakeaways={highlights.keyTakeaways}
          insightsLoading={highlightsLoading}
          insightsError={highlightsError}
          totalPages={totalPages}
        />
      </section>

      {showPerformanceSection ? (
        <ExportSection title="Performance summary">
          {performanceNarrative.length > 0 ? (
            <div className={EXPORT_NARRATIVE_WELL_CLASS}>
              {performanceNarrative.map((p, idx) => (
                <p key={`${idx}-${p}`} className={EXPORT_BODY_CLASS}>
                  <OrganicClientReportInlineText text={p} />
                </p>
              ))}
            </div>
          ) : null}
          {showGa4PeriodTable && ga4PeriodTable ? (
            <OrganicPeriodProgressTable
              table={ga4PeriodTable}
              exportMode
              className="organic-client-report-export__metric-stack"
            />
          ) : (
            <ExportMetricStack
              groupTitle="Website traffic (GA4)"
              rows={traffic}
              showCompare={showCompare}
              comparePeriodLabel={comparePeriodLabel}
              primaryPeriodLabel={primaryPeriodLabel}
            />
          )}
          {showGscPeriodTable && gscPeriodTable ? (
            <OrganicPeriodProgressTable
              table={gscPeriodTable}
              exportMode
              className="organic-client-report-export__metric-stack"
            />
          ) : (
            <ExportMetricStack
              groupTitle="Search visibility (GSC)"
              rows={search}
              showCompare={showCompare}
              comparePeriodLabel={comparePeriodLabel}
              primaryPeriodLabel={primaryPeriodLabel}
            />
          )}
        </ExportSection>
      ) : null}

      {showSemrushSection ? (
        <ExportSection title="Semrush estimates">
          {showSemrushPeriodTable && semrushPeriodTable ? (
            <OrganicPeriodProgressTable
              table={semrushPeriodTable}
              exportMode
              showTotalRow={false}
              className="organic-client-report-export__metric-stack"
            />
          ) : (
            <ExportMetricStack
              groupTitle="Organic visibility (Semrush)"
              rows={semrushDeckRows}
              showCompare={showCompare}
              comparePeriodLabel={comparePeriodLabel}
              primaryPeriodLabel={primaryPeriodLabel}
            />
          )}
          {topSemrushKeywords.length > 0 ? (
            <>
              <h3 className={EXPORT_H3_CLASS}>{toExportTitleCase("Sample Semrush keywords")}</h3>
              <ul className={EXPORT_QUERY_LIST_CLASS}>
                {topSemrushKeywords.map((k, idx) => (
                  <li key={`${k.phrase}-${idx}`} className={EXPORT_QUERY_ITEM_CLASS}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h4 className={EXPORT_H4_CLASS}>{k.phrase}</h4>
                      <p className="tabular-nums text-base text-[#52525b]">
                        {formatClientReportSemrushKeywordMeta(k.traffic, k.volume)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </ExportSection>
      ) : null}

      {showKeywordSection ? (
        <ExportSection title="Keyword performance">
          {keywordNarrative.length > 0 ? (
            <div className={EXPORT_NARRATIVE_WELL_CLASS}>
              {keywordNarrative.map((p, idx) => (
                <p key={`${idx}-${p}`} className={EXPORT_BODY_CLASS}>
                  <OrganicClientReportInlineText text={p} />
                </p>
              ))}
            </div>
          ) : null}
          <ExportKeywordList queries={topQueries} primaryPeriodLabel={primaryPeriodLabel} />
        </ExportSection>
      ) : null}

      {showHighlightsSection ? (
        <ExportSection title="Highlights">
          <ExportKpiStrip stats={highlightStats} showCompare={showCompare} />
          {opportunities.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {opportunities.map((item, idx) => (
                <ExportOpportunityCard
                  key={`${item.rank}-${item.label}-${idx}`}
                  item={item}
                  showCompare={showCompare}
                  comparePeriodLabel={comparePeriodLabel}
                  primaryPeriodLabel={primaryPeriodLabel}
                  periodProgressTables={periodProgressTables}
                />
              ))}
            </ul>
          ) : null}
        </ExportSection>
      ) : null}

      {showLocalGridSection && localGridSection ? (
        <ExportSection title="Local map visibility" pageBreak>
          <OrganicClientReportLocalGridSection
            section={localGridSection}
            narrative={localGridNarrative}
            overviewLoading={localGridNarrativeLoading}
          />
        </ExportSection>
      ) : null}

      {showGoogleAdsSection ? (
        <ExportSection title="Google Ads" pageBreak>
          {googleAdsLoadError ? (
            <p className={EXPORT_BODY_MUTED_CLASS}>{googleAdsLoadError}</p>
          ) : null}
          {googleAdsAccountCard ? (
            <OrganicClientReportGoogleAdsAccountPanel
              card={googleAdsAccountCard}
              narrative={googleAdsNarrative}
              overviewLoading={highlightsLoading}
              overviewError={highlightsError}
            />
          ) : googleAdsDeckRows.length > 0 ? (
            <ExportMetricStack
              groupTitle=""
              rows={googleAdsDeckRows}
              showCompare={showCompare}
              comparePeriodLabel={comparePeriodLabel}
              primaryPeriodLabel={primaryPeriodLabel}
            />
          ) : null}
        </ExportSection>
      ) : null}
    </article>
  );
}

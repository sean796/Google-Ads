import { useMemo, type ReactNode } from "react";
import {
  OrganicClientReportAccordion,
  ReportLabelWithTooltip,
} from "@/components/organic-dashboard/OrganicClientReportAccordion";
import { OrganicClientReportCover } from "@/components/organic-dashboard/OrganicClientReportCover";
import { OrganicClientReportGoogleAdsAccountPanel } from "@/components/organic-dashboard/OrganicClientReportGoogleAdsAccountPanel";
import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import { OrganicClientReportLocalGridSection } from "@/components/organic-dashboard/OrganicClientReportLocalGridSection";
import { ExportOpportunityCard } from "@/components/organic-dashboard/OrganicClientReportOpportunitySection";
import { OrganicPeriodProgressTable } from "@/components/organic-dashboard/OrganicPeriodProgressTable";
import {
  EXPORT_BODY_CLASS,
  EXPORT_BODY_MUTED_CLASS,
  EXPORT_COVER_PAGE_CLASS,
  EXPORT_H4_CLASS,
  EXPORT_KPI_ACCENT_CLICKS,
  EXPORT_KPI_ACCENT_IMPRESSIONS,
  EXPORT_KPI_ACCENT_NEUTRAL,
  EXPORT_KPI_ITEM_CLASS,
  EXPORT_KPI_LIST_CLASS,
  EXPORT_LABEL_CLASS,
  EXPORT_METRIC_TABLE_CLASS,
  EXPORT_NARRATIVE_WELL_CLASS,
  EXPORT_PAGE_BREAK_CLASS,
  EXPORT_PAGE_CLASS,
  EXPORT_QUERY_ITEM_CLASS,
  EXPORT_QUERY_LIST_CLASS,
  EXPORT_SECTION_BODY_CLASS,
  EXPORT_SECTION_CLASS,
  EXPORT_SECTION_HEAD_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import "@/components/organic-dashboard/organic-client-report-export.css";
import { TooltipProvider } from "@/ui";

import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  parseDeckCountDisplay,
  type DeckHighlightAccent,
  type DeckHighlightStat,
  type DeckSummaryRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  formatClientReportSemrushKeywordMeta,
  formatClientReportTopQueryMeta,
  formatOwnerReportHeading,
  formatOwnerReportMetricLabel,
  getOwnerReportHeadingTooltip,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { cn } from "@/lib/utils";

export type OrganicClientReportExportDocumentProps = {
  content: OrganicClientReportContent;
  highlightsLoading?: boolean;
  localGridNarrativeLoading?: boolean;
  highlightsError?: string | null;
  onToggleLogoBoxTheme?: () => void;
  pdfExport?: boolean;
};

function ExportSection({
  title,
  narrative,
  narrativeLoading = false,
  narrativeError = null,
  pageBreak,
  pdfExport = false,
  children,
}: {
  title: string;
  narrative?: string[];
  narrativeLoading?: boolean;
  narrativeError?: string | null;
  pageBreak?: boolean;
  pdfExport?: boolean;
  children: ReactNode;
}) {
  const slug = title.replace(/\s+/g, "-").toLowerCase();
  const sectionId = `export-section-${slug}`;
  const headingId = `${sectionId}-heading`;
  const displayTitle = formatOwnerReportHeading(title);
  const tooltip = getOwnerReportHeadingTooltip(title);
  const hasNarrativeAccordion =
    !pdfExport &&
    narrative !== undefined &&
    (narrative.length > 0 || narrativeLoading || Boolean(narrativeError));

  return (
    <section
      id={sectionId}
      className={cn(EXPORT_SECTION_CLASS, pageBreak && EXPORT_PAGE_BREAK_CLASS)}
      aria-labelledby={headingId}
    >
      {hasNarrativeAccordion ? (
        <OrganicClientReportAccordion
          id={`section-${slug}`}
          headingId={headingId}
          variant="section"
          title={displayTitle}
          tooltip={tooltip}
          contentClassName="pt-1 pb-3"
        >
          <div className={EXPORT_NARRATIVE_WELL_CLASS}>
            {narrative.length > 0 ? (
              narrative.map((p, idx) => (
                <p key={`${idx}-${p.slice(0, 24)}`} className={EXPORT_BODY_CLASS}>
                  <OrganicClientReportInlineText text={p} />
                </p>
              ))
            ) : narrativeLoading ? (
              <p className={EXPORT_BODY_MUTED_CLASS}>Generating summary…</p>
            ) : narrativeError ? (
              <p className="text-base text-[#b91c1c]">{narrativeError}</p>
            ) : null}
          </div>
        </OrganicClientReportAccordion>
      ) : (
        <h2 id={headingId} className={EXPORT_SECTION_HEAD_CLASS}>
          {pdfExport ? (
            <span className="organic-client-report-export__h2-text">{displayTitle}</span>
          ) : (
            <ReportLabelWithTooltip label={displayTitle} tooltip={tooltip} />
          )}
        </h2>
      )}
      {pdfExport && narrative && narrative.length > 0 ? (
        <div className={EXPORT_NARRATIVE_WELL_CLASS}>
          {narrative.map((p, idx) => (
            <p key={`${idx}-${p.slice(0, 24)}`} className={EXPORT_BODY_CLASS}>
              <OrganicClientReportInlineText text={p} />
            </p>
          ))}
        </div>
      ) : null}
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
    return null;
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
          <p className={EXPORT_LABEL_CLASS}>{formatOwnerReportMetricLabel(stat.label)}</p>
          <p className="organic-client-report-export__kpi-value tabular-nums">{stat.value}</p>
          {showCompare && stat.delta.deltaPercent != null ? <ExportDelta delta={stat.delta} /> : null}
        </li>
      ))}
    </ul>
  );
}

function ExportMetricStack({
  rows,
  showCompare,
  comparePeriodLabel,
  primaryPeriodLabel,
}: {
  groupTitle?: string;
  rows: DeckSummaryRow[];
  showCompare: boolean;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
}) {
  if (rows.length === 0) return null;
  const hasCompareData =
    showCompare &&
    rows.some(
      (r) =>
        r.earlier.trim() !== "" &&
        r.earlier.trim().toLowerCase() !== CLIENT_REPORT_DELTA_EMPTY &&
        r.earlier.trim() !== "—" &&
        r.delta.deltaPercent != null,
    );
  return (
    <div className="organic-client-report-export__metric-stack">
      <table className={EXPORT_METRIC_TABLE_CLASS}>
        <thead>
          <tr>
            <th scope="col">{formatOwnerReportMetricLabel("Metric")}</th>
            {hasCompareData ? (
              <>
                <th scope="col">{comparePeriodLabel}</th>
                <th scope="col">{formatOwnerReportMetricLabel("Change")}</th>
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
              <td>{formatOwnerReportMetricLabel(row.label)}</td>
              {hasCompareData ? (
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

export function OrganicClientReportExportDocument({
  content,
  highlightsLoading = false,
  localGridNarrativeLoading = false,
  highlightsError = null,
  onToggleLogoBoxTheme,
  pdfExport = false,
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
    semrushNarrative,
    keywordNarrative,
    traffic,
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
    localGridSections,
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
  const showSemrushPeriodTable = Boolean(semrushPeriodTable && semrushPeriodTable.monthLabels.length > 0);

  let totalPages = 1;
  if (showPerformanceSection) totalPages += 1;
  if (showSemrushSection) totalPages += 1;
  if (showHighlightsSection) totalPages += 1;
  if (showLocalGridSection) totalPages += 1;
  if (showGoogleAdsSection) totalPages += 1;

  return (
    <TooltipProvider delayDuration={150}>
      <article
        className={cn(
          EXPORT_PAGE_CLASS,
          pdfExport && "organic-client-report--pdf-capture",
        )}
      >
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
            pdfExport={pdfExport}
          />
        </section>

        {showPerformanceSection ? (
          <ExportSection
            title="Performance summary"
            narrative={performanceNarrative}
            narrativeLoading={highlightsLoading && performanceNarrative.length === 0}
            pdfExport={pdfExport}
          >
            {showGa4PeriodTable && ga4PeriodTable ? (
              <OrganicPeriodProgressTable
                table={ga4PeriodTable}
                exportMode
                showTotalRow={false}
                className="organic-client-report-export__metric-stack"
              />
            ) : (
              <ExportMetricStack
                rows={traffic}
                showCompare={showCompare}
                comparePeriodLabel={comparePeriodLabel}
                primaryPeriodLabel={primaryPeriodLabel}
              />
            )}
          </ExportSection>
        ) : null}

        {showSemrushSection ? (
          <ExportSection
            title="Semrush estimates"
            narrative={semrushNarrative}
            pdfExport={pdfExport}
          >
            {showSemrushPeriodTable && semrushPeriodTable ? (
              <OrganicPeriodProgressTable
                table={semrushPeriodTable}
                exportMode
                showTotalRow={false}
                className="organic-client-report-export__metric-stack"
              />
            ) : (
              <ExportMetricStack
                rows={semrushDeckRows}
                showCompare={showCompare}
                comparePeriodLabel={comparePeriodLabel}
                primaryPeriodLabel={primaryPeriodLabel}
              />
            )}
            {topSemrushKeywords.length > 0 ? (
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
            ) : null}
          </ExportSection>
        ) : null}

        {showHighlightsSection ? (
          <ExportSection title="Highlights" pdfExport={pdfExport}>
            <ExportKpiStrip stats={highlightStats} showCompare={showCompare} />
            {opportunities.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {opportunities.map((item, idx) => (
                  <ExportOpportunityCard
                    key={`${item.rank}-${item.label}-${idx}`}
                    item={item}
                    showCompare={showCompare}
                    comparePeriodLabel={comparePeriodLabel}
                    primaryPeriodLabel={primaryPeriodLabel}
                    periodProgressTables={periodProgressTables}
                    pdfExport={pdfExport}
                  />
                ))}
              </ul>
            ) : null}
          </ExportSection>
        ) : null}

        {showLocalGridSection && (localGridSections?.length || localGridSection) ? (
          <ExportSection
            title="Local map visibility"
            narrative={localGridNarrative.slice(0, 1)}
            narrativeLoading={localGridNarrativeLoading && localGridNarrative.length === 0}
            pageBreak
            pdfExport={pdfExport}
          >
            <OrganicClientReportLocalGridSection
              section={localGridSection ?? undefined}
              sections={localGridSections}
            />
          </ExportSection>
        ) : null}

        {showGoogleAdsSection ? (
          <ExportSection
            title="Google Ads"
            narrative={googleAdsNarrative}
            narrativeLoading={highlightsLoading && googleAdsNarrative.length === 0}
            narrativeError={!highlightsLoading && googleAdsNarrative.length === 0 ? highlightsError : null}
            pageBreak
            pdfExport={pdfExport}
          >
            {googleAdsLoadError ? (
              <p className={EXPORT_BODY_MUTED_CLASS}>{googleAdsLoadError}</p>
            ) : null}
            {googleAdsAccountCard ? (
              <OrganicClientReportGoogleAdsAccountPanel
                card={googleAdsAccountCard}
                showCompare={showCompare}
              />
            ) : googleAdsDeckRows.length > 0 ? (
              <ExportMetricStack
                rows={googleAdsDeckRows}
                showCompare={showCompare}
                comparePeriodLabel={comparePeriodLabel}
                primaryPeriodLabel={primaryPeriodLabel}
              />
            ) : null}
          </ExportSection>
        ) : null}
      </article>
    </TooltipProvider>
  );
}

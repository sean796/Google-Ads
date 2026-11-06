import { useMemo } from "react";
import { OrganicClientReportCover } from "@/components/organic-dashboard/OrganicClientReportCover";
import { OrganicClientReportGoogleAdsAccountPanel } from "@/components/organic-dashboard/OrganicClientReportGoogleAdsAccountPanel";
import { OrganicClientReportLocalGridSection } from "@/components/organic-dashboard/OrganicClientReportLocalGridSection";
import { ExportOpportunityCard } from "@/components/organic-dashboard/OrganicClientReportOpportunitySection";
import { OrganicPeriodProgressTable } from "@/components/organic-dashboard/OrganicPeriodProgressTable";
import {
  ExportMetricStack,
  ExportKpiStrip,
  ExportSection,
} from "@/components/organic-dashboard/OrganicClientReportExportSections";
import type { OrganicClientReportExportDocumentProps } from "@/components/organic-dashboard/organic-client-report-export-document-types";
import {
  EXPORT_BODY_MUTED_CLASS,
  EXPORT_COVER_PAGE_CLASS,
  EXPORT_H4_CLASS,
  EXPORT_PAGE_BREAK_CLASS,
  EXPORT_PAGE_CLASS,
  EXPORT_QUERY_ITEM_CLASS,
  EXPORT_QUERY_LIST_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import "@/components/organic-dashboard/organic-client-report-export.css";
import { TooltipProvider } from "@/ui";
import { formatClientReportSemrushKeywordMeta } from "@/lib/organic-dashboard/organic-client-report-copy";
import { cn } from "@/lib/utils";

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

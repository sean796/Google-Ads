import type { ReactNode } from "react";
import {
  EXPORT_BODY_CLASS,
  EXPORT_BODY_MUTED_CLASS,
  EXPORT_BULLET_LIST_CLASS,
  EXPORT_FOOTER_CLASS,
  EXPORT_H3_CLASS,
  EXPORT_H4_CLASS,
  EXPORT_HERO_CLASS,
  EXPORT_KPI_ACCENT_CLICKS,
  EXPORT_KPI_ACCENT_IMPRESSIONS,
  EXPORT_KPI_ACCENT_NEUTRAL,
  EXPORT_KPI_ITEM_CLASS,
  EXPORT_KPI_LIST_CLASS,
  EXPORT_LABEL_CLASS,
  EXPORT_LEAD_CLASS,
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
  parseDeckCountDisplay,
  type DeckHighlightAccent,
  type DeckHighlightStat,
  type DeckOpportunityComparisonRow,
  type DeckSummaryRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { OrganicDeckOpportunity } from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  formatClientReportCoverTitle,
  formatClientReportSemrushKeywordMeta,
  formatClientReportTopQueryMeta,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { AGENCY_NAME } from "@/lib/report-planner";
import { cn } from "@/lib/utils";

export type OrganicClientReportExportDocumentProps = {
  content: OrganicClientReportContent;
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
  return (
    <section
      className={cn(EXPORT_SECTION_CLASS, pageBreak && EXPORT_PAGE_BREAK_CLASS)}
      aria-labelledby={`export-section-${slug}`}
    >
      <h2 id={`export-section-${slug}`} className={EXPORT_SECTION_HEAD_CLASS}>
        {title}
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

function ExportKpiStrip({ stats }: { stats: DeckHighlightStat[] }) {
  if (stats.length === 0) return null;
  return (
    <ul className={EXPORT_KPI_LIST_CLASS}>
      {stats.map((stat, idx) => (
        <li key={`${stat.label}-${idx}`} className={cn(EXPORT_KPI_ITEM_CLASS, kpiAccentClass(stat.accent))}>
          <p className={EXPORT_LABEL_CLASS}>{stat.label}</p>
          <p className="organic-client-report-export__kpi-value tabular-nums">{stat.value}</p>
          <ExportDelta delta={stat.delta} />
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
  return (
    <div className="organic-client-report-export__metric-stack">
      <h3 className={EXPORT_H3_CLASS}>{groupTitle}</h3>
      <table className={EXPORT_METRIC_TABLE_CLASS}>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {showCompare ? (
              <>
                <th scope="col">{comparePeriodLabel}</th>
                <th scope="col">Change</th>
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

function ExportOpportunityTable({
  rows,
  comparePeriodLabel,
  primaryPeriodLabel,
  legacyMetrics,
}: {
  rows: DeckOpportunityComparisonRow[];
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
  legacyMetrics: string;
}) {
  if (rows.length === 0) {
    if (!legacyMetrics.trim()) return null;
    return <p className={EXPORT_BODY_CLASS}>{legacyMetrics}</p>;
  }
  return (
    <table className={EXPORT_METRIC_TABLE_CLASS}>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">{comparePeriodLabel}</th>
          <th scope="col">{primaryPeriodLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.metric}-${row.comparePeriodValue}-${idx}`}>
            <td>{row.metric}</td>
            <td className="tabular-nums">{row.comparePeriodValue}</td>
            <td className="tabular-nums font-semibold">{row.primaryPeriodValue}</td>
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
  comparePeriodLabel,
  primaryPeriodLabel,
}: {
  item: OrganicDeckOpportunity;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
}) {
  return (
    <li className={EXPORT_OPPORTUNITY_CLASS}>
      <h3 className={EXPORT_H3_CLASS}>{item.label}</h3>
      <ExportOpportunityTable
        rows={item.comparisonRows}
        comparePeriodLabel={comparePeriodLabel}
        primaryPeriodLabel={primaryPeriodLabel}
        legacyMetrics={item.metrics}
      />
      <p className={EXPORT_BODY_CLASS}>{item.why}</p>
    </li>
  );
}

export function OrganicClientReportExportDocument({ content }: OrganicClientReportExportDocumentProps) {
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
    semrushDatabase,
    semrushOverviewUrl,
    semrushDomain,
    showPerformanceSection,
    showSemrushSection,
    showKeywordSection,
    showHighlightsSection,
  } = content;

  return (
    <article className={EXPORT_PAGE_CLASS}>
      <header className={EXPORT_HERO_CLASS}>
        <div className="organic-client-report-export__cover-header">
          <div>
            <h1 className="organic-client-report-export__cover-title">
              {formatClientReportCoverTitle(AGENCY_NAME, siteName)}
            </h1>
            <p className="organic-client-report-export__cover-meta">
              {siteUrl} | {periodLine} | Prepared {preparedOn}
            </p>
          </div>
        </div>
        <div className="organic-client-report-export__hero-body">
          <h2 className="organic-client-report-export__insights-title">Insights</h2>
          <p className={EXPORT_LEAD_CLASS}>{highlights.executiveSummary}</p>
          {highlights.keyTakeaways.length > 0 ? (
            <div>
              <h3 className={EXPORT_H3_CLASS}>Key takeaways</h3>
              <ul className={EXPORT_BULLET_LIST_CLASS}>
                {highlights.keyTakeaways.map((line, idx) => (
                  <li key={`${idx}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </header>

      {showPerformanceSection ? (
        <ExportSection title="Performance summary">
          <p className={EXPORT_BODY_MUTED_CLASS}>
            Headline metrics for the selected periods. Organic search traffic comes from GA4 (Organic Search
            channel); search visibility from Google Search Console.
          </p>
          {showCompare ? (
            <p className="tabular-nums text-base text-[#52525b]">
              {comparePeriodLabel} vs {primaryPeriodLabel}
            </p>
          ) : null}
          {performanceNarrative.length > 0 ? (
            <div className={EXPORT_NARRATIVE_WELL_CLASS}>
              <h3 className={EXPORT_H3_CLASS}>Performance breakdown</h3>
              {performanceNarrative.map((p, idx) => (
                <p key={`${idx}-${p}`} className={EXPORT_BODY_CLASS}>
                  {p}
                </p>
              ))}
            </div>
          ) : null}
          <ExportMetricStack
            groupTitle="Website traffic (GA4)"
            rows={traffic}
            showCompare={showCompare}
            comparePeriodLabel={comparePeriodLabel}
            primaryPeriodLabel={primaryPeriodLabel}
          />
          <ExportMetricStack
            groupTitle="Search visibility (GSC)"
            rows={search}
            showCompare={showCompare}
            comparePeriodLabel={comparePeriodLabel}
            primaryPeriodLabel={primaryPeriodLabel}
          />
        </ExportSection>
      ) : null}

      {showSemrushSection ? (
        <ExportSection title="Semrush estimates">
          <p className={EXPORT_BODY_MUTED_CLASS}>
            Semrush domain overview estimates (not Google Search Console clicks). Regional database:{" "}
            {semrushDatabase.toUpperCase()}.
            {semrushOverviewUrl ? <> Full report: {semrushOverviewUrl}</> : null}
          </p>
          <ExportMetricStack
            groupTitle="Organic visibility (Semrush)"
            rows={semrushDeckRows}
            showCompare={showCompare}
            comparePeriodLabel={comparePeriodLabel}
            primaryPeriodLabel={primaryPeriodLabel}
          />
          {topSemrushKeywords.length > 0 ? (
            <>
              <p className={EXPORT_BODY_MUTED_CLASS}>
                Top organic keywords by estimated traffic for {semrushDomain || siteUrl}.
              </p>
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
              <h3 className={EXPORT_H3_CLASS}>Keyword performance breakdown</h3>
              {keywordNarrative.map((p, idx) => (
                <p key={`${idx}-${p}`} className={EXPORT_BODY_CLASS}>
                  {p}
                </p>
              ))}
            </div>
          ) : null}
          <p className={EXPORT_BODY_MUTED_CLASS}>
            Top queries by clicks in {primaryPeriodLabel}. Align titles, headings, and internal links with terms
            that already earn clicks.
          </p>
          <ExportKeywordList queries={topQueries} primaryPeriodLabel={primaryPeriodLabel} />
        </ExportSection>
      ) : null}

      {showHighlightsSection ? (
        <ExportSection title="Highlights">
          <ExportKpiStrip stats={highlightStats} />
          {opportunities.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {opportunities.map((item, idx) => (
                <ExportOpportunityCard
                  key={`${item.rank}-${item.label}-${idx}`}
                  item={item}
                  comparePeriodLabel={comparePeriodLabel}
                  primaryPeriodLabel={primaryPeriodLabel}
                />
              ))}
            </ul>
          ) : null}
        </ExportSection>
      ) : null}

      <footer className={EXPORT_FOOTER_CLASS}>
        <span className="min-w-0 truncate">{siteUrl}</span>
        <span className="font-medium text-[#18181b]">{AGENCY_NAME}</span>
        <span className="tabular-nums">Prepared {preparedOn}</span>
      </footer>
    </article>
  );
}

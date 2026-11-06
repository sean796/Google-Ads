import type { ReactNode } from "react";
import {
  OrganicClientReportAccordion,
  ReportLabelWithTooltip,
} from "@/components/organic-dashboard/OrganicClientReportAccordion";
import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import {
  EXPORT_BODY_CLASS,
  EXPORT_BODY_MUTED_CLASS,
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
  EXPORT_QUERY_ITEM_CLASS,
  EXPORT_QUERY_LIST_CLASS,
  EXPORT_SECTION_BODY_CLASS,
  EXPORT_SECTION_CLASS,
  EXPORT_SECTION_HEAD_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import {
  parseDeckCountDisplay,
  type DeckHighlightAccent,
  type DeckHighlightStat,
  type DeckSummaryRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  formatClientReportTopQueryMeta,
  formatOwnerReportHeading,
  formatOwnerReportMetricLabel,
  getOwnerReportHeadingTooltip,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { cn } from "@/lib/utils";

export function ExportSection({
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

export function ExportKpiStrip({ stats, showCompare }: { stats: DeckHighlightStat[]; showCompare: boolean }) {
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


export function ExportMetricStack({
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

export function ExportKeywordList({
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

import { OrganicClientReportAccordion } from "@/components/organic-dashboard/OrganicClientReportAccordion";
import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import { OrganicPeriodProgressTable } from "@/components/organic-dashboard/OrganicPeriodProgressTable";
import {
  EXPORT_BODY_CLASS,
  EXPORT_METRIC_TABLE_CLASS,
  EXPORT_OPPORTUNITY_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import {
  CLIENT_REPORT_ACCORDION_COPY,
  formatOwnerReportMetricLabel,
  toExportTitleCase,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { clientReportHighlightMetricLabel } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { OrganicPeriodProgressTables } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { planOpportunityExportTable } from "@/lib/organic-dashboard/organic-opportunity-export-tables";
import type { OrganicDeckOpportunity } from "@/lib/organic-dashboard/organic-reporting-highlights";
import { cn } from "@/lib/utils";

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
          <colgroup>
            <col className="organic-period-progress-table__query-col" />
            <col className="organic-period-progress-table__metric-col" />
            <col className="organic-period-progress-table__metric-col" />
            <col className="organic-period-progress-table__metric-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="organic-period-progress-table__query-col">
                {formatOwnerReportMetricLabel("Query")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {formatOwnerReportMetricLabel("Clicks")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {formatOwnerReportMetricLabel("Impressions")}
              </th>
              <th scope="col" className="organic-period-progress-table__metric-col">
                {formatOwnerReportMetricLabel("Avg. position")}
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.queryRows.queryRows.map((q) => (
              <tr key={q.query}>
                <td className="organic-period-progress-table__query-col">{q.query}</td>
                <td className="organic-period-progress-table__metric-col tabular-nums">
                  {q.clicks.primary}
                </td>
                <td className="organic-period-progress-table__metric-col tabular-nums">
                  {q.impressions.primary}
                </td>
                <td className="organic-period-progress-table__metric-col tabular-nums">
                  {q.avgPosition.primary}
                </td>
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
            {formatOwnerReportMetricLabel("Metric")}
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
              {formatOwnerReportMetricLabel("Value")}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const baseMetric = clientReportHighlightMetricLabel(row.metric);
          return (
            <tr key={`${row.metric}-${row.comparePeriodValue}-${idx}`}>
              <td
                className={
                  isPrimaryFlat
                    ? "organic-client-report-export__highlight-metric-label whitespace-nowrap"
                    : undefined
                }
              >
                {formatOwnerReportMetricLabel(baseMetric)}
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
          );
        })}
      </tbody>
    </table>
  );
}

export function ExportOpportunityCard({
  item,
  showCompare,
  comparePeriodLabel,
  primaryPeriodLabel,
  periodProgressTables,
  pdfExport = false,
}: {
  item: OrganicDeckOpportunity;
  showCompare: boolean;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
  periodProgressTables: OrganicPeriodProgressTables | null;
  pdfExport?: boolean;
}) {
  const body = (
    <>
      <p className={EXPORT_BODY_CLASS}>
        <OrganicClientReportInlineText text={item.why} />
      </p>
      <ExportOpportunityMetrics
        item={item}
        showCompare={showCompare}
        comparePeriodLabel={comparePeriodLabel}
        primaryPeriodLabel={primaryPeriodLabel}
        periodProgressTables={periodProgressTables}
      />
    </>
  );

  if (pdfExport) {
    return (
      <li className={EXPORT_OPPORTUNITY_CLASS}>
        <h3 className="m-0 py-0.5 text-base font-bold leading-snug text-[#09090b]">
          {toExportTitleCase(item.label)}
        </h3>
        <div className="flex flex-col gap-3 pt-2">{body}</div>
      </li>
    );
  }

  return (
    <li className={EXPORT_OPPORTUNITY_CLASS}>
      <OrganicClientReportAccordion
        id={`opportunity-${item.rank}-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
        title={toExportTitleCase(item.label)}
        contentClassName="flex flex-col gap-3 pt-2"
      >
        {body}
      </OrganicClientReportAccordion>
    </li>
  );
}
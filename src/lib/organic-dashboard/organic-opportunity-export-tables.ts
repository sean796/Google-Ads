import {
  CLIENT_REPORT_DELTA_EMPTY,
  sanitizeClientReportMetricValue,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import {
  layoutOpportunityComparisonRows,
  parseOpportunityRowMetric,
  type DeckOpportunityComparisonRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type {
  OrganicPeriodProgressRow,
  OrganicPeriodProgressTable,
  OrganicPeriodProgressTables,
} from "@/lib/organic-dashboard/organic-dashboard-period-progress";

export function deckOpportunityShowCompare(
  showCompare: boolean,
  rows: DeckOpportunityComparisonRow[],
): boolean {
  if (!showCompare || rows.length === 0) return false;
  return rows.some((row) => {
    const v = sanitizeClientReportMetricValue(row.comparePeriodValue);
    return v !== CLIENT_REPORT_DELTA_EMPTY && !/^n\/a$/i.test(v);
  });
}

function candidatePeriodLabels(label: string): string[] {
  const k = label.trim().toLowerCase();
  if (k === "clicks") return ["Total clicks"];
  if (k === "impressions") return ["Total impressions"];
  if (k.includes("position")) return ["Average position"];
  if (k === "organic search sessions" || k === "sessions") return ["Organic Search sessions", "Sessions"];
  if (k === "engagement rate") return ["Engagement rate"];
  return [label.trim()];
}

function findPeriodProgressRow(
  metricLabel: string,
  tables: OrganicPeriodProgressTables,
): { row: OrganicPeriodProgressRow; monthLabels: string[] } | null {
  const candidates = candidatePeriodLabels(metricLabel);
  for (const table of [tables.ga4, tables.gsc, tables.semrush]) {
    if (!table) continue;
    for (const name of candidates) {
      const row = table.rows.find((r) => r.label.toLowerCase() === name.toLowerCase());
      if (row && row.values.length === table.monthLabels.length) {
        return { row, monthLabels: table.monthLabels };
      }
    }
  }
  return null;
}

export function buildOpportunitySitePeriodTable(
  siteRows: DeckOpportunityComparisonRow[],
  periodProgressTables: OrganicPeriodProgressTables | null,
): OrganicPeriodProgressTable | null {
  if (!periodProgressTables || siteRows.length === 0) return null;

  const rows: OrganicPeriodProgressRow[] = [];
  let monthLabels: string[] | null = null;

  for (const siteRow of siteRows) {
    const parsed = parseOpportunityRowMetric(siteRow.metric);
    const match = findPeriodProgressRow(parsed.label, periodProgressTables);
    if (!match) return null;
    if (!monthLabels) {
      monthLabels = match.monthLabels;
    } else if (match.monthLabels.join("|") !== monthLabels.join("|")) {
      return null;
    }
    rows.push({
      label: match.row.label,
      values: match.row.values,
      periodTotal: siteRow.primaryPeriodValue.trim() || match.row.periodTotal,
    });
  }

  if (rows.length === 0 || !monthLabels) return null;
  return {
    title: "",
    monthLabels,
    periodTotalColumnLabel: "",
    rows,
  };
}

export function buildOpportunityFlatPeriodTable(
  rows: DeckOpportunityComparisonRow[],
  periodProgressTables: OrganicPeriodProgressTables | null,
): OrganicPeriodProgressTable | null {
  const siteRows = rows.filter((row) => !parseOpportunityRowMetric(row.metric).query);
  if (siteRows.length === 0) return null;
  return buildOpportunitySitePeriodTable(siteRows, periodProgressTables);
}

export type OpportunityExportTablePlan =
  | { kind: "period"; table: OrganicPeriodProgressTable }
  | {
      kind: "query-primary";
      queryRows: Extract<ReturnType<typeof layoutOpportunityComparisonRows>, { kind: "query-grid" }>;
      sitePeriodTable: OrganicPeriodProgressTable | null;
    }
  | { kind: "compare-flat"; rows: DeckOpportunityComparisonRow[] }
  | { kind: "primary-flat"; rows: DeckOpportunityComparisonRow[] }
  | { kind: "legacy"; metrics: string };

export function planOpportunityExportTable(
  item: { comparisonRows: DeckOpportunityComparisonRow[]; metrics: string },
  showCompare: boolean,
  periodProgressTables: OrganicPeriodProgressTables | null,
): OpportunityExportTablePlan {
  const rows = item.comparisonRows;
  if (rows.length === 0) {
    return { kind: "legacy", metrics: item.metrics };
  }

  const compare = deckOpportunityShowCompare(showCompare, rows);
  const layout = layoutOpportunityComparisonRows(rows);

  if (!compare) {
    if (layout.kind === "query-grid") {
      const sitePeriodTable = buildOpportunitySitePeriodTable(layout.siteRows, periodProgressTables);
      if (sitePeriodTable && layout.queryRows.length === 0) {
        return { kind: "period", table: sitePeriodTable };
      }
      if (layout.queryRows.length > 0) {
        return { kind: "query-primary", queryRows: layout, sitePeriodTable };
      }
    }
    const periodTable = buildOpportunityFlatPeriodTable(rows, periodProgressTables);
    if (periodTable) {
      return { kind: "period", table: periodTable };
    }
    return { kind: "primary-flat", rows };
  }

  return { kind: "compare-flat", rows };
}

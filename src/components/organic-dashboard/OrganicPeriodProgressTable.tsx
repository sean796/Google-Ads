import type { OrganicPeriodProgressTable as OrganicPeriodProgressTableModel } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { toExportTitleCase } from "@/lib/organic-dashboard/organic-client-report-copy";
import { cn } from "@/lib/utils";

export type OrganicPeriodProgressTableProps = {
  table: OrganicPeriodProgressTableModel;
  /** When true, use light export/PDF styling hooks via className on wrapper. */
  exportMode?: boolean;
  className?: string;
  /** When false, omit the bottom total row (e.g. Semrush monthly estimates). */
  showTotalRow?: boolean;
};

export function OrganicPeriodProgressTable({
  table,
  exportMode = false,
  className = "",
  showTotalRow = true,
}: OrganicPeriodProgressTableProps) {
  if (table.rows.length === 0) return null;

  const titleClass = exportMode
    ? "text-base font-semibold text-[#18181b] mb-2"
    : "text-base font-normal text-white";
  const thClass = exportMode
    ? "pb-2 font-normal text-[#52525b]"
    : "pb-2 font-normal text-muted-foreground";
  const tdMetricClass = exportMode ? "py-2 text-[#18181b]" : "py-2 text-white";
  const tdNumClass = exportMode
    ? "py-2 tabular-nums text-[#18181b]"
    : "py-2 tabular-nums text-muted-foreground";
  const tdTotalClass = exportMode
    ? "py-2 tabular-nums font-semibold text-[#18181b]"
    : "py-2 tabular-nums font-semibold text-white";
  const borderClass = exportMode ? "border-t border-[#e4e4e7]" : "border-t border-white/5";
  const displayTitle = exportMode ? toExportTitleCase(table.title) : table.title;
  const totalRowLabel = exportMode ? toExportTitleCase("Total") : "Total";
  const tableClass = cn(
    "w-full min-w-[20rem] text-base",
    exportMode && "organic-client-report-export__period-progress-table",
    !exportMode && "organic-period-progress-table",
  );

  return (
    <div className={className}>
      {displayTitle.trim() ? <h3 className={titleClass}>{displayTitle}</h3> : null}
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <colgroup>
            <col className="organic-period-progress-table__month-col" />
            {table.rows.map((row) => (
              <col key={row.label} className="organic-period-progress-table__metric-col" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={cn(thClass, "organic-period-progress-table__month-col")}>
                {exportMode ? toExportTitleCase("Month") : "Month"}
              </th>
              {table.rows.map((row) => (
                <th
                  key={row.label}
                  scope="col"
                  className={cn(thClass, "organic-period-progress-table__metric-col")}
                >
                  {exportMode ? toExportTitleCase(row.label) : row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.monthLabels.map((monthLabel, monthIdx) => (
              <tr key={`${monthLabel}-${monthIdx}`} className={borderClass}>
                <td className={cn(tdMetricClass, "organic-period-progress-table__month-col whitespace-nowrap")}>
                  {monthLabel}
                </td>
                {table.rows.map((row) => (
                  <td key={`${monthLabel}-${row.label}`} className={cn(tdNumClass, "organic-period-progress-table__metric-col")}>
                    {row.values[monthIdx] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {showTotalRow && table.monthLabels.length > 1 ? (
              <tr className={borderClass}>
                <td className={cn(tdMetricClass, "organic-period-progress-table__month-col font-semibold whitespace-nowrap")}>
                  {totalRowLabel}
                </td>
                {table.rows.map((row) => (
                  <td key={`total-${row.label}`} className={cn(tdTotalClass, "organic-period-progress-table__metric-col")}>
                    {row.periodTotal}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { OrganicPeriodProgressTable as OrganicPeriodProgressTableModel } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { toExportTitleCase } from "@/lib/organic-dashboard/organic-client-report-copy";

export type OrganicPeriodProgressTableProps = {
  table: OrganicPeriodProgressTableModel;
  /** When true, use light export/PDF styling hooks via className on wrapper. */
  exportMode?: boolean;
  className?: string;
};

export function OrganicPeriodProgressTable({
  table,
  exportMode = false,
  className = "",
}: OrganicPeriodProgressTableProps) {
  if (table.rows.length === 0) return null;

  const titleClass = exportMode
    ? "text-base font-semibold text-[#18181b] mb-2"
    : "text-base font-normal text-white";
  const thClass = exportMode
    ? "pb-2 pr-3 font-normal text-[#52525b]"
    : "pb-2 pr-3 font-normal text-muted-foreground";
  const tdMetricClass = exportMode ? "py-2 pr-3 text-[#18181b]" : "py-2 pr-3 text-white";
  const tdNumClass = exportMode
    ? "py-2 pr-3 tabular-nums text-[#18181b]"
    : "py-2 pr-3 tabular-nums text-muted-foreground";
  const tdTotalClass = exportMode
    ? "py-2 tabular-nums font-semibold text-[#18181b]"
    : "py-2 tabular-nums font-semibold text-white";
  const borderClass = exportMode ? "border-t border-[#e4e4e7]" : "border-t border-white/5";
  const displayTitle = exportMode ? toExportTitleCase(table.title) : table.title;
  const displayTotalLabel = exportMode
    ? toExportTitleCase(table.periodTotalColumnLabel)
    : table.periodTotalColumnLabel;

  return (
    <div className={className}>
      <h3 className={titleClass}>{displayTitle}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-base">
          <thead>
            <tr className="text-left">
              <th scope="col" className={thClass}>
                {exportMode ? toExportTitleCase("Month") : "Month"}
              </th>
              {table.rows.map((row) => (
                <th key={row.label} scope="col" className={`${thClass} whitespace-nowrap`}>
                  {exportMode ? toExportTitleCase(row.label) : row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.monthLabels.map((monthLabel, monthIdx) => (
              <tr key={`${monthLabel}-${monthIdx}`} className={borderClass}>
                <td className={`${tdMetricClass} whitespace-nowrap`}>{monthLabel}</td>
                {table.rows.map((row) => (
                  <td key={`${monthLabel}-${row.label}`} className={tdNumClass}>
                    {row.values[monthIdx] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {table.monthLabels.length > 1 ? (
              <tr className={borderClass}>
                <td className={`${tdMetricClass} font-semibold whitespace-nowrap`}>
                  {displayTotalLabel && displayTotalLabel !== table.monthLabels[0]
                    ? displayTotalLabel
                    : "Total"}
                </td>
                {table.rows.map((row) => (
                  <td key={`total-${row.label}`} className={tdTotalClass}>
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

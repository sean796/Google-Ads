import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBoxReady } from "@/ui";

import type {
  OrganicChartPoint,
  OrganicDashboardPeriodLabels,
  OrganicGa4TableRow,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
  ORGANIC_GSC_CHART_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { OrganicMetricDelta } from "@/components/organic-dashboard/OrganicMetricDelta";
import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";

export type OrganicGa4SectionProps = {
  tableRows: OrganicGa4TableRow[];
  chartPoints: OrganicChartPoint[];
  periodLabels: OrganicDashboardPeriodLabels;
  showCompare: boolean;
};

export function OrganicGa4Section({
  tableRows,
  chartPoints,
  periodLabels,
  showCompare,
}: OrganicGa4SectionProps) {
  const { boxRef, ready } = useBoxReady();
  const showChart = ready && chartPoints.length > 0;

  return (
    <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
          <BarChart3 className="h-4 w-4" aria-hidden />
        </span>
        <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>GA4 organic</h2>
      </div>
      <p className="text-base text-muted-foreground">
        User acquisition · first user medium = organic. Session rows use Traffic acquisition · Organic Search.
      </p>

      {tableRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-normal">Metric</th>
                {showCompare ? (
                  <>
                    <th className="pb-2 pr-4 font-normal tabular-nums">{periodLabels.compare}</th>
                    <th className="pb-2 pr-4 font-normal tabular-nums">Change</th>
                    <th className="pb-2 font-normal tabular-nums">{periodLabels.primary}</th>
                  </>
                ) : (
                  <th className="pb-2 font-normal tabular-nums">{periodLabels.primary}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">{row.label}</td>
                  {showCompare ? (
                    <>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{row.previous}</td>
                      <td className="py-2 pr-4">
                        <OrganicMetricDelta delta={row.delta} />
                      </td>
                      <td className="py-2 tabular-nums text-white">{row.current}</td>
                    </>
                  ) : (
                    <td className="py-2 tabular-nums text-white">{row.current}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-base text-muted-foreground tabular-nums">—</p>
      )}

      {showChart ? (
        <div ref={boxRef} className={ORGANIC_GSC_CHART_CLASS}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartPoints} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="hsl(0 0% 100% / 0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(0 0% 98%)", fontSize: 16 }} />
              <YAxis
                tick={{ fill: "hsl(0 0% 98%)", fontSize: 16 }}
                width={56}
                tickFormatter={(v) => formatCanadianNumber(Number(v), 0)}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(0 0% 7%)",
                  border: "0",
                  fontSize: "1rem",
                }}
              />
              <Bar
                dataKey={chartPoints.some((p) => p.gaUsers != null) ? "gaUsers" : "gaSessions"}
                name={chartPoints.some((p) => p.gaUsers != null) ? "Users" : "Sessions"}
                fill="hsl(var(--primary))"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

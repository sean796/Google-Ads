import { Megaphone } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBoxReady } from "@/components/ui/chart-box-ready";
import { OrganicMetricDelta } from "@/components/organic-dashboard/OrganicMetricDelta";
import type {
  OrganicGoogleAdsChartPoint,
  OrganicGoogleAdsTableRow,
} from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import type { OrganicDashboardPeriodLabels } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
  ORGANIC_GSC_CHART_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { formatCanadianCompactNumber } from "@/lib/gsc-reporting/gsc-number-format";

export type OrganicGoogleAdsSectionProps = {
  tableRows: OrganicGoogleAdsTableRow[];
  chartPoints: OrganicGoogleAdsChartPoint[];
  periodLabels: OrganicDashboardPeriodLabels;
  showCompare: boolean;
  loadError: string | null;
};

export function OrganicGoogleAdsSection({
  tableRows,
  chartPoints,
  periodLabels,
  showCompare,
  loadError,
}: OrganicGoogleAdsSectionProps) {
  const { boxRef, ready } = useBoxReady();
  const showChart = ready && chartPoints.length > 0;

  return (
    <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
          <Megaphone className="h-4 w-4" aria-hidden />
        </span>
        <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>Google Ads</h2>
      </div>
      <p className="text-base text-muted-foreground">
        Paid search account totals. Leads use Google Ads conversion counts for the selected dates.
      </p>

      {loadError ? (
        <p className="text-base text-red-400">{loadError}</p>
      ) : null}

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
      ) : null}

      <div ref={boxRef} className={ORGANIC_GSC_CHART_CLASS}>
        {showChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(0 0% 65%)", fontSize: 16 }} interval="preserveStartEnd" />
              <YAxis
                yAxisId="spend"
                tick={{ fill: "hsl(0 0% 65%)", fontSize: 16 }}
                tickFormatter={(v) => formatCanadianCompactNumber(v as number)}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "none", fontSize: "1rem" }}
                formatter={(value: number) => formatCanadianCompactNumber(value)}
                labelFormatter={(label) => String(label)}
              />
              <Line
                yAxisId="spend"
                type="monotone"
                dataKey="adsSpend"
                name="Spend"
                stroke="hsl(142 70% 45%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </section>
  );
}

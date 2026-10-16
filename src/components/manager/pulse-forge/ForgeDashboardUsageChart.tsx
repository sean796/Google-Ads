import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ForgeDashboardChartPoint } from "@/lib/pulse-forge/forge-dashboard-demo-data";
import {
  FORGE_DASHBOARD_PANEL_SHELL_CLASS,
  forgeChartColor,
} from "@/components/manager/pulse-forge/forge-dashboard-styles";

export type ForgeDashboardUsageChartProps = {
  title: string;
  chartSeries: ForgeDashboardChartPoint[];
  chartKeys: string[];
  labels?: Record<string, string>;
};

export function ForgeDashboardUsageChart({
  title,
  chartSeries,
  chartKeys,
  labels = {},
}: ForgeDashboardUsageChartProps): React.ReactElement | null {
  const config = useMemo(() => {
    const out: Record<string, { label: string; color: string }> = {};
    chartKeys.forEach((key, index) => {
      out[key] = {
        label: labels[key] ?? key.replace(/_/g, " "),
        color: forgeChartColor(index),
      };
    });
    return out;
  }, [chartKeys, labels]);

  const hasData = chartKeys.length > 0 && chartSeries.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-base font-semibold text-white">{title}</p>
        <span className="inline-flex items-center gap-0.5 text-base text-muted-foreground">
          Explore
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        </span>
      </div>
      <div className={FORGE_DASHBOARD_PANEL_SHELL_CLASS}>
        <div className="px-2 py-3">
          {hasData ? (
            <ChartContainer config={config} className="aspect-[3/1] h-48 w-full">
              <BarChart data={chartSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-zinc-800" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {chartKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="usage"
                    fill={`var(--color-${key})`}
                    radius={key === chartKeys[chartKeys.length - 1] ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-48 w-full items-center justify-center">
              <p className="text-base text-muted-foreground">No usage recorded in this period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

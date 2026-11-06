import React, { useMemo } from "react";
import { ArrowDown, ArrowUp, Maximize2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import { useBoxReady } from "@/ui";

import { cn } from "@/lib/utils";
import type { ForgeDashboardHeroCard } from "@/lib/pulse-forge/forge-dashboard-demo-data";
import {
  FORGE_DASHBOARD_HERO_CARD_SHELL_CLASS,
  forgeChartColor,
} from "@/components/manager/pulse-forge/forge-dashboard-styles";

export type ForgeDashboardHeroCardProps = {
  card: ForgeDashboardHeroCard;
};

export function ForgeDashboardHeroCard({ card }: ForgeDashboardHeroCardProps): React.ReactElement {
  const config = useMemo(() => {
    const out: Record<string, string> = {};
    card.miniKeys.forEach((key, index) => {
      out[key] = forgeChartColor(index);
    });
    return out;
  }, [card.miniKeys]);

  const showDelta = card.deltaPercent != null;
  const hasChart = card.miniKeys.length > 0 && card.miniSeries.length > 0;
  const { boxRef, ready } = useBoxReady();

  return (
    <div className={cn(FORGE_DASHBOARD_HERO_CARD_SHELL_CLASS, "gap-2 p-3")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-base text-muted-foreground">{card.label}</span>
          <span className="text-base font-semibold text-white">{card.value}</span>
          <div className="min-h-[1.5rem]">
            {showDelta ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-base",
                  card.deltaPositive ? "text-primary" : "text-destructive",
                )}
              >
                {card.deltaPositive ? (
                  <ArrowUp className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {Math.abs(card.deltaPercent!).toFixed(1)}%
              </span>
            ) : null}
          </div>
        </div>
        <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" aria-hidden />
      </div>

      {hasChart ? (
        <div ref={boxRef} className="h-14 w-full shrink-0">
          {ready ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={card.miniSeries} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                {card.miniKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="hero"
                    fill={config[key]}
                    radius={0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      ) : null}

      {card.legend.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
          {card.legend.map((item, index) => (
            <li
              key={item.id}
              className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-2 text-base"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: config[item.id] ?? forgeChartColor(index) }}
                aria-hidden
              />
              <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
              <span className="tabular-nums text-white">{item.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <p className={cn("shrink-0 text-base text-muted-foreground", !card.footnote && "invisible")}>
        {card.footnote ?? "\u00a0"}
      </p>
    </div>
  );
}

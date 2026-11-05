import { cn } from "@/lib/utils";
import {
  FORGE_DASHBOARD_HERO_CARD_SHELL_CLASS,
  FORGE_DASHBOARD_PANEL_SHELL_CLASS,
} from "@/components/manager/pulse-forge/forge-dashboard-styles";

export const ORGANIC_DASHBOARD_PAGE_CLASS = cn(
  "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black font-sans",
);

export const ORGANIC_DASHBOARD_SCROLL_CLASS =
  "relative flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-0 py-4";

export const ORGANIC_DASHBOARD_HERO_CARD_CLASS = FORGE_DASHBOARD_HERO_CARD_SHELL_CLASS;

export const ORGANIC_DASHBOARD_SECTION_PANEL_CLASS = cn(
  FORGE_DASHBOARD_PANEL_SHELL_CLASS,
  "flex min-h-0 flex-col gap-3 p-4",
);

export const ORGANIC_DASHBOARD_SECTION_TITLE_CLASS = "text-lg font-semibold leading-snug text-white";

export const ORGANIC_DASHBOARD_ICON_BADGE_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary";

export const ORGANIC_DASHBOARD_GRID_BACKDROP_CLASS = cn(
  "pointer-events-none absolute inset-0 overflow-hidden",
  "bg-[linear-gradient(hsl(var(--primary)/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.04)_1px,transparent_1px)]",
  "bg-[size:2.5rem_2.5rem]",
  "[mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]",
);

export const ORGANIC_DASHBOARD_CHART_MIN_H = "min-h-[12rem]";

/** GSC Performance-style chart height (only when series data exists). */
export const ORGANIC_GSC_CHART_CLASS = "h-56 min-h-56 w-full";

export const ORGANIC_GSC_CLICKS_COLOR = "hsl(217 91% 60%)";

export const ORGANIC_GSC_IMPRESSIONS_COLOR = "hsl(262 83% 65%)";

export const ORGANIC_SEMRUSH_TRAFFIC_COLOR = "hsl(262 83% 65%)";

export const ORGANIC_SEMRUSH_KEYWORDS_COLOR = "hsl(217 91% 60%)";

export const ORGANIC_SEMRUSH_COST_COLOR = "hsl(142 70% 45%)";

export const ORGANIC_GSC_METRIC_INACTIVE_CLASS =
  "border border-white/10 bg-ui-field text-foreground hover:bg-ui-field-hover/80";

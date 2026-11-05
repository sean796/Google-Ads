import { cn } from "@/lib/utils";
import { FORGE_DASHBOARD_PANEL_SHELL_CLASS } from "@/components/manager/pulse-forge/forge-dashboard-styles";
import { ORGANIC_DASHBOARD_GRID_BACKDROP_CLASS } from "@/components/organic-dashboard/organic-dashboard-styles";

/** Pulse cyberpunk client report (matches Reporting Performance tab). */

export const DECK_PAGE_CLASS = cn(
  "organic-client-report relative box-border w-full rounded-none bg-black font-sans text-base text-white",
);

/** Full-width title card (no fixed hero height). */
export const DECK_HERO_SHELL_CLASS = cn(
  FORGE_DASHBOARD_PANEL_SHELL_CLASS,
  "relative w-full overflow-hidden rounded-none border-l-0",
);

/** Same type as green section bands (Performance summary, etc.). */
export const DECK_PRIMARY_BAND_TEXT_CLASS =
  "text-xl font-semibold tracking-tight text-primary-foreground md:text-2xl";

export const DECK_HERO_TITLE_BAND_CLASS = cn(
  "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 bg-primary px-5 py-3",
  DECK_PRIMARY_BAND_TEXT_CLASS,
);

export const DECK_HERO_BODY_CLASS = "relative flex flex-col gap-4 p-5 md:p-6";

export const DECK_GRID_BACKDROP_CLASS = ORGANIC_DASHBOARD_GRID_BACKDROP_CLASS;

export const DECK_PANEL_SHELL_CLASS = cn(
  FORGE_DASHBOARD_PANEL_SHELL_CLASS,
  "overflow-hidden rounded-none",
);

/** Section band (h2). */
export const DECK_SECTION_HEAD_CLASS = cn(
  "bg-primary px-5 py-3",
  DECK_PRIMARY_BAND_TEXT_CLASS,
);

export const DECK_SECTION_BODY_CLASS = "flex flex-col gap-6 p-5 md:p-6";

export const DECK_H2_INSIGHTS_CLASS = "text-xl font-semibold tracking-tight text-white md:text-2xl";

export const DECK_H3_CLASS = "text-base font-semibold tracking-tight text-white md:text-lg";

/** Metric / opportunity titles (h4). */
export const DECK_H4_CLASS = "text-base font-semibold text-white";

/** Subsection labels under h4 (Period comparison, etc.). */
export const DECK_LABEL_CLASS = "text-base font-medium text-muted-foreground";

export const DECK_LEAD_CLASS = "text-base font-medium leading-relaxed text-white md:text-lg";

export const DECK_BULLET_LIST_CLASS =
  "list-disc space-y-2 pl-6 text-base leading-relaxed text-white/90 marker:text-primary";

export const DECK_NARRATIVE_WELL_CLASS = "flex flex-col gap-4 rounded-none bg-ui-field p-5 md:p-6";

export const DECK_BODY_MUTED_CLASS = "text-base leading-relaxed text-muted-foreground";

export const DECK_BODY_CLASS = "text-base leading-relaxed text-white/90";

export const DECK_SECTION_CLASS = "organic-deck-section px-4 py-5 md:px-8 lg:px-10";

export const DECK_FOOTER_CLASS =
  "flex flex-wrap items-center justify-between gap-4 rounded-none border-t border-white/10 bg-black px-4 py-6 md:px-8 lg:px-10 text-base text-white";

export const DECK_KPI_TILE_BASE_CLASS =
  "flex min-h-[8.5rem] flex-col justify-between gap-2 rounded-none p-5 shadow-tile";

export const DECK_OPPORTUNITY_CARD_CLASS = "rounded-none bg-ui-field p-5 md:p-6";

export const DECK_KEYWORD_WELL_CLASS = "rounded-none bg-ui-field";

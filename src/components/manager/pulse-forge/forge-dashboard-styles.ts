import { cn } from "@/lib/utils";

export const FORGE_AUTOMATION_TILE_SHELL_CLASS =
  "rounded-none border-0 bg-black text-white shadow-tile transition-shadow hover:shadow-tile-pop";

export const FORGE_DASHBOARD_PAGE_CLASS = "bg-black font-sans";

/** Forge chrome: match Properties toolbar — text-base, normal weight. */
export const FORGE_NAV_TEXT_CLASS = "text-base font-normal leading-snug";

/** Section headers (Agents categories, dashboard bands) — no uppercase shrink. */
export const FORGE_DASHBOARD_SECTION_LABEL_CLASS = "text-lg font-semibold leading-snug text-white";

/** Primary page / panel titles inside Forge. */
export const FORGE_PAGE_TITLE_CLASS = "text-xl font-semibold leading-snug text-white";

/** Body copy and form values in Forge surfaces. */
export const FORGE_BODY_TEXT_CLASS = "text-lg leading-snug text-white";

export const FORGE_DASHBOARD_HERO_CARD_CLASS =
  "rounded-lg border-0 border-t border-b border-primary/55 bg-card shadow-tile transition-shadow hover:shadow-tile-pop";

export const FORGE_DASHBOARD_HERO_CARD_SHELL_CLASS = cn(
  FORGE_DASHBOARD_HERO_CARD_CLASS,
  "flex h-[13rem] min-h-[13rem] flex-col overflow-hidden",
);

export const FORGE_DASHBOARD_PANEL_SHELL_CLASS =
  "overflow-hidden rounded-lg border-0 border-l-[length:var(--tile-accent-width)] border-l-primary bg-card shadow-tile";

export const FORGE_TASK_BUILDER_PANEL_SHELL_CLASS =
  "flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-black";

export const FORGE_CHART_SEGMENT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--semantic-data))",
  "hsl(var(--semantic-publish))",
  "hsl(280 65% 58%)",
  "hsl(0 0% 45%)",
] as const;

export function forgeChartColor(index: number): string {
  return FORGE_CHART_SEGMENT_COLORS[index % FORGE_CHART_SEGMENT_COLORS.length] ?? FORGE_CHART_SEGMENT_COLORS[0];
}

export const FORGE_TABLE_HEADER_BORDER_CLASS = "border-b border-white/10";

export const FORGE_FILTER_MENU_CONTENT_CLASS =
  "max-h-[min(24rem,calc(100vh-6rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto border-0 bg-black p-1 text-white [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-none [&::-webkit-scrollbar-thumb]:bg-ui-field-hover [&::-webkit-scrollbar-track]:bg-black";

export const FORGE_FILTER_MENU_ITEM_CLASS =
  "text-lg focus:bg-ui-field-hover focus:text-white data-[highlighted]:bg-ui-field-hover data-[highlighted]:text-white";

export function forgeFilterMenuStripeClass(index: number): string {
  return index % 2 === 0 ? "bg-black" : "bg-ui-field/55";
}

export function forgeTableRowStripeClass(
  index: number,
  { active = false }: { active?: boolean } = {},
): string {
  if (active) {
    return "bg-ui-field-hover/90 transition-colors hover:bg-ui-field-hover/90";
  }
  return cn(
    "transition-colors hover:bg-ui-field-hover/90",
    index % 2 === 0 ? "bg-black" : "bg-ui-field/55",
  );
}

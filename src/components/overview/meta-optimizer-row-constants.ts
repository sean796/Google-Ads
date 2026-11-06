import { cn } from "@/lib/utils";

export const META_FAQ_PAIR_TILE = "space-y-2 rounded-none bg-black py-1.5";
/** Light elevated fields: white value text, neon cyan placeholders, readable on dark UI */
export const META_INPUT_SURFACE =
  "rounded-none border-0 bg-ui-field text-white shadow-inner shadow-black/40 placeholder:text-semantic-analysis-foreground placeholder:opacity-95 focus-visible:ring-2 focus-visible:ring-semantic-analysis/30 focus-visible:ring-offset-0 selection:bg-semantic-analysis/20";

export const META_TRIGGER_FLAT =
  "flex w-full items-center gap-2 rounded-none border-0 bg-transparent px-0 py-1.5 text-left text-base font-medium text-white";

/** Character counts in end rails — blue */
export const META_FIELD_COUNT = "text-base font-medium tabular-nums text-semantic-analysis-foreground";
/** WordPress-style post bar: horizontal cells, dividers, right stack */
export const META_FIELD_END_RAIL =
  "flex h-7 shrink-0 items-stretch divide-x divide-white/25 rounded-none border-0 bg-black/90 sm:h-8";
export const META_FIELD_END_RAIL_CELL = "flex min-w-[2rem] items-center justify-center px-2";
export const META_FIELD_END_RAIL_BTN =
  "inline-flex h-full min-h-0 min-w-[2rem] shrink-0 items-center justify-center rounded-none border-0 bg-transparent px-0 shadow-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-semantic-analysis/35 focus-visible:ring-offset-0 disabled:opacity-45 [&_svg]:text-primary";

const ZONE_BASE = "space-y-2.5 rounded-none";
export const zoneTop = ZONE_BASE;
export const zoneSerp = cn(ZONE_BASE, "min-h-[12.5rem]");
/** Brief JSON + headers / links / FAQs / content — flush alternating stripes */
export const zoneMetaAccordionStack = "flex flex-col gap-0 rounded-none pt-2.5";

export function isVisualElementorSection(section: {
  hasHeadingWidget?: boolean;
  headingInBodyHtml?: boolean;
  title: string;
  bodyText?: string;
  bodyHtml?: string;
}): boolean {
  return (
    !section.hasHeadingWidget &&
    !section.headingInBodyHtml &&
    !section.title?.trim() &&
    !section.bodyText?.trim() &&
    !section.bodyHtml?.trim()
  );
}

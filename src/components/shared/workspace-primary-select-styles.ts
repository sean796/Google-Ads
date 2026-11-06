import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Slot height only; width comes from {@link workspacePrimarySelectWidthStyle}. */
export const WORKSPACE_PRIMARY_SELECT_SLOT_CLASS = "h-8 shrink-0";

/** @deprecated Use {@link sitemapScopeDropdownReserveProps}. */
export const SITEMAP_SCOPE_DROPDOWN_SLOT_CLASS = WORKSPACE_PRIMARY_SELECT_SLOT_CLASS;

export const WORKSPACE_PRIMARY_SELECT_TRIGGER_CLASS = cn(
  "h-8 w-full min-w-0 justify-between rounded-none border-0 bg-primary px-3 text-base text-black shadow-none",
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0",
  "[&>span]:line-clamp-none [&>span]:whitespace-nowrap",
  "[&_svg]:text-black",
);

/** Full-height menu: no max-h scroll or chevron scroll buttons. */
export const WORKSPACE_PRIMARY_SELECT_MENU_CLASS = cn(
  "rounded-none border-0 bg-black p-1 text-white shadow-lg",
  "max-h-none overflow-visible",
  "[&>button]:hidden",
  "[&>div]:max-h-none [&>div]:overflow-visible",
);

export const WORKSPACE_PRIMARY_SELECT_ITEM_CLASS = cn(
  "cursor-pointer rounded-none py-2 pl-3 pr-3 text-base text-white",
  "focus:rounded-none focus:bg-primary focus:text-black",
  "data-[highlighted]:rounded-none data-[highlighted]:bg-primary data-[highlighted]:text-black",
  "[&>span:first-child]:hidden",
  "[&_svg]:shrink-0",
);

const TRIGGER_PAD_REM = 1.625;
const CHEVRON_REM = 1.125;
const CHAR_WIDTH_REM = 0.625;
const ITEM_LEADING_ICON_REM = 1.375;

/**
 * Fixed trigger/menu width from the longest label in this dropdown (no CLS when value changes).
 */
export function workspacePrimarySelectWidthStyle(
  labels: readonly string[],
  options?: { itemLeadingIcon?: boolean },
): CSSProperties {
  const longest = labels.reduce(
    (max, label) => (label.length > max.length ? label : max),
    labels[0] ?? " ",
  );
  const textRem = Math.max(longest.length, 1) * CHAR_WIDTH_REM;
  const iconRem = options?.itemLeadingIcon ? ITEM_LEADING_ICON_REM : 0;
  const totalRem = TRIGGER_PAD_REM + CHEVRON_REM + textRem + iconRem + 0.25;
  const stepped = Math.ceil(totalRem * 4) / 4;
  const w = `${stepped}rem`;
  return { width: w, minWidth: w, maxWidth: w };
}

export function workspacePrimarySelectSlotProps(
  labels: readonly string[],
  options?: { itemLeadingIcon?: boolean },
): { className: string; style: CSSProperties } {
  return {
    className: WORKSPACE_PRIMARY_SELECT_SLOT_CLASS,
    style: workspacePrimarySelectWidthStyle(labels, options),
  };
}

/** Worst-case label bucket so reserved sitemap slot matches loaded menus (custom tags). */
const SITEMAP_SCOPE_RESERVE_LABELS: readonly string[] = [
  "Pages",
  "Posts",
  "Entities",
  "Custom sitemap collection",
];

/** Reserve space when sitemap scope menu is not mounted yet. */
export function sitemapScopeDropdownReserveProps(
  labels: readonly string[] = SITEMAP_SCOPE_RESERVE_LABELS,
): { className: string; style: CSSProperties } {
  return workspacePrimarySelectSlotProps(labels);
}

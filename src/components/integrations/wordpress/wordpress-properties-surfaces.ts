import { cn } from "@/lib/utils";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";

/** Square controls across Properties (list rows, toolbar, expanded panels). */
export const PROPERTIES_SQUARE_CONTROLS_CLASS =
  "[&_button]:rounded-none [&_input]:rounded-none [&_[role=checkbox]]:rounded-none [&_[role=combobox]]:rounded-none";

/** Outer chrome for Properties list: flush under unified dashboard header (toolbar band). */
export const PROPERTIES_SHELL = cn(
  "bg-black px-0 pb-0 pt-0 shadow-none ring-0 outline-none",
  PROPERTIES_SQUARE_CONTROLS_CLASS,
);

/** Vertical stack for property rows (no panel border). */
export const PROPERTIES_LIST_STACK = "flex flex-col gap-0";

/**
 * Collapsed property row shell (stripe applied via propertiesRowStripeClass).
 */
/** Shared row height shell (real rows + filler stripes). */
export const PROPERTIES_ROW_OUTER_BASE = cn(
  "flex min-h-[4.5rem] w-full min-w-0 items-stretch gap-3 rounded-none border-0 px-2 py-2 shadow-none transition-colors sm:gap-4 sm:px-3",
);

/** Alternating stripe matching SEO manager dropdown rows. */
export function propertiesRowStripeClass(
  index: number,
  rowSelected = false,
  canHover = true,
): string {
  return cn(
    !rowSelected && (index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/55"),
    !rowSelected && canHover && "hover:bg-zinc-800/90",
    rowSelected && "bg-zinc-800/90 hover:bg-zinc-800/90",
  );
}

/** Collapsed row outer classes with optional compact density (visual only). */
export function propertiesRowOuterClass(
  display: WordPressPropertyRowDisplay,
  index: number,
  rowSelected = false,
  canHover = true,
): string {
  return cn(
    PROPERTIES_ROW_OUTER_BASE,
    propertiesRowStripeClass(index, rowSelected, canHover),
    display === "compact" &&
      "min-h-[3.25rem] gap-2 py-1 sm:min-h-[3.5rem] sm:gap-3 sm:px-2.5",
  );
}

/** Empty / no-results states (flat, readable on dark). */
export const PROPERTIES_EMPTY = cn(
  "rounded-none border-0 bg-zinc-900/50 py-10 text-center text-foreground/85 shadow-none sm:py-12",
);

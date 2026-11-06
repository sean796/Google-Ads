import type { OptimizationOptions } from "@/hooks/use-optimization-options";
import type React from "react";
import { cn } from "@/lib/utils";
import { SEO_WORKSPACE_SHELL_CLASS } from "@/components/seo/seo-workspace-layout";
import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimization/content-optimizer-bulk-page-size";

/** Lato + 1rem floor for Content / Overview tab (see typography-min-1rem rule). */
export const OVERVIEW_TAB_TYPO_CLASS =
  "neo-pulse-overview-tab font-sans text-base [&_input]:font-sans [&_input]:text-base [&_textarea]:font-sans [&_textarea]:text-base [&_button]:font-sans [&_button]:text-base [&_label]:font-sans [&_label]:text-base";

/** Shared Content single + multi shell (same padding, typography, width). */
export const CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS =
  "[&_button]:rounded-none [&_input]:rounded-none [&_textarea]:rounded-none [&_[role=combobox]]:rounded-none";

export const CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS = cn(
  SEO_WORKSPACE_SHELL_CLASS,
  OVERVIEW_TAB_TYPO_CLASS,
  CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
);

/** Shared scroll body inset under workspace chrome. */
export const CONTENT_OPTIMIZER_BODY_INSET_CLASS = "px-1 pb-4 pt-0";

/** Fixed visible row slots in the Overview content grid (per pagination page). */
export const OVERVIEW_GRID_VISIBLE_ROW_COUNT = CONTENT_OPTIMIZER_BULK_PAGE_SIZE;

/** Page row shell (single-site meta tiles + multi-site list rows). */
export const CONTENT_OPTIMIZER_ROW_SHELL_CLASS =
  "rounded-none border-0 bg-black px-2.5 py-2.5 sm:px-3 sm:py-3";

/** Outer wrapper around each content row (matches OverviewPagesSection). */
export const CONTENT_OPTIMIZER_ROW_WRAPPER_CLASS = "w-full px-0 py-2 sm:px-1 sm:py-3";

/** Vertical gap between single-site page rows. */
export const CONTENT_OPTIMIZER_ROW_STACK_CLASS = "flex flex-col gap-3";

/** Multi-site: flush rows; header→first-row air lives on the first wrapper only. */
export const CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS = "flex flex-col gap-0";

export const CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS =
  "w-full px-0 py-0 sm:px-1 first:pt-2 first:sm:pt-3";

/** Multi-site compact row interior (horizontal list). */
export const CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS =
  "rounded-none border-0 px-2.5 py-1.5 sm:px-3 sm:py-2 transition-colors";

/** Active bulk row copy — sky glow visible when drawer rows are collapsed. */
export const CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS =
  "text-semantic-analysis-foreground drop-shadow-[0_0_10px_rgba(56,189,248,0.55)]";

/** Active bulk-optimization row — glow only, no border. */
export const CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS =
  "relative z-10 overflow-visible shadow-[0_0_14px_-6px_hsl(var(--semantic-data)/0.2)]";

/** Inverted stripe on hover (black ↔ zinc-950), not a flat grey wash. */
export function contentOptimizerRowStripeHoverClass(index: number): string {
  return index % 2 === 0 ? "hover:bg-black" : "hover:bg-black";
}

/** Alternating stripe matching Properties list + SEO mega-menu dropdown rows. */
export function contentOptimizerRowStripeClass(
  index: number,
  { isActiveOptimize = false }: { isActiveOptimize?: boolean } = {},
): string {
  return cn(
    CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
    index % 2 === 0 ? "bg-black" : "bg-black",
    isActiveOptimize && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  );
}

/** Fixed slot so sparkle + usage (e.g. 120/50) line up on one vertical axis every row. */
export const CONTENT_OPTIMIZER_MULTI_SITE_OPT_COUNT_SLOT = cn(
  "flex w-[6.75rem] min-w-[6.75rem] shrink-0 items-center justify-start sm:w-[7rem] sm:min-w-[7rem]",
  "[&>div]:!w-auto [&>div]:min-w-0 [&>div]:!justify-start",
);

/** Sitemap dropdown + date: one fixed-height row, vertically centered. */
export const CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER = cn(
  "flex h-7 w-[18.75rem] shrink-0 items-center gap-0 overflow-hidden rounded-none border-0 bg-black py-0 pl-0.5 pr-1.5 sm:h-8 sm:w-[19rem]",
  "[&_button]:!text-white [&_span]:!text-white [&_svg]:!text-white [&_svg]:opacity-80",
  "[&_button]:disabled:!opacity-100 [&_button]:disabled:!text-white",
);

/** Left cell: fixed width so the cluster stays aligned across rows. */
export const CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL =
  "flex h-full w-[8.75rem] min-w-[8.75rem] max-w-[8.75rem] shrink-0 items-center sm:w-[9rem] sm:min-w-[9rem] sm:max-w-[9rem]";

export const CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL = cn(
  "flex h-full min-w-0 flex-1 items-center py-0 pl-2 pr-1 text-sm leading-none !text-white sm:text-base",
);

export const CONTENT_OPTIMIZER_PAGE_ROW_EXPANDED_GRID_CLASS = cn(
  "flex w-full min-w-0 min-h-9 items-center justify-end gap-2 sm:min-h-10",
);

/** Collapsed row: select (2.25rem) | title→url (1fr) | keyword (40%) | date (8.5rem) | actions (2.75rem). */
export const CONTENT_OPTIMIZER_PAGE_ROW_GRID_CLASS = cn(
  "grid w-full min-w-0 min-h-[3rem] grid-cols-[2.25rem_minmax(0,1fr)_40%_8.5rem_2.75rem] items-center gap-x-2 sm:min-h-[3.25rem] sm:gap-x-3",
);

export const CONTENT_OPTIMIZER_PAGE_ROW_SELECT_CELL =
  "flex shrink-0 items-center justify-center pl-0.5";

export const CONTENT_OPTIMIZER_PAGE_ROW_URL_CELL =
  "flex min-w-0 items-center border-0 bg-transparent px-0 py-0";

/** Keyword cell (40% track). */
export const CONTENT_OPTIMIZER_PAGE_ROW_TITLE_CELL = cn(
  "flex min-w-0 items-center border-0 bg-transparent px-1.5 py-0.5",
  "[&_span]:!text-white",
);

/** Date cell (8.5rem track). */
export const CONTENT_OPTIMIZER_PAGE_ROW_DATE_CELL = cn(
  "flex min-w-0 items-center justify-end border-0 bg-transparent px-1.5 py-0.5",
  "text-sm leading-none !text-white sm:text-base",
);

export const CONTENT_OPTIMIZER_PAGE_ROW_ACTIONS_CELL =
  "flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2";

/** Highlight/copy in clickable list rows without toggling expand. */
export const CONTENT_OPTIMIZER_COPYABLE_CELL_CLASS = "select-text cursor-text [user-select:text]";

export function contentOptimizerCopyableCellProps(): {
  className: string;
  "data-copyable": true;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
} {
  return {
    className: CONTENT_OPTIMIZER_COPYABLE_CELL_CLASS,
    "data-copyable": true,
    onMouseDown: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation(),
  };
}

/** NEO Pulse logo tile only (green square + black spark). */
export const CONTENT_OPTIMIZER_MULTI_SITE_OPTIMIZE_ROW_BTN =
  "h-7 w-7 shrink-0 rounded-none p-0 sm:h-8 sm:w-8";

/** Shared compact row horizontal rhythm (multi-site + single-site accordion header). */
export const CONTENT_OPTIMIZER_COMPACT_ROW_INNER_CLASS =
  "flex min-h-[3rem] w-full min-w-0 items-stretch gap-2 sm:min-h-[3.25rem] sm:gap-3";

export const OVERVIEW_SEO_EXTRA_BULK: Partial<OptimizationOptions> = {
  optimizeTitle: false,
  optimizeMeta: false,
  optimizeExcerpt: false,
  optimizeContent: false,
  optimizeFeaturedImage: false,
  optimizeExtraText: true,
  optimizeExtraImage: false,
  useAcfKeyword: true,
  contentOnlyUpload: true,
  seoExtraTextFieldOnly: true,
  hasEntity: false,
  manualKeyword: "",
  bulkFaqMinimum4: false,
};

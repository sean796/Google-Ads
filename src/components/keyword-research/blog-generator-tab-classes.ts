import { cn } from "@/lib/utils";
import { SEO_WORKSPACE_BODY_SCROLL_CLASS, SEO_WORKSPACE_SHELL_CLASS } from "@/components/seo/seo-workspace-layout";

/** Shared layout classes for Blog Generator unified workspace headers. */
export const BLOG_GENERATOR_TAB_ROOT_CLASS = cn(
  SEO_WORKSPACE_SHELL_CLASS,
  "min-h-0 gap-0 !px-1.5 md:!px-2.5",
);

/** Padding so meta-opt-breathe glow is not clipped by tab shell overflow. */
export const BLOG_GENERATOR_WORKSPACE_HEADER_CLASS =
  "relative z-30 shrink-0 overflow-visible px-0.5 pb-0.5";

/** Scrollable body under unified workspace chrome - fills remaining viewport height. */
export const BLOG_GENERATOR_WORKSPACE_BODY_CLASS = cn(
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  "px-0 pb-4 pt-0",
);

/** Compact empty rows to fill the workspace (matches Content Optimizer list density). */
export const BULK_GENERATOR_EMPTY_ROW_COUNT = 18;

/** Shared collapsed row band height (Import, CSV, Prompt slot rows). */
export const BULK_GENERATOR_ROW_GRID_MIN_CLASS = "min-h-[3rem] sm:min-h-[3.25rem]";

export const BLOG_GENERATOR_FORM_CARD_CLASS = "p-6";

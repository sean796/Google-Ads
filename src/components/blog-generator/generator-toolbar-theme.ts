import { cn } from "@/lib/utils";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";

/** Single-row generator toolbar root (matches UNIFIED_TOOLBAR_CLASS gap). */
export const GENERATOR_TOOLBAR_ROOT_CLASS =
  "flex w-full min-w-0 flex-nowrap items-center gap-1.5";

/** Visual doc canvas Band 2: allow bulk controls to wrap instead of horizontal scroll. */
export const GENERATOR_STUDIO_BAND2_TOOLBAR_CLASS =
  "w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 [&>div]:min-w-0 [&>div]:flex-wrap";

/** Left zone: uploads, keyword, main intent. */
export const GENERATOR_TOOLBAR_PRIMARY_CLASS =
  "flex min-w-0 flex-1 flex-nowrap items-center gap-1.5";

/** Middle zone: fixed-width selects and toggles. */
export const GENERATOR_TOOLBAR_OPTIONS_CLASS =
  "flex shrink-0 flex-nowrap items-center gap-1.5";

/** Right zone: run / clear cluster. */
export const GENERATOR_TOOLBAR_ACTIONS_CLASS =
  "ml-auto flex shrink-0 flex-nowrap items-center gap-1.5";

export const GENERATOR_FIELD_KEYWORD = cn(BULK_HEADER_FIELD, "min-w-[10rem] flex-1 text-base");

export const GENERATOR_FIELD_COUNT = cn(
  BULK_HEADER_FIELD,
  "w-[3.25rem] shrink-0 text-center font-mono text-base tabular-nums",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-auto [&::-webkit-outer-spin-button]:appearance-auto",
);

export const GENERATOR_FIELD_FLEX = cn(BULK_HEADER_FIELD, "min-w-0 flex-1 text-base");

export const GENERATOR_FIELD_URL = cn(BULK_HEADER_FIELD, "min-w-0 max-w-md flex-1 font-mono text-base");

export const GENERATOR_SELECT = cn(BULK_HEADER_SELECT_TRIGGER, "w-[9rem] shrink-0");

export const GENERATOR_EXPORT_BTN = cn(
  BULK_HEADER_TOOL_BTN,
  "min-h-8 border-0 bg-[hsl(var(--muted)/0.45)] shadow-none transition-colors hover:bg-[hsl(var(--muted)/0.6)] disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-50",
);

/** Reserve fixed slot when a conditional control is hidden (prevents horizontal CLS). */
export const GENERATOR_TOOLBAR_SLOT_RESERVE = "invisible pointer-events-none shrink-0";

import { cn } from "@/lib/utils";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";

/** Zinc flat actions on the black reporting toolbar (fixed width, zero CLS). */
export const REPORTING_TOOLBAR_ACTION_BTN = cn(
  BULK_HEADER_TOOL_BTN,
  "inline-flex h-8 min-h-8 items-center justify-center gap-2 px-3 text-white hover:bg-ui-field-hover",
);

export const REPORTING_TOOLBAR_DOWNLOAD_MARKDOWN_BTN_CLASS = cn(
  REPORTING_TOOLBAR_ACTION_BTN,
  "min-w-[11rem]",
);

export const REPORTING_SECTION_TAB_BTN = cn(
  "inline-flex h-8 min-h-8 items-center justify-center rounded-none border-0 px-3 text-base font-medium shadow-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
);

export const REPORTING_SECTION_TAB_INACTIVE = cn(
  REPORTING_SECTION_TAB_BTN,
  "bg-ui-field text-white hover:bg-ui-field-hover hover:text-white",
);

export const REPORTING_SECTION_TAB_ACTIVE = cn(
  REPORTING_SECTION_TAB_BTN,
  "bg-primary text-black hover:bg-primary/90",
);

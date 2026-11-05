import { cn } from "@/lib/utils";

export const META_VISUAL_ROW_SHELL = "rounded-none border-0 px-2.5 py-1.5 sm:px-3 sm:py-2";

export const META_VISUAL_GRID_CLASS =
  "grid w-full min-w-0 grid-cols-4 items-center gap-x-3 gap-y-0";

export const META_VISUAL_GROUP_HEADING_CLASS =
  "col-span-4 text-base font-semibold text-foreground";

export const META_VISUAL_CELL_CLASS = "min-w-0";

export const META_VISUAL_LABEL_COL = "w-[7.5rem] shrink-0 text-base text-muted-foreground";
export const META_VISUAL_WEIGHT_COL = "w-[4.5rem] shrink-0";
export const META_VISUAL_SELECT_COL = "w-[10rem] shrink-0";
export const META_VISUAL_FIELD_COL = "w-[min(100%,14rem)] shrink-0";

export const META_VISUAL_COLORS_SIDE_CLASS = "w-[5.5rem] shrink-0";
export const META_VISUAL_COLORS_ACTION_CLASS = "w-[12.5rem] shrink-0";
export const META_VISUAL_COLORS_FIELDS_CLASS =
  "grid min-w-0 flex-1 grid-cols-3 items-center gap-x-3 gap-y-0";
export const META_VISUAL_COLORS_ROW_CLASS =
  "flex min-w-0 w-full items-center gap-x-3 gap-y-0";

/** Outer stripe: two equal tool halves (50/50). */
export const META_VISUAL_TOOL_STRIPE_CLASS =
  "grid w-full min-w-0 grid-cols-2 items-center gap-x-4 gap-y-0";

/** Outer stripe: tool col 1 | tool col 2 | colors col. */
export const META_VISUAL_SETTINGS_STRIPE_MIN_H = "min-h-10";

export const META_VISUAL_TOOL_COLOR_STRIPE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-3 items-center gap-x-3 gap-y-0",
  META_VISUAL_SETTINGS_STRIPE_MIN_H,
);

/** Inner half: label | style slot | degree. */
export const META_VISUAL_TOOL_HALF_GRID_CLASS =
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_6rem_5rem] items-center gap-x-2 gap-y-0";

export const META_VISUAL_TOOL_STYLE_SELECT_CLASS = "h-8 w-[6rem] max-w-[6rem] shrink-0";

export const META_VISUAL_COLOR_HEX_CLASS =
  "h-8 w-[7.5rem] max-w-[7.5rem] shrink-0 justify-start rounded-none border-0 px-2 text-left text-base font-normal tabular-nums";

export const META_VISUAL_COLOR_CELL_GRID_CLASS = cn(
  META_VISUAL_CELL_CLASS,
  "grid w-full min-w-0 grid-cols-[minmax(5.5rem,7rem)_minmax(0,1fr)] items-center gap-x-2",
);

export const META_VISUAL_TOOL_LABEL_CLASS =
  "text-base font-semibold text-foreground";

export const META_VISUAL_TOOL_ROW_LABEL_CLASS = META_VISUAL_TOOL_LABEL_CLASS;

export const META_VISUAL_TOOL_COL_HEADER_CLASS =
  "text-base font-semibold text-muted-foreground";

export const META_VISUAL_PARAM_SURFACE_CLASS = cn(
  "rounded-none bg-ui-field-hover text-foreground hover:bg-ui-field-hover focus-visible:outline-none focus-visible:ring-0",
);

export const META_VISUAL_COMPACT_WEIGHT_INPUT_CLASS = cn(
  "h-8 w-full max-w-[5rem] border-0 px-1 text-center text-base tabular-nums",
  META_VISUAL_PARAM_SURFACE_CLASS,
);

export const META_VISUAL_TEXTAREA_CLASS = cn(
  "min-h-[4.5rem] w-full resize-y border-0 px-2.5 py-2 text-base shadow-none",
  META_VISUAL_PARAM_SURFACE_CLASS,
);

export const META_VISUAL_TOOLS_PER_ROW = 2;

export const META_VISUAL_TOOL_GRID_COLS_PER_TOOL = 3;

export function chunkMetaVisualToolKeys<T>(keys: T[], size = META_VISUAL_TOOLS_PER_ROW): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < keys.length; index += size) {
    rows.push(keys.slice(index, index + size));
  }
  return rows;
}

export function metaVisualToolStripeRowCount(toolCount: number): number {
  return 1 + Math.ceil(toolCount / META_VISUAL_TOOLS_PER_ROW);
}

export const META_VISUAL_COLOR_ROW_COUNT = 0;

export function metaVisualSettingsRowCount(toolCount: number): number {
  return metaVisualToolStripeRowCount(toolCount);
}

export function metaVisualSettingsRowClass(index: number): string {
  return cn(META_VISUAL_ROW_SHELL, index % 2 === 0 ? "bg-black" : "bg-black");
}

/** Muted control surface for buttons and select triggers on dark visual settings rows. */
export const META_VISUAL_CONTROL_SURFACE_CLASS = cn(
  "rounded-none bg-ui-field-hover text-foreground hover:bg-ui-field-hover focus:ring-0 focus-visible:ring-0",
  "[&_svg]:text-foreground",
);

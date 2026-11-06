import { cn } from "@/lib/utils";

/**
 * Pulse UI tokens: the only place raw palette values and control geometry live.
 * Colors resolve through CSS variables (`--ui-*` in src/index.css, `ui.*` in tailwind.config.ts).
 * Everything under src/ui and every converted page composes these; nothing else invents classes.
 */

/** Grey well on the black toolbar (zinc-900 surface). Height h-8, flat, no focus ring. */
export const UI_FIELD = cn(
  "h-8 rounded-none border-0 bg-ui-field text-foreground shadow-none",
  "ring-0 ring-offset-0 placeholder:text-muted-foreground",
);

export const UI_SELECT = cn(UI_FIELD, "px-2 text-base [&_svg]:text-muted-foreground");

/** Select trigger shows the full selected label (SelectTrigger defaults to line-clamp-1). */
export const UI_SELECT_TRIGGER = cn(
  UI_SELECT,
  "h-8 w-auto shrink-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap",
);
/** Green on black dropdown for data rows and toolbars. */
export const UI_SELECT_TRIGGER_DATA = cn(UI_SELECT_TRIGGER, "bg-black text-white hover:bg-black [&>svg]:text-white [&>svg]:opacity-100");

export const UI_BTN_TOOL = cn(
  "h-8 shrink-0 rounded-none border-0 bg-ui-field px-2.5 text-base text-foreground shadow-none",
  "hover:bg-ui-field-hover disabled:opacity-50",
);

export const UI_BTN_RUN =
  "h-8 shrink-0 gap-1.5 rounded-none border-0 bg-primary px-2.5 text-base text-black shadow-none hover:bg-primary/90 disabled:opacity-50";

export const UI_BTN_DANGER = cn(
  "h-8 shrink-0 rounded-none border-0 bg-transparent px-2.5 text-base text-ui-danger shadow-none",
  "hover:bg-ui-danger-surface/50 hover:text-ui-danger-hover disabled:opacity-50",
);

/** Verb-only grey control (icon carries the action). */
export const UI_BTN_ICON_TOOL = cn(
  UI_BTN_TOOL,
  "w-8 min-w-8 max-w-8 shrink-0 justify-center border border-white/10 px-0",
);

/** Verb-only primary control (icon carries the action). */
export const UI_BTN_ICON_RUN = cn(
  UI_BTN_RUN,
  "w-8 min-w-8 max-w-8 shrink-0 justify-center border border-white/10 px-0 [&_svg]:text-black",
);

/** Red-outline icon control for destructive verbs (cancel, clear). */
export const UI_BTN_ICON_DANGER =
  "h-8 w-8 shrink-0 rounded-none border border-ui-danger-edge/70 bg-black p-0 text-ui-danger shadow-none hover:bg-ui-danger-surface/50 hover:text-ui-danger-hover disabled:opacity-50";

/** Upload control after a file is loaded (primary, matches run). */
export const UI_BTN_UPLOAD_READY = cn(
  UI_BTN_RUN,
  "gap-1.5 max-w-[min(100%,28rem)] whitespace-normal py-1 [&_svg]:text-black",
);

/** Square checkbox on the black toolbar (checked and indeterminate share one fill). */
export const UI_CHECKBOX =
  "border-white/40 data-[state=checked]:border-white/40 data-[state=checked]:bg-ui-field-hover data-[state=checked]:text-foreground data-[state=indeterminate]:border-white/40 data-[state=indeterminate]:bg-ui-field-hover data-[state=indeterminate]:text-foreground";

export const UI_TOOLBAR_GROUP_DIVIDER = "mx-0.5 h-6 w-px shrink-0 bg-white/12";

/** Single toolbar row: fixed gap, never wraps. */
export const UI_TOOLBAR_ROW = "flex min-w-0 flex-nowrap items-center gap-1.5";

/** Right-aligned action cluster inside a toolbar row. */
export const UI_TOOLBAR_END = "ml-auto flex shrink-0 flex-nowrap items-center gap-1.5";

/** Keep the box when a conditional control is absent (zero CLS). */
export const UI_SLOT_RESERVE = "invisible pointer-events-none shrink-0";

/** Textarea well: same flat surface as UI_FIELD, free height. */
export const UI_TEXTAREA = cn(
  "min-h-[5rem] w-full rounded-none border-0 bg-ui-field px-2 py-1.5 text-base text-foreground shadow-none",
  "ring-0 ring-offset-0 placeholder:text-muted-foreground resize-none",
);

/** Switch track and thumb on the flat toolbar surface (overrides the shadcn glow). */
export const UI_SWITCH =
  "h-6 w-11 border-0 bg-ui-field shadow-none data-[state=unchecked]:bg-ui-field-hover data-[state=checked]:bg-primary data-[state=checked]:shadow-none [&>span]:border-0 [&>span]:shadow-none";

/** Dialog surface: flat black, square, no border. Width comes from the size map in DialogShell. */
export const UI_DIALOG = "max-h-[90vh] gap-3 overflow-y-auto rounded-none border-0 bg-black p-4 text-base text-foreground shadow-none sm:rounded-none";

/** Dialog body stack (fields first, one action row after). */
export const UI_DIALOG_BODY = "flex flex-col gap-1.5";
/** Borderless text-only control for dismiss and inline actions (no well). */
export const UI_BTN_QUIET =
  "h-8 shrink-0 gap-1.5 rounded-none border-0 bg-transparent px-2.5 text-base text-muted-foreground shadow-none hover:bg-ui-field-hover hover:text-foreground disabled:opacity-50";

/** Icon-only quiet control. */
export const UI_BTN_ICON_QUIET = cn(UI_BTN_QUIET, "w-8 min-w-8 max-w-8 shrink-0 justify-center px-0");

/** Toggle on state. Same box as off; only the surface changes. */
export const UI_BTN_PRESSED = "bg-primary text-black hover:bg-primary/90 [&_svg]:text-black";

/** Inline text action inside copy (no box, no fixed height). */
export const UI_TEXT_BUTTON =
  "inline-flex items-center gap-1 rounded-none border-0 bg-transparent p-0 text-base text-primary underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline";

export const UI_TEXT_BUTTON_MUTED = cn(UI_TEXT_BUTTON, "text-muted-foreground hover:text-foreground");

/** White bold name that opens something (site name in a list row). */
export const UI_TEXT_BUTTON_PLAIN = cn(UI_TEXT_BUTTON, "shrink-0 whitespace-nowrap font-bold leading-none text-foreground");

/** Full-width clickable row (list item, disclosure header). Content is free-form. */
export const UI_ROW_BUTTON =
  "flex w-full items-center gap-2 rounded-none border-0 bg-transparent px-3 py-2 text-left text-base text-foreground shadow-none hover:bg-ui-field-hover disabled:opacity-50";

export const UI_ROW_BUTTON_SELECTED = "bg-ui-field-hover";

/** Green sidebar rail launcher (matches the right docked rail): icon above label, fixed box. */
export const UI_RAIL_BUTTON =
  "flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-none border-0 bg-primary px-1 py-3 text-base text-black shadow-none hover:bg-primary/85 disabled:opacity-50 [&_svg]:text-black";

export const UI_RAIL_BUTTON_SELECTED = "bg-black/25 hover:bg-black/25";

/** Color tile that carries a data-driven color (theme preview, tag chip, chart series). */
export const UI_SWATCH_BUTTON =
  "inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-none border-0 px-2.5 text-base shadow-none disabled:opacity-50";

export const UI_SWATCH_BUTTON_SELECTED = "ring-2 ring-primary";
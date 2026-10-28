import { cn } from "@/lib/utils";

/** Grey wells on the black toolbar — matches unified header chrome (zinc-900). */
export const BULK_HEADER_FIELD = cn(
  "h-8 rounded-none border-0 bg-zinc-900 text-foreground shadow-none",
  "ring-0 ring-offset-0 placeholder:text-muted-foreground",
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0",
);

export const BULK_HEADER_SELECT = cn(
  BULK_HEADER_FIELD,
  "px-2 text-base [&_svg]:text-muted-foreground",
);

/** Toolbar select trigger: show full selected label (SelectTrigger defaults to line-clamp-1). */
export const BULK_HEADER_SELECT_TRIGGER = cn(
  BULK_HEADER_SELECT,
  "h-8 w-auto shrink-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap",
);

export const BULK_HEADER_TOOL_BTN = cn(
  "h-8 shrink-0 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-foreground shadow-none",
  "hover:bg-zinc-800 disabled:opacity-50",
);

export const BULK_HEADER_RUN_BTN =
  "h-8 shrink-0 gap-1.5 rounded-none border-0 bg-primary px-2.5 text-base text-black shadow-none hover:bg-primary/90 disabled:opacity-50";

/** Verb-only grey toolbar control (icon carries the action). */
export const BULK_HEADER_ICON_TOOL_BTN = cn(
  BULK_HEADER_TOOL_BTN,
  "w-8 min-w-8 max-w-8 shrink-0 justify-center border border-white/10 px-0",
);

/** Verb-only green run control (icon carries the action). */
export const BULK_HEADER_ICON_RUN_BTN = cn(
  BULK_HEADER_RUN_BTN,
  "w-8 min-w-8 max-w-8 shrink-0 justify-center border border-white/10 px-0 [&_svg]:text-black",
);

/** Upload control after a file is loaded (green/black, matches run). */
export const BULK_HEADER_UPLOAD_READY_BTN = cn(
  BULK_HEADER_RUN_BTN,
  "gap-1.5 max-w-[min(100%,28rem)] whitespace-normal py-1 [&_svg]:text-black",
);

/** Red-outline icon control for destructive verbs (cancel, clear). */
export const BULK_HEADER_DANGER_ICON_BTN =
  "h-8 w-8 shrink-0 rounded-none border border-red-600/70 bg-black p-0 text-red-500 shadow-none hover:bg-red-950/50 hover:text-red-400 disabled:opacity-50";

export const BULK_TOOLBAR_GROUP_DIVIDER = "mx-0.5 h-6 w-px shrink-0 bg-white/12";

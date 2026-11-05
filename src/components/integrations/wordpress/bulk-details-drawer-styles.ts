import { cn } from "@/lib/utils";
import { CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";

/** Details dropdown panel surface — continues the progress band (UnifiedWorkspaceChrome). */
export const DETAILS_DRAWER_SHELL = cn(
  "rounded-none bg-transparent px-0 py-0",
  CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
);

/** Full progress-band width — capped height, single outer scroll. */
export const DETAILS_DRAWER_PANEL = cn(
  "absolute left-0 right-0 top-full z-50 mt-0 max-h-[min(60vh,720px)] overflow-y-auto overscroll-y-contain",
  "border-x-[6px] border-b-[6px] border-t-0 border-border bg-black/88 backdrop-blur-xl backdrop-saturate-150",
  "shadow-[0_20px_56px_rgba(0,0,0,0.82)]",
);

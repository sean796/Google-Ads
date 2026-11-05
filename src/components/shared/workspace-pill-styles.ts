/** Shared pill styling for UnifiedWorkspaceChrome section tabs. */
export const WORKSPACE_PILL_SHAPE =
  "inline-flex items-center justify-center px-3 text-base font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const WORKSPACE_PILL_BASE = `${WORKSPACE_PILL_SHAPE} rounded-md`;

export const WORKSPACE_PILL_SQUARE_BASE = `${WORKSPACE_PILL_SHAPE} rounded-none`;

export const WORKSPACE_PILL_INACTIVE =
  "bg-black text-muted-foreground hover:bg-black hover:text-foreground";

/** Forge Task Builder active pill: solid primary fill, no outline ring. */
export const WORKSPACE_PILL_ACTIVE_FORGE =
  "relative isolate overflow-hidden bg-primary text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] hover:bg-primary hover:text-black after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-[48%] after:bg-gradient-to-b after:from-white/30 after:to-transparent";

export const WORKSPACE_PILL_INACTIVE_FORGE =
  "bg-black text-muted-foreground hover:bg-black hover:text-white";

/** Neon green active tab with top gloss highlight. */
export const WORKSPACE_PILL_ACTIVE =
  "relative isolate overflow-hidden bg-primary text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] hover:bg-primary hover:text-black after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-[48%] after:bg-gradient-to-b after:from-white/30 after:to-transparent";

/** ToggleGroupItem: same inactive/active mapping when a toggle group is required. */
export const WORKSPACE_PILL_TOGGLE_ITEM = [
  WORKSPACE_PILL_BASE,
  "h-8 min-w-[4.5rem] border-0 shadow-none ring-offset-0",
  WORKSPACE_PILL_INACTIVE,
  "data-[state=on]:bg-primary data-[state=on]:text-black data-[state=on]:hover:bg-primary data-[state=on]:hover:text-black",
].join(" ");

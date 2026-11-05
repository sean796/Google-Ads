import { HOST_DIVIDER, HOST_SURFACE } from "../my-sites/my-sites-theme";

/** Square, hairline-outlined dark surfaces for the Pulse Host site profile page. */
export const PROFILE_TITLE_BAND = "flex h-14 shrink-0 items-center gap-3";
export const PROFILE_META_BAND = "flex h-10 shrink-0 items-center gap-3 text-muted-foreground";
export const PROFILE_BODY = "grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] gap-6";

export const PROFILE_NAV = "sticky top-0 flex flex-col gap-px self-start";
export const PROFILE_NAV_BTN =
  "flex h-9 items-center px-3 text-left text-muted-foreground hover:bg-white/[0.04] hover:text-foreground data-[active=true]:bg-white/[0.06] data-[active=true]:text-white data-[active=true]:shadow-[inset_2px_0_0] data-[active=true]:shadow-primary";

export const PROFILE_CARD = `flex flex-col ${HOST_SURFACE}`;
export const PROFILE_CARD_HEAD = `flex h-12 shrink-0 items-center justify-between gap-3 border-b ${HOST_DIVIDER} px-5`;
export const PROFILE_CARD_TITLE = "text-lg font-semibold tracking-tight text-white";

/** Open stat columns separated by hairline dividers; no nested boxes. */
export const PROFILE_STAT_GRID = `grid divide-x ${HOST_DIVIDER}`;
export const PROFILE_STAT_CELL = "flex min-h-[6.5rem] min-w-0 flex-col justify-center gap-1 px-5 py-4";
export const PROFILE_STAT_LABEL = "text-muted-foreground";
export const PROFILE_STAT_VALUE = "break-words text-2xl font-semibold tracking-tight tabular-nums text-white";
export const PROFILE_STAT_NOTE = "flex h-6 items-center gap-1.5 break-words text-muted-foreground";

export const PROFILE_ENV_SWITCH = "inline-flex h-8 shrink-0 items-center border border-white/10 p-0.5";
export const PROFILE_ENV_SWITCH_BTN =
  "inline-flex h-full min-w-[3.25rem] items-center justify-center px-3 font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground data-[active=true]:bg-white/10 data-[active=true]:text-white";

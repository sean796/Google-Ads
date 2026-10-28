import type { NotifyVariant } from "@/lib/app-notifications";
import { cn } from "@/lib/utils";

/** Green chip styling for the connected site selector in the manager top bar. */
export const MANAGER_HEADER_BADGE_SIZE = "h-9 min-h-9";

/** @deprecated Use MANAGER_DISPLAY_CONSOLE_ROW */
export const MANAGER_SITE_STRIP_CLASS =
  "inline-flex h-9 shrink-0 items-stretch rounded-none bg-zinc-900";

/** @deprecated No dividers in display console */
export const MANAGER_SITE_STRIP_DIVIDER = "w-px shrink-0 self-stretch bg-white/10";

/** @deprecated Use MANAGER_DISPLAY_SQUARE_POWER */
export const MANAGER_SITE_POWER_SEGMENT =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-primary text-black shadow-none";

/** @deprecated Use MANAGER_DISPLAY_NAME_LABEL */
export const MANAGER_SITE_NAME_SEGMENT =
  "px-2.5 text-base font-normal text-foreground whitespace-nowrap";

/** @deprecated Use MANAGER_DISPLAY_SQUARE_* */
export const MANAGER_SITE_STRIP_ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 bg-transparent shadow-none hover:bg-zinc-800";

export const MANAGER_DISPLAY_CONSOLE_ROW =
  "inline-flex h-9 shrink-0 items-stretch rounded-none";

export const MANAGER_DISPLAY_NAME_BAND =
  "flex h-9 min-w-0 flex-1 items-center bg-zinc-900 text-base font-sans font-normal text-foreground";

export const MANAGER_DISPLAY_NAME_LABEL =
  "min-w-0 flex-1 px-2.5 text-left whitespace-nowrap";

export const MANAGER_DISPLAY_NAME_CHEVRON_SLOT =
  "ml-auto flex w-7 shrink-0 items-center justify-center text-muted-foreground";

export const MANAGER_DISPLAY_SQUARE_BASE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border-0 shadow-none";

export const MANAGER_DISPLAY_SQUARE_POWER =
  "bg-primary text-black hover:bg-primary";

/** Cyan neon glow while entity site warm cache (inventory + GSC) is loading. */
export const MANAGER_DISPLAY_SITE_WARMING =
  "neo-pulse-site-warm-loading ring-1 ring-[hsl(var(--semantic-data)/0.45)]";

export const MANAGER_DISPLAY_SQUARE_POWER_WARMING =
  "bg-[hsl(var(--semantic-data))] text-black hover:bg-[hsl(var(--semantic-data))]";

export const MANAGER_DISPLAY_NAME_BAND_WARMING =
  "bg-[hsl(var(--semantic-data)/0.08)] text-[hsl(var(--semantic-data-foreground))]";

export const MANAGER_DISPLAY_SQUARE_NOTIFY_IDLE =
  "bg-zinc-800 text-muted-foreground hover:bg-zinc-700";

export const MANAGER_DISPLAY_SQUARE_KB =
  "bg-zinc-900 [&_svg]:size-6 [&_svg]:text-sky-400 hover:bg-zinc-800";

export const MANAGER_DISPLAY_SQUARE_KB_ACTIVE = "bg-zinc-800 text-foreground";

export const MANAGER_DISPLAY_SQUARE_RESET =
  "bg-zinc-900 text-red-500 hover:bg-zinc-800 hover:text-red-400";

export const MANAGER_DISPLAY_DROPDOWN_PANEL =
  "z-50 rounded-none border-0 bg-zinc-950 p-0 shadow-none overflow-y-auto overflow-x-hidden max-h-[min(70vh,36rem)]";

export function managerDisplayNotifySquareClass(variant: NotifyVariant | null): string {
  if (!variant) {
    return MANAGER_DISPLAY_SQUARE_NOTIFY_IDLE;
  }
  switch (variant) {
    case "success":
      return "bg-green-500/15 text-green-400 hover:bg-green-500/25";
    case "error":
      return "bg-red-500/15 text-red-400 hover:bg-red-500/25";
    case "warning":
      return "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25";
    case "loading":
      return MANAGER_DISPLAY_SQUARE_NOTIFY_IDLE;
    case "info":
    case "default":
    default:
      return "bg-zinc-800 text-foreground hover:bg-zinc-700";
  }
}

export function managerDisplayKbSquareClass(active: boolean): string {
  return cn(MANAGER_DISPLAY_SQUARE_BASE, MANAGER_DISPLAY_SQUARE_KB, active && MANAGER_DISPLAY_SQUARE_KB_ACTIVE);
}

export function managerDisplayResetSquareClass(): string {
  return cn(MANAGER_DISPLAY_SQUARE_BASE, MANAGER_DISPLAY_SQUARE_RESET, "[&_svg]:size-6");
}

export function managerDisplayErrorLogSquareClass(hasErrors: boolean): string {
  return cn(
    MANAGER_DISPLAY_SQUARE_BASE,
    hasErrors
      ? "bg-red-500/15 text-red-400 hover:bg-red-500/25 [&_svg]:size-5"
      : "bg-zinc-900 text-muted-foreground hover:bg-zinc-800 [&_svg]:size-5",
  );
}

export function managerDisplayNotifySquareButtonClass(variant: NotifyVariant | null): string {
  return cn(MANAGER_DISPLAY_SQUARE_BASE, managerDisplayNotifySquareClass(variant));
}

/** Semantic tint on the site name band when app notify or error log is active (no separate bell/tray). */
export function managerDisplayNameBandAlertClass(kind: NotifyVariant | "error" | null): string | false {
  if (!kind) return false;
  if (kind === "error") {
    return "bg-red-500/15 text-red-400";
  }
  switch (kind) {
    case "success":
      return "bg-green-500/15 text-green-400";
    case "warning":
      return "bg-amber-500/15 text-amber-400";
    case "info":
    case "default":
      return "bg-zinc-800 text-foreground";
    case "loading":
      return false;
    default:
      return false;
  }
}

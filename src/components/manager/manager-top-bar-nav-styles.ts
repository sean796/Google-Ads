import { cn } from "@/lib/utils";

/** Square grey nav controls for the manager top bar (#000 background). */
export const MANAGER_TOP_BAR_CLASS = "bg-black";

export const MANAGER_NAV_TRIGGER_BASE =
  "inline-flex items-center gap-2 rounded-none px-3 text-base font-normal outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-0";

export const MANAGER_NAV_TRIGGER_INACTIVE =
  "bg-ui-field text-muted-foreground hover:bg-ui-field-hover hover:text-foreground data-[state=open]:bg-ui-field-hover data-[state=open]:text-foreground";

export const MANAGER_NAV_TRIGGER_ACTIVE =
  "bg-ui-field-hover text-foreground hover:bg-ui-field-hover hover:text-foreground";

/** Above embedded sticky chrome (`z-[60]`) and docked Assist rail. */
export const MANAGER_NAV_DROPDOWN_Z = "z-[100]";

/** Same horizontal inset as top bar logo (`pl-3 md:pl-5` on the nav row). */
export const MANAGER_TOP_BAR_EDGE_INSET_CLASS = "pl-3 md:pl-5";

/** Site name console: trailing slot, vertically centered with mega menu (same row flex). */
export const MANAGER_SITE_CONSOLE_DOCK_CLASS =
  "pointer-events-auto z-[70] flex h-9 min-h-9 shrink-0 items-center self-center pr-3 md:pr-5";

/** Embedded manager top bar: fixed band height, controls vertically centered (no extra pt/pb). */
export const MANAGER_TOP_BAR_ROW_CLASS =
  "relative z-[1] flex w-full min-w-0 flex-nowrap items-center gap-2.5 min-h-[var(--neo-pulse-manager-sticky-nav-height)]";

/** Keep mega menu from running under the docked site console + shortcut rail. */
export const MANAGER_TOP_BAR_MENU_RAIL_RESERVE_CLASS =
  "min-w-0 flex-1 pr-[var(--neo-pulse-shortcut-rail-width)]";

export const MANAGER_NAV_DROPDOWN_PANEL = cn(
  MANAGER_NAV_DROPDOWN_Z,
  "min-w-[16.5rem] rounded-none border border-white/[0.06] bg-black p-0 shadow-none text-popover-foreground",
);

export const MANAGER_NAV_DROPDOWN_ITEM_BASE =
  "cursor-pointer rounded-none px-3 py-2.5 text-base font-normal outline-none transition-colors focus:!bg-ui-field-hover/90 focus:!text-foreground data-[highlighted]:!bg-ui-field-hover/90 data-[highlighted]:!text-foreground";

/** Subtle stripe for rows; active row matches workspace pill (primary + black text). */
export const managerNavDropdownRowClass = (index: number, selected: boolean) =>
  cn(
    !selected && (index % 2 === 0 ? "bg-black" : "bg-ui-field/55"),
    !selected && "text-muted-foreground hover:bg-ui-field-hover/90 hover:text-foreground",
    selected &&
      "bg-primary text-black hover:bg-primary hover:text-black focus:!bg-primary focus:!text-black data-[highlighted]:!bg-primary data-[highlighted]:!text-black",
  );

/** Square grey icon buttons on the top bar (Knowledge Base, etc.). */
export const MANAGER_TOP_BAR_ICON_BTN =
  "rounded-none border-0 bg-ui-field text-muted-foreground shadow-none hover:bg-ui-field-hover hover:text-foreground";

export const MANAGER_TOP_BAR_ICON_BTN_ACTIVE =
  "bg-ui-field-hover text-foreground ring-1 ring-inset ring-white/10 hover:bg-ui-field-hover";

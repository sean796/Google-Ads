import { cn } from "@/lib/utils";
import type { PpcCampaignRow } from "@/lib/ppc/google-ads-types";

/** Fixed grid size; never tied to toolbar Campaigns input. */
export const PPC_GOOGLE_PLACEHOLDER_ROW_COUNT = 18;

export function ppcGoogleGridRowCount(realCampaignCount: number): number {
  return Math.max(PPC_GOOGLE_PLACEHOLDER_ROW_COUNT, realCampaignCount);
}

export function buildPpcGoogleGridRows(campaigns: PpcCampaignRow[]): Array<PpcCampaignRow | null> {
  const totalRows = ppcGoogleGridRowCount(campaigns.length);
  return Array.from({ length: totalRows }, (_, index) => campaigns[index] ?? null);
}

export const PPC_CAMPAIGN_ROW_GRID_COLS =
  "grid-cols-[minmax(6.5rem,7.5rem)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(5.5rem,0.55fr)_7rem]";

export const PPC_CAMPAIGN_ROW_GRID_CLASS = cn(
  "grid w-full min-w-0 min-h-[3rem] items-center gap-x-2 sm:min-h-[3.25rem] sm:gap-x-3",
  PPC_CAMPAIGN_ROW_GRID_COLS,
);

export const PPC_CAMPAIGN_ROW_FIELD_CELL =
  "flex min-w-0 w-full items-center border-0 bg-transparent px-0 py-0";

/** Ad group / accordion header body spans cols 1–4 so actions land in col 5 with campaign rows. */
export const PPC_ROW_CONTENT_SPAN_CLASS = "col-span-5 flex min-w-0 items-center gap-2 pl-[5px]";

export const PPC_ROW_END_RAIL_ICON_SLOT = "inline-flex h-8 w-8 shrink-0 items-center justify-center";

export const PPC_ROW_END_RAIL_CLASS = cn(
  "flex w-full flex-nowrap items-center justify-end gap-1 sm:gap-2",
);

export const PPC_DETAILS_ACCORDION_STACK = "flex flex-col gap-2.5 rounded-none pt-1";

export const PPC_DETAILS_TRIGGER = cn(
  "grid w-full min-w-0 min-h-[3rem] items-center gap-x-2 rounded-none border-0 bg-black py-1.5 text-left text-base font-medium text-white sm:min-h-[3.25rem] sm:gap-x-3",
  PPC_CAMPAIGN_ROW_GRID_COLS,
);

export const PPC_DETAILS_SUBTRIGGER = cn(PPC_DETAILS_TRIGGER, "bg-ui-field/80");

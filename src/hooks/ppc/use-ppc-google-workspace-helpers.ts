import type { PpcCampaignRow } from "@/lib/ppc/google-ads-types";
import { ensurePpcRowDailyBudget } from "@/lib/ppc/ppc-row-generate-patch";

export function stripPpcCampaignRowErrors(rows: PpcCampaignRow[]): PpcCampaignRow[] {
  return rows.map((row) =>
    ensurePpcRowDailyBudget(
      row.errorMessage || row.status === "error"
        ? {
            ...row,
            errorMessage: undefined,
            status: row.status === "error" ? (row.campaign ? "ready" : "idle") : row.status,
          }
        : row,
    ),
  );
}

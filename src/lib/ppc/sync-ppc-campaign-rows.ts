import {
  createIdlePpcCampaignRow,
  resolvePpcRowAdGroupKeywords,
  syncPpcAdGroupKeywordsToCount,
  type PpcCampaignRow,
} from "@/lib/ppc/google-ads-types";

export function syncPpcCampaignRowsToCount(
  rows: PpcCampaignRow[],
  targetCount: number,
  adGroupCount: number,
): PpcCampaignRow[] {
  const next = [...rows];

  while (next.length < targetCount) {
    next.push(createIdlePpcCampaignRow(adGroupCount));
  }

  while (next.length > targetCount) {
    const last = next[next.length - 1];
    if (last?.status === "idle" && !last.campaign) {
      next.pop();
    } else {
      break;
    }
  }

  return next.map((row) => ({
    ...row,
    adGroupKeywords: resolvePpcRowAdGroupKeywords(row, adGroupCount),
  }));
}

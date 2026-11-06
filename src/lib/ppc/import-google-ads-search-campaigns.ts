import type { PpcCampaign, PpcCampaignRow, PpcResponsiveSearchAd } from "@/lib/ppc/google-ads-types";
import {
  clampPpcCampaignCount,
  createIdlePpcCampaignRow,
  createPpcCampaignRowId,
  syncPpcAdGroupKeywordsToCount,
} from "@/lib/ppc/google-ads-types";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";

export type GoogleAdsImportedSearchCampaign = {
  campaignId: string;
  name: string;
  status: string;
  dailyBudget: number;
  campaign: PpcCampaign;
};

function normalizeAd(raw: unknown, index: number): PpcResponsiveSearchAd | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const headlines = Array.isArray(row.headlines)
    ? row.headlines.filter((h): h is string => typeof h === "string" && h.trim().length > 0).map((h) => h.trim())
    : [];
  const descriptions = Array.isArray(row.descriptions)
    ? row.descriptions.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim())
    : [];
  const finalUrl = typeof row.finalUrl === "string" ? row.finalUrl.trim() : "";
  if (headlines.length === 0 && descriptions.length === 0 && !finalUrl) return null;
  return {
    id: typeof row.id === "string" && row.id ? row.id : `import-ad-${index}`,
    headlines,
    descriptions,
    finalUrl,
    path1: typeof row.path1 === "string" && row.path1.trim() ? row.path1.trim() : undefined,
    path2: typeof row.path2 === "string" && row.path2.trim() ? row.path2.trim() : undefined,
  };
}

function normalizeImportedCampaign(raw: unknown): GoogleAdsImportedSearchCampaign | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const campaignId = typeof row.campaignId === "string" ? row.campaignId.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!campaignId || !name || !/^\d+$/.test(campaignId)) return null;

  const campaignRaw = row.campaign;
  if (!campaignRaw || typeof campaignRaw !== "object") return null;
  const c = campaignRaw as Record<string, unknown>;
  const adGroupsRaw = Array.isArray(c.adGroups) ? c.adGroups : [];
  const adGroups = adGroupsRaw
    .map((ag, agIndex) => {
      if (!ag || typeof ag !== "object") return null;
      const group = ag as Record<string, unknown>;
      const groupName = typeof group.name === "string" ? group.name.trim() : "";
      if (!groupName) return null;
      const keywords = Array.isArray(group.keywords)
        ? group.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
        : [];
      const adsRaw = Array.isArray(group.ads) ? group.ads : [];
      const ads = adsRaw
        .map((ad, adIndex) => normalizeAd(ad, adIndex))
        .filter((ad): ad is PpcResponsiveSearchAd => ad !== null);
      const landingPageUrl =
        typeof group.landingPageUrl === "string" && group.landingPageUrl.trim()
          ? group.landingPageUrl.trim()
          : ads[0]?.finalUrl ?? "";
      return {
        id: typeof group.id === "string" && group.id ? group.id : `import-ag-${agIndex}`,
        name: groupName,
        landingPageUrl,
        keywords,
        ads,
      };
    })
    .filter((ag): ag is PpcCampaign["adGroups"][number] => ag !== null);

  if (adGroups.length === 0) return null;

  const dailyBudget =
    typeof row.dailyBudget === "number" && Number.isFinite(row.dailyBudget) && row.dailyBudget >= 1
      ? Math.round(row.dailyBudget)
      : 1;

  return {
    campaignId,
    name,
    status: typeof row.status === "string" ? row.status : "",
    dailyBudget,
    campaign: {
      name: typeof c.name === "string" && c.name.trim() ? c.name.trim() : name,
      network: "SEARCH",
      adGroups,
    },
  };
}

export async function loadGoogleAdsSearchCampaignImports(customerId: string): Promise<GoogleAdsImportedSearchCampaign[]> {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  if (normalizedCustomerId.length !== 10) {
    throw new Error("Set a 10-digit Google Ads customer ID on this property before pulling campaigns.");
  }

  const res = await fetch(backendApiUrl("/google-ads/import-search-campaigns"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ customerId: normalizedCustomerId }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    campaigns?: unknown[];
  };

  if (!res.ok || data.success !== true) {
    const message =
      typeof data.error === "string" && data.error.trim() ? data.error.trim() : "Failed to import Google Ads campaigns.";
    throw new Error(message);
  }

  const out: GoogleAdsImportedSearchCampaign[] = [];
  for (const item of data.campaigns ?? []) {
    const normalized = normalizeImportedCampaign(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

function rowFromImport(item: GoogleAdsImportedSearchCampaign): PpcCampaignRow {
  const focusKeyword = item.campaign.adGroups[0]?.keywords[0] ?? item.campaign.adGroups[0]?.name ?? "";
  const landingPageUrl = item.campaign.adGroups[0]?.landingPageUrl ?? "";
  const adGroupKeywords = item.campaign.adGroups.map((ag) => ag.name);
  const adGroupCount = adGroupKeywords.length;

  return {
    ...createIdlePpcCampaignRow(adGroupCount),
    id: createPpcCampaignRowId(),
    createdAt: new Date().toISOString(),
    adsCampaignId: item.campaignId,
    googleAdsCampaignStatus: item.status || undefined,
    campaignName: item.name,
    dailyBudget: item.dailyBudget,
    campaign: item.campaign,
    status: "ready",
    focusKeyword,
    landingPageUrl,
    adGroupKeywords: syncPpcAdGroupKeywordsToCount(adGroupKeywords, adGroupCount),
  };
}

function applyImportToRow(row: PpcCampaignRow, item: GoogleAdsImportedSearchCampaign): PpcCampaignRow {
  const focusKeyword = item.campaign.adGroups[0]?.keywords[0] ?? item.campaign.adGroups[0]?.name ?? "";
  const landingPageUrl = item.campaign.adGroups[0]?.landingPageUrl ?? "";
  const adGroupKeywords = item.campaign.adGroups.map((ag) => ag.name);
  const adGroupCount = adGroupKeywords.length;

  return {
    ...row,
    adsCampaignId: item.campaignId,
    googleAdsCampaignStatus: item.status || undefined,
    campaignName: item.name,
    dailyBudget: item.dailyBudget,
    campaign: item.campaign,
    status: "ready",
    errorMessage: undefined,
    focusKeyword: focusKeyword || row.focusKeyword,
    landingPageUrl: landingPageUrl || row.landingPageUrl,
    adGroupKeywords: syncPpcAdGroupKeywordsToCount(adGroupKeywords, adGroupCount),
  };
}

function isEmptyPpcRow(row: PpcCampaignRow): boolean {
  return !row.campaign && !row.adsCampaignId?.trim() && row.status === "idle";
}

export function mergeGoogleAdsImportsIntoPpcRows(
  existingRows: PpcCampaignRow[],
  imported: GoogleAdsImportedSearchCampaign[],
): { rows: PpcCampaignRow[]; importedCount: number; updatedCount: number } {
  if (imported.length === 0) {
    return { rows: existingRows, importedCount: 0, updatedCount: 0 };
  }

  const byAdsId = new Map<string, number>();
  existingRows.forEach((row, index) => {
    const id = row.adsCampaignId?.trim();
    if (id) byAdsId.set(id, index);
  });

  let importedCount = 0;
  let updatedCount = 0;
  const nextRows = [...existingRows];
  const emptySlotIndexes: number[] = [];
  nextRows.forEach((row, index) => {
    if (isEmptyPpcRow(row)) emptySlotIndexes.push(index);
  });

  for (const item of imported) {
    const existingIndex = byAdsId.get(item.campaignId);
    if (existingIndex !== undefined) {
      updatedCount += 1;
      nextRows[existingIndex] = applyImportToRow(nextRows[existingIndex]!, item);
      continue;
    }

    importedCount += 1;
    const filled = rowFromImport(item);
    const slot = emptySlotIndexes.shift();
    if (slot !== undefined) {
      nextRows[slot] = { ...filled, id: nextRows[slot]!.id };
      byAdsId.set(item.campaignId, slot);
    } else {
      byAdsId.set(item.campaignId, nextRows.length);
      nextRows.push(filled);
    }
  }

  return { rows: nextRows, importedCount, updatedCount };
}

export function ppcCampaignCountAfterImport(rows: PpcCampaignRow[], currentCount: number): number {
  const filled = rows.filter((r) => r.campaign || r.adsCampaignId?.trim()).length;
  return clampPpcCampaignCount(Math.max(currentCount, filled));
}

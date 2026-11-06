import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";
import {
  normalizePpcCampaignInsights,
  type PpcCampaignInsights,
} from "@/lib/ppc/ppc-campaign-insights-types";

export type LoadPpcCampaignInsightsOptions = {
  customerId: string;
  campaignId: string;
  startDate: string;
  endDate: string;
  compareStartDate?: string;
  compareEndDate?: string;
  signal?: AbortSignal;
};

export async function loadPpcCampaignInsights(
  options: LoadPpcCampaignInsightsOptions,
): Promise<PpcCampaignInsights> {
  const customerId = normalizeGoogleAdsCustomerId(options.customerId);
  const campaignId = options.campaignId.trim();
  if (!customerId) {
    throw new Error("Google Ads customer ID is required for campaign insights.");
  }
  if (!campaignId || !/^\d+$/.test(campaignId)) {
    throw new Error("A numeric Google Ads campaign ID is required for campaign insights.");
  }

  const body: Record<string, string> = {
    customerId,
    campaignId,
    startDate: options.startDate,
    endDate: options.endDate,
  };
  if (options.compareStartDate && options.compareEndDate) {
    body.compareStartDate = options.compareStartDate;
    body.compareEndDate = options.compareEndDate;
  }

  const res = await fetch(backendApiUrl("/google-ads/fetch-campaign-insights"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: options.signal,
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    customerId?: string;
    campaignId?: string;
  };

  if (!res.ok || data.success !== true) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Failed to load campaign insights.";
    throw new Error(message);
  }

  return normalizePpcCampaignInsights(data);
}

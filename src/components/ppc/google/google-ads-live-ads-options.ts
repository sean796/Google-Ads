import type { PpcCampaign } from "@/lib/ppc/google-ads-types";
import type { PpcCampaignInsights, PpcCampaignStructureAd } from "@/lib/ppc/ppc-campaign-insights-types";

function fallbackAdsFromCampaign(campaign: PpcCampaign | undefined): PpcCampaignStructureAd[] {
  if (!campaign) return [];
  const out: PpcCampaignStructureAd[] = [];
  for (const ag of campaign.adGroups) {
    ag.ads.forEach((ad, adIndex) => {
      const adId = ad.id?.trim() || `local-${ag.id}-${adIndex}`;
      out.push({
        adGroupId: ag.id,
        adGroupName: ag.name,
        adId,
        status: "",
        label: `${ag.name} · Responsive search ad ${adIndex + 1}`,
      });
    });
  }
  return out;
}

export function listPpcLiveAdsOptions(
  insights: PpcCampaignInsights | null,
  campaign: PpcCampaign | undefined,
): PpcCampaignStructureAd[] {
  if (insights?.structureAds.length) return insights.structureAds;
  return fallbackAdsFromCampaign(campaign);
}

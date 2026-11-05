
import type { PpcCampaign } from "@/lib/ppc/google-ads-types";
import { ppcAdDailySeriesKey } from "@/lib/ppc/ppc-campaign-insights-scope";
import type { PpcCampaignInsights, PpcCampaignStructureAd } from "@/lib/ppc/ppc-campaign-insights-types";
import { SelectField } from "@/ui";

const NONE_VALUE = "__none__";

export type GoogleAdsLiveAdsSelectProps = {
  insights: PpcCampaignInsights | null;
  campaign: PpcCampaign | undefined;
  selectedLiveAdKey: string | null;
  onSelectedLiveAdKeyChange: (key: string | null, ad: PpcCampaignStructureAd | null) => void;
};

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

export function GoogleAdsLiveAdsSelect({
  insights,
  campaign,
  selectedLiveAdKey,
  onSelectedLiveAdKeyChange,
}: GoogleAdsLiveAdsSelectProps) {
  const options = listPpcLiveAdsOptions(insights, campaign);
  if (options.length === 0) return null;

  return (
    <SelectField
      placeholder="Google Ads in this campaign"
      value={selectedLiveAdKey ?? NONE_VALUE}
      onValueChange={(value) => {
        if (value === NONE_VALUE) {
          onSelectedLiveAdKeyChange(null, null);
          return;
        }
        const ad = options.find((row) => ppcAdDailySeriesKey(row.adGroupId, row.adId) === value) ?? null;
        onSelectedLiveAdKeyChange(value, ad);
      }}
      options={[
        { value: NONE_VALUE, label: "All ads (level from focus)" },
        ...options.map((row) => ({ value: ppcAdDailySeriesKey(row.adGroupId, row.adId), label: row.label })),
      ]}
      width="full"
    />
  );
}
import { describe, expect, it } from "vitest";
import {
  ppcCampaignInsightsAverageCpcMicros,
  ppcCampaignInsightsTrafficStatsLabel,
} from "@/lib/ppc/ppc-campaign-insights-display";

describe("ppc-campaign-insights-display", () => {
  it("derives CPC from cost and clicks when averageCpc is zero", () => {
    expect(
      ppcCampaignInsightsAverageCpcMicros({
        impressions: 10,
        clicks: 2,
        costMicros: 4_000_000,
        ctr: 0,
        averageCpc: 0,
        conversions: 0,
        conversionsValue: 0,
      }),
    ).toBe(
      2_000_000,
    );
  });

  it("formats traffic stats with spend and CPC", () => {
    const label = ppcCampaignInsightsTrafficStatsLabel({
      impressions: 100,
      clicks: 10,
      costMicros: 50_000_000,
      averageCpc: 5_000_000,
      ctr: 0.1,
      conversions: 0,
      conversionsValue: 0,
    });
    expect(label).toContain("10 clk");
    expect(label).toContain("100 imp");
    expect(label).toContain("$50.00");
    expect(label).toContain("CPC $5.00");
  });
});

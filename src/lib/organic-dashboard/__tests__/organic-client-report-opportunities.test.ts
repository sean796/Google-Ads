import { describe, expect, it } from "vitest";
import {
  isGoogleAdsClientReportOpportunity,
  partitionClientReportOpportunities,
} from "@/lib/organic-dashboard/organic-client-report-opportunities";

describe("organic-client-report-opportunities", () => {
  it("routes paid-search metric rows to Google Ads opportunities", () => {
    const ads = {
      rank: 1,
      label: "Restore paid search lead efficiency",
      why: "Leads fell while spend rose.",
      comparisonRows: [
        {
          metric: "Leads (Google Ads)",
          comparePeriodValue: "258",
          primaryPeriodValue: "191",
        },
      ],
      metrics: "",
      action: "",
    };
    const seo = {
      rank: 2,
      label: "GSC clicks",
      why: "Visibility shifted.",
      comparisonRows: [
        {
          metric: "Total clicks (GSC)",
          comparePeriodValue: "876",
          primaryPeriodValue: "731",
        },
      ],
      metrics: "",
      action: "",
    };
    expect(isGoogleAdsClientReportOpportunity(ads)).toBe(true);
    expect(isGoogleAdsClientReportOpportunity(seo)).toBe(false);
    const split = partitionClientReportOpportunities([seo, ads]);
    expect(split.seoOpportunities).toHaveLength(1);
    expect(split.googleAdsOpportunities).toHaveLength(1);
  });
});

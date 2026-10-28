import { describe, expect, it } from "vitest";
import { EMPTY_CLIENT_REPORT_HIGHLIGHTS } from "@/lib/organic-dashboard/organic-client-report-content";
import { clientReportDeckNeedsAgentHighlights } from "@/lib/organic-dashboard/organic-client-report-highlights-status";

describe("clientReportDeckNeedsAgentHighlights", () => {
  it("returns true when deck highlights are empty", () => {
    expect(
      clientReportDeckNeedsAgentHighlights(EMPTY_CLIENT_REPORT_HIGHLIGHTS, { hasGoogleAds: false }),
    ).toBe(true);
  });

  it("returns false when agent fields are populated", () => {
    expect(
      clientReportDeckNeedsAgentHighlights(
        {
          executiveSummary: "Summary.",
          keyTakeaways: ["One.", "Two."],
          performanceNarrative: ["GA4.", "GSC."],
          keywordNarrative: ["Queries."],
          googleAdsNarrative: [],
          localGridNarrative: [],
          topOpportunities: [
            {
              rank: 1,
              label: "Opportunity",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
            {
              rank: 2,
              label: "Opportunity 2",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
            {
              rank: 3,
              label: "Opportunity 3",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
          ],
        },
        { hasGoogleAds: false },
      ),
      ).toBe(false);
  });

  it("returns true when local grid is on the report but map narrative is missing", () => {
    expect(
      clientReportDeckNeedsAgentHighlights(
        {
          executiveSummary: "Summary.",
          keyTakeaways: ["One.", "Two."],
          performanceNarrative: ["GA4.", "GSC."],
          keywordNarrative: ["Queries."],
          googleAdsNarrative: [],
          localGridNarrative: [],
          topOpportunities: [
            {
              rank: 1,
              label: "Opportunity",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
            {
              rank: 2,
              label: "Opportunity 2",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
            {
              rank: 3,
              label: "Opportunity 3",
              why: "Because.",
              comparisonRows: [
                { metric: "Clicks", comparePeriodValue: "1", primaryPeriodValue: "2" },
              ],
            },
          ],
        },
        { hasGoogleAds: false },
        { hasLocalGrid: true },
      ),
    ).toBe(true);
  });
});

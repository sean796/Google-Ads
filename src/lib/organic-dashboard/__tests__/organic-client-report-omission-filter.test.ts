import { describe, expect, it } from "vitest";
import {
  cleanTakeawayBulletText,
  isNonExistentSectionOmissionStatement,
  stripNonExistentOmissionClauses,
  filterHighlightsTakeaways,
  sanitizeExecutiveSummaryText,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";

describe("stripNonExistentOmissionClauses", () => {
  it("strips leading negative preamble clauses about absent comparison periods and key events", () => {
    // User's exact screenshot case
    const raw =
      "With no comparison period and no key events, the immediate opportunity for KWB lies in converting strong impression volume and near-first-page rankings into measurable actions.";
    const stripped = stripNonExistentOmissionClauses(raw);
    expect(stripped).toBe(
      "The immediate opportunity for KWB lies in converting strong impression volume and near-first-page rankings into measurable actions.",
    );
  });

  it("strips trailing clauses reporting zero key events or absent comparison periods", () => {
    const raw =
      "Google Search generated 334 clicks from 76.5K impressions, while recording no key events.";
    const stripped = stripNonExistentOmissionClauses(raw);
    expect(stripped).toBe("Google Search generated 334 clicks from 76.5K impressions.");
  });

  it("strips clauses about absent comparison periods", () => {
    const raw =
      "Without a comparison period, primary keyword visibility concentrated on brand terms.";
    const stripped = stripNonExistentOmissionClauses(raw);
    expect(stripped).toBe("Primary keyword visibility concentrated on brand terms.");
  });
});

describe("isNonExistentSectionOmissionStatement", () => {
  it("identifies negative disclaimer statements for absent Google Ads, Semrush, and Local Map", () => {
    // User's exact case
    expect(
      isNonExistentSectionOmissionStatement(
        "No Google Ads data is available for this reporting period.",
      ),
    ).toBe(true);

    expect(isNonExistentSectionOmissionStatement("No Google Ads reported.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("No Google Ads data was reported.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("Google Ads is omitted from this report.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("Google Ads was not configured.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("Google Ads unavailable (no account connected).")).toBe(true);
    expect(
      isNonExistentSectionOmissionStatement(
        "No Google Ads totals were supplied, so paid search is omitted from this report.",
      ),
    ).toBe(true);
    expect(isNonExistentSectionOmissionStatement("Paid search is omitted from this report.")).toBe(true);

    expect(isNonExistentSectionOmissionStatement("No Semrush data was reported.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("No Semrush data is available.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("No local map data was recorded.")).toBe(true);
    expect(isNonExistentSectionOmissionStatement("No local grid scan was found.")).toBe(true);
  });

  it("identifies negative disclaimer statements for absent comparison periods and zero/untracked key events", () => {
    expect(
      isNonExistentSectionOmissionStatement(
        "No key events were recorded from organic search sessions, so conversion tracking or landing page alignment may need attention.",
      ),
    ).toBe(true);

    expect(
      isNonExistentSectionOmissionStatement(
        "Key events attributed to organic search sessions registered at zero, so no conversions were tracked during this period.",
      ),
    ).toBe(true);

    expect(
      isNonExistentSectionOmissionStatement(
        "No comparison period is available to evaluate period-over-period growth.",
      ),
    ).toBe(true);

    expect(
      isNonExistentSectionOmissionStatement(
        "Comparison period is unavailable for this property.",
      ),
    ).toBe(true);
  });

  it("does not flag positive metric findings or active channel statements", () => {
    // Active GA4 sessions finding
    expect(
      isNonExistentSectionOmissionStatement(
        "Organic search delivered 533 sessions to KWB, of which 310 were engaged.",
      ),
    ).toBe(false);

    // Active Google Ads finding
    expect(
      isNonExistentSectionOmissionStatement(
        "Google Ads delivered 32 leads with a cost per lead of $24.10.",
      ),
    ).toBe(false);

    // Active Semrush finding
    expect(
      isNonExistentSectionOmissionStatement(
        "Semrush branded searches represent 64% of total organic query volume.",
      ),
    ).toBe(false);

    // Active Local Grid finding
    expect(
      isNonExistentSectionOmissionStatement(
        "Local map visibility achieved a 74% TARP score across the primary service zone.",
      ),
    ).toBe(false);
  });
});

describe("filterHighlightsTakeaways", () => {
  it("removes negative omission statements and cleans omission preamble clauses", () => {
    const takeaways = [
      "Organic search delivered 533 sessions to KWB, of which 310 were engaged.",
      "Google Search generated 334 clicks from 76.5K impressions.",
      "No Google Ads data is available for this reporting period.",
      "No key events were recorded from organic search sessions, so conversion tracking or landing page alignment may need attention.",
      "With no comparison period and no key events, the immediate opportunity for KWB lies in converting strong impression volume and near-first-page rankings into measurable actions.",
    ];
    const filtered = filterHighlightsTakeaways(takeaways);
    expect(filtered).toHaveLength(3);
    expect(filtered).not.toContain("No Google Ads data is available for this reporting period.");
    expect(filtered).not.toContain(
      "No key events were recorded from organic search sessions, so conversion tracking or landing page alignment may need attention.",
    );
    expect(filtered[2]).toBe(
      "The immediate opportunity for KWB lies in converting strong impression volume and near-first-page rankings into measurable actions.",
    );
  });

  it("removes any references to non-existent channels when option is false", () => {
    const takeaways = [
      "Organic search delivered 533 sessions.",
      "Google Ads generated 15 leads.",
      "Semrush branded queries accounted for 40%.",
      "Local grid visibility was in top 3.",
    ];

    const filteredNoAds = filterHighlightsTakeaways(takeaways, { hasGoogleAds: false });
    expect(filteredNoAds.some((t) => t.includes("Google Ads"))).toBe(false);
    expect(filteredNoAds.some((t) => t.includes("Semrush"))).toBe(true);

    const filteredOnlyOrganic = filterHighlightsTakeaways(takeaways, {
      hasGoogleAds: false,
      hasSemrush: false,
      hasLocalGrid: false,
    });
    expect(filteredOnlyOrganic).toEqual(["Organic search delivered 533 sessions."]);
  });
});

describe("sanitizeExecutiveSummaryText", () => {
  it("strips negative omission sentences from executive summary", () => {
    const summary =
      "KWB drew 533 organic search sessions with strong engagement. No Google Ads data is available for this reporting period. No key events were recorded from organic search sessions.";
    const cleaned = sanitizeExecutiveSummaryText(summary);
    expect(cleaned).toBe("KWB drew 533 organic search sessions with strong engagement.");
  });

  it("strips references to channels that do not exist", () => {
    const summary =
      "Organic sessions rose 12% across GA4. Paid search on Google Ads generated additional traffic.";
    const cleaned = sanitizeExecutiveSummaryText(summary, { hasGoogleAds: false });
    expect(cleaned).toBe("Organic sessions rose 12% across GA4.");
  });
});

describe("buildOrganicClientReportContent with non-existent Google Ads and key events", () => {
  it("omits Google Ads and key event negative disclaimers from client report content", () => {
    const vm = buildOrganicDashboardViewModel(undefined, { showCompare: false });
    // ViewModel has no Google Ads
    expect(vm.hasGoogleAds).toBe(false);

    const content = buildOrganicClientReportContent({
      viewModel: vm,
      highlights: {
        executiveSummary:
          "KWB drew 533 organic search sessions with a 58.2% engagement rate and 334 Google Search clicks from 76.5K impressions.",
        keyTakeaways: [
          "Organic search delivered 533 sessions to KWB, of which 310 were engaged, producing a 58.2% engagement rate.",
          "Google Search generated 334 clicks from 76.5K impressions, a 0.4% average CTR, with an average position of 11.4.",
          "No key events were recorded from organic search sessions, so conversion tracking or landing page alignment may need attention.",
          "No Google Ads data is available for this reporting period.",
        ],
        performanceNarrative: [],
        keywordNarrative: [],
        googleAdsNarrative: [],
        localGridNarrative: [],
        topOpportunities: [],
      },
      siteName: "KWB",
      siteUrl: "https://kwbllp.com",
      showCompare: false,
      preparedOn: "October 27, 2026",
    });

    expect(content.showGoogleAdsSection).toBe(false);
    expect(content.highlights.keyTakeaways).toHaveLength(2);
    expect(content.highlights.keyTakeaways).toEqual([
      "Organic search delivered 533 sessions to KWB, of which 310 were engaged, producing a 58.2% engagement rate.",
      "Google Search generated 334 clicks from 76.5K impressions, a 0.4% average CTR, with an average position of 11.4.",
    ]);
    expect(
      content.highlights.keyTakeaways.some((t) => t.toLowerCase().includes("google ads")),
    ).toBe(false);
    expect(
      content.highlights.keyTakeaways.some((t) => t.toLowerCase().includes("key events")),
    ).toBe(false);
  });
});

describe("cleanTakeawayBulletText", () => {
  it("strips leading unicode bullets and spaces", () => {
    expect(
      cleanTakeawayBulletText("• Google Search visibility remained solid for KWB."),
    ).toBe("Google Search visibility remained solid for KWB.");
    expect(
      cleanTakeawayBulletText("∙ The immediate opportunity for KWB lies in conversions."),
    ).toBe("The immediate opportunity for KWB lies in conversions.");
  });

  it("strips leading hyphens and asterisks when followed by spaces", () => {
    expect(
      cleanTakeawayBulletText("- Google Search visibility remained solid."),
    ).toBe("Google Search visibility remained solid.");
    expect(
      cleanTakeawayBulletText("* First page rankings convert into action."),
    ).toBe("First page rankings convert into action.");
  });

  it("strips numbered bullet prefixes", () => {
    expect(cleanTakeawayBulletText("1. Organic search grew.")).toBe("Organic search grew.");
    expect(cleanTakeawayBulletText("2) Clicks increased.")).toBe("Clicks increased.");
  });

  it("preserves negative percentages and numbers without leading spaces after dash", () => {
    expect(cleanTakeawayBulletText("-12% change in keyword rankings.")).toBe("-12% change in keyword rankings.");
  });

  it("handles empty or non-string input safely", () => {
    expect(cleanTakeawayBulletText("")).toBe("");
  });
});

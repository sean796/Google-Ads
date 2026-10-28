import { describe, expect, it } from "vitest";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  organicClientReportMarkdownFileName,
  serializeOrganicClientReportMarkdown,
} from "@/lib/organic-dashboard/organic-client-report-markdown";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

const bundle: OrganicDashboardBundleResponse = {
  success: true,
  meta: {
    fetchedAt: "2026-01-01T00:00:00Z",
    primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
    compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
  },
  ga4: {
    organicAcquisition: {
      current: { sessions: 100, engagedSessions: 50, engagementRate: 0.5, averageSessionDurationSec: 60, keyEvents: 5, eventCount: 10, eventsPerSession: 0.1 },
      previous: { sessions: 80, engagedSessions: 40, engagementRate: 0.4, averageSessionDurationSec: 55, keyEvents: 4, eventCount: 8, eventsPerSession: 0.1 },
    },
  },
  gsc: {
    stats: {
      currentPeriod: { startDate: "2026-09-01", endDate: "2026-09-30", clicks: 881, impressions: 73432, ctr: 0.012, avgPosition: 13.2 },
      comparisonPeriod: { startDate: "2026-08-01", endDate: "2026-08-31", clicks: 830, impressions: 88428, ctr: 0.009, avgPosition: 16.2 },
      comparisons: { clicksChangePercent: 6.1 },
      topKeywords: [{ query: "brand blinds", currentRanking: 3, previousRanking: 5, rankingChange: 2, currentClicks: 40, previousClicks: 30, clicksChange: 10, currentImpressions: 500, previousImpressions: 450, impressionsChange: 50 }],
    },
  },
  sources: { ga4: "ok", gsc: "ok", semrush: "skipped" },
};

describe("serializeOrganicClientReportMarkdown", () => {
  it("includes title, insights, and performance section tables", () => {
    const vm = buildOrganicDashboardViewModel(bundle, { showCompare: true });
    const content = buildOrganicClientReportContent({
      viewModel: vm,
      highlights: {
        executiveSummary: "Traffic improved in September.",
        keyTakeaways: ["Clicks rose.", "Sessions grew."],
        performanceNarrative: ["GA4 narrative."],
        keywordNarrative: ["Keyword narrative."],
        googleAdsNarrative: [],
        topOpportunities: [],
      },
      siteName: "Blind Magic",
      siteUrl: "https://blindmagic.com",
      showCompare: true,
      preparedOn: "2026-10-13",
    });

    const md = serializeOrganicClientReportMarkdown(content);
    expect(md).toContain("# Blind Magic Organic Performance");
    expect(md).toContain("## Insights");
    expect(md).toContain("Traffic improved in September.");
    expect(md).toContain("## Performance summary");
    expect(md).toContain("## Keyword performance");
    expect(md).toContain("brand blinds");
  });
});

describe("organicClientReportMarkdownFileName", () => {
  it("uses md extension", () => {
    expect(organicClientReportMarkdownFileName("Acme")).toBe("Acme Organic Performance.md");
  });
});

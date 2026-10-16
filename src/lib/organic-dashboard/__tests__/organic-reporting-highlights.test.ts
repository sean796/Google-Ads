import { describe, expect, it } from "vitest";
import {
  buildOrganicReportingHighlightsSnapshot,
  buildPlaceholderOrganicReportingHighlights,
  normalizeOrganicReportingHighlights,
  parseOrganicReportingHighlightsPayload,
  resolveClientReportHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import { deckHighlightsNeedsAgentNarratives } from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

function sampleOpportunity(rank: number, label: string) {
  return {
    rank,
    label,
    why: "This supports lead quality.",
    comparisonRows: [
      {
        metric: "Clicks",
        comparePeriodValue: "29",
        primaryPeriodValue: "33",
      },
    ],
  };
}

describe("buildPlaceholderOrganicReportingHighlights", () => {
  it("uses neutral copy and leaves agent narratives empty", () => {
    const placeholder = buildPlaceholderOrganicReportingHighlights("Shutter Spot");
    expect(placeholder.executiveSummary).toContain("Shutter Spot");
    expect(placeholder.performanceNarrative).toEqual([]);
    expect(placeholder.keywordNarrative).toEqual([]);
    expect(placeholder.topOpportunities).toEqual([]);
    expect(deckHighlightsNeedsAgentNarratives(placeholder)).toBe(true);
  });

  it("includes factual GSC and GA4 summary takeaways when viewModel is provided", () => {
    const vm = buildOrganicDashboardViewModel({
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
        compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
      },
      gsc: {
        stats: {
          currentPeriod: {
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            clicks: 410,
            impressions: 12000,
            ctr: 0.034,
            avgPosition: 9.4,
          },
          comparisonPeriod: {
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            clicks: 380,
            impressions: 11000,
            ctr: 0.034,
            avgPosition: 10.1,
          },
          comparisons: {},
          topKeywords: [],
        },
      },
      sources: { ga4: "skipped", gsc: "ok" },
    });
    const placeholder = buildPlaceholderOrganicReportingHighlights("Shutter Spot", vm);
    expect(placeholder.keyTakeaways[0]).toContain("410 clicks");
    expect(deckHighlightsNeedsAgentNarratives(placeholder)).toBe(true);
  });
});

describe("resolveClientReportHighlights", () => {
  it("returns cached highlights when prefetch finished", () => {
    const cached = buildPlaceholderOrganicReportingHighlights("Example");
    cached.performanceNarrative = ["GA4 paragraph.", "GSC paragraph."];
    cached.keywordNarrative = ["Keyword paragraph."];
    const resolved = resolveClientReportHighlights(cached, "Example");
    expect(resolved).toBe(cached);
  });

  it("falls back to placeholder when cache is empty", () => {
    const resolved = resolveClientReportHighlights(undefined, "Example Co");
    expect(resolved.executiveSummary).toContain("Example Co");
    expect(deckHighlightsNeedsAgentNarratives(resolved)).toBe(true);
  });
});

describe("buildOrganicReportingHighlightsSnapshot", () => {
  it("includes GA4 rows and GSC totals in snapshot", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
        compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
      },
      ga4: {
        organicAcquisition: {
          current: {
            sessions: 100,
            engagedSessions: 50,
            engagementRate: 0.5,
            averageSessionDurationSec: 60,
            keyEvents: 5,
            eventCount: 10,
            eventsPerSession: 0.1,
          },
          previous: {
            sessions: 80,
            engagedSessions: 40,
            engagementRate: 0.4,
            averageSessionDurationSec: 55,
            keyEvents: 4,
            eventCount: 8,
            eventsPerSession: 0.1,
          },
        },
      },
      gsc: {
        stats: {
          currentPeriod: {
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            clicks: 881,
            impressions: 73432,
            ctr: 0.012,
            avgPosition: 13.2,
          },
          comparisonPeriod: {
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            clicks: 830,
            impressions: 88428,
            ctr: 0.009,
            avgPosition: 16.2,
          },
          comparisons: {
            clicksChangePercent: 6.1,
          },
          topKeywords: [],
        },
      },
      sources: { ga4: "ok", gsc: "ok", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: true });
    const snap = buildOrganicReportingHighlightsSnapshot(vm, "Blind Magic", "https://example.com", true);
    expect(snap.ga4Rows.length).toBeGreaterThan(0);
    expect(snap.gscTotals?.length).toBe(4);
    expect(snap.periods.earlier).toContain("August");
  });
});

describe("normalizeOrganicReportingHighlights", () => {
  it("derives keyTakeaways when missing from stored deck payload", () => {
    const normalized = normalizeOrganicReportingHighlights({
      executiveSummary: "Traffic grew in September. Clicks rose on brand terms. Impressions eased on broad queries.",
      topOpportunities: [],
    });
    expect(normalized?.keyTakeaways.length).toBeGreaterThanOrEqual(2);
    expect(normalized?.executiveSummary).toContain("Traffic");
  });

  it("strips markdown from opportunity fields", () => {
    const normalized = normalizeOrganicReportingHighlights({
      executiveSummary: "Headline.",
      keyTakeaways: ["One insight.", "Two insight."],
      topOpportunities: [
        {
          rank: 1,
          label: "Query",
          why: "**High-intent** query gap.",
          comparisonRows: [
            { metric: "Clicks", comparePeriodValue: "10", primaryPeriodValue: "12" },
          ],
        },
      ],
    });
    expect(normalized?.topOpportunities[0]?.why).toBe("High-intent query gap.");
  });

  it("preserves performanceNarrative when present", () => {
    const normalized = normalizeOrganicReportingHighlights({
      executiveSummary: "Headline.",
      keyTakeaways: ["One.", "Two."],
      performanceNarrative: ["GA4 paragraph.", "GSC paragraph."],
      keywordNarrative: ["Query paragraph."],
      topOpportunities: [],
    });
    expect(normalized?.performanceNarrative).toEqual(["GA4 paragraph.", "GSC paragraph."]);
    expect(normalized?.keywordNarrative).toEqual(["Query paragraph."]);
  });
});

describe("parseOrganicReportingHighlightsPayload", () => {
  it("parses valid highlights JSON with action and strips markdown", () => {
    const raw = JSON.stringify({
      executiveSummary: "Organic sessions rose in September versus August.",
      keyTakeaways: [
        "Organic Search sessions increased with stronger engagement on site.",
        "Search Console clicks improved while impressions shifted on core queries.",
      ],
      performanceNarrative: [
        "From August 2–31 to September 1–30, GA4 total users and Organic Search sessions both increased.",
        "In the same window, Search Console clicks rose while impressions contracted, lifting average CTR and average position.",
      ],
      keywordNarrative: [
        "Brand queries led clicks in September 1–30, 2026, with non-brand blinds terms still contributing meaningful volume.",
      ],
      topOpportunities: [
        sampleOpportunity(1, "Brand query"),
        { ...sampleOpportunity(2, "Non-brand"), why: "**Winnable** CTR gap on a core term." },
        sampleOpportunity(3, "Conversion"),
      ],
    });
    const parsed = parseOrganicReportingHighlightsPayload(raw);
    expect(parsed.executiveSummary).toContain("Organic sessions");
    expect(parsed.keyTakeaways).toHaveLength(2);
    expect(parsed.performanceNarrative).toHaveLength(2);
    expect(parsed.keywordNarrative).toHaveLength(1);
    expect(parsed.topOpportunities).toHaveLength(3);
    expect(parsed.topOpportunities[1]?.why).toBe("Winnable CTR gap on a core term.");
  });
});

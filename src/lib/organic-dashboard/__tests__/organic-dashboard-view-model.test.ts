import { describe, expect, it } from "vitest";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("buildOrganicDashboardViewModel", () => {
  it("empty GA4 table when GA4 skipped", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2025-12-01", endDate: "2025-12-31" },
        compare: { startDate: "2025-11-01", endDate: "2025-11-30" },
      },
      ga4: { skipped: true, reason: "missing_ga4_property_id", error: "No GA4" },
      gsc: { skipped: true, reason: "gsc_error", error: "No GSC" },
      sources: { ga4: "skipped", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data);
    expect(vm.hasGa4).toBe(false);
    expect(vm.ga4Table).toEqual([]);
  });

  it("filters GA monthly chart to primary range", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2025-11-15", endDate: "2025-12-31" },
        compare: { startDate: "2025-10-01", endDate: "2025-10-31" },
      },
      ga4: {
        organicTraffic: {
          sessionsCurrent: 100,
          sessionsPrevious: 80,
          change: 20,
          changePercent: 25,
        },
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
        organicTrafficAcquisitionMonthly: {
          channel: "Organic Search",
          dimension: "sessionDefaultChannelGroup",
          periodStart: "2025-11-01",
          periodEnd: "2025-12-31",
          totals: {
            sessions: 100,
            engagedSessions: 50,
            engagementRate: 0.5,
            averageSessionDurationSec: 60,
            keyEvents: 5,
            eventCount: 10,
            eventsPerSession: 0.1,
          },
          months: [
            {
              yearMonth: "2025-10",
              label: "Oct 2025",
              sessions: 1,
              engagedSessions: 1,
              engagementRate: 0.1,
              averageSessionDurationSec: 1,
              keyEvents: 0,
              eventCount: 0,
              eventsPerSession: 0,
            },
            {
              yearMonth: "2025-11",
              label: "Nov 2025",
              sessions: 40,
              engagedSessions: 20,
              engagementRate: 0.5,
              averageSessionDurationSec: 60,
              keyEvents: 2,
              eventCount: 4,
              eventsPerSession: 0.1,
            },
            {
              yearMonth: "2025-12",
              label: "Dec 2025",
              sessions: 60,
              engagedSessions: 30,
              engagementRate: 0.5,
              averageSessionDurationSec: 60,
              keyEvents: 3,
              eventCount: 6,
              eventsPerSession: 0.1,
            },
          ],
        },
      },
      sources: { ga4: "ok", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data);
    expect(vm.ga4MonthlyChart.map((p) => p.label)).toEqual(["Nov 2025", "Dec 2025"]);
    const sessionsRow = vm.ga4Table.find((r) => r.label === "Organic Search sessions");
    expect(sessionsRow?.delta.deltaPercent).toBe(25);
  });

  it("prefers User acquisition totals in GA4 table when organicUsers is present", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
        compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
      },
      ga4: {
        organicUsers: {
          current: { totalUsers: 1056, newUsers: 1000, userKeyEventRate: 0.0114, keyEvents: 12 },
          previous: { totalUsers: 751, newUsers: 700, userKeyEventRate: 0.0013, keyEvents: 1 },
        },
        organicAcquisition: {
          current: {
            sessions: 9999,
            engagedSessions: 1,
            engagementRate: 0.5,
            averageSessionDurationSec: 60,
            keyEvents: 5,
            eventCount: 10,
            eventsPerSession: 0.1,
          },
          previous: {
            sessions: 1,
            engagedSessions: 1,
            engagementRate: 0.4,
            averageSessionDurationSec: 55,
            keyEvents: 4,
            eventCount: 8,
            eventsPerSession: 0.1,
          },
        },
      },
      sources: { ga4: "ok", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data);
    expect(vm.ga4Table.find((r) => r.label === "Total users")?.current).toBe("1,056");
    expect(vm.ga4Table.find((r) => r.label === "Total users")?.delta.deltaPositive).toBe(true);
  });

  it("builds GSC query row deltas when compare is on", () => {
    const data: OrganicDashboardBundleResponse = {
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
            clicks: 100,
            impressions: 1000,
            ctr: 0.1,
            avgPosition: 5,
          },
          comparisonPeriod: {
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            clicks: 80,
            impressions: 800,
            ctr: 0.1,
            avgPosition: 6,
          },
          comparisons: {},
          topKeywords: [
            {
              query: "blind magic",
              currentRanking: 3,
              previousRanking: 4,
              rankingChange: 1,
              currentClicks: 33,
              previousClicks: 29,
              clicksChange: 4,
              currentImpressions: 284,
              previousImpressions: 236,
              impressionsChange: 48,
            },
          ],
        },
      },
      sources: { ga4: "skipped", gsc: "ok", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: true });
    expect(vm.gscQueries[0]?.clicks).toBe("33");
    expect(vm.gscQueries[0]?.previousClicks).toBe("29");
    expect(vm.gscQueries[0]?.clicksDelta.deltaPositive).toBe(true);
    expect(vm.gscQueries[0]?.impressionsDelta.deltaPositive).toBe(true);
    expect(vm.gscSummary?.compareClicks).toBe("80");
  });

  it("hides GSC query deltas when showCompare is false", () => {
    const data: OrganicDashboardBundleResponse = {
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
            clicks: 10,
            impressions: 100,
            ctr: 0.1,
            avgPosition: 5,
          },
          comparisonPeriod: {
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            clicks: 8,
            impressions: 80,
            ctr: 0.1,
            avgPosition: 6,
          },
          comparisons: {},
          topKeywords: [
            {
              query: "test",
              currentRanking: 1,
              previousRanking: 2,
              rankingChange: 1,
              currentClicks: 5,
              previousClicks: 4,
              clicksChange: 1,
              currentImpressions: 50,
              previousImpressions: 40,
              impressionsChange: 10,
            },
          ],
        },
      },
      sources: { ga4: "skipped", gsc: "ok", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: false });
    expect(vm.gscQueries[0]?.clicksDelta.deltaPercent).toBeNull();
    expect(vm.gscQueries[0]?.impressionsDelta.deltaPercent).toBeNull();
  });

  it("hides compare deltas when showCompare is false", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2025-12-01", endDate: "2025-12-31" },
        compare: { startDate: "2025-11-01", endDate: "2025-11-30" },
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
      sources: { ga4: "ok", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: false });
    expect(vm.ga4Table[0]?.delta.deltaPercent).toBeNull();
  });

  it("maps Semrush bundle into summary, trend, and keywords", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        primary: { startDate: "2025-12-01", endDate: "2025-12-31" },
        compare: { startDate: "2025-11-01", endDate: "2025-11-30" },
      },
      ga4: { skipped: true, reason: "missing_ga4_property_id", error: "No GA4" },
      gsc: { skipped: true, reason: "gsc_error", error: "No GSC" },
      semrush: {
        success: true,
        database: "ca",
        domain: "example.ca",
        overviewUrl: "https://www.semrush.com/analytics/overview/?searchType=domain&q=example.ca&db=ca",
        current: { organicKeywords: 36, organicTraffic: 14, trafficCost: 102 },
        compare: { organicKeywords: 27, organicTraffic: 27, trafficCost: 51 },
        comparisons: {
          keywordsChangePercent: 33.33,
          trafficChangePercent: -48.15,
          trafficCostChangePercent: 100,
        },
        history: [
          { month: "2025-10", organicTraffic: 10 },
          { month: "2025-11", organicTraffic: 12 },
        ],
        topKeywords: [
          { phrase: "calgary blinds", volume: 500, traffic: 3, position: 4.2 },
          { phrase: "how to clean blinds properly", volume: 1200, traffic: 8, position: 2.0 },
          { phrase: "How to clean blinds properly", volume: 1200, traffic: 2, position: 6.0 },
        ],
      },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "ok" },
    };
    const vm = buildOrganicDashboardViewModel(data);
    expect(vm.hasSemrush).toBe(true);
    expect(vm.semrushSummary?.keywords).toBe("36");
    expect(vm.semrushSummary?.traffic).toBe("14");
    expect(vm.semrushTrend).toHaveLength(2);
    expect(vm.semrushTrend[0]?.label).toBe("2025-10");
    expect(vm.semrushTrend[1]?.semrushTraffic).toBe(12);
    expect(vm.semrushKeywords).toHaveLength(2);
    expect(vm.semrushKeywords[0]?.phrase).toBe("calgary blinds");
    expect(vm.semrushKeywords[1]?.phrase).toBe("how to clean blinds properly");
    expect(vm.semrushKeywords[1]?.traffic).toBe("8");
    expect(vm.semrushOverviewUrl).toContain("example.ca");
  });
});

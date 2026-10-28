import { describe, expect, it } from "vitest";
import {
  buildGa4PeriodProgressTable,
  buildGscPeriodProgressTable,
  buildOrganicPeriodProgressTables,
  buildSemrushPeriodProgressTable,
  reconcilePeriodProgressTablesForDeck,
} from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("organic-dashboard-period-progress", () => {
  it("builds GSC monthly rows aligned to trend points", () => {
    const vm = buildOrganicDashboardViewModel(
      {
        success: true,
        meta: {
          fetchedAt: "2026-01-01T00:00:00Z",
          reportStructure: "period_progress",
          primary: { startDate: "2025-11-01", endDate: "2025-12-31" },
          compare: null,
        },
        gsc: {
          stats: {
            currentPeriod: {
              startDate: "2025-11-01",
              endDate: "2025-12-31",
              clicks: 200,
              impressions: 10000,
              ctr: 0.02,
              avgPosition: 8.5,
            },
            topKeywords: [],
          },
          timeseries: [
            { date: "2025-11-15", clicks: 45, impressions: 2500, ctr: 0.018, avgPosition: 9 },
            { date: "2025-12-10", clicks: 55, impressions: 2500, ctr: 0.022, avgPosition: 8 },
          ],
        },
        sources: { ga4: "skipped", gsc: "ok", gscHistorical: "skipped" },
      } satisfies OrganicDashboardBundleResponse,
      { showCompare: false },
    );

    const table = buildGscPeriodProgressTable(vm.gscTrendMonthly, vm.gscSummary, "Period total");
    expect(table?.monthLabels.length).toBe(2);
    expect(table?.rows.map((r) => r.label)).toEqual([
      "Total clicks",
      "Total impressions",
      "Average CTR",
      "Average position",
    ]);
    expect(table?.rows[0]?.periodTotal).toBeTruthy();
  });

  it("includes GA4 months when yearMonth is YYYYMM from the API", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        reportStructure: "period_progress",
        primary: { startDate: "2026-07-01", endDate: "2026-09-30" },
        compare: null,
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
            sessions: 0,
            engagedSessions: 0,
            engagementRate: 0,
            averageSessionDurationSec: 0,
            keyEvents: 0,
            eventCount: 0,
            eventsPerSession: 0,
          },
        },
        organicTrafficAcquisitionMonthly: {
          channel: "Organic Search",
          dimension: "sessionDefaultChannelGroup",
          periodStart: "2026-07-01",
          periodEnd: "2026-09-30",
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
              yearMonth: "202607",
              label: "Jul 2026",
              sessions: 40,
              engagedSessions: 20,
              engagementRate: 0.5,
              averageSessionDurationSec: 55,
              keyEvents: 2,
              eventCount: 4,
              eventsPerSession: 0.1,
            },
            {
              yearMonth: "202608",
              label: "Aug 2026",
              sessions: 30,
              engagedSessions: 15,
              engagementRate: 0.5,
              averageSessionDurationSec: 60,
              keyEvents: 2,
              eventCount: 3,
              eventsPerSession: 0.1,
            },
            {
              yearMonth: "202609",
              label: "Sep 2026",
              sessions: 30,
              engagedSessions: 15,
              engagementRate: 0.5,
              averageSessionDurationSec: 65,
              keyEvents: 1,
              eventCount: 3,
              eventsPerSession: 0.1,
            },
          ],
        },
      },
      gsc: { skipped: true, reason: "gsc_error", error: "No GSC" },
      sources: { ga4: "ok", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: false });
    expect(vm.periodProgressTables?.ga4?.monthLabels).toEqual(["Jul", "Aug", "Sep"]);
    expect(vm.periodProgressTables?.ga4?.title).toBe("Website traffic (GA4) by month");
  });

  it("builds GA4 monthly table when acquisition monthly exists", () => {
    const data: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-01-01T00:00:00Z",
        reportStructure: "period_progress",
        primary: { startDate: "2025-11-01", endDate: "2025-12-31" },
        compare: null,
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
              yearMonth: "2025-11",
              label: "Nov 2025",
              sessions: 40,
              engagedSessions: 20,
              engagementRate: 0.5,
              averageSessionDurationSec: 55,
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
              averageSessionDurationSec: 65,
              keyEvents: 3,
              eventCount: 6,
              eventsPerSession: 0.1,
            },
          ],
        },
      },
      gsc: { skipped: true, reason: "gsc_error", error: "No GSC" },
      sources: { ga4: "ok", gsc: "skipped", gscHistorical: "skipped" },
    };
    const vm = buildOrganicDashboardViewModel(data, { showCompare: false });
    const gaTable = buildGa4PeriodProgressTable(
      data.ga4 as Exclude<typeof data.ga4, { skipped: true }>,
      data.meta.primary,
      vm.ga4Table,
      "Period total",
    );
    expect(gaTable?.monthLabels).toEqual(["Nov", "Dec"]);
    expect(gaTable?.rows.some((r) => r.label === "Sessions")).toBe(true);
    expect(gaTable?.rows.find((r) => r.label === "Sessions")?.values).toHaveLength(2);

    const tables = buildOrganicPeriodProgressTables(
      data.ga4 as Exclude<typeof data.ga4, { skipped: true }>,
      data.meta.primary,
      vm,
      "Period total",
    );
    expect(tables.ga4).not.toBeNull();
    expect(vm.periodProgressTables?.ga4).not.toBeNull();
  });

  it("uses full primary period label for period total row, not end month only", () => {
    const vm = buildOrganicDashboardViewModel(
      {
        success: true,
        meta: {
          fetchedAt: "2026-01-01T00:00:00Z",
          reportStructure: "compare",
          primary: { startDate: "2026-07-01", endDate: "2026-09-30" },
          compare: { startDate: "2026-03-31", endDate: "2026-06-30" },
        },
        gsc: {
          stats: {
            currentPeriod: {
              startDate: "2026-07-01",
              endDate: "2026-09-30",
              clicks: 2700,
              impressions: 247800,
              ctr: 0.011,
              avgPosition: 15.3,
            },
            topKeywords: [],
          },
          timeseries: [
            { date: "2026-07-15", clicks: 300, impressions: 25000, ctr: 0.012, avgPosition: 16 },
            { date: "2026-08-15", clicks: 280, impressions: 26000, ctr: 0.011, avgPosition: 16 },
            { date: "2026-09-15", clicks: 290, impressions: 24000, ctr: 0.012, avgPosition: 13 },
          ],
        },
        sources: { ga4: "skipped", gsc: "ok", gscHistorical: "skipped" },
      } satisfies OrganicDashboardBundleResponse,
      { showCompare: true },
    );
    expect(vm.periodProgressTables?.gsc?.periodTotalColumnLabel).toContain("Jul");
    expect(vm.periodProgressTables?.gsc?.periodTotalColumnLabel).not.toBe("Sep");
  });

  it("rebuilds GSC period table from gscTrendMonthly when deck omitted periodProgressTables", () => {
    const vm = buildOrganicDashboardViewModel(
      {
        success: true,
        meta: {
          fetchedAt: "2026-01-01T00:00:00Z",
          reportStructure: "compare",
          primary: { startDate: "2026-07-01", endDate: "2026-09-30" },
          compare: null,
        },
        gsc: {
          stats: {
            currentPeriod: {
              startDate: "2026-07-01",
              endDate: "2026-09-30",
              clicks: 100,
              impressions: 10000,
              ctr: 0.01,
              avgPosition: 10,
            },
            topKeywords: [],
          },
          timeseries: [
            { date: "2026-07-10", clicks: 30, impressions: 3000, ctr: 0.01, avgPosition: 11 },
            { date: "2026-08-10", clicks: 35, impressions: 3500, ctr: 0.01, avgPosition: 10 },
            { date: "2026-09-10", clicks: 35, impressions: 3500, ctr: 0.01, avgPosition: 9 },
          ],
        },
        sources: { ga4: "skipped", gsc: "ok", gscHistorical: "skipped" },
      } satisfies OrganicDashboardBundleResponse,
      { showCompare: true },
    );
    const reconciled = reconcilePeriodProgressTablesForDeck({
      ...vm,
      periodProgressTables: null,
    });
    expect(reconciled?.gsc?.monthLabels.length).toBeGreaterThan(0);
    expect(reconciled?.gsc?.rows.length).toBe(4);
  });

  it("builds Semrush monthly table from semrushTrend", () => {
    const vm = buildOrganicDashboardViewModel(
      {
        success: true,
        meta: {
          fetchedAt: "2026-01-01T00:00:00Z",
          reportStructure: "compare",
          primary: { startDate: "2026-07-01", endDate: "2026-09-30" },
          compare: null,
        },
        semrush: {
          current: {
            organicKeywords: 626,
            organicTraffic: 184,
            trafficCost: 240,
          },
          history: [
            { month: "2026-07", organicKeywords: 699, organicTraffic: 277, trafficCost: 343 },
            { month: "2026-08", organicKeywords: 720, organicTraffic: 251, trafficCost: 328 },
            { month: "2026-09", organicKeywords: 748, organicTraffic: 181, trafficCost: 251 },
          ],
        },
        sources: { ga4: "skipped", gsc: "skipped", gscHistorical: "skipped", semrush: "ok" },
      } satisfies OrganicDashboardBundleResponse,
      { showCompare: true },
    );
    expect(vm.periodProgressTables?.semrush?.monthLabels).toEqual(["Jul", "Aug", "Sep"]);
    expect(vm.periodProgressTables?.semrush?.rows.map((r) => r.label)).toEqual([
      "Keywords",
      "Est. organic traffic",
      "Traffic cost",
    ]);
    const table = buildSemrushPeriodProgressTable(vm.semrushTrend, vm.semrushSummary, "Total", {
      startDate: "2026-07-01",
      endDate: "2026-09-30",
    });
    expect(table?.rows[0]?.values).toEqual(["699", "720", "748"]);
    expect(table?.rows[0]?.periodTotal).toBe("748");
    expect(table?.rows[1]?.periodTotal).toBe("709");
    expect(table?.rows[2]?.periodTotal).toBe("$922");
  });
});

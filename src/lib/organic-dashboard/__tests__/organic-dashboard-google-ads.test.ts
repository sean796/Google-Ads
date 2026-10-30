import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsBudgetPacingDisplay,
  buildGoogleAdsReportAccountCard,
  buildGoogleAdsSummary,
  buildGoogleAdsTable,
  formatGoogleAdsLoadError,
  formatGoogleAdsMoney,
} from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import { buildOrganicReportingHighlightsSnapshot } from "@/lib/organic-dashboard/organic-reporting-highlights";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("organic-dashboard-google-ads", () => {
  it("builds budget pacing display with period caption and as-of date", () => {
    const display = buildGoogleAdsBudgetPacingDisplay(
      {
        spendMicros: 500_000_000,
        budgetMicros: 1_000_000_000,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-19",
      },
      "CAD",
      "Oct 1–19, 2026",
      "2026-10-19",
    );
    expect(display.caption).toContain("Oct 1–19, 2026");
    expect(display.spendRatio).toBeGreaterThan(0);
  });

  it("formats CAD and USD spend labels", () => {
    expect(formatGoogleAdsMoney(2995.5, "CAD")).toMatch(/^CA\$/);
    expect(formatGoogleAdsMoney(100, "USD")).toMatch(/^\$/);
  });

  it("returns null load error when Ads customer id is missing", () => {
    expect(
      formatGoogleAdsLoadError({ skipped: true, reason: "missing_google_ads_customer_id" }),
    ).toBeNull();
  });

  it("maps account metrics into summary and table rows", () => {
    const bundle: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-10-19T00:00:00Z",
        primary: { startDate: "2026-10-01", endDate: "2026-10-19" },
        compare: { startDate: "2026-09-12", endDate: "2026-09-30" },
        reportStructure: "compare",
      },
      googleAds: {
        success: true,
        customerId: "1234567890",
        currencyCode: "CAD",
        account: {
          clicks: 100,
          costMicros: 2_995_000_000,
          conversions: 78,
          impressions: 5000,
        },
        compareAccount: {
          clicks: 90,
          costMicros: 3_500_000_000,
          conversions: 73,
          impressions: 4800,
        },
        dailySeries: [{ date: "2026-10-01", costMicros: 100_000_000, conversions: 4, clicks: 5 }],
        budgetPacing: {
          spendMicros: 500_000_000,
          budgetMicros: 2_000_000_000,
          periodStart: "2026-10-01",
          periodEnd: "2026-10-19",
        },
      },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped", googleAds: "ok" },
    };
    const vm = buildOrganicDashboardViewModel(bundle, {
      showCompare: true,
      googleAdsCustomerIdForReporting: "1234567890",
    });
    expect(vm.hasGoogleAds).toBe(true);
    expect(vm.googleAdsLoadError).toBeNull();
    expect(vm.googleAdsSummary?.leads).toBe("78");
    expect(vm.googleAdsBudgetPacing?.caption).toContain("CA$");
    expect(vm.googleAdsTable.map((r) => r.label)).toEqual([
      "Leads",
      "Cost per lead",
      "Spend",
      "Clicks",
    ]);
    const summary = buildGoogleAdsSummary(
      {
        account: {
          impressions: 0,
          clicks: 100,
          costMicros: 2_995_000_000,
          conversions: 78,
          ctr: 0,
          averageCpc: 0,
        },
        compareAccount: {
          impressions: 0,
          clicks: 90,
          costMicros: 3_500_000_000,
          conversions: 73,
          ctr: 0,
          averageCpc: 0,
        },
        currencyCode: "CAD",
        customerId: "1234567890",
        dailySeries: [],
      },
      true,
    );
    expect(summary?.costPerLead).toMatch(/^CA\$/);
    expect(buildGoogleAdsTable(summary, true)).toHaveLength(4);
  });

  it("account card KPI deltas come from summary when saved table rows omit delta", () => {
    const summary = buildGoogleAdsSummary(
      {
        account: {
          impressions: 0,
          clicks: 100,
          costMicros: 2_995_000_000,
          conversions: 78,
          ctr: 0,
          averageCpc: 0,
        },
        compareAccount: {
          impressions: 0,
          clicks: 90,
          costMicros: 3_500_000_000,
          conversions: 73,
          ctr: 0,
          averageCpc: 0,
        },
        currencyCode: "CAD",
        customerId: "1234567890",
        dailySeries: [],
      },
      true,
    );
    if (!summary) throw new Error("expected summary");
    const staleRows = buildGoogleAdsTable(summary, true).map((row) => ({
      ...row,
      delta: { deltaPercent: null, deltaPositive: null },
    }));
    const card = buildGoogleAdsReportAccountCard({
      siteName: "Test",
      summary,
      tableRows: staleRows,
      chartPoints: [],
      budgetPacing: null,
      preparedOn: "2026-10-28",
      showCompare: true,
    });
    expect(card.kpis[0]?.delta.deltaPercent).not.toBeNull();
  });

  it("shows a load error when property has Ads ID but payload is missing", () => {
    const vm = buildOrganicDashboardViewModel(
      {
        success: true,
        meta: {
          fetchedAt: "2026-10-19T00:00:00Z",
          primary: { startDate: "2026-10-01", endDate: "2026-10-19" },
          compare: null,
        },
        sources: { ga4: "ok", gsc: "ok", semrush: "ok", googleAds: "skipped" },
      },
      { googleAdsCustomerIdForReporting: "5619137403" },
    );
    expect(vm.hasGoogleAds).toBe(false);
    expect(vm.googleAdsLoadError).toContain("Google Ads");
  });

  it("includes googleAdsTotals in highlights snapshot when connected", () => {
    const bundle: OrganicDashboardBundleResponse = {
      success: true,
      meta: {
        fetchedAt: "2026-10-19T00:00:00Z",
        primary: { startDate: "2026-10-01", endDate: "2026-10-19" },
        compare: { startDate: "2026-09-12", endDate: "2026-09-30" },
        reportStructure: "compare",
      },
      googleAds: {
        success: true,
        currencyCode: "USD",
        account: { clicks: 10, costMicros: 1_000_000, conversions: 2, impressions: 100 },
        compareAccount: { clicks: 8, costMicros: 900_000, conversions: 1, impressions: 90 },
        dailySeries: [],
      },
    };
    const vm = buildOrganicDashboardViewModel(bundle, { showCompare: true });
    const snap = buildOrganicReportingHighlightsSnapshot(vm, "Test Site", "https://example.com", true);
    expect(snap.googleAdsTotals?.length).toBe(4);
  });
});

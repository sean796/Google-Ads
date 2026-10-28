import { describe, expect, it } from "vitest";
import { mergeOrganicDashboardBundleParts } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("mergeOrganicDashboardBundleParts", () => {
  it("merges ga4, gsc, and semrush from parallel part responses", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-07-01", endDate: "2025-12-31" },
      compare: { startDate: "2025-01-01", endDate: "2025-06-30" },
    };

    const ga4Part: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { success: true, propertyId: "123" },
      gsc: { skipped: true, reason: "partial_request" },
      semrush: { skipped: true, reason: "partial_request" },
      sources: { ga4: "ok", gsc: "skipped", semrush: "skipped" },
    };

    const gscPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      gsc: { success: true, property: "https://example.com/" },
      semrush: { skipped: true, reason: "partial_request" },
      sources: { ga4: "skipped", gsc: "ok", semrush: "skipped" },
    };

    const merged = mergeOrganicDashboardBundleParts([ga4Part, gscPart]);

    expect(merged.ga4).toEqual({ success: true, propertyId: "123" });
    expect(merged.gsc).toEqual({ success: true, property: "https://example.com/" });
    expect(merged.sources?.ga4).toBe("ok");
    expect(merged.sources?.gsc).toBe("ok");
  });

  it("merges googleAds from the googleAds part response", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-09-01", endDate: "2025-09-30" },
      compare: { startDate: "2025-08-01", endDate: "2025-08-31" },
    };
    const monolithStub: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { success: true, propertyId: "289673706" },
      gsc: { success: true },
      semrush: { skipped: true, reason: "semrush_error" },
      sources: { ga4: "ok", gsc: "ok", semrush: "error" },
    };
    const adsPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      googleAds: {
        success: true,
        customerId: "5619137403",
        currencyCode: "CAD",
        account: { impressions: 1, clicks: 1, costMicros: 1, conversions: 1, ctr: 0, averageCpc: 0 },
        compareAccount: { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, ctr: 0, averageCpc: 0 },
        dailySeries: [],
      },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped", googleAds: "ok" },
    };
    const merged = mergeOrganicDashboardBundleParts([monolithStub, adsPart]);
    expect(merged.googleAds).toMatchObject({ success: true, customerId: "5619137403" });
    expect(merged.sources?.googleAds).toBe("ok");
  });
});

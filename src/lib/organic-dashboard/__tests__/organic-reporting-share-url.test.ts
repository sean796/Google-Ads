import { describe, expect, it } from "vitest";
import {
  buildOrganicClientReportShareUrl,
  buildOrganicReportingShareSearch,
  buildOrganicReportingShareUrl,
  parseOrganicReportingShareParams,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { refreshOrganicReportingDateHarness } from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import { organicDashboardBundleQueryKey } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("organic-reporting-share-url", () => {
  it("round-trips GA4 preset and section", () => {
    const search = buildOrganicReportingShareSearch({
      section: "speed",
      primaryPreset: "last_30",
      compareBaseline: "previous_period",
      compareEnabled: true,
      compareRangeDraft: {
        primary: { startDate: "2026-03-14", endDate: "2026-04-13" },
        compare: { startDate: "2026-02-12", endDate: "2026-03-13" },
      },
    });
    const parsed = parseOrganicReportingShareParams(`?${search}`);
    expect(parsed?.section).toBe("speed");
    expect(parsed?.compareEnabled).toBe(true);
    expect(parsed?.primaryPreset).toBe("last_30");
    expect(parsed?.compareBaseline).toBe("previous_period");
  });

  it("round-trips custom date range", () => {
    const search = buildOrganicReportingShareSearch({
      section: "performance",
      primaryPreset: "custom",
      compareBaseline: "custom",
      compareEnabled: true,
      compareRangeDraft: {
        primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
        compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
      },
    });
    expect(search).toContain("start=2026-09-01");
    const parsed = parseOrganicReportingShareParams(`?${search}`);
    expect(parsed?.compareRangeDraft.primary.endDate).toBe("2026-09-30");
    expect(parsed?.compareRangeDraft.compare.startDate).toBe("2026-08-01");
  });

  it("maps legacy section=indexing share links to performance", () => {
    const parsed = parseOrganicReportingShareParams(
      "?section=indexing&structure=compare&preset=last_30&baseline=previous_period&start=2026-03-14&end=2026-04-13&cstart=2026-02-12&cend=2026-03-13",
    );
    expect(parsed?.section).toBe("performance");
  });

  it("builds absolute client report share url", () => {
    const url = buildOrganicClientReportShareUrl(
      "site-1",
      {
        section: "performance",
        primaryPreset: "last_30",
        compareBaseline: "previous_period",
        compareEnabled: true,
        compareRangeDraft: {
          primary: { startDate: "2026-04-07", endDate: "2026-04-13" },
          compare: { startDate: "2026-03-31", endDate: "2026-04-06" },
        },
      },
      "https://app.example.com",
      "Acme Blinds",
    );
    expect(url).toContain("/sites/acme-blinds/organic/client-report");
    expect(url).toContain("siteId=site-1");
    expect(url).toContain("client=Acme");
    expect(url).toContain("preset=last_30");
    expect(url).toContain("structure=compare");
  });

  it("last_month preset resolves to different primary range when calendar month changes", () => {
    const search = buildOrganicReportingShareSearch({
      section: "performance",
      primaryPreset: "last_month",
      compareBaseline: "previous_period",
      compareEnabled: true,
      compareRangeDraft: {
        primary: { startDate: "2020-01-01", endDate: "2020-01-31" },
        compare: { startDate: "2019-12-01", endDate: "2019-12-31" },
      },
    });
    const parsed = parseOrganicReportingShareParams(`?${search}`);
    expect(parsed).not.toBeNull();
    const march = refreshOrganicReportingDateHarness(parsed!, new Date("2026-03-15T12:00:00"));
    const april = refreshOrganicReportingDateHarness(parsed!, new Date("2026-04-15T12:00:00"));
    expect(march.compareRangeDraft.primary.startDate).toBe("2026-02-01");
    expect(march.compareRangeDraft.primary.endDate).toBe("2026-02-28");
    expect(april.compareRangeDraft.primary.startDate).toBe("2026-03-01");
    expect(april.compareRangeDraft.primary.endDate).toBe("2026-03-31");

    const base: OrganicDashboardFetchParams = {
      siteUrl: "https://example.com",
      ga4PropertyId: "1",
      semrushDatabase: "us",
      reportStructure: "compare",
      startDate: "",
      endDate: "",
      compareStartDate: "",
      compareEndDate: "",
    };
    const keyMarch = organicDashboardBundleQueryKey("s1", {
      ...base,
      startDate: march.compareRangeDraft.primary.startDate,
      endDate: march.compareRangeDraft.primary.endDate,
    });
    const keyApril = organicDashboardBundleQueryKey("s1", {
      ...base,
      startDate: april.compareRangeDraft.primary.startDate,
      endDate: april.compareRangeDraft.primary.endDate,
    });
    expect(keyMarch).not.toEqual(keyApril);
  });

  it("builds absolute share url", () => {
    const url = buildOrganicReportingShareUrl(
      "site-1",
      {
        section: "performance",
        primaryPreset: "last_7",
        compareBaseline: "previous_period",
        compareEnabled: false,
        compareRangeDraft: {
          primary: { startDate: "2026-04-07", endDate: "2026-04-13" },
          compare: { startDate: "2026-04-07", endDate: "2026-04-13" },
        },
      },
      "https://app.example.com",
    );
    expect(url).toContain("https://app.example.com");
    expect(url).toContain("/sites/site-1/organic");
    expect(url).toContain("section=performance");
    expect(url).toContain("structure=filter");
  });
});

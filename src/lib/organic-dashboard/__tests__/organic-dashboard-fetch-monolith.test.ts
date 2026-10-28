import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOrganicDashboardBundle,
  OrganicDashboardFetchPartUnsupportedError,
} from "@/lib/organic-dashboard/organic-dashboard-fetch";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";

const PARAMS: OrganicDashboardFetchParams = {
  siteUrl: "https://blindmagic.com",
  ga4PropertyId: "289673706",
  semrushDatabase: "us",
  reportStructure: "compare",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  compareStartDate: "2026-08-01",
  compareEndDate: "2026-08-31",
};

const MONOLITH_BODY = {
  success: true,
  meta: { fetchedAt: "2026-01-01T00:00:00Z", primary: { startDate: "2026-09-01", endDate: "2026-09-30" } },
  ga4: { success: true },
  gsc: { success: true },
  semrush: { success: true },
  sources: { ga4: "ok", gsc: "ok", semrush: "ok", googleAds: "skipped" },
};

describe("fetchOrganicDashboardBundle fetch-part 404", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to monolith when fetch-part returns 404 without JSON path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("fetch-part")) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }
      if (url.includes("/organic-dashboard/fetch")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify(MONOLITH_BODY), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchOrganicDashboardBundle(PARAMS);
    expect(data.success).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/organic-dashboard/fetch"))).toBe(true);
  });

  it("exports OrganicDashboardFetchPartUnsupportedError for unsupported parts", () => {
    expect(new OrganicDashboardFetchPartUnsupportedError().code).toBe("ORGANIC_FETCH_PART_UNSUPPORTED");
  });

  it("loads googleAds via fetch-part when monolith omits googleAds but customer id is set", async () => {
    const params: OrganicDashboardFetchParams = {
      ...PARAMS,
      googleAdsCustomerId: "5619137403",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("fetch-part")) {
        if (body.part === "googleAds") {
          return new Response(
            JSON.stringify({
              success: true,
              meta: MONOLITH_BODY.meta,
              googleAds: {
                success: true,
                customerId: "5619137403",
                currencyCode: "CAD",
                account: {
                  impressions: 1,
                  clicks: 1,
                  costMicros: 1,
                  conversions: 1,
                  ctr: 0,
                  averageCpc: 0,
                },
                compareAccount: {
                  impressions: 0,
                  clicks: 0,
                  costMicros: 0,
                  conversions: 0,
                  ctr: 0,
                  averageCpc: 0,
                },
                dailySeries: [],
              },
              sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped", googleAds: "ok" },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }
      if (url.includes("/organic-dashboard/fetch")) {
        return new Response(JSON.stringify(MONOLITH_BODY), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchOrganicDashboardBundle(params);
    expect(data.googleAds).toMatchObject({ success: true, customerId: "5619137403" });
  });
});

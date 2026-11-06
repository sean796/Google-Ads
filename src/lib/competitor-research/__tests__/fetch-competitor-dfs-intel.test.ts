import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import {
  buildCompetitorSerpKeyword,
  fetchCompetitorDfsIntel,
} from "@/lib/competitor-research/fetch-competitor-dfs-intel";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function testSite(): WordPressSite {
  return {
    id: "site-1",
    name: "Blind Magic",
    siteUrl: "https://blindmagic.com",
  } as WordPressSite;
}

function testPlace(): CompetitorGridPlaceRow {
  return {
    dfsKeyword: "cid:999",
    businessName: "Linh's Window Fashions",
    rank: 2,
    latitude: 53.54,
    longitude: -113.49,
    idLabel: "999",
    websiteHostname: null,
  };
}

describe("buildCompetitorSerpKeyword", () => {
  it("combines business name and focus keyword", () => {
    expect(buildCompetitorSerpKeyword("Linh's Window Fashions", "blinds near me")).toBe(
      "Linh's Window Fashions blinds near me",
    );
  });
});

describe("fetchCompetitorDfsIntel", () => {
  it("sends company+keyword to organic SERP and AI overview", async () => {
    const serpKeyword = "Linh's Window Fashions blinds near me";

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
      if (url.includes("serp_organic_live_advanced")) {
        expect(body.keyword).toBe(serpKeyword);
        return {
          ok: true,
          json: async () => ({
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        type: "organic",
                        title: "Linh's Window Fashions",
                        url: "https://example-competitor.com/",
                        description: "Custom blinds",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        };
      }
      if (url.includes("serp_google_ai_overview")) {
        expect(body.keyword).toBe(serpKeyword);
        return {
          ok: true,
          json: async () => ({
            tasks: [{ result: [{ items: [{ markdown: "AI summary text" }] }] }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    const result = await fetchCompetitorDfsIntel({
      place: testPlace(),
      focusKeyword: "blinds near me",
      site: testSite(),
    });

    expect(result.serpKeyword).toBe(serpKeyword);
    expect(result.serpHitCount).toBe(1);
    expect(result.topPages.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

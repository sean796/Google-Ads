import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";

const searchWikipediaPages = vi.fn();
const streamChatCompletion = vi.fn();

vi.mock("@/lib/wikipedia/mediawiki-search", () => ({
  searchWikipediaPages: (...args: unknown[]) => searchWikipediaPages(...args),
}));

vi.mock("@/lib/api", () => ({
  streamChatCompletion: (...args: unknown[]) => streamChatCompletion(...args),
}));

const altonaBucket: GridLocationBucket = {
  bucketId: "altona",
  placeLabel: "Altona, MB",
  weight: 10,
  avgRank: 12,
  rowCount: 1,
  sampleAddresses: ["123 Main St, Altona, MB R0G 0B0"],
};

const manitobaGridSummary = `## Geographic scope (from this file)
- Centroid: (49.17949, -97.93331)
- Bounding box: Manitoba, Canada
## Nearby place names seen in this export
- Winkler, MB
- Plum Coulee, MB
- Morden, MB`;

describe("wiki-entity-pool", () => {
  beforeEach(() => {
    searchWikipediaPages.mockReset();
    streamChatCompletion.mockReset();
  });

  it("appends wikipediaSearchAugment to harvest queries", async () => {
    searchWikipediaPages.mockResolvedValue(["Millwood, Altona"]);

    const { harvestWikiPlacesForCity } = await import("../wiki-entity-pool");
    await harvestWikiPlacesForCity({
      bucket: altonaBucket,
      gridPlaceHints: ["Winkler, MB"],
      minCount: 1,
      wikipediaSearchAugment: "Canada Manitoba",
    });

    expect(searchWikipediaPages).toHaveBeenCalled();
    const firstQuery = searchWikipediaPages.mock.calls[0]?.[0] as string;
    expect(firstQuery).toContain("Canada Manitoba");
  });

  it("filters out other cities from the parent-city pool", async () => {
    const { wikiPoolEntriesForParentCity } = await import("../wiki-entity-pool");
    const geo = { city: "Altona", regionCode: "MB", regionName: "Manitoba" };
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Winkler, Manitoba",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Winkler%2C_Manitoba",
        entityLabel: "Winkler, Manitoba",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "List of historic places in Pembina Valley",
        wikipediaUrl: "https://en.wikipedia.org/wiki/List_of_historic_places_in_Pembina_Valley",
        entityLabel: "List of historic places in Pembina Valley",
        tier: "place" as const,
      },
    ];
    expect(wikiPoolEntriesForParentCity(pool, "Altona, MB", geo)).toEqual([pool[0]]);
  });

  it("runs tier-2 harvest when tier-1 places are fewer than minCount", async () => {
    searchWikipediaPages.mockImplementation(async (query: string) => {
      if (query.includes("neighbourhood") || query.includes("communities")) {
        return ["Millwood, Altona", "Parkview, Altona"];
      }
      if (query.includes("landmark") || query.includes("buildings") || query.includes("exhibition")) {
        return ["Millennium Exhibition Centre", "Altona Mall", "Altona Community Centre"];
      }
      return [];
    });

    const { harvestWikiPlacesForCity } = await import("../wiki-entity-pool");
    const result = await harvestWikiPlacesForCity({
      bucket: altonaBucket,
      gridPlaceHints: ["Millwood"],
      minCount: 3,
      wikipediaSearchAugment: "Canada Manitoba",
    });

    expect(result.pool.length).toBeGreaterThanOrEqual(3);
    expect(result.tier2Count).toBeGreaterThan(0);
  });

  it("pickWikiEntriesFromPool puts grid summary before Wikipedia list", async () => {
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Plum Coulee",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Plum_Coulee",
        entityLabel: "Plum Coulee, Altona, MB",
        tier: "place" as const,
      },
    ];

    let userPrompt = "";
    streamChatCompletion.mockImplementation(async (opts: { messages?: { role: string; content: string }[]; onContentChunk?: (c: string) => void }) => {
      userPrompt = opts.messages?.find((m) => m.role === "user")?.content ?? "";
      opts.onContentChunk?.(JSON.stringify({ titles: ["Millwood, Altona", "Plum Coulee"] }));
    });

    const { pickWikiEntriesFromPool } = await import("../wiki-entity-pool");
    await pickWikiEntriesFromPool({
      pool,
      count: 2,
      parentCity: "Altona, MB",
      sampleAddresses: altonaBucket.sampleAddresses,
      gridLocations: ["Altona, MB"],
      gridSummaryMarkdown: manitobaGridSummary,
      excludeTitles: [],
      apiKey: "test-key",
    });

    expect(userPrompt).toContain("Grid scan (read this first)");
    expect(userPrompt).toContain("Plum Coulee, MB");
    const listIdx = userPrompt.indexOf("1. Millwood, Altona");
    const gridIdx = userPrompt.indexOf("Geographic scope");
    expect(gridIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(gridIdx);
    expect(userPrompt).toContain("Do not pick other cities");
  });

  it("pickWikiEntriesFromPool uses AI picks only with no backfill", async () => {
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Klein Flottbek, Altona, Germany",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Klein_Flottbek",
        entityLabel: "Klein Flottbek, Altona, Germany",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Parkview, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Parkview%2C_Altona",
        entityLabel: "Parkview, Altona, MB",
        tier: "place" as const,
      },
    ];

    streamChatCompletion.mockImplementation(async (opts: { onContentChunk?: (c: string) => void }) => {
      opts.onContentChunk?.(
        JSON.stringify({
          titles: ["Millwood, Altona", "Parkview, Altona"],
        }),
      );
    });

    const { pickWikiEntriesFromPool } = await import("../wiki-entity-pool");
    const picked = await pickWikiEntriesFromPool({
      pool,
      count: 2,
      parentCity: "Altona, MB",
      sampleAddresses: altonaBucket.sampleAddresses,
      gridLocations: ["Altona, MB"],
      gridSummaryMarkdown: manitobaGridSummary,
      excludeTitles: [],
      apiKey: "test-key",
    });

    expect(picked).toHaveLength(2);
    expect(picked.map((e) => e.wikipediaTitle)).toEqual(["Millwood, Altona", "Parkview, Altona"]);
    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("filters out conference and government org titles", async () => {
    const { wikiPoolEntriesForParentCity, isRejectedNonPlaceWikiTitle } = await import("../wiki-entity-pool");
    const geo = { city: "Altona", regionCode: "MB", regionName: "Manitoba" };
    expect(isRejectedNonPlaceWikiTitle("Christian Mennonite Conference")).toBe(true);
    expect(isRejectedNonPlaceWikiTitle("Manitoba Justice")).toBe(true);
    expect(isRejectedNonPlaceWikiTitle("Millwood, Altona")).toBe(false);

    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Christian Mennonite Conference",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Christian_Mennonite_Conference",
        entityLabel: "Christian Mennonite Conference",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Manitoba Justice",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Manitoba_Justice",
        entityLabel: "Manitoba Justice",
        tier: "place" as const,
      },
    ];
    expect(wikiPoolEntriesForParentCity(pool, "Altona, MB", geo)).toEqual([pool[0]]);
  });

  it("pickWikiEntriesFromPool returns AI picks only", async () => {
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
      {
        wikipediaTitle: "Plum Coulee",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Plum_Coulee",
        entityLabel: "Plum Coulee, Altona, MB",
        tier: "place" as const,
      },
    ];

    streamChatCompletion.mockImplementation(async (opts: { onContentChunk?: (c: string) => void }) => {
      opts.onContentChunk?.(JSON.stringify({ titles: ["Millwood, Altona"] }));
    });

    const { pickWikiEntriesFromPool } = await import("../wiki-entity-pool");
    const picked = await pickWikiEntriesFromPool({
      pool,
      count: 2,
      parentCity: "Altona, MB",
      sampleAddresses: altonaBucket.sampleAddresses,
      gridLocations: ["Altona, MB"],
      gridSummaryMarkdown: manitobaGridSummary,
      excludeTitles: [],
      apiKey: "test-key",
    });

    expect(picked).toHaveLength(1);
    expect(picked[0]!.wikipediaTitle).toBe("Millwood, Altona");
  });

  it("always calls AI even when pool size equals count", async () => {
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
    ];

    streamChatCompletion.mockImplementation(async (opts: { onContentChunk?: (c: string) => void }) => {
      opts.onContentChunk?.(JSON.stringify({ titles: ["Millwood, Altona"] }));
    });

    const { pickWikiEntriesFromPool } = await import("../wiki-entity-pool");
    await pickWikiEntriesFromPool({
      pool,
      count: 1,
      parentCity: "Altona, MB",
      sampleAddresses: altonaBucket.sampleAddresses,
      gridLocations: [],
      gridSummaryMarkdown: manitobaGridSummary,
      excludeTitles: [],
      apiKey: "test-key",
    });

    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("includes client context in user message for B2B entity preference", async () => {
    const pool = [
      {
        wikipediaTitle: "Millwood, Altona",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Millwood%2C_Altona",
        entityLabel: "Millwood, Altona, MB",
        tier: "place" as const,
      },
    ];

    let userPrompt = "";
    let systemPrompt = "";
    streamChatCompletion.mockImplementation(
      async (opts: { messages?: { role: string; content: string }[]; onContentChunk?: (c: string) => void }) => {
        userPrompt = opts.messages?.find((m) => m.role === "user")?.content ?? "";
        systemPrompt = opts.messages?.find((m) => m.role === "system")?.content ?? "";
        opts.onContentChunk?.(JSON.stringify({ titles: ["Millwood, Altona"] }));
      },
    );

    const { pickWikiEntriesFromPool } = await import("../wiki-entity-pool");
    await pickWikiEntriesFromPool({
      pool,
      count: 1,
      parentCity: "Altona, MB",
      sampleAddresses: altonaBucket.sampleAddresses,
      gridLocations: [],
      gridSummaryMarkdown: manitobaGridSummary,
      excludeTitles: [],
      apiKey: "test-key",
      clientAudienceContextMarkdown:
        "- **Business / site name:** Example Accounting LLP\n- **Focus service / product theme:** tax preparation",
      entityTypeFocus: ["Business districts and downtown cores"],
    });

    expect(systemPrompt).toContain("Client-aware preference");
    expect(userPrompt).toContain("Client & site context");
    expect(userPrompt).toContain("Example Accounting LLP");
    expect(userPrompt).toContain("Business districts and downtown cores");
  });

  it("isWikiTitleScopedToParentCity rejects homonym single-token titles", async () => {
    const { isWikiTitleScopedToParentCity } = await import("../wiki-entity-pool");
    expect(isWikiTitleScopedToParentCity("Sherwood", "Sherwood Park, AB")).toBe(false);
    expect(isWikiTitleScopedToParentCity("Sherwood Park", "Sherwood Park, AB")).toBe(true);
    expect(isWikiTitleScopedToParentCity("Broadmoor, Sherwood Park", "Sherwood Park, AB")).toBe(true);
  });
});

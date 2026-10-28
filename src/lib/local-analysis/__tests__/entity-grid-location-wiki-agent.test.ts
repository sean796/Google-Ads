import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  allocatePagesAcrossNeighbourhoodPicks,
  combineKeywordWithFullEntity,
  cycleItemsForRowCount,
  isDirectionalCompassPlaceLabel,
  neighbourhoodPicksFromWikiPool,
  pickNeighbourhoodEntitiesForCluster,
  runEntityGridLocationClusterAgent,
} from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";

const sampleBucket: GridLocationBucket = {
  bucketId: "sherwood-park",
  placeLabel: "Sherwood Park, AB",
  weight: 12,
  avgRank: 8,
  rowCount: 4,
  sampleAddresses: ["99 Coliseum Way, Sherwood Park, AB"],
};

describe("pickNeighbourhoodEntitiesForCluster client context", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          system?: string;
          user?: string;
        };
        expect(body.system ?? "").toContain("Client-aware entity preference");
        expect(body.user ?? "").toContain("clientAudienceContextMarkdown");
        expect(body.user ?? "").toContain("Business districts and downtown cores");
        const content = JSON.stringify({
          parentCity: "Sherwood Park, AB",
          entities: [{ name: "Baseline, Sherwood Park, AB", posWeight: 12 }],
        });
        return new Response(
          JSON.stringify({
            ok: true,
            content,
            raw: {
              choices: [
                {
                  message: { content },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
  });

  it("includes client context and entity type focus in OpenRouter payload", async () => {
    const picks = await pickNeighbourhoodEntitiesForCluster(
      sampleBucket,
      ["Sherwood Park, AB"],
      [],
      1,
      "test-key",
      undefined,
      {
        clientAudienceContextMarkdown:
          "- **Business / site name:** Example Accounting LLP\n- **Focus service / product theme:** tax preparation",
        entityTypeFocus: ["Business districts and downtown cores"],
      },
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]?.name).toBe("Baseline, Sherwood Park, AB");
  });

  it("fills from wikipedia pool when the model reply is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            content:
              "We need answer only valid JSON. Need plan sub-ad neighbourhoods under parent city Calgary, AB",
            raw: { choices: [{ message: { content: "not json" } }] },
          }),
          { status: 200 },
        ),
      ),
    );

    const picks = await pickNeighbourhoodEntitiesForCluster(
      sampleBucket,
      ["Calgary, AB"],
      [],
      2,
      "test-key",
      undefined,
      {
        wikipediaPool: [
          { entityLabel: "Baseline, Sherwood Park, AB", wikipediaTitle: "Baseline, Sherwood Park" },
          { entityLabel: "Summerside, Sherwood Park, AB", wikipediaTitle: "Summerside, Edmonton" },
        ],
      },
    );
    expect(picks).toHaveLength(2);
    expect(picks[0]?.name).toContain("Sherwood Park");
  });

  it("forwards entitiesAlreadyUsed from entity sitemap into neighbourhood pick payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { user?: string };
        const user = JSON.parse(body.user ?? "{}") as { entitiesAlreadyUsed?: string[] };
        expect(user.entitiesAlreadyUsed).toContain("Existing Neighbourhood, Sherwood Park, AB");
        const content = JSON.stringify({
          parentCity: "Sherwood Park, AB",
          entities: [{ name: "Baseline, Sherwood Park, AB", posWeight: 12 }],
        });
        return new Response(
          JSON.stringify({
            ok: true,
            content,
            raw: {
              choices: [
                {
                  message: { content },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );

    const picks = await pickNeighbourhoodEntitiesForCluster(
      sampleBucket,
      ["Sherwood Park, AB"],
      ["Existing Neighbourhood, Sherwood Park, AB"],
      1,
      "test-key",
      undefined,
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]?.name).toBe("Baseline, Sherwood Park, AB");
  });
});

describe("neighbourhoodPicksFromWikiPool", () => {
  it("returns the requested count from harvested labels", () => {
    const picks = neighbourhoodPicksFromWikiPool(
      [
        { entityLabel: "Millwoods, Edmonton, AB" },
        { entityLabel: "Summerside, Edmonton, AB" },
      ],
      2,
      [],
    );
    expect(picks).toHaveLength(2);
  });
});

describe("isDirectionalCompassPlaceLabel", () => {
  it("flags synthetic quadrant labels", () => {
    expect(isDirectionalCompassPlaceLabel("South West Altona, MB")).toBe(true);
    expect(isDirectionalCompassPlaceLabel("North East Altona, MB")).toBe(true);
  });

  it("allows real neighbourhood names", () => {
    expect(isDirectionalCompassPlaceLabel("Millwood, Altona, MB")).toBe(false);
    expect(isDirectionalCompassPlaceLabel("Southland Mall, Winkler, MB")).toBe(false);
  });
});

describe("allocatePagesAcrossNeighbourhoodPicks", () => {
  it("collapses 3 picks into one entity when ad budget is 3", () => {
    const alloc = allocatePagesAcrossNeighbourhoodPicks(
      [
        { name: "Plum Coulee, Altona, MB", posWeight: 1 },
        { name: "Parkview, Altona, MB", posWeight: 1 },
        { name: "Millwood, Altona, MB", posWeight: 1 },
      ],
      3,
    );
    expect(alloc).toHaveLength(1);
    expect(alloc[0]?.pages).toBe(3);
    expect(alloc[0]?.entity).toBe("Plum Coulee, Altona, MB");
  });

  it("keeps multiple neighbourhoods when budget exceeds min per cluster", () => {
    const alloc = allocatePagesAcrossNeighbourhoodPicks(
      [
        { name: "Mill Woods, Edmonton, AB", posWeight: 30 },
        { name: "Oliver, Edmonton, AB", posWeight: 10 },
        { name: "Westmount, Edmonton, AB", posWeight: 5 },
      ],
      7,
    );
    expect(alloc.length).toBeGreaterThan(1);
    expect(alloc.reduce((s, a) => s + a.pages, 0)).toBe(7);
  });
});

describe("cycleItemsForRowCount", () => {
  it("reuses places until row budget is met", () => {
    const places = ["A", "B", "C"];
    expect(cycleItemsForRowCount(places, 5)).toEqual(["A", "B", "C", "A", "B"]);
    expect(cycleItemsForRowCount(places, 3)).toEqual(["A", "B", "C"]);
  });

  it("returns empty when no places", () => {
    expect(cycleItemsForRowCount([], 5)).toEqual([]);
  });
});

describe("cluster defers keywords to hydrate", () => {
  it("combineKeywordWithFullEntity accepts empty base until hydrate", () => {
    expect(combineKeywordWithFullEntity("", "Plum Coulee, Altona, MB")).toBe("");
  });

  it("builds one row per slot with empty baseKeywords", () => {
    const slots = [
      { entity: "Millwood, Altona, MB", wiki: { title: "Millwood" } },
      { entity: "Parkview, Altona, MB", wiki: { title: "Parkview" } },
      { entity: "Plum Coulee, Altona, MB", wiki: { title: "Plum Coulee" } },
    ];
    const rowSlots = cycleItemsForRowCount(slots, 5);
    const plans = rowSlots.map((slot) => ({
      entity: slot.entity,
      baseKeywords: [""],
      sapPageCount: 1,
      wiki: slot.wiki,
    }));
    expect(plans).toHaveLength(5);
    expect(plans.every((p) => p.baseKeywords[0] === "")).toBe(true);
  });
});

describe("explicit layout row budget", () => {
  it("cycles places to fill locations per ad group", () => {
    const slots = ["Plum Coulee", "Parkview", "Millwood"];
    expect(cycleItemsForRowCount(slots, 5)).toEqual([
      "Plum Coulee",
      "Parkview",
      "Millwood",
      "Plum Coulee",
      "Parkview",
    ]);
    expect(cycleItemsForRowCount(slots, 7)).toHaveLength(7);
  });

  it("reuses one grid location for every slot in an ad group", () => {
    const fallbackLocation = "Schanzenfeld, MB";
    expect(cycleItemsForRowCount([fallbackLocation], 5)).toEqual([
      fallbackLocation,
      fallbackLocation,
      fallbackLocation,
      fallbackLocation,
      fallbackLocation,
    ]);
  });

  it("matches configured ad groups x locations per group", () => {
    const adGroups = 4;
    const locationsPerGroup = 6;
    const configuredTotal = adGroups * locationsPerGroup;
    const perGroup = cycleItemsForRowCount(["A", "B", "C"], locationsPerGroup);
    expect(perGroup).toHaveLength(locationsPerGroup);
    const total = Array.from({ length: adGroups }, () => perGroup).flat();
    expect(total).toHaveLength(configuredTotal);
  });

  it("cycles one city bucket across ad groups for full row budget", () => {
    const locationsPerGroup = 5;
    const adGroups = 3;
    const configuredTotal = adGroups * locationsPerGroup;
    const oneCitySlots = cycleItemsForRowCount(["North End", "Transcona", "Wolseley"], locationsPerGroup);
    const threeGroups = cycleItemsForRowCount(["Altona"], adGroups);
    const total = threeGroups.flatMap(() => oneCitySlots);
    expect(total).toHaveLength(configuredTotal);
    expect(new Set(threeGroups).size).toBe(1);
  });
});

describe("runEntityGridLocationClusterAgent profile location", () => {
  it("fails when there is no grid and no profile city", async () => {
    await expect(
      runEntityGridLocationClusterAgent({
        apiKey: "test-key",
        gridRows: [],
        gridKeywordWeights: [],
        buckets: [],
        gridLocations: [],
        gridSummaryMarkdown: "",
        totalSapBudget: 9,
      }),
    ).rejects.toThrow("No city on this site profile for location clustering.");
  });
});

describe("explicit layout ad slots", () => {
  it("expects one entity per slot (3 slots = 3 distinct entities, not allocatePages merge)", () => {
    const picks = [
      { name: "Plum Coulee, Altona, MB", posWeight: 1 },
      { name: "Parkview, Altona, MB", posWeight: 1 },
      { name: "Millwood, Altona, MB", posWeight: 1 },
    ];
    const merged = allocatePagesAcrossNeighbourhoodPicks(picks, 3);
    expect(merged).toHaveLength(1);
    const perSlot = picks.slice(0, 3).map((p) => p.name);
    expect(new Set(perSlot).size).toBe(3);
    expect(perSlot).not.toEqual([merged[0]?.entity, merged[0]?.entity, merged[0]?.entity]);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { syncPromptBlogRowsToCount } from "@/lib/bulk/prompt-blog-slots";
import { buildSyncPreloadRowsFromGrid } from "@/lib/local-analysis/entity-sync-grid-preload";
import { allocatePagesAcrossNeighbourhoodPicks } from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import { buildEntityAdGroupSections } from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  assignUniqueEntitiesToSlots,
  assignUniqueKeywordsPerAdGroup,
  fillBlankEntitySlotEntities,
  fillBlankEntitySlotKeywords,
  isBadPreloadEntityLabel,
  pickUniqueSuggestedKeywords,
  refreshEntityPreloadSlotKeywords,
} from "@/lib/local-analysis/entity-preload-suggested-keywords";

vi.mock("@/lib/local-analysis/entity-grid-location-wiki-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-analysis/entity-grid-location-wiki-agent")>();
  return {
    ...actual,
    pickNeighbourhoodEntitiesForCluster: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/local-analysis/entity-site-warm-cache", () => ({
  getEntitySiteWarmCacheIfReady: vi.fn(() => null),
  ensureEntitySiteWarmCache: vi.fn(async () => ({ error: "test skip" })),
  gscQueriesFromWarmBundleForSapBudget: vi.fn(() => []),
}));

vi.mock("@/lib/content-brand-ai-gate", () => ({
  aiFilterAllowedBrandTexts: vi.fn(async (args: { candidates: string[] }) => args.candidates),
  aiRejectBrandOrBlockedTexts: vi.fn(async () => []),
}));

vi.mock("@/lib/local-analysis/stamp-preload-entity-wikipedia", () => ({
  stampPreloadRowsWithUniqueEntityWikipedia: vi.fn(async (rows: unknown[]) => rows),
}));

const GRID_CSV = `Keyword,Address,Latitude,Longitude,Rank
blinds near me,"195 Mountain Ave, Winkler, MB",49.181,-97.939,8
blinds near me,"210 Mountain Ave, Winkler, MB",49.182,-97.938,12
blinds near me,"Southland Mall, Winkler, MB",49.175,-97.945,15`;

const TEST_SITE = {
  id: "test-site",
  name: "Test Site",
  siteUrl: "https://example.com",
} as WordPressSite;

describe("entity-preload-suggested-keywords", () => {
  it("pickUniqueSuggestedKeywords returns unique list and respects alreadyUsed", () => {
    const out = pickUniqueSuggestedKeywords(
      ["blinds edmonton", "roman shades", "Blinds Edmonton", "solar shades", "roman shades"],
      3,
      ["roman shades"],
    );
    expect(out).toEqual(["blinds edmonton", "solar shades"]);
  });

  it("pickUniqueSuggestedKeywords returns empty when candidates empty", () => {
    expect(pickUniqueSuggestedKeywords([], 5, [])).toEqual([]);
  });

  it("fillBlankEntitySlotKeywords fills blanks and preserves edits", () => {
    const rows = fillBlankEntitySlotKeywords(
      [
        { keyword: "kept by user", title: "" },
        { keyword: "", title: "" },
        { keyword: "  ", title: "" },
        { keyword: "", title: "t" },
      ],
      ["a", "b", "c"],
    );
    expect(rows.map((r) => r.keyword)).toEqual(["kept by user", "a", "b", "c"]);
    expect(rows[3].title).toBe("t");
  });

  it("isBadPreloadEntityLabel rejects street addresses", () => {
    expect(
      isBadPreloadEntityLabel("10615 170 St NW, Edmonton, Alberta T5P 4W2, CA"),
    ).toBe(true);
    expect(isBadPreloadEntityLabel("Edmonton, AB")).toBe(false);
    expect(isBadPreloadEntityLabel("Mill Woods, Edmonton, AB")).toBe(false);
  });

  it("fillBlankEntitySlotEntities replaces street address with city place", () => {
    const rows = fillBlankEntitySlotEntities(
      [
        { keyword: "a", title: "", entity: "Westmount, Edmonton" },
        {
          keyword: "b",
          title: "",
          entity: "10615 170 St NW, Edmonton, Alberta T5P 4W2, CA",
        },
        { keyword: "c", title: "" },
      ],
      "Edmonton, AB",
    );
    expect(rows.map((r) => r.entity)).toEqual([
      "Westmount, Edmonton",
      "Edmonton, AB",
      "Edmonton, AB",
    ]);
  });

  it("assignUniqueEntitiesToSlots fills bad/blank only", () => {
    const rows = assignUniqueEntitiesToSlots(
      [
        { keyword: "a", title: "", entity: "Oliver, Edmonton, AB" },
        { keyword: "b", title: "" },
        { keyword: "c", title: "", entity: "123 Main St, Edmonton, AB" },
      ],
      ["Mill Woods, Edmonton, AB", "Westmount, Edmonton, AB"],
    );
    expect(rows.map((r) => r.entity)).toEqual([
      "Oliver, Edmonton, AB",
      "Mill Woods, Edmonton, AB",
      "Westmount, Edmonton, AB",
    ]);
  });

  it("allocatePagesAcrossNeighbourhoodPicks gives multi-page AdGroups from POS weights", () => {
    const alloc = allocatePagesAcrossNeighbourhoodPicks(
      [
        { name: "Mill Woods, Edmonton, AB", posWeight: 30 },
        { name: "Oliver, Edmonton, AB", posWeight: 10 },
        { name: "Westmount, Edmonton, AB", posWeight: 5 },
        { name: "Canora, Edmonton, AB", posWeight: 5 },
        { name: "Namao, Edmonton, AB", posWeight: 5 },
        { name: "Erin Ridge, St. Albert, AB", posWeight: 5 },
        { name: "Meadowlark Park, Edmonton, AB", posWeight: 5 },
      ],
      7,
    );
    expect(alloc.length).toBeLessThanOrEqual(2);
    expect(alloc.reduce((s, a) => s + a.pages, 0)).toBe(7);
    expect(alloc.every((a) => a.pages >= 1)).toBe(true);
    expect(Math.max(...alloc.map((a) => a.pages))).toBeGreaterThan(1);
  });

  it("syncing amount 3→5 pads; 5→2 trims; keywords preserved on surviving indices", () => {
    const at3 = syncPromptBlogRowsToCount(
      [
        { keyword: "one", title: "" },
        { keyword: "two", title: "" },
        { keyword: "three", title: "" },
      ],
      3,
    );
    const at5 = syncPromptBlogRowsToCount(at3, 5);
    expect(at5).toHaveLength(5);
    expect(at5[0].keyword).toBe("one");
    expect(at5[1].keyword).toBe("two");
    expect(at5[2].keyword).toBe("three");
    expect(at5[3].keyword).toBe("");
    expect(at5[4].keyword).toBe("");

    const at2 = syncPromptBlogRowsToCount(at5, 2);
    expect(at2).toHaveLength(2);
    expect(at2[0].keyword).toBe("one");
    expect(at2[1].keyword).toBe("two");
  });

  it("refresh returns rows unchanged when entity and keyword already set", async () => {
    const rows = buildSyncPreloadRowsFromGrid({
      rows: syncPromptBlogRowsToCount([], 1),
      gridCsvText: GRID_CSV,
      entityTypeFocus: ["Neighbourhoods and residential quarters"],
      adGroupCount: 1,
      adsPerGroup: 1,
    });
    const withKeywords = rows.map((r) => ({
      ...r,
      entity: "Southland Mall, Winkler, MB",
      keyword: "blinds near me southland mall",
    }));
    const next = await refreshEntityPreloadSlotKeywords(TEST_SITE, withKeywords, {
      apiKey: "test-key",
      model: "test-model",
      entityTypeFocus: ["Neighbourhoods and residential quarters"],
      gridCsvText: GRID_CSV,
    });
    expect(buildEntityAdGroupSections(next).length).toBeGreaterThan(0);
    expect(next.every((r) => r.entity?.trim() && r.keyword?.trim())).toBe(true);
    expect(next[0]?.entity).toBe(withKeywords[0]?.entity);
    expect(next[0]?.keyword).toBe(withKeywords[0]?.keyword);
  });

  it("refresh preserves sync entity when OpenRouter neighbourhood pick is empty", async () => {
    const rows = buildSyncPreloadRowsFromGrid({
      rows: syncPromptBlogRowsToCount([], 1),
      gridCsvText: GRID_CSV,
      entityTypeFocus: ["Neighbourhoods and residential quarters"],
      adGroupCount: 1,
      adsPerGroup: 1,
    });
    const entity = "Southland Mall, Winkler, MB";
    const partial = [{ ...rows[0]!, entity, keyword: "" }];
    const next = await refreshEntityPreloadSlotKeywords(TEST_SITE, partial, {
      apiKey: "test-key",
      model: "test-model",
      entityTypeFocus: ["Neighbourhoods and residential quarters"],
      gridCsvText: GRID_CSV,
    });
    expect(next[0]?.entity?.trim()).toBe(entity);
  });

  it("assignUniqueKeywordsPerAdGroup keeps existing keyword when strip would blank it", () => {
    const rows = assignUniqueKeywordsPerAdGroup(
      [
        {
          keyword: "blinds near me southland mall winkler",
          title: "",
          entity: "Southland Mall, Winkler, MB",
        },
      ],
      ["Winkler, MB", "Southland Mall, Winkler, MB"],
      [],
    );
    expect(rows[0]?.keyword?.trim()).toBeTruthy();
  });
});

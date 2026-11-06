import { describe, expect, it, vi } from "vitest";
import {
  assertBulkInventorySnapshotReady,
  fullPostSnapshotFromInventoryRow,
  seedAllBulkPrefetchCachesFromInventory,
} from "../bulk-optimization-seed-from-inventory";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { SetStateAction } from "react";
import type { BulkOptimizationState } from "../use-optimization-state";

const site: WordPressSite = {
  id: "site-1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
};

function snapshotForRow(row: SitePostInventoryRow) {
  const postsMaps = buildInventoryLookupMaps([row], site.siteUrl);
  return {
    postsMaps,
    pagesMaps: buildInventoryLookupMaps([], site.siteUrl),
    customMapsByCollection: {},
  };
}

const fullRow: SitePostInventoryRow = {
  id: 42,
  slug: "energy-rebate",
  url: "https://example.com/service-area/energy-rebate/",
  date_gmt: "2026-01-01T00:00:00",
  fields: {
    title: "Energy Rebate",
    meta: "",
    keyword: "energy rebate st albert",
    content: "<p>Substantive post body for optimization harness.</p>",
    excerpt: "Excerpt",
  },
  acf: {
    keyword_focus: "energy rebate st albert",
    seo_research: '{"brief":"ok"}',
  },
};

describe("assertBulkInventorySnapshotReady", () => {
  it("throws when snapshot is empty", () => {
    expect(() => assertBulkInventorySnapshotReady(null)).toThrow(/requires WordPress inventory/);
    expect(() =>
      assertBulkInventorySnapshotReady({
        postsMaps: buildInventoryLookupMaps([], site.siteUrl),
        pagesMaps: buildInventoryLookupMaps([], site.siteUrl),
        customMapsByCollection: {},
      }),
    ).toThrow(/requires WordPress inventory/);
  });
});

describe("seedAllBulkPrefetchCachesFromInventory", () => {
  it("seeds all caches from inventory without WordPress API", () => {
    const url = fullRow.url;
    const acfCache = new Map<number, Record<string, unknown>>();
    const postCache = new Map();
    const fullPostCache = new Map<number, Record<string, unknown>>();
    const pendingCache = new Map();
    const setBulk = vi.fn(
      (action: SetStateAction<Record<string, BulkOptimizationState>>) => {
        if (typeof action === "function") action({});
      },
    );

    const result = seedAllBulkPrefetchCachesFromInventory({
      site,
      urls: [url],
      batchKey: "site-1-batch",
      bulkInventorySnapshot: snapshotForRow(fullRow),
      updateMode: "update",
      optimizationOptions: { optimizeContent: true },
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      isAcfKeywordMode: true,
      prefetchedAcfFieldsCache: acfCache,
      prefetchedPostPayloadByUrlIndex: postCache,
      prefetchedAcfFullPostByUrlIndex: fullPostCache,
      prefetchedPendingCache: pendingCache,
      setBulkOptimizationState: setBulk,
    });

    expect(result.urlKeywords[url]).toBe("energy rebate st albert");
    expect(acfCache.get(0)?.keyword_focus).toBe("energy rebate st albert");
    expect(postCache.get(0)?.id).toBe(42);
    expect(pendingCache.get(0)?.primaryKeyword).toBe("energy rebate st albert");
    expect((pendingCache.get(0)?.pending as { optimizationOptions?: { hasEntity?: boolean } }).optimizationOptions?.hasEntity).toBe(false);
    expect(fullPostCache.get(0)).toEqual({
      id: 42,
      link: fullRow.url,
      slug: "energy-rebate",
      acf: fullRow.acf,
    });
    expect(setBulk).toHaveBeenCalled();
  });

  it("fullPostSnapshotFromInventoryRow nests acf for upload reuse", () => {
    expect(fullPostSnapshotFromInventoryRow(fullRow)).toEqual({
      id: 42,
      link: fullRow.url,
      slug: "energy-rebate",
      acf: fullRow.acf,
    });
  });

  it("seeds when keyword is missing (AI fills during SERP warmup)", () => {
    const row: SitePostInventoryRow = {
      ...fullRow,
      fields: { ...fullRow.fields, keyword: "", content: fullRow.fields?.content },
      acf: {},
    };

    const pendingCache = new Map();
    const result = seedAllBulkPrefetchCachesFromInventory({
      site,
      urls: [row.url],
      batchKey: "site-1-batch",
      bulkInventorySnapshot: snapshotForRow(row),
      updateMode: "update",
      optimizationOptions: { optimizeContent: true },
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      isAcfKeywordMode: true,
      prefetchedAcfFieldsCache: new Map(),
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
      prefetchedPendingCache: pendingCache,
      setBulkOptimizationState: vi.fn(),
    });

    expect(result.skippedUrls[row.url]).toBeUndefined();
    expect(pendingCache.has(0)).toBe(true);
    expect(Object.keys(result.urlKeywords)).toHaveLength(0);
  });

  it("seeds when body is empty (session CSV, no re-fetch)", () => {
    const row: SitePostInventoryRow = {
      ...fullRow,
      fields: {
        title: "T",
        meta: "",
        keyword: "kw",
        content: "",
        excerpt: "",
      },
    };

    const pendingCache = new Map();
    const result = seedAllBulkPrefetchCachesFromInventory({
      site,
      urls: [row.url],
      batchKey: "site-1-batch",
      bulkInventorySnapshot: snapshotForRow(row),
      updateMode: "update",
      optimizationOptions: { optimizeContent: true },
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      isAcfKeywordMode: true,
      prefetchedAcfFieldsCache: new Map(),
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
      prefetchedPendingCache: pendingCache,
      setBulkOptimizationState: vi.fn(),
    });

    expect(result.skippedUrls[row.url]).toBeUndefined();
    expect(pendingCache.has(0)).toBe(true);
  });

  it("skips when URL is not in inventory", () => {
    const result = seedAllBulkPrefetchCachesFromInventory({
      site,
      urls: ["https://example.com/missing/"],
      batchKey: "site-1-batch",
      bulkInventorySnapshot: snapshotForRow(fullRow),
      updateMode: "update",
      optimizationOptions: { optimizeContent: true },
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      isAcfKeywordMode: true,
      prefetchedAcfFieldsCache: new Map(),
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
      prefetchedPendingCache: new Map(),
      setBulkOptimizationState: vi.fn(),
    });

    expect(result.skippedUrls["https://example.com/missing/"]).toBe("Not in WordPress inventory");
  });
});

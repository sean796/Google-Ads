import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import {
  clearBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";

const prefetchPageGscMock = vi.fn().mockResolvedValue(new Map());
const prefetchAcfMock = vi.fn().mockResolvedValue(undefined);
const postLoopMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../bulk-optimization-prefetch-page-gsc", () => ({
  prefetchBulkPageGscForUrls: (...args: unknown[]) => prefetchPageGscMock(...args),
  applyPageGscToPendingCache: vi.fn(),
  gscResultFromPagePerformance: vi.fn(),
  lookupPageGsc: vi.fn(),
  pageGscQueryStringsFromPending: vi.fn(() => []),
}));

vi.mock("../bulk-optimization-prefetch-acf-by-post-id", () => ({
  prefetchBulkAcfFieldsByPostIdForUrls: (...args: unknown[]) => prefetchAcfMock(...args),
}));

vi.mock("../bulk-optimization-post-loop", () => ({
  bulkOptimizationRunPostLoop: (...args: unknown[]) => postLoopMock(...args),
}));

vi.mock("../bulk-optimization-serp-warmup", () => ({
  createBulkSerpWarmupController: () => ({
    stop: vi.fn(),
    onUrlComplete: vi.fn(),
    seedReadyFromAcf: vi.fn(),
  }),
}));

vi.mock("../bulk-optimization-google-maps-image-warmup", () => ({
  bulkSapGoogleMapsImageWarmupEnabled: () => false,
  createBulkGoogleMapsImageWarmupController: () => ({
    stop: vi.fn(),
  }),
}));

import { handleOptimizeMultipleContent } from "../bulk-optimization";

const site: WordPressSite = {
  id: "site-prep-warm",
  name: "Prep Warm",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: Date.now(),
  enabled: true,
};

const batchUrl = "https://example.com/post-a/";

function postsSnapshot() {
  return {
    postsMaps: buildInventoryLookupMaps(
      [
        {
          id: 1,
          slug: "post-a",
          url: batchUrl,
          fields: { title: "Post A", meta: "", content: "", excerpt: "", keyword: "kw" },
          acf: { keyword_focus: "kw" },
        },
      ],
      site.siteUrl,
    ),
    pagesMaps: buildInventoryLookupMaps([], site.siteUrl),
    customMapsByCollection: {},
  };
}

describe("handleOptimizeMultipleContent useSiteWarmCacheOnly", () => {
  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-prep-warm");
    prefetchPageGscMock.mockClear();
    prefetchAcfMock.mockClear();
    postLoopMock.mockClear();
    setBulkInventorySessionSnapshot("site-prep-warm", "posts", postsSnapshot());
    setBulkInventorySessionSnapshot("site-prep-warm", "pages", {
      postsMaps: buildInventoryLookupMaps([], site.siteUrl),
      pagesMaps: buildInventoryLookupMaps([], site.siteUrl),
      customMapsByCollection: {},
    });
  });

  it("skips page GSC and ACF batch prefetch during agent warm-cache prep", async () => {
    const result = await handleOptimizeMultipleContent({
      site,
      urls: [batchUrl],
      updateMode: "update",
      setGscQueriesForSelection: vi.fn(),
      setIsKeywordSelectionOpen: vi.fn(),
      setGscClusterAnalysis: vi.fn(),
      setIsAnalyzingClusters: vi.fn(),
      optimizationOptions: {
        optimizeMeta: true,
        inventorySitemapSource: "posts",
      },
      setIsOptimizingContent: vi.fn(),
      setOptimizationProgress: vi.fn(),
      setBulkOptimizationState: vi.fn(),
      optimizationFileManagers: {},
      continueOptimizationRef: { current: null },
      muteToasts: true,
      prefetchedBulkInventorySnapshot: postsSnapshot(),
      useSiteWarmCacheOnly: true,
    });

    expect(result.prepCompleted).toBe(true);
    expect(prefetchPageGscMock).not.toHaveBeenCalled();
    expect(prefetchAcfMock).not.toHaveBeenCalled();
    expect(postLoopMock).toHaveBeenCalled();
  });
});

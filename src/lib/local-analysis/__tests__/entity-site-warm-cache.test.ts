import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";

const loadInventoryMock = vi.fn();
const fetchGscMock = vi.fn();
const masterMock = vi.fn();
const persistReadMock = vi.fn();
const persistWriteMock = vi.fn();
const persistDeleteMock = vi.fn();
const bulkReadyMock = vi.fn();

vi.mock("@/lib/bulk/bulk-sitemap-inventory-session", () => ({
  loadBulkSitemapInventoryForSite: (...args: unknown[]) => loadInventoryMock(...args),
}));

vi.mock("@/lib/competitor-research/competitor-gsc-queries", () => ({
  COMPETITOR_GSC_QUERY_ROW_LIMIT: 500,
  fetchCompetitorGscQueries: (...args: unknown[]) => fetchGscMock(...args),
  getDefaultGscCompetitorDateRange: () => ({
    startDate: "2026-04-01",
    endDate: "2026-07-01",
  }),
  getGscNinetyDayCompetitorDateRange: () => ({
    startDate: "2026-04-01",
    endDate: "2026-07-01",
  }),
}));

vi.mock("@/lib/master-instructions-storage", () => ({
  ensureMasterInstructionsInMemory: (...args: unknown[]) => masterMock(...args),
}));

vi.mock("@/lib/local-analysis/site-prefetch-persist", () => ({
  readWarmUrlMirrorSync: () => [],
  readSitePrefetchPersist: (...args: unknown[]) => persistReadMock(...args),
  writeSitePrefetchPersist: (...args: unknown[]) => persistWriteMock(...args),
  deleteSitePrefetchPersist: (...args: unknown[]) => persistDeleteMock(...args),
  bundleToPersisted: (b: unknown) => b,
}));

vi.mock("@/lib/bulk/bulk-generation-inventory-cache-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bulk/bulk-generation-inventory-cache-store")>();
  return {
    ...actual,
    getBulkGenerationWpInventoryIfReady: (...args: unknown[]) => bulkReadyMock(...args),
  };
});

import {
  bootstrapEntitySiteWarmOnAppLoad,
  clearEntitySiteWarmCache,
  ensureEntitySiteWarmCache,
  ensureEntitySiteWarmInventory,
  getEntitySiteWarmCacheIfReady,
  gscQueriesFromWarmBundleForSapBudget,
  invalidateEntitySiteWarmCacheIfCredentialsChanged,
  isSitePrefetchStale,
  refreshSitePrefetch,
  seedOverviewSessionCachesFromWarm,
  SITE_PREFETCH_TTL_MS,
  siteWarmCredentialsKey,
  warmEntitySiteCache,
} from "@/lib/local-analysis/entity-site-warm-cache";

const site: WordPressSite = {
  id: "wp-test",
  name: "Test Site",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: Date.now(),
  enabled: true,
};

function mockInventory() {
  return {
    links: [],
    buckets: {
      pages: { json: '["https://example.com/page/"]', rowCount: 10 },
      posts: { json: "", rowCount: 20 },
      sap: { json: "", rowCount: 15 },
    },
    totalRows: 45,
    sources: ["pages", "posts", "sap"] as const,
    errors: {},
    postsMetadata: [],
  };
}

function mockBulkRows() {
  return [{ url: "https://example.com/page/", id: 1, slug: "page", fields: { title: "Page" } }];
}

function mockGscOk() {
  fetchGscMock.mockResolvedValue({
    ok: true,
    queries: [
      { query: "blinds near me", clicks: 50, impressions: 500, ctr: 0.1, position: 3 },
      { query: "custom blinds", clicks: 40, impressions: 400, ctr: 0.1, position: 4 },
      { query: "window shades", clicks: 30, impressions: 300, ctr: 0.1, position: 5 },
    ],
    dateRange: { startDate: "2026-04-01", endDate: "2026-07-01" },
  });
}

import {
  getOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";

describe("entity-site-warm-cache", () => {
  beforeEach(() => {
    clearEntitySiteWarmCache();
    loadInventoryMock.mockReset();
    fetchGscMock.mockReset();
    masterMock.mockReset();
    persistReadMock.mockReset();
    persistWriteMock.mockReset();
    persistDeleteMock.mockReset();
    bulkReadyMock.mockReset();
    loadInventoryMock.mockResolvedValue(mockInventory());
    bulkReadyMock.mockReturnValue(mockBulkRows());
    mockGscOk();
    masterMock.mockResolvedValue(undefined);
    persistReadMock.mockResolvedValue(null);
    persistWriteMock.mockResolvedValue(undefined);
    persistDeleteMock.mockResolvedValue(undefined);
  });

  it("seedOverviewSessionCachesFromWarm writes overview session rows from bulk inventory", async () => {
    bulkReadyMock.mockReturnValue([
      {
        id: 1,
        url: "https://example.com/post-a/",
        slug: "post-a",
        collection: "posts",
        date_gmt: "2024-01-01T00:00:00",
        fields: { title: "Post A", meta: "", keyword: "Post A" },
      },
      {
        id: 2,
        url: "https://example.com/page-b/",
        slug: "page-b",
        collection: "pages",
        date_gmt: "2024-02-01T00:00:00",
        fields: { title: "Page B", meta: "", keyword: "pages" },
      },
    ]);
    await ensureEntitySiteWarmCache(site);

    seedOverviewSessionCachesFromWarm(site);

    const posts = getOverviewRowsSessionCache(site.id, "posts");
    expect(posts?.length).toBe(1);
    expect(posts?.[0]?.title).toBe("Post A");
    expect(posts?.[0]?.focusKeyword).toBe("Post A");
  });

  it("siteWarmCredentialsKey tracks url username password", () => {
    expect(siteWarmCredentialsKey(site)).toBe("https://example.com|user|pass");
  });

  it("ensureEntitySiteWarmCache fetches inventory and GSC in parallel once", async () => {
    const bundle = await ensureEntitySiteWarmCache(site);
    expect(bundle.error).toBeUndefined();
    expect(bundle.counts.inventoryTotal).toBe(45);
    expect(bundle.counts.gscQueries).toBe(3);
    expect(loadInventoryMock).toHaveBeenCalledTimes(1);
    expect(fetchGscMock).toHaveBeenCalledTimes(1);
    expect(persistWriteMock).toHaveBeenCalledTimes(1);
  });

  it("getEntitySiteWarmCacheIfReady returns cached bundle without refetch", async () => {
    await ensureEntitySiteWarmCache(site);
    const ready = getEntitySiteWarmCacheIfReady(site.id);
    expect(ready?.counts.gscQueries).toBe(3);
    await ensureEntitySiteWarmCache(site);
    expect(loadInventoryMock).toHaveBeenCalledTimes(1);
  });

  it("isSitePrefetchStale is true after 24 hours", async () => {
    const bundle = await ensureEntitySiteWarmCache(site);
    bundle.fetchedAt = Date.now() - SITE_PREFETCH_TTL_MS - 1;
    expect(isSitePrefetchStale(bundle)).toBe(true);
  });

  it("stale cache returns the same bundle immediately", async () => {
    const bundle = await ensureEntitySiteWarmCache(site);
    bundle.fetchedAt = Date.now() - SITE_PREFETCH_TTL_MS - 1;
    const again = await ensureEntitySiteWarmCache(site);
    expect(again).toBe(bundle);
    expect(again.counts.gscQueries).toBe(3);
  });

  it("hydrates from persisted cache without network on cold start", async () => {
    const persisted = await ensureEntitySiteWarmCache(site);
    clearEntitySiteWarmCache(site.id);
    loadInventoryMock.mockClear();
    fetchGscMock.mockClear();
    persistReadMock.mockResolvedValueOnce({
      ...persisted,
      fetchedAt: Date.now(),
    });

    const hydrated = await ensureEntitySiteWarmCache(site);
    expect(hydrated.counts.gscQueries).toBe(3);
    expect(loadInventoryMock).not.toHaveBeenCalled();
    expect(fetchGscMock).not.toHaveBeenCalled();
  });

  it("refreshSitePrefetch forces refetch", async () => {
    await ensureEntitySiteWarmCache(site);
    await refreshSitePrefetch(site);
    expect(loadInventoryMock).toHaveBeenCalledTimes(2);
    expect(persistWriteMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("gscQueriesFromWarmBundleForSapBudget slices to budget plus 20", async () => {
    const bundle = await ensureEntitySiteWarmCache(site);
    const sliced = gscQueriesFromWarmBundleForSapBudget(bundle, 45);
    expect(sliced.length).toBe(3);
    expect(sliced[0]?.query).toBe("blinds near me");
  });

  it("invalidateEntitySiteWarmCacheIfCredentialsChanged clears stale cache", async () => {
    await ensureEntitySiteWarmCache(site);
    expect(getEntitySiteWarmCacheIfReady(site.id)).not.toBeNull();

    invalidateEntitySiteWarmCacheIfCredentialsChanged({
      ...site,
      appPassword: "new-pass",
    });

    expect(getEntitySiteWarmCacheIfReady(site.id)).toBeNull();
  });

  it("warmEntitySiteCache dedupes inflight", async () => {
    warmEntitySiteCache(site);
    warmEntitySiteCache(site);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadInventoryMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat empty inventory partial as ready", async () => {
    let resolveInventory: (value: ReturnType<typeof mockInventory>) => void = () => {};
    loadInventoryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInventory = resolve;
        }),
    );

    const pending = ensureEntitySiteWarmCache(site);
    await new Promise((r) => setTimeout(r, 0));
    expect(getEntitySiteWarmCacheIfReady(site.id)).toBeNull();

    resolveInventory(mockInventory());
    const bundle = await pending;
    expect(bundle.counts.inventoryTotal).toBe(45);
    expect(getEntitySiteWarmCacheIfReady(site.id)?.counts.inventoryTotal).toBe(45);
  });

  it("ensureEntitySiteWarmCache resolves when inventory load fails", async () => {
    loadInventoryMock.mockRejectedValueOnce(new Error("<html>504 Gateway Time-out</html>"));
    await expect(ensureEntitySiteWarmCache(site)).resolves.toMatchObject({
      counts: { inventoryTotal: 0 },
    });
    expect(fetchGscMock).toHaveBeenCalled();
  });

  it("warmEntitySiteCache starts GSC with site URL only", async () => {
    const gscOnlySite: WordPressSite = {
      ...site,
      username: "",
      appPassword: "",
    };
    warmEntitySiteCache(gscOnlySite);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchGscMock).toHaveBeenCalledTimes(1);
    expect(loadInventoryMock).not.toHaveBeenCalled();
  });

  it("ensureEntitySiteWarmInventory resolves while GSC is still pending", async () => {
    bulkReadyMock.mockReturnValue(null);
    fetchGscMock.mockImplementation(() => new Promise(() => {}));
    await ensureEntitySiteWarmInventory(site);
    expect(loadInventoryMock).toHaveBeenCalledTimes(1);
  });

  it("requireGsc waits for inflight when cache has inventory but no GSC yet", async () => {
    let resolveGsc!: (value: {
      ok: boolean;
      queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
      dateRange: { startDate: string; endDate: string };
    }) => void;
    fetchGscMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGsc = resolve;
        }),
    );

    const pending = ensureEntitySiteWarmCache(site);
    await new Promise((r) => setTimeout(r, 0));

    const partialReady = getEntitySiteWarmCacheIfReady(site.id);
    expect(partialReady?.counts.inventoryTotal).toBe(45);
    expect(partialReady?.counts.gscQueries).toBe(0);

    const requireGscPending = ensureEntitySiteWarmCache(site, { requireGsc: true });
    let requireGscSettled = false;
    void requireGscPending.then(() => {
      requireGscSettled = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(requireGscSettled).toBe(false);

    resolveGsc({
      ok: true,
      queries: [{ query: "blinds near me", clicks: 50, impressions: 500, ctr: 0.1, position: 3 }],
      dateRange: { startDate: "2026-04-01", endDate: "2026-07-01" },
    });

    const bundle = await requireGscPending;
    expect(bundle.counts.gscQueries).toBeGreaterThan(0);
    await pending;
  });

  it("requireGsc ignores persisted bundle with inventory but zero GSC queries", async () => {
    const persisted = await ensureEntitySiteWarmCache(site);
    clearEntitySiteWarmCache(site.id);
    loadInventoryMock.mockClear();
    fetchGscMock.mockClear();
    persistReadMock.mockResolvedValueOnce({
      ...persisted,
      gsc: { queries: [], dateRange: persisted.gsc.dateRange },
      counts: { ...persisted.counts, gscQueries: 0 },
      fetchedAt: Date.now(),
    });

    const bundle = await ensureEntitySiteWarmCache(site, { requireGsc: true });
    expect(bundle.counts.gscQueries).toBe(3);
    expect(loadInventoryMock).toHaveBeenCalledTimes(1);
    expect(fetchGscMock).toHaveBeenCalledTimes(1);
  });
});

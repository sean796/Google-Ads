import { describe, expect, it, beforeEach, vi } from "vitest";
import { ensureBulkOptimizerInventoryForRun } from "@/hooks/content-optimization/bulk-optimization-load-inventory-snapshot";
import {
  resolveTaskExecutionBucketInventory,
  workUrlsFromExplicitTargets,
} from "@/lib/task-execution-resolve-bucket-urls";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import {
  clearBulkInventorySessionSnapshot,
  getBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";

const fetchOverviewInventoryForSource = vi.fn();
const getWarmMock = vi.fn();

vi.mock("@/lib/overview/overview-parallel-inventory-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overview/overview-parallel-inventory-fetch")>();
  return {
    ...actual,
    fetchOverviewInventoryForSource: (...args: unknown[]) => fetchOverviewInventoryForSource(...args),
  };
});

vi.mock("@/lib/local-analysis/entity-site-warm-cache", () => ({
  getEntitySiteWarmCacheIfReady: (...args: unknown[]) => getWarmMock(...args),
}));

vi.mock("@/lib/bulk/bulk-generation-wp-inventory", () => ({
  getBulkGenerationWpInventoryIfReady: vi.fn(() => null),
}));

describe("resolveTaskExecutionBucketUrls session seeding", () => {
  const site = {
    id: "site-agent",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
  } as never;

  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-agent");
    fetchOverviewInventoryForSource.mockReset();
    getWarmMock.mockReset();
    getWarmMock.mockReturnValue(null);
    fetchOverviewInventoryForSource.mockResolvedValue({
      rows: [
        {
          collection: "posts",
          id: 1,
          slug: "post-a",
          url: "https://example.com/post-a/",
          fields: { title: "Post A", content: "", excerpt: "", meta: "", keyword: "" },
        },
      ],
      errors: {},
    });
  });

  it("seeds session cache when posts bucket is live-fetched", async () => {
    expect(getBulkInventorySessionSnapshot("site-agent", "posts")).toBeNull();

    const resolved = await resolveTaskExecutionBucketInventory(site, "posts");

    expect(resolved.urls).toEqual(["https://example.com/post-a/"]);
    expect(getBulkInventorySessionSnapshot("site-agent", "posts")?.postsMaps.byLink.size).toBe(1);

    const snapshot = await ensureBulkOptimizerInventoryForRun(site, resolved.urls, "posts");
    expect(snapshot.postsMaps.byLink.size).toBe(1);
  });
});

describe("resolveTaskExecutionBucketInventory warm cache", () => {
  const site = {
    id: "site-warm-resolve",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
  } as never;

  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-warm-resolve");
    fetchOverviewInventoryForSource.mockReset();
    getWarmMock.mockReset();
  });

  it("resolves posts from warm cache without live fetch", async () => {
    getWarmMock.mockReturnValue({
      siteId: "site-warm-resolve",
      counts: { inventoryTotal: 1, pages: 0, posts: 1, sap: 0, gscQueries: 0 },
      bulkInventoryRows: [
        {
          id: 1,
          collection: "posts",
          url: "https://example.com/post-a/",
          slug: "post-a",
          fields: { title: "Post A", content: "", excerpt: "", meta: "", keyword: "" },
        },
      ],
    });

    const resolved = await resolveTaskExecutionBucketInventory(site, "posts");

    expect(resolved.urls).toEqual(["https://example.com/post-a"]);
    expect(fetchOverviewInventoryForSource).not.toHaveBeenCalled();
  });

  it("fetches posts when includeContent is set even if warm cache is ready", async () => {
    getWarmMock.mockReturnValue({
      siteId: "site-warm-resolve",
      counts: { inventoryTotal: 1, pages: 0, posts: 1, sap: 0, gscQueries: 0 },
      bulkInventoryRows: [
        {
          id: 1,
          collection: "posts",
          url: "https://example.com/post-a/",
          slug: "post-a",
          fields: { title: "Post A", content: "", excerpt: "", meta: "", keyword: "" },
        },
      ],
    });
    fetchOverviewInventoryForSource.mockResolvedValue({
      rows: [
        {
          collection: "posts",
          id: 1,
          slug: "post-a",
          url: "https://example.com/post-a/",
          fields: { title: "Post A", content: "<h2>Answer</h2>", excerpt: "" },
        },
      ],
      errors: {},
    });

    const resolved = await resolveTaskExecutionBucketInventory(site, "posts", undefined, {
      includeContent: true,
    });

    expect(fetchOverviewInventoryForSource).toHaveBeenCalled();
    expect(resolved.urls).toEqual(["https://example.com/post-a/"]);
  });
});

describe("workUrlsFromExplicitTargets", () => {
  it("maps CSV URLs onto inventory links when slash or www differs", () => {
    const snapshot = {
      postsMaps: buildInventoryLookupMaps(
        [
          {
            id: 1,
            slug: "post-a",
            url: "https://example.com/post-a/",
            fields: { title: "Post A", content: "", excerpt: "", meta: "", keyword: "" },
          },
        ],
        "https://example.com",
      ),
      pagesMaps: buildInventoryLookupMaps([], "https://example.com"),
    };

    expect(
      workUrlsFromExplicitTargets(
        ["https://www.example.com/post-a", "https://missing.test/nope/"],
        snapshot,
        "https://example.com",
        "posts",
      ),
    ).toEqual(["https://example.com/post-a/", "https://missing.test/nope/"]);
  });
});

describe("ensureBulkOptimizerInventoryForRun live-fetch fallback", () => {
  const site = {
    id: "site-fallback",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
  } as never;

  const batchUrl = "https://example.com/page-a/";

  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-fallback");
    fetchOverviewInventoryForSource.mockReset();
    getWarmMock.mockReset();
    getWarmMock.mockReturnValue(null);
    fetchOverviewInventoryForSource.mockResolvedValue({
      rows: [
        {
          collection: "pages",
          id: 2,
          slug: "page-a",
          url: batchUrl,
          fields: { title: "Page A", content: "", excerpt: "", meta: "", keyword: "" },
        },
      ],
      errors: {},
    });
  });

  it("fetches and seeds pages inventory when session cache is empty", async () => {
    const snapshot = await ensureBulkOptimizerInventoryForRun(site, [batchUrl], "pages");

    expect(fetchOverviewInventoryForSource).toHaveBeenCalled();
    expect(snapshot.pagesMaps.byLink.size).toBe(1);
    expect(getBulkInventorySessionSnapshot("site-fallback", "pages")?.pagesMaps.byLink.size).toBe(1);
  });

  it("uses session cache without fetching when already seeded", async () => {
    setBulkInventorySessionSnapshot("site-fallback", "pages", {
      postsMaps: buildInventoryLookupMaps([], "https://example.com"),
      pagesMaps: buildInventoryLookupMaps(
        [
          {
            id: 2,
            slug: "page-a",
            url: batchUrl,
            fields: { title: "Page A", content: "", excerpt: "", meta: "", keyword: "" },
          },
        ],
        "https://example.com",
      ),
      customMapsByCollection: {},
    });

    await ensureBulkOptimizerInventoryForRun(site, [batchUrl], "pages");

    expect(fetchOverviewInventoryForSource).not.toHaveBeenCalled();
  });
});

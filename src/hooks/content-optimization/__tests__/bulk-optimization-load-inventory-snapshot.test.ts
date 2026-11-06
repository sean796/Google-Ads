import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  bulkOptimizerInventoryCollections,
  bulkSnapshotReadyForRun,
  ensurePostsPagesInventoryForLinking,
  getBulkOptimizerInventoryFromSession,
  loadBulkOptimizerInventorySnapshot,
} from "../bulk-optimization-load-inventory-snapshot";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import {
  clearBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";

const getSiteInventoryBulk = vi.fn();

vi.mock("@/lib/wordpress-api", () => ({
  getSiteInventoryBulk: (...args: unknown[]) => getSiteInventoryBulk(...args),
}));

describe("bulkOptimizerInventoryCollections", () => {
  it("includes Pages-bucket CPT sitemaps", () => {
    const cols = bulkOptimizerInventoryCollections({
      sitemaps: {
        mainSitemapUrl: "https://shutterspot.com/sitemap_index.xml",
        detectedAt: 0,
        type: "index",
        childSitemaps: [
          "https://shutterspot.com/page-sitemap.xml",
          "https://shutterspot.com/hunter-douglas-sitemap.xml",
        ],
      },
    } as never);
    expect(cols).toContain("pages");
    expect(cols).toContain("hunter-douglas");
  });

  it("includes entity CPT from sitemap", () => {
    const cols = bulkOptimizerInventoryCollections({
      entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
    } as never);
    expect(cols).toContain("posts");
    expect(cols).toContain("pages");
    expect(cols).toContain("service-area");
  });
});

describe("getBulkOptimizerInventoryFromSession", () => {
  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-1");
    getSiteInventoryBulk.mockReset();
    setBulkInventorySessionSnapshot("site-1", "posts", {
      postsMaps: buildInventoryLookupMaps(
        [
          {
            id: 1,
            slug: "a",
            url: "https://example.com/a/",
            fields: { title: "A", meta: "", keyword: "", content: "", excerpt: "" },
          },
        ],
        "https://example.com",
      ),
      pagesMaps: buildInventoryLookupMaps([], "https://example.com"),
    });
  });

  it("returns session snapshot without fetching WordPress", async () => {
    const site = {
      id: "site-1",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
    } as never;

    const snapshot = getBulkOptimizerInventoryFromSession(site);
    expect(snapshot?.postsMaps.byLink.size).toBe(1);

    const loaded = await loadBulkOptimizerInventorySnapshot(site);
    expect(loaded?.postsMaps.byLink.size).toBe(1);
  });

  it("returns null when session has no inventory", () => {
    const snapshot = getBulkOptimizerInventoryFromSession({
      id: "other-site",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
    } as never);
    expect(snapshot).toBeNull();
  });
});

describe("bulkSnapshotReadyForRun", () => {
  const site = {
    id: "site-run",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
  } as never;

  const batchUrl = "https://example.com/my-post/";

  it("rejects harness-only rows without body content", () => {
    const snapshot = {
      postsMaps: buildInventoryLookupMaps(
        [
          {
            id: 1,
            slug: "my-post",
            url: batchUrl,
            fields: { title: "T", meta: "", keyword: "kw", content: "", excerpt: "" },
          },
        ],
        "https://example.com",
      ),
      pagesMaps: buildInventoryLookupMaps([], "https://example.com"),
      customMapsByCollection: {},
    };

    expect(bulkSnapshotReadyForRun(snapshot, site, [batchUrl])).toBe(false);
  });

  it("accepts rows with body content and keyword", () => {
    const snapshot = {
      postsMaps: buildInventoryLookupMaps(
        [
          {
            id: 1,
            slug: "my-post",
            url: batchUrl,
            fields: {
              title: "T",
              meta: "",
              keyword: "kw",
              content: "<p>Enough body text for optimization run.</p>",
              excerpt: "",
            },
          },
        ],
        "https://example.com",
      ),
      pagesMaps: buildInventoryLookupMaps([], "https://example.com"),
      customMapsByCollection: {},
    };

    expect(bulkSnapshotReadyForRun(snapshot, site, [batchUrl])).toBe(true);
  });
});

describe("ensurePostsPagesInventoryForLinking", () => {
  const site = {
    id: "site-link",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
  } as never;

  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-link");
    getSiteInventoryBulk.mockReset();
  });

  it("fetches pages when session only has posts bucket", async () => {
    setBulkInventorySessionSnapshot("site-link", "posts", {
      postsMaps: buildInventoryLookupMaps(
        [
          {
            id: 1,
            slug: "blog-post",
            url: "https://example.com/blog-post/",
            fields: { title: "Post", meta: "", keyword: "", content: "", excerpt: "" },
          },
        ],
        "https://example.com",
      ),
      pagesMaps: buildInventoryLookupMaps([], "https://example.com"),
    });

    getSiteInventoryBulk.mockResolvedValue({
      rows: [
        {
          collection: "pages",
          id: 2,
          slug: "about",
          url: "https://example.com/about/",
          fields: { title: "About", content: "", excerpt: "" },
        },
      ],
    });

    const snapshot = await ensurePostsPagesInventoryForLinking(site);

    expect(getSiteInventoryBulk).toHaveBeenCalledWith(
      "https://example.com",
      "u",
      "p",
      expect.objectContaining({ collections: ["pages"] }),
    );
    expect(snapshot.postsMaps.byLink.size).toBe(1);
    expect(snapshot.pagesMaps.byLink.size).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  clearBulkInventorySessionSnapshot,
  getBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import {
  resolveTaskExecutionInventoryFromWarmCache,
  seedBulkInventorySessionFromSiteWarmCache,
} from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";

const getWarmMock = vi.fn();

vi.mock("@/lib/local-analysis/entity-site-warm-cache", () => ({
  getEntitySiteWarmCacheIfReady: (...args: unknown[]) => getWarmMock(...args),
}));

vi.mock("@/lib/bulk/bulk-generation-wp-inventory", () => ({
  getBulkGenerationWpInventoryIfReady: vi.fn(() => null),
}));

const site: WordPressSite = {
  id: "site-warm",
  name: "Warm Site",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: Date.now(),
  enabled: true,
  entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
  sitemaps: {
    mainSitemapUrl: "https://example.com/sitemap.xml",
    detectedAt: 0,
    type: "index",
    endpoints: {
      "https://example.com/service-area-sitemap.xml": "service-area",
    },
  },
};

describe("seed-bulk-session-from-site-warm-cache", () => {
  beforeEach(() => {
    clearBulkInventorySessionSnapshot("site-warm");
    getWarmMock.mockReset();
  });

  it("seeds session snapshots from warm bulk rows", () => {
    getWarmMock.mockReturnValue({
      siteId: "site-warm",
      counts: { inventoryTotal: 2, pages: 0, posts: 1, sap: 1, gscQueries: 0 },
      bulkInventoryRows: [
        {
          id: 1,
          collection: "posts",
          url: "https://example.com/post-a/",
          slug: "post-a",
          fields: { title: "Post A", content: "", excerpt: "" },
        },
        {
          id: 2,
          collection: "service-area",
          url: "https://example.com/sap-a/",
          slug: "sap-a",
          fields: { title: "Sap A", content: "", excerpt: "" },
        },
      ],
    });

    expect(seedBulkInventorySessionFromSiteWarmCache(site)).toBe(true);
    expect(getBulkInventorySessionSnapshot("site-warm", "posts")?.postsMaps.byLink.size).toBe(1);
    expect(getBulkInventorySessionSnapshot("site-warm", "sap")).not.toBeNull();
  });

  it("resolveTaskExecutionInventoryFromWarmCache returns sap bucket urls", () => {
    getWarmMock.mockReturnValue({
      siteId: "site-warm",
      counts: { inventoryTotal: 1, pages: 0, posts: 0, sap: 1, gscQueries: 0 },
      bulkInventoryRows: [
        {
          id: 2,
          collection: "service-area",
          url: "https://example.com/sap-a/",
          slug: "sap-a",
          fields: { title: "Sap A", content: "", excerpt: "" },
        },
      ],
    });

    const resolved = resolveTaskExecutionInventoryFromWarmCache(site, "sap");
    expect(resolved?.urls).toEqual(["https://example.com/sap-a"]);
  });
});

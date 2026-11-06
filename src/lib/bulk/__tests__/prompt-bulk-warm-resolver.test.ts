import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";
import {
  canUseWarmPromptBulkData,
  resolvePromptBulkInventory,
  promptBulkScopeCacheKey,
} from "@/lib/bulk/prompt-bulk-warm-resolver";
import { buildPromptBulkSiteKwFromGscQueries } from "@/lib/bulk/prompt-bulk-site-kw-scrape";

vi.mock("@/lib/local-analysis/entity-site-warm-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-analysis/entity-site-warm-cache")>();
  return {
    ...actual,
    getEntitySiteWarmCacheIfReady: vi.fn(),
  };
});

vi.mock("@/lib/bulk/bulk-sitemap-inventory-session", () => ({
  loadBulkSitemapInventoryForSite: vi.fn(async () => ({
    links: [],
    buckets: {
      pages: { json: "[]", rowCount: 1 },
      posts: { json: "[]", rowCount: 2 },
      sap: { json: "[]", rowCount: 3 },
    },
    totalRows: 6,
    sources: ["pages", "posts", "sap"],
    errors: {},
    postsMetadata: [],
  })),
}));

import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import { loadBulkSitemapInventoryForSite } from "@/lib/bulk/bulk-sitemap-inventory-session";

const site: WordPressSite = {
  id: "kwb-1",
  name: "KWB",
  siteUrl: "https://www.kwbllp.com/",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
};

function warmBundle(overrides: Partial<EntitySiteWarmBundle> = {}): EntitySiteWarmBundle {
  const credKey = `${site.siteUrl}|${site.username}|${site.appPassword}`;
  return {
    siteId: site.id,
    credentialsKey: credKey,
    fetchedAt: Date.now(),
    inventory: {
      links: [],
      buckets: {
        pages: { json: '["https://example.com/p"]', rowCount: 1 },
        posts: { json: '["https://example.com/post"]', rowCount: 1 },
        sap: { json: '["https://example.com/sap"]', rowCount: 1 },
      },
      totalRows: 3,
      sources: ["pages", "posts", "sap"],
      errors: {},
      postsMetadata: [],
    },
    gsc: {
      queries: [{ query: "tax planning", clicks: 1, impressions: 10, ctr: 0.1, position: 5, date: "x" }],
      dateRange: { startDate: "2026-01-01", endDate: "2026-03-01" },
    },
    counts: { inventoryTotal: 3, pages: 1, posts: 1, sap: 1, gscQueries: 1 },
    ...overrides,
  };
}

describe("prompt-bulk-warm-resolver", () => {
  beforeEach(() => {
    vi.mocked(getEntitySiteWarmCacheIfReady).mockReset();
    vi.mocked(loadBulkSitemapInventoryForSite).mockClear();
  });

  it("canUseWarmPromptBulkData requires inventory and GSC", () => {
    expect(canUseWarmPromptBulkData(site, warmBundle())).toBe(true);
    expect(
      canUseWarmPromptBulkData(
        site,
        warmBundle({ counts: { inventoryTotal: 3, pages: 1, posts: 1, sap: 1, gscQueries: 0 } }),
      ),
    ).toBe(false);
  });

  it("resolvePromptBulkInventory uses warm cache without network", async () => {
    vi.mocked(getEntitySiteWarmCacheIfReady).mockReturnValue(warmBundle());
    const result = await resolvePromptBulkInventory(site, undefined);
    expect(result.source).toBe("warm");
    expect(result.totalRows).toBe(3);
    expect(loadBulkSitemapInventoryForSite).not.toHaveBeenCalled();
  });

  it("resolvePromptBulkInventory falls back to network when warm missing", async () => {
    vi.mocked(getEntitySiteWarmCacheIfReady).mockReturnValue(null);
    const result = await resolvePromptBulkInventory(site, undefined);
    expect(result.source).toBe("network");
    expect(loadBulkSitemapInventoryForSite).toHaveBeenCalled();
  });

  it("promptBulkScopeCacheKey is stable", () => {
    expect(promptBulkScopeCacheKey(["posts", "pages"])).toBe("pages,posts");
  });

  it("buildPromptBulkSiteKwFromGscQueries produces gsc keywords", () => {
    const res = buildPromptBulkSiteKwFromGscQueries(site, [
      { query: "bookkeeping edmonton", clicks: 2, impressions: 20, ctr: 0.1, position: 8, date: "x" },
    ]);
    expect(res.json.gsc.length).toBe(1);
    expect(res.json.gsc[0]).toBe("bookkeeping edmonton");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bulkOptimizationGrepAcfKeywordFocus,
  inventoryRowToAcfKeywordFields,
  seedBulkAcfKeywordsFromInventory,
} from "../bulk-optimization-grep-acf";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";

const getACFFieldsForUrlsBatch = vi.fn();

vi.mock("@/lib/wordpress-api/fields-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wordpress-api/fields-client")>(
    "@/lib/wordpress-api/fields-client",
  );
  return {
    ...actual,
    getFieldsForUrlsBatch: (...args: unknown[]) => getACFFieldsForUrlsBatch(...args),
  };
});

describe("bulkOptimizationGrepAcfKeywordFocus", () => {
  beforeEach(() => {
    getACFFieldsForUrlsBatch.mockReset();
  });

  it("never calls WordPress; seeds from session inventory only", async () => {
    const n = 5;
    const urls = Array.from({ length: n }, (_, i) => `https://example.com/p${i}/`);
    const rows: SitePostInventoryRow[] = urls.map((url, i) => ({
      id: i + 1,
      slug: `p${i}`,
      url,
      date_gmt: "",
      acf: { keyword_focus: `kw-${i}` },
      fields: { title: `P${i}`, meta: "", keyword: `kw-${i}`, content: "", excerpt: "" },
    }));
    const postsMaps = buildInventoryLookupMaps(rows, "https://example.com");
    const bulkInventorySnapshot = { postsMaps, pagesMaps: postsMaps };
    const prefetchedAcfFieldsCache = new Map<number, Record<string, unknown>>();

    await bulkOptimizationGrepAcfKeywordFocus({
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      urls,
      batchKey: "bk",
      muteToasts: true,
      setBulkStep: vi.fn(),
      prefetchedAcfFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      setBulkOptimizationState: vi.fn(),
      wordPressPostsForRun: [],
      bulkInventorySnapshot,
    });

    expect(getACFFieldsForUrlsBatch).not.toHaveBeenCalled();
    expect(prefetchedAcfFieldsCache.get(0)?.keyword_focus).toBe("kw-0");
  });

  it("seedBulkAcfKeywordsFromInventory marks allKeywordsReady when every URL has ACF keyword_focus", () => {
    const row: SitePostInventoryRow = {
      id: 1,
      slug: "a",
      url: "https://example.com/a/",
      date_gmt: "",
      acf: { keyword_focus: "kw-a" },
      fields: {
        title: "A",
        meta: "",
        keyword: "kw-a",
        content: "",
        excerpt: "",
      },
    };
    const postsMaps = buildInventoryLookupMaps([row], "https://example.com");
    const cache = new Map<number, Record<string, unknown>>();
    const result = seedBulkAcfKeywordsFromInventory({
      site: { id: "s1", siteUrl: "https://example.com" } as unknown as WordPressSite,
      urls: ["https://example.com/a/"],
      batchKey: "bk",
      bulkInventorySnapshot: { postsMaps, pagesMaps: postsMaps },
      wordPressPostsForRun: [],
      prefetchedAcfFieldsCache: cache,
      setBulkOptimizationState: vi.fn(),
    });
    expect(result.allKeywordsReady).toBe(true);
    expect(cache.get(0)?.keyword_focus).toBe("kw-a");
  });

  it("inventoryRowToAcfKeywordFields uses fields.keyword when acf is empty", () => {
    const row: SitePostInventoryRow = {
      id: 2,
      slug: "b",
      url: "https://example.com/b/",
      date_gmt: "",
      fields: { title: "B", meta: "", keyword: "fields-only-kw", content: "", excerpt: "" },
    };
    const seeded = inventoryRowToAcfKeywordFields(row);
    expect(seeded?.acfKeywordRaw).toBe("fields-only-kw");
    expect(seeded?.acfFields.keyword_focus).toBe("fields-only-kw");
  });
});

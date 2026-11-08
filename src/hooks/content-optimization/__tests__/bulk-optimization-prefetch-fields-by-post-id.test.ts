import { describe, expect, it, vi, beforeEach } from "vitest";
import { prefetchBulkAcfFieldsByPostIdForUrls } from "../bulk-optimization-prefetch-fields-by-post-id";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";

const getPostFieldsForPostsBatch = vi.fn();

vi.mock("@/lib/wordpress-api/fields-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wordpress-api/fields-client")>(
    "@/lib/wordpress-api/fields-client",
  );
  return {
    ...actual,
    getFieldsForPostsBatch: (...args: unknown[]) => getPostFieldsForPostsBatch(...args),
  };
});

describe("prefetchBulkAcfFieldsByPostIdForUrls", () => {
  beforeEach(() => {
    getPostFieldsForPostsBatch.mockReset();
  });

  it("chunks getPostFieldsForPostsBatch by WORDPRESS_BULK_READ_CHUNK", async () => {
    const rows: SitePostInventoryRow[] = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      slug: `p${i}`,
      url: `https://example.com/p${i}/`,
      date_gmt: "",
      fields: {
        title: `T${i}`,
        meta: "",
        keyword: "k",
        content: "<p>" + "hello ".repeat(8) + "</p>",
        excerpt: "",
      },
    }));
    const maps = buildInventoryLookupMaps(rows, "https://example.com");
    const bulkInventorySnapshot = { postsMaps: maps, pagesMaps: maps };

    const urls = rows.map((r) => r.url);
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    const prefetchedAcfFullPostByUrlIndex = new Map<number, Record<string, unknown>>();

    getPostFieldsForPostsBatch.mockResolvedValue({ results: [] });

    await prefetchBulkAcfFieldsByPostIdForUrls({
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      urls,
      wordPressPostsForRun: [],
      bulkInventorySnapshot,
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedExistingPostByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex,
    });

    expect(getPostFieldsForPostsBatch).toHaveBeenCalledTimes(2);
    expect(getPostFieldsForPostsBatch.mock.calls[0][1]).toHaveLength(100);
    expect(getPostFieldsForPostsBatch.mock.calls[1][1]).toHaveLength(1);
  });

  it("stores neo_pulse_fields from fullPost when batch fields object is empty", async () => {
    getPostFieldsForPostsBatch.mockResolvedValue({
      results: [
        {
          postId: 1,
          success: true,
          fields: {},
          fullPost: {
            id: 1,
            neo_pulse_fields: { keyword_focus: "blinds", seo_research: "brief" },
          },
        },
      ],
    });

    const rows: SitePostInventoryRow[] = [
      {
        id: 1,
        slug: "p1",
        url: "https://example.com/p1/",
        date_gmt: "",
        fields: { title: "T", meta: "", keyword: "k", content: "<p>" + "hello ".repeat(8) + "</p>", excerpt: "" },
      },
    ];
    const maps = buildInventoryLookupMaps(rows, "https://example.com");
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();

    await prefetchBulkAcfFieldsByPostIdForUrls({
      site: { id: "s1", siteUrl: "https://example.com", username: "u", appPassword: "p" } as unknown as WordPressSite,
      urls: [rows[0].url],
      wordPressPostsForRun: [],
      bulkInventorySnapshot: { postsMaps: maps, pagesMaps: maps },
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
    });

    expect(prefetchedPostFieldsCache.get(0)?.keyword_focus).toBe("blinds");
    expect(prefetchedPostFieldsCache.get(0)?.seo_research).toBe("brief");
  });

  it("refreshes when cache has keyword_focus but empty seo_research", async () => {
    getPostFieldsForPostsBatch.mockResolvedValue({
      results: [
        {
          postId: 1,
          success: true,
          fields: {
            keyword_focus: "Hunter Douglas Blinds Edmonton City Centre AB",
            seo_research: '{"primary_keyword":"Hunter Douglas Blinds Near Edmonton City Centre"}',
          },
        },
      ],
    });

    const rows: SitePostInventoryRow[] = [
      {
        id: 1,
        slug: "p1",
        url: "https://example.com/p1/",
        date_gmt: "",
        fields: {
          title: "T",
          meta: "",
          keyword: "seeded kw",
          content: "<p>" + "hello ".repeat(8) + "</p>",
          excerpt: "",
        },
      },
    ];
    const maps = buildInventoryLookupMaps(rows, "https://example.com");
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>([
      [0, { keyword_focus: "seeded kw" }],
    ]);

    await prefetchBulkAcfFieldsByPostIdForUrls({
      site: { id: "s1", siteUrl: "https://example.com", username: "u", appPassword: "p" } as unknown as WordPressSite,
      urls: [rows[0].url],
      wordPressPostsForRun: [],
      bulkInventorySnapshot: { postsMaps: maps, pagesMaps: maps },
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
    });

    expect(getPostFieldsForPostsBatch).toHaveBeenCalledTimes(1);
    expect(prefetchedPostFieldsCache.get(0)?.keyword_focus).toBe(
      "Hunter Douglas Blinds Edmonton City Centre AB",
    );
    expect(String(prefetchedPostFieldsCache.get(0)?.seo_research ?? "")).toContain("primary_keyword");
  });

  it("skips WP fetch when cache already has substantive seo_research", async () => {
    const rows: SitePostInventoryRow[] = [
      {
        id: 1,
        slug: "p1",
        url: "https://example.com/p1/",
        date_gmt: "",
        fields: {
          title: "T",
          meta: "",
          keyword: "k",
          content: "<p>" + "hello ".repeat(8) + "</p>",
          excerpt: "",
        },
      },
    ];
    const maps = buildInventoryLookupMaps(rows, "https://example.com");
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>([
      [0, { keyword_focus: "k", seo_research: '{"a":1}' }],
    ]);

    await prefetchBulkAcfFieldsByPostIdForUrls({
      site: { id: "s1", siteUrl: "https://example.com", username: "u", appPassword: "p" } as unknown as WordPressSite,
      urls: [rows[0].url],
      wordPressPostsForRun: [],
      bulkInventorySnapshot: { postsMaps: maps, pagesMaps: maps },
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex: new Map(),
    });

    expect(getPostFieldsForPostsBatch).not.toHaveBeenCalled();
  });
});

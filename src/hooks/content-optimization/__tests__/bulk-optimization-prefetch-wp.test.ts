import { describe, expect, it, vi, beforeEach } from "vitest";
import { bulkOptimizationDoPrefetch } from "../bulk-optimization-do-prefetch";
import type { WpPostSnapshotFromFieldsByUrl } from "@/lib/wordpress-api/fields-client";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildInventoryLookupMaps,
  existingPostFromInventoryRow,
} from "@/lib/wordpress-api/inventory-match";
import * as acfReader from "@/lib/content-generation/ai-driven-post-fields-reader";

const getWordPressPostContent = vi.fn();
const getFieldsForPost = vi.fn();

vi.mock("@/lib/api", () => ({
  loadApiKey: () => "",
}));

vi.mock("@/lib/wordpress-api", () => ({
  getWordPressPostContent: (...args: unknown[]) => getWordPressPostContent(...args),
}));

vi.mock("@/lib/wordpress-api/fields-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wordpress-api/fields-client")>(
    "@/lib/wordpress-api/fields-client",
  );
  return {
    ...actual,
    getFieldsForPost: (...args: unknown[]) => getFieldsForPost(...args),
  };
});

describe("bulkOptimizationDoPrefetch", () => {
  beforeEach(() => {
    getWordPressPostContent.mockReset();
    getFieldsForPost.mockReset();
  });

  it("does not call getWordPressPostContent when post snapshot exists from grep (inventory miss)", async () => {
    const snapshot: WpPostSnapshotFromFieldsByUrl = {
      id: 42,
      slug: "svc-area",
      title: "T",
      content: "<p>body</p>",
      excerpt: "",
      date_gmt: "",
      status: "publish",
      link: "https://example.com/svc-area/",
      postTypeEndpoint: "posts",
      postTypeSubtype: "post",
    };

    const prefetchedPostPayloadByUrlIndex = new Map<number, WpPostSnapshotFromFieldsByUrl>();
    prefetchedPostPayloadByUrlIndex.set(0, snapshot);

    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, {
      keyword_focus: "test keyword",
      seo_research: '{"ok":true}',
    });

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();

    await bulkOptimizationDoPrefetch(0, {
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      urls: ["https://example.com/svc-area/"],
      batchKey: "s1-batch",
      isAcfKeywordMode: true,
      updateMode: "update",
      optimizationOptions: {},
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      siteServiceContext: null,
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex,
      prefetchedPendingCache,
      setBulkOptimizationState: vi.fn(),
      bulkInventorySnapshot: null,
    });

    expect(getWordPressPostContent).not.toHaveBeenCalled();
    expect(getFieldsForPost).not.toHaveBeenCalled();
    expect(prefetchedPendingCache.has(0)).toBe(true);
    const pending = prefetchedPendingCache.get(0)?.pending as { existingContent?: string } | undefined;
    expect(pending?.existingContent).toContain("body");
  });

  it("does not call getWordPressPostContent when bulk inventory has usable plain-text body", async () => {
    const row: SitePostInventoryRow = {
      id: 88,
      slug: "svc",
      url: "https://example.com/svc/",
      fields: {
        title: "Svc",
        meta: "",
        keyword: "",
        content: `<p>${"alpha ".repeat(6)}</p>`,
        excerpt: "",
      },
    };
    const maps = buildInventoryLookupMaps([row], "https://example.com");
    const bulkInventorySnapshot = { postsMaps: maps, pagesMaps: maps };

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();

    await bulkOptimizationDoPrefetch(0, {
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      urls: ["https://example.com/svc/"],
      batchKey: "s1-batch",
      isAcfKeywordMode: true,
      updateMode: "update",
      optimizationOptions: {},
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      siteServiceContext: null,
      prefetchedPostFieldsCache: new Map([
        [
          0,
          {
            keyword_focus: "kw",
            seo_research: "{}",
          },
        ],
      ]),
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedPendingCache,
      setBulkOptimizationState: vi.fn(),
      bulkInventorySnapshot,
    });

    expect(getWordPressPostContent).not.toHaveBeenCalled();
    expect(prefetchedPendingCache.has(0)).toBe(true);
  });

  it("uses inventory title-only row with service-area endpoint without getWordPressPostContent", async () => {
    const row: SitePostInventoryRow = {
      id: 10,
      slug: "painter-amisk",
      url: "https://example.com/painter-amisk/",
      fields: {
        title: "Painter Amisk",
        meta: "",
        keyword: "house painter amisk",
        content: "",
        excerpt: "",
      },
    };
    const entityMaps = buildInventoryLookupMaps([row], "https://example.com");
    const bulkInventorySnapshot = {
      postsMaps: { bySlug: new Map(), byLink: new Map() },
      pagesMaps: { bySlug: new Map(), byLink: new Map() },
      customMapsByCollection: { "service-area": entityMaps },
    };

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();

    await bulkOptimizationDoPrefetch(0, {
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
        entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
      } as unknown as WordPressSite,
      urls: ["https://example.com/painter-amisk/"],
      batchKey: "s1-batch",
      isAcfKeywordMode: true,
      updateMode: "update",
      optimizationOptions: {},
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      siteServiceContext: null,
      prefetchedPostFieldsCache: new Map([[0, { keyword_focus: "house painter amisk" }]]),
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedPendingCache,
      setBulkOptimizationState: vi.fn(),
      bulkInventorySnapshot,
    });

    expect(getWordPressPostContent).not.toHaveBeenCalled();
    const pending = prefetchedPendingCache.get(0)?.pending as {
      existingPost?: { postTypeEndpoint?: string };
    };
    expect(pending?.existingPost?.postTypeEndpoint).toBe("service-area");
  });

  it("existingPostFromInventoryRow preserves custom CPT endpoint", () => {
    const row: SitePostInventoryRow = {
      id: 3,
      slug: "x",
      url: "https://example.com/x/",
      fields: { title: "T", meta: "", keyword: "", content: "", excerpt: "" },
    };
    const post = existingPostFromInventoryRow({ row, source: "service-area" });
    expect(post.postTypeEndpoint).toBe("service-area");
    expect(post.postTypeSubtype).toBe("service-area");
  });

  it("uses prefetchedAcfFullPostByUrlIndex without calling getFieldsForPost", async () => {
    const row: SitePostInventoryRow = {
      id: 5,
      slug: "x",
      url: "https://example.com/x/",
      fields: { title: "T", meta: "", keyword: "k", content: "body", excerpt: "" },
      acf: { keyword_focus: "k", seo_research: "{}" },
    };
    const maps = buildInventoryLookupMaps([row], "https://example.com");
    const bulkInventorySnapshot = { postsMaps: maps, pagesMaps: maps };

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>([
      [0, { keyword_focus: "k", seo_research: "{}" }],
    ]);
    const prefetchedAcfFullPostByUrlIndex = new Map<number, Record<string, unknown>>([
      [0, { id: 5, link: row.url, slug: "x", acf: row.acf }],
    ]);

    await bulkOptimizationDoPrefetch(0, {
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      urls: ["https://example.com/x/"],
      batchKey: "s1-batch",
      isAcfKeywordMode: true,
      updateMode: "update",
      optimizationOptions: {},
      inContentImageRequest: undefined,
      wordPressPostsForRun: [],
      siteServiceContext: null,
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex: new Map(),
      prefetchedAcfFullPostByUrlIndex,
      prefetchedPendingCache,
      setBulkOptimizationState: vi.fn(),
      bulkInventorySnapshot,
    });

    expect(getFieldsForPost).not.toHaveBeenCalled();
    expect(getWordPressPostContent).not.toHaveBeenCalled();
    const pending = prefetchedPendingCache.get(0)?.pending as { acfFullPostSnapshot?: { id?: number } };
    expect(pending?.acfFullPostSnapshot?.id).toBe(5);
  });

  it("rethrows prefetch errors without seeding stub pending row", async () => {
    const snapshot: WpPostSnapshotFromFieldsByUrl = {
      id: 42,
      slug: "svc-area",
      title: "T",
      content: "<p>body</p>",
      excerpt: "",
      date_gmt: "",
      status: "publish",
      link: "https://example.com/svc-area/",
      postTypeEndpoint: "posts",
      postTypeSubtype: "post",
    };

    const prefetchedPostPayloadByUrlIndex = new Map<number, WpPostSnapshotFromFieldsByUrl>();
    prefetchedPostPayloadByUrlIndex.set(0, snapshot);

    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, {
      keyword_focus: "test keyword",
      seo_research: '{"ok":true}',
    });

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();

    vi.spyOn(acfReader, "mergeSeoResearchFromAcfIntoContext").mockImplementation(() => {
      throw new Error("prefetch failed");
    });

    await expect(
      bulkOptimizationDoPrefetch(0, {
        site: {
          id: "s1",
          siteUrl: "https://example.com",
          username: "u",
          appPassword: "p",
        } as unknown as WordPressSite,
        urls: ["https://example.com/svc-area/"],
        batchKey: "s1-batch",
        isAcfKeywordMode: true,
        updateMode: "update",
        optimizationOptions: {},
        inContentImageRequest: undefined,
        wordPressPostsForRun: [],
        siteServiceContext: null,
        prefetchedPostFieldsCache,
        prefetchedPostPayloadByUrlIndex,
        prefetchedPendingCache,
        setBulkOptimizationState: vi.fn(),
        bulkInventorySnapshot: null,
      }),
    ).rejects.toThrow("prefetch failed");

    expect(prefetchedPendingCache.has(0)).toBe(false);
    vi.restoreAllMocks();
  });
});

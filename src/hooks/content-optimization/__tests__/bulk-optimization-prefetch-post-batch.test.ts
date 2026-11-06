import { describe, expect, it, vi, beforeEach } from "vitest";
import { prefetchBulkPostBodiesForUrls } from "../bulk-optimization-prefetch-post-batch";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import { buildInventoryLookupMaps } from "@/lib/wordpress-api/inventory-match";

const getWordPressPostContent = vi.fn();

vi.mock("@/lib/wordpress-api", () => ({
  getWordPressPostContent: (...args: unknown[]) => getWordPressPostContent(...args),
}));

describe("prefetchBulkPostBodiesForUrls", () => {
  beforeEach(() => {
    getWordPressPostContent.mockReset();
  });

  it("batches resolved IDs into one getWordPressPostContent call per chunk", async () => {
    getWordPressPostContent.mockResolvedValue({
      error: undefined,
      posts: [
        {
          id: 10,
          slug: "a",
          title: "A",
          content: "<p>a</p>",
          excerpt: "",
          date_gmt: "",
          postTypeEndpoint: "posts",
          postTypeSubtype: "post",
          link: "https://example.com/a/",
        },
        {
          id: 11,
          slug: "b",
          title: "B",
          content: "<p>b</p>",
          excerpt: "",
          date_gmt: "",
          postTypeEndpoint: "posts",
          postTypeSubtype: "post",
          link: "https://example.com/b/",
        },
      ],
    });

    const site = {
      id: "s1",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
    } as unknown as WordPressSite;

    const wordPressPostsForRun = [
      { id: 10, slug: "a", title: "A", excerpt: "", link: "https://example.com/a/", date_gmt: "", postType: "post" },
      { id: 11, slug: "b", title: "B", excerpt: "", link: "https://example.com/b/", date_gmt: "", postType: "post" },
    ];

    const map = await prefetchBulkPostBodiesForUrls({
      site,
      urls: ["https://example.com/a/", "https://example.com/b/"],
      wordPressPostsForRun,
      bulkInventorySnapshot: null,
      prefetchedPostPayloadByUrlIndex: new Map(),
    });

    expect(getWordPressPostContent).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(2);
    expect(map.get(0)?.content).toContain("a");
    expect(map.get(1)?.content).toContain("b");
  });

  it("skips REST when inventory supplies usable body", async () => {
    const site = {
      id: "s1",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
    } as unknown as WordPressSite;

    const row: SitePostInventoryRow = {
      id: 7,
      slug: "inv",
      url: "https://example.com/inv/",
      fields: {
        title: "Inv",
        meta: "",
        keyword: "",
        content: `<p>${"hello ".repeat(8)}</p>`,
        excerpt: "",
      },
    };
    const postsMaps = buildInventoryLookupMaps([row], site.siteUrl);
    const bulkInventorySnapshot = { postsMaps, pagesMaps: postsMaps };

    await prefetchBulkPostBodiesForUrls({
      site,
      urls: ["https://example.com/inv/"],
      wordPressPostsForRun: [],
      bulkInventorySnapshot,
      prefetchedPostPayloadByUrlIndex: new Map(),
    });

    expect(getWordPressPostContent).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPostCreatorInventoryCatalog,
  deriveSlugFromText,
  lookupInventoryByUrl,
} from "@/lib/post-creator/post-creator-cannibalization-tools";
import {
  buildPostCreatorInventoryContext,
  buildRowReviewEntries,
  filterPostCreatorChecklistRows,
} from "@/lib/post-creator/post-creator-inventory-gate";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";

function postsBucketJson(
  posts: Array<{ link: string; slug?: string; title?: string }>,
): string {
  return JSON.stringify({
    source: "posts",
    posts: posts.map((post, i) => ({
      id: i + 1,
      slug: post.slug ?? "",
      title: post.title ?? "",
      link: post.link,
    })),
  });
}

function inventoryFromPosts(
  posts: Array<{ link: string; slug?: string; title?: string }>,
): LoadBulkSitemapInventoryResult {
  const json = postsBucketJson(posts);
  return {
    links: [],
    buckets: {
      pages: { json: "", rowCount: 0 },
      posts: { json, rowCount: posts.length },
      sap: { json: "", rowCount: 0 },
    },
    totalRows: posts.length,
    sources: ["posts"],
    errors: {},
    postsMetadata: [],
  };
}

describe("post-creator inventory context", () => {
  it("loads inventory titles from content bucket JSON for AI review", () => {
    const inventory = inventoryFromPosts([
      {
        link: "https://neodigital.ca/digital-mktg-blinds-co-3/",
        slug: "digital-mktg-blinds-co-3",
        title: "Digital Marketing for Blinds Companies: Complete Guide",
      },
    ]);
    const context = buildPostCreatorInventoryContext(inventory);
    expect(context.catalog.rows[0]?.title).toContain("Digital Marketing for Blinds");
    expect(context.keywordInventoryJson).toContain("Digital Marketing for Blinds");
  });

  it("builds row review entries for cannibalization agent input", () => {
    const entries = buildRowReviewEntries([
      { keyword: "plantation shutters", title: "Plantation Shutters Guide", featuredImage: "y" },
    ]);
    expect(entries[0]?.status).toBe("ok");
    expect(entries[0]?.rowIndex).toBe(0);
  });

  it("blocks inventory conflicts and duplicate checklist rows", () => {
    const inventory = inventoryFromPosts([
      {
        link: "https://neodigital.ca/seo-for-window-installers/",
        slug: "seo-for-window-installers",
        title: "SEO for Window Installers: Attracting Local Homeowners and Businesses",
      },
    ]);
    const filtered = filterPostCreatorChecklistRows({
      inventory,
      postCount: 2,
      rows: [
        {
          keyword: "seo for window installers",
          title: "SEO for Window Installers: Attracting Local Homeowners and Businesses",
          featuredImage: "y",
        },
        {
          keyword: "seo for window installers",
          title: "SEO for Window Installers: Attracting Local Homeowners and Businesses",
          featuredImage: "y",
        },
        {
          keyword: "local seo for contractors",
          title: "Local SEO for Contractors in Alberta",
          featuredImage: "y",
        },
      ],
    });
    expect(filtered.blockedRows.length).toBeGreaterThanOrEqual(2);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]?.keyword).toBe("local seo for contractors");
  });
});

describe("post-creator cannibalization tools", () => {
  it("finds inventory row by slug path", () => {
    const catalog = buildPostCreatorInventoryCatalog([
      "https://example.com/blog/battery-powered-shades/",
    ]);
    const hits = lookupInventoryByUrl(catalog, deriveSlugFromText("battery powered shades"));
    expect(hits[0]?.url).toContain("battery-powered-shades");
  });
});

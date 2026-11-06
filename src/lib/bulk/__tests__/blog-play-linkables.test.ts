import { describe, expect, it } from "vitest";
import {
  formatBlogPlayLinkTargetsPrompt,
  inventoryRowsToBlogPlayLinkables,
  isBlogPlayLinkCollection,
  keepBlogPlayLinkTargets,
  mergePageSitemapUrlsIntoBlogPlayLinkables,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { removeInvalidInternalLinks } from "@/lib/content-generation/content-sanitizer";

function row(collection: string, url: string, title: string): SiteInventoryBulkRow {
  return {
    id: 1,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    url,
    collection,
    date_gmt: "",
    fields: { title, excerpt: "" },
  } as SiteInventoryBulkRow;
}

describe("removeInvalidInternalLinks strips service-area hrefs", () => {
  it("drops /service-area/ when that URL is not in the post list", () => {
    const html =
      '<p>See <a href="https://example.com/service-area/charleston/">Charleston</a> and <a href="https://example.com/hunter-douglas/">Hunter Douglas</a>.</p>';
    const out = removeInvalidInternalLinks(html, [
      {
        id: 2,
        slug: "hunter-douglas",
        title: "Hunter Douglas",
        excerpt: "",
        link: "https://example.com/hunter-douglas/",
        date_gmt: "",
      },
    ], "https://example.com");
    expect(out).not.toContain("/service-area/");
    expect(out).toContain('href="https://example.com/hunter-douglas/"');
    expect(out).toContain("Charleston");
  });
});

describe("keepBlogPlayLinkTargets", () => {
  it("keeps a main page and a blog post, drops service-area", () => {
    const out = keepBlogPlayLinkTargets([
      { title: "Charleston", link: "https://example.com/service-area/charleston/", collection: "sap" },
      { title: "Hunter Douglas", link: "https://example.com/hunter-douglas/", collection: "pages" },
      { title: "PowerView Guide", link: "https://example.com/blog/powerview/", collection: "posts" },
    ]);
    expect(out.map((item) => item.link)).toEqual([
      "https://example.com/hunter-douglas/",
      "https://example.com/blog/powerview/",
    ]);
  });
});

describe("inventoryRowsToBlogPlayLinkables", () => {
  it("keeps pages then blog posts and drops service-area", () => {
    const out = inventoryRowsToBlogPlayLinkables([
      row("sap", "https://lindseyblindsetc.com/service-area/charleston/", "Charleston"),
      row("posts", "https://lindseyblindsetc.com/blog/powerview-guide/", "PowerView Guide"),
      row("pages", "https://lindseyblindsetc.com/hunter-douglas/", "Hunter Douglas"),
    ]);
    expect(out.map((item) => item.link)).toEqual([
      "https://lindseyblindsetc.com/hunter-douglas/",
      "https://lindseyblindsetc.com/blog/powerview-guide/",
    ]);
    expect(out.every((item) => isBlogPlayLinkCollection(item.collection))).toBe(true);
  });
});

describe("formatBlogPlayLinkTargetsPrompt", () => {
  it("lists pages before blog posts and names the service-area ban", () => {
    const block = formatBlogPlayLinkTargetsPrompt([
      { title: "PowerView Guide", link: "https://example.com/blog/powerview/", collection: "posts" },
      { title: "Hunter Douglas", link: "https://example.com/hunter-douglas/", collection: "pages" },
      { title: "Charleston", link: "https://example.com/service-area/charleston/", collection: "sap" },
    ]);
    expect(block).toContain("PAGES");
    expect(block).toContain("Hunter Douglas");
    expect(block).toContain("BLOG POSTS");
    expect(block).toContain("PowerView Guide");
    expect(block).not.toContain("service-area/charleston");
    expect(block).toContain("never service-area");
    expect(block).toContain("page-sitemap.xml");
    expect(block).toContain("Brand, product, service");
    expect(block).toContain("Informational keywords");
    expect(block).toContain("[[LINK:PAGES title words|short anchor]]");
    expect(block).toContain("If the same brand or product name appears in both");
    expect(block).not.toContain("example.com/");
    expect(block).not.toContain("| https://");
    expect(block).not.toContain('href="');
    expect(block).not.toContain("copy exact");
  });
});

describe("mergePageSitemapUrlsIntoBlogPlayLinkables", () => {
  it("puts page-sitemap URLs first and keeps blog posts after", () => {
    const existing = inventoryRowsToBlogPlayLinkables([
      row("posts", "https://lindseyblindsetc.com/blog/powerview-guide/", "PowerView Guide"),
    ]);
    const out = mergePageSitemapUrlsIntoBlogPlayLinkables(existing, [
      "https://lindseyblindsetc.com/hunter-douglas/",
      "https://lindseyblindsetc.com/service-area/charleston/",
      "https://lindseyblindsetc.com/alta-window-fashions/",
    ]);
    expect(out.map((item) => item.link)).toEqual([
      "https://lindseyblindsetc.com/hunter-douglas/",
      "https://lindseyblindsetc.com/alta-window-fashions/",
      "https://lindseyblindsetc.com/blog/powerview-guide/",
    ]);
    expect(out.filter((item) => item.collection === "pages")).toHaveLength(2);
  });
});

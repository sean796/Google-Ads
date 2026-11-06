import { describe, expect, it } from "vitest";
import { hostedInventoryDownloads } from "@/components/keyword-research/bulk/sitemap-inventory-downloads";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";

describe("hostedInventoryDownloads", () => {
  it("includes sitemap buckets and GSC keywords", () => {
    const links: PromptBulkSitemapInventoryLink[] = [
      {
        source: "pages",
        label: "Pages",
        href: "blob:pages",
        filename: "wp-sitemap-pages-ridgelinesolar.ca.txt",
        rowCount: 16,
      },
      {
        source: "posts",
        label: "Posts",
        href: "blob:posts",
        filename: "wp-sitemap-posts-ridgelinesolar.ca.txt",
        rowCount: 25,
      },
    ];
    const files = hostedInventoryDownloads(links, {
      href: "blob:gsc",
      filename: "gsc-keywords-ridgelinesolar.ca.txt",
      rowCount: 1215,
      label: "GSC keywords",
    });
    expect(files).toEqual([
      { href: "blob:pages", filename: "wp-sitemap-pages-ridgelinesolar.ca.txt" },
      { href: "blob:posts", filename: "wp-sitemap-posts-ridgelinesolar.ca.txt" },
      { href: "blob:gsc", filename: "gsc-keywords-ridgelinesolar.ca.txt" },
    ]);
  });
});

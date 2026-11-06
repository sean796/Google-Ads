import { describe, expect, it } from "vitest";
import { buildBlogLinksSiteLinkPoolFromRows } from "@/lib/overview/overview-blog-links-inventory";

describe("buildBlogLinksSiteLinkPoolFromRows", () => {
  it("splits posts and pages from collection field", () => {
    const pool = buildBlogLinksSiteLinkPoolFromRows([
      {
        id: 1,
        url: "https://example.com/blog/tax-tips/",
        slug: "tax-tips",
        collection: "posts",
        fields: { title: "Tax Tips", meta: "", keyword: "" },
      },
      {
        id: 2,
        url: "https://example.com/wealth-management/",
        slug: "wealth-management",
        collection: "pages",
        fields: { title: "Wealth Management", meta: "", keyword: "" },
      },
    ]);

    expect(pool.postCount).toBe(1);
    expect(pool.pageCount).toBe(1);
    expect(pool.postInventory[0]?.url).toContain("/blog/tax-tips/");
    expect(pool.pageInventory[0]?.bucket).toBe("page");
  });
});

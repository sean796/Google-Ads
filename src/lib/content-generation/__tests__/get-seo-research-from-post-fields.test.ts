import { describe, expect, it } from "vitest";
import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { downloadFieldsFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";

describe("getSeoResearchFromPostFields", () => {
  it("reads seo_research", () => {
    expect(getSeoResearchFromPostFields({ seo_research: '{"focusKeyword":"kw"}' })).toBe(
      '{"focusKeyword":"kw"}',
    );
  });
});

describe("downloadFieldsFromInventoryRow", () => {
  it("maps seo_research into seoResearch on inventory rows", () => {
    const row: SitePostInventoryRow = {
      id: 1,
      url: "https://example.com/test/",
      slug: "test",
      date_gmt: "",
      acf: {
        seo_research: '{"focusKeyword":"hunter douglas blinds"}',
        keyword_focus: "hunter douglas blinds",
      },
      fields: { title: "Title", excerpt: "Excerpt", meta: "", keyword: "" },
    };
    const fields = downloadFieldsFromInventoryRow(row);
    expect(fields.seoResearch).toContain("focusKeyword");
  });
});

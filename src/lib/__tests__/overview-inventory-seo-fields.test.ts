import { describe, expect, it } from "vitest";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  downloadFieldsFromInventoryRow,
  extractPageHeadingFromHtml,
  inventoryCoversLiveScrape,
  inventoryRowHasSeoHydration,
  sentimentHtmlFromInventoryRow,
} from "@/lib/overview/overview-inventory-seo-fields";

const base: SitePostInventoryRow = {
  id: 99,
  url: "https://example.com/a/",
  slug: "a",
  fields: { title: "T", keyword: "k k", meta: "meta desc" },
  acf: {
    faq: "Q",
    date_modifier: "Jan",
    seo_research: "brief",
    keyword_focus: "focus phrase",
  },
};

describe("overview-inventory-seo-fields", () => {
  it("maps ACF + fields to DownloadedSeoFields (meta is excerpt only)", () => {
    const d = downloadFieldsFromInventoryRow({
      ...base,
      fields: {
        ...base.fields!,
        excerpt: "Post excerpt for meta.",
      },
    });
    expect(d.title).toBe("T");
    expect(d.metaDescription).toBe("Post excerpt for meta.");
    expect(d.faq).toBe("Q");
    expect(d.dateModifier).toBe("Jan");
    expect(d.seoResearch).toBe("brief");
    expect(d.focusKeyword).toBeTruthy();
  });

  it("uses a title-matching keyword and drops a leftover fields.keyword", () => {
    const d = downloadFieldsFromInventoryRow({
      ...base,
      acf: { keyword_focus: "what is national seo" },
      fields: {
        title: "What Is National SEO And How It Works",
        keyword: "elementor experts",
        meta: "",
      },
    });
    expect(d.focusKeyword).toBe("what is national seo");
  });

  it("infers from the current title when NEO Pulse redirect still has the old slug keyword", () => {
    const d = downloadFieldsFromInventoryRow({
      ...base,
      acf: { keyword_focus: "elementor experts" },
      fields: {
        title: "What Is National SEO And How Does It Work?",
        keyword: "elementor experts",
        meta: "",
      },
    });
    expect(d.focusKeyword).toBe("what is national seo and how does it work");
  });

  it("uses ACF keyword_focus when it matches the post even if fields.keyword is stale", () => {
    const d = downloadFieldsFromInventoryRow({
      ...base,
      acf: { keyword_focus: "CRA tax payments changes" },
      fields: {
        title: "Upcoming Changes to Canadian Tax Payments: What Businesses Need to Know",
        keyword: "canadian tax payments",
        meta: "",
        excerpt: "Excerpt line for meta.",
      },
    });
    expect(d.focusKeyword).toBe("CRA tax payments changes");
  });

  it("ignores fields.meta and ACF modifiers for metaDescription", () => {
    const d = downloadFieldsFromInventoryRow(base);
    expect(d.metaDescription).toBeUndefined();
  });

  it("inventoryRowHasSeoHydration is true when id and any SEO-ish field exists", () => {
    expect(inventoryRowHasSeoHydration(base)).toBe(true);
    expect(
      inventoryRowHasSeoHydration({
        id: 1,
        url: "https://x/",
        slug: "x",
        fields: { title: "", keyword: "", meta: "" },
      }),
    ).toBe(false);
  });

  it("inventoryCoversLiveScrape requires title and excerpt meta", () => {
    expect(
      inventoryCoversLiveScrape({
        ...base,
        fields: { ...base.fields!, excerpt: "Has excerpt for meta." },
      }),
    ).toBe(true);
    expect(inventoryCoversLiveScrape(base)).toBe(false);
    expect(
      inventoryCoversLiveScrape({
        id: 1,
        url: "https://x/",
        slug: "x",
        fields: { title: "Only", keyword: "", meta: "" },
      }),
    ).toBe(false);
    expect(
      inventoryCoversLiveScrape({
        id: 2,
        url: "https://x/e/",
        slug: "e",
        fields: {
          title: "Hello",
          keyword: "",
          meta: "",
          excerpt: "WordPress excerpt used as meta when ACF meta line is empty.",
        },
      }),
    ).toBe(true);
  });

  it("downloadFieldsFromInventoryRow uses excerpt only when meta fields are empty", () => {
    const d = downloadFieldsFromInventoryRow({
      id: 3,
      url: "https://example.com/p/",
      slug: "p",
      fields: {
        title: "Post",
        keyword: "",
        meta: "",
        excerpt: "Our meta lives in the excerpt field.",
      },
    });
    expect(d.metaDescription).toContain("excerpt");
  });

  it("downloadFieldsFromInventoryRow leaves meta empty when excerpt is missing", () => {
    const body = `<p>${"word ".repeat(40).trim()}</p>`;
    const d = downloadFieldsFromInventoryRow({
      id: 4,
      url: "https://example.com/b/",
      slug: "b",
      fields: {
        title: "Post",
        keyword: "",
        meta: "modifier only",
        content: body,
      },
    });
    expect(d.metaDescription).toBeUndefined();
  });

  describe("sentimentHtmlFromInventoryRow", () => {
    it("returns HTML content when postId matches and plain body is long enough", () => {
      const row: SitePostInventoryRow = {
        id: 5,
        url: "https://example.com/p/",
        slug: "p",
        fields: {
          title: "T",
          keyword: "",
          meta: "",
          content: `<p>${"word ".repeat(30).trim()}</p>`,
        },
      };
      const html = sentimentHtmlFromInventoryRow(row, 5);
      expect(html).toBeTruthy();
      expect(html).toContain("word");
      expect(sentimentHtmlFromInventoryRow(row, 999)).toBeUndefined();
    });

    it("returns excerpt when content is empty but excerpt is usable", () => {
      const row: SitePostInventoryRow = {
        id: 2,
        url: "https://example.com/e/",
        slug: "e",
        fields: {
          title: "T",
          keyword: "",
          meta: "",
          content: "",
          excerpt: "This excerpt is definitely long enough for plain text.",
        },
      };
      expect(sentimentHtmlFromInventoryRow(row, 2)).toContain("excerpt");
    });

    it("returns undefined for empty or whitespace-only content", () => {
      const row: SitePostInventoryRow = {
        id: 3,
        url: "https://example.com/z/",
        slug: "z",
        fields: {
          title: "T",
          keyword: "",
          meta: "",
          content: "<p></p>   ",
        },
      };
      expect(sentimentHtmlFromInventoryRow(row, 3)).toBeUndefined();
    });
  });

  it("extractPageHeadingFromHtml prefers Elementor heading widgets", () => {
    expect(
      extractPageHeadingFromHtml(
        '<header><h1>Site Logo</h1></header><h1 class="elementor-heading-title elementor-size-default">Dental Clinic Near Edmonton Valley Zoo</h1>',
      ),
    ).toBe("Dental Clinic Near Edmonton Valley Zoo");
  });

  it("downloadFieldsFromInventoryRow prefers fields.pageHeading and falls back to content H1", () => {
    const d = downloadFieldsFromInventoryRow({
      ...base,
      fields: {
        ...base.fields!,
        title: "SEO Title: Your Guide",
        content: "<h1>On Page H1</h1><p>Body</p>",
      },
    });
    expect(d.pageHeading).toBe("On Page H1");
  });
});

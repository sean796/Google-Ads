import { describe, expect, it } from "vitest";
import {
  extractFuzzyMatchTerms,
  formatAnswerMoneyPageLinksPromptBlock,
  formatFuzzySitemapLinksPromptBlock,
  isEligibleSitemapLinkCandidate,
  matchStem,
  rankFuzzyMoneyPageLinksForAnswer,
  rankFuzzySitemapLinksForSection,
  scoreFuzzySitemapCandidate,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";

describe("overview-blog-sitemap-fuzzy-links", () => {
  it("stems words and extracts hyphenated bigrams like the WP search plugin", () => {
    expect(matchStem("motorized")).toBe("motoriz");
    expect(matchStem("blinds")).toBe("blind");
    const { words, matchTerms } = extractFuzzyMatchTerms(
      "Motorized Roller Blinds for Light Control",
      ["powerview automation"],
    );
    expect(words).toContain("motorized");
    expect(words).toContain("roller");
    expect(matchTerms).toContain("motorized-roller");
    expect(matchTerms).toContain("powerview-automation");
  });

  it("strictly excludes entity / service-area URLs, utility pages, and self-links", () => {
    expect(
      isEligibleSitemapLinkCandidate({
        url: "https://blindmagic.com/service-area/st-albert/",
        title: "St. Albert Blinds",
        collection: "sap",
      }),
    ).toBe(false);

    expect(
      isEligibleSitemapLinkCandidate({
        url: "https://blindmagic.com/service-areas/sherwood-park/",
        title: "Sherwood Park",
        collection: "pages",
      }),
    ).toBe(false);

    expect(
      isEligibleSitemapLinkCandidate({
        url: "https://blindmagic.com/privacy-policy/",
        title: "Privacy Policy",
        collection: "pages",
      }),
    ).toBe(false);

    expect(
      isEligibleSitemapLinkCandidate(
        {
          url: "https://blindmagic.com/blog/motorized-roller-blinds-benefits/",
          title: "Motorized Roller Blinds Benefits",
          collection: "posts",
        },
        "https://blindmagic.com/blog/motorized-roller-blinds-benefits/",
      ),
    ).toBe(false);

    expect(
      isEligibleSitemapLinkCandidate({
        url: "https://blindmagic.com/roller-shades/",
        title: "Roller Shades",
        collection: "pages",
      }),
    ).toBe(true);
  });

  it("prioritizes product / commercial pages over blog posts on fuzzy match", () => {
    const productPage: SitemapFuzzyLinkCandidate = {
      url: "https://blindmagic.com/motorized-blinds/",
      title: "Motorized Blinds & Shades",
      slug: "motorized-blinds",
      bucket: "page",
    };
    const blogPost: SitemapFuzzyLinkCandidate = {
      url: "https://blindmagic.com/blog/motorized-blinds-tips/",
      title: "Motorized Blinds Tips",
      slug: "motorized-blinds-tips",
      bucket: "post",
    };

    const pageScore = scoreFuzzySitemapCandidate(
      productPage,
      "Key Advantages of Motorised Roller Blinds",
      ["motorized roller blinds"],
    );
    const postScore = scoreFuzzySitemapCandidate(
      blogPost,
      "Key Advantages of Motorised Roller Blinds",
      ["motorized roller blinds"],
    );
    expect(pageScore).toBeGreaterThan(postScore);

    const ranked = rankFuzzySitemapLinksForSection({
      pool: [blogPost, productPage],
      sectionTitle: "Key Advantages of Motorised Roller Blinds",
      sectionBodyHtml: "<p>Automated window treatments replace pull chains with quiet motors.</p>",
      articleTitle: "Advantages Of Motorised Roller Blinds",
      focusKeyword: "motorized roller blinds",
    });

    expect(ranked[0]?.url).toBe("https://blindmagic.com/motorized-blinds/");
    expect(ranked[0]?.bucket).toBe("page");
  });

  it("formats prompt instructions requiring 1-3 front-loaded contextual links", () => {
    const block = formatFuzzySitemapLinksPromptBlock(
      [
        {
          url: "https://blindmagic.com/roller-shades/",
          title: "Roller Shades",
          slug: "roller-shades",
          bucket: "page",
        },
      ],
      [],
    );
    expect(block).toContain("MANDATORY: WEAVE 1 TO 3 LINKS IN THIS SECTION");
    expect(block).toContain("PRIORITIZE [PRODUCT / PAGE] URLs first");
    expect(block).toContain("FRONT-LOAD LINKS IN SENTENCES");
    expect(block).toContain("https://blindmagic.com/roller-shades/");
  });

  it("ranks only page-sitemap money pages (never blog posts) for the Answer section", () => {
    const productPage: SitemapFuzzyLinkCandidate = {
      url: "https://blindmagic.com/roller-shades/",
      title: "Roller Shades",
      slug: "roller-shades",
      bucket: "page",
    };
    const blogPost: SitemapFuzzyLinkCandidate = {
      url: "https://blindmagic.com/blog/motorized-roller-blinds/",
      title: "Motorized Roller Blinds Guide",
      slug: "motorized-roller-blinds",
      bucket: "post",
    };

    const answerMoneyPages = rankFuzzyMoneyPageLinksForAnswer({
      pool: [blogPost, productPage],
      articleTitle: "Advantages Of Motorised Roller Blinds",
      focusKeyword: "motorized roller blinds",
    });

    expect(answerMoneyPages).toHaveLength(1);
    expect(answerMoneyPages[0]?.url).toBe("https://blindmagic.com/roller-shades/");
    expect(formatAnswerMoneyPageLinksPromptBlock(answerMoneyPages)).toContain(
      "MANDATORY IN ANSWER: WEAVE 1 PRODUCT/SERVICE LINK",
    );
  });
});

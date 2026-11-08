import { describe, expect, it } from "vitest";
import {
  focusKeywordFromWordPressSources,
  inferFocusKeywordFromTitle,
  keywordMatchesPostTitle,
  overviewGridFocusKeywordLabel,
} from "../focus-keyword-from-wp-sources";

describe("focusKeywordFromWordPressSources", () => {
  it("keeps a stored keyword that describes this title", () => {
    expect(
      focusKeywordFromWordPressSources({
        acf: { keyword_focus: "elementor experts" },
        meta: { neo_pulse_seo_focus_keyword: "what is national seo" },
        title: "What Is National SEO And How It Works",
        collection: "posts",
      }),
    ).toBe("what is national seo");
  });

  it("drops a leftover NEO Pulse redirect keyword from an old slug", () => {
    expect(
      focusKeywordFromWordPressSources({
        meta: { neo_pulse_seo_focus_keyword: "elementor experts" },
        title: "What Is National SEO And How Does It Work?",
        collection: "posts",
      }),
    ).toBe("what is national seo and how does it work");
  });

  it("prefers ACF keyword_focus over stale NEO Pulse redirect when both describe the post", () => {
    expect(
      focusKeywordFromWordPressSources({
        acf: { keyword_focus: "CRA tax payments changes" },
        meta: { neo_pulse_seo_focus_keyword: "canadian tax payments" },
        title: "Upcoming Changes to Canadian Tax Payments: What Businesses Need to Know",
        collection: "posts",
      }),
    ).toBe("CRA tax payments changes");
  });

  it("drops wordpress maintenance on a scaling-brand title", () => {
    expect(
      focusKeywordFromWordPressSources({
        fieldsKeyword: "wordpress maintenance",
        title: "Scaling A Digital Brand With Growth Strategies",
        collection: "posts",
      }),
    ).toBe("scaling a digital brand with growth strategies");
  });

  it("uses the title segment before a colon", () => {
    expect(inferFocusKeywordFromTitle("Seo Vs Ads: SEO vs. Ads: Which Is Best?")).toBe("seo vs ads");
  });

  it("does not rewrite page keywords that are not in the title", () => {
    expect(
      focusKeywordFromWordPressSources({
        acf: { keyword_focus: "digital marketing agency edmonton" },
        title: "About Us",
        collection: "pages",
      }),
    ).toBe("digital marketing agency edmonton");
  });

  it("keywordMatchesPostTitle requires shared topic words", () => {
    expect(keywordMatchesPostTitle("elementor experts", "What Is National SEO And How Does It Work?")).toBe(
      false,
    );
    expect(keywordMatchesPostTitle("what is national seo", "What Is National SEO And How It Works")).toBe(true);
  });
});

describe("overviewGridFocusKeywordLabel", () => {
  it("shows a stored AISEO keyword even when it does not match the title", () => {
    expect(
      overviewGridFocusKeywordLabel({
        storedKeyword: "canada tariff impact",
        title: "How Tariffs Impact Canadian Businesses: 2026 Overview",
        postType: "post",
      }),
    ).toBe("canada tariff impact");
  });

  it("infers from the title when the row has no stored keyword", () => {
    expect(
      overviewGridFocusKeywordLabel({
        storedKeyword: "",
        title: "How Tariffs Impact Canadian Businesses: 2026 Overview",
        postType: "post",
      }),
    ).toBe("how tariffs impact canadian businesses");
  });
});

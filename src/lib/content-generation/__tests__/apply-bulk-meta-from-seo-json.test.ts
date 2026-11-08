import { describe, it, expect } from "vitest";
import { buildOptimizedMetaFromKeywordResearch } from "@/lib/content-generation/apply-bulk-meta-from-seo-json";

describe("buildOptimizedMetaFromKeywordResearch entity SAP titles", () => {
  it("keeps Near post title when focus keyword embeds place tokens", () => {
    const postTitle = "Advanced Window Coverings Near Plum Coulee, MB";
    const meta = buildOptimizedMetaFromKeywordResearch(
      { seoTitle: "Advanced Window Coverings Plum Coulee: Guide", focusKeyword: "advanced window coverings plum coulee" },
      postTitle,
      "Meta description for the page.",
      "advanced window coverings plum coulee",
      "https://example.com/plum-coulee/",
      "https://example.com",
    );
    expect(meta.neo_pulse_seo_title).toBe(postTitle);
    expect(meta.neo_pulse_seo_title).not.toContain(":");
  });

  it("does not stitch the keyword onto the title agent headline", () => {
    const postTitle = "Blackout Blinds For Homes In Mediterra Naples Florida";
    const meta = buildOptimizedMetaFromKeywordResearch(
      {
        seoTitle: "Blackout Blinds Mediterra Naples Florida: Guide",
        focusKeyword: "blackout blinds mediterra naples florida",
      },
      postTitle,
      "Blackout blinds for homes in Mediterra.",
      "blackout blinds mediterra naples florida",
      "https://example.com/mediterra/",
      "https://example.com",
    );
    expect(meta.neo_pulse_seo_title).toBe(postTitle);
    expect(meta.neo_pulse_seo_title).not.toContain(":");
  });
});

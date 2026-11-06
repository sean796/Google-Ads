import { describe, expect, it } from "vitest";
import {
  parseClusterResultJson,
  parseMergeRecommendationJson,
  sitemapOptimizerClusterResultSchema,
  sitemapOptimizerMergeRecommendationSchema,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-parse";

describe("sitemap-optimizer-parse", () => {
  it("parses cluster JSON with loose member ids", () => {
    const raw = {
      clusters: [
        {
          clusterId: "c1",
          label: "Blinds comparison",
          intent: "informational",
          memberPostIds: ["wp:101", "wp:102"],
          confidence: "high",
          rationale: "Same comparison intent",
        },
      ],
      singletons: ["wp:99"],
    };
    const viaSchema = sitemapOptimizerClusterResultSchema.parse(raw);
    expect(viaSchema.clusters).toHaveLength(1);
    expect(viaSchema.clusters[0]?.memberPostIds).toEqual(["wp:101", "wp:102"]);
    expect(viaSchema.singletons).toEqual(["wp:99"]);

    const viaString = parseClusterResultJson(JSON.stringify(raw));
    expect(viaString.clusters[0]?.label).toBe("Blinds comparison");
  });

  it("drops single-member clusters", () => {
    const raw = {
      clusters: [{ memberPostIds: ["wp:1"], label: "Solo" }],
      singletons: [],
    };
    const parsed = sitemapOptimizerClusterResultSchema.parse(raw);
    expect(parsed.clusters).toHaveLength(0);
  });

  it("parses merge recommendation from model-shaped JSON", () => {
    const raw = {
      clusterId: "c1",
      recommendedTitle: "Best Blinds Guide",
      recommendedPrimaryKeyword: "best blinds",
      recommendedMeta: "Compare top blinds for your home with expert tips.",
      combinedOutline: ["Types of blinds", "Cost factors", "Installation tips"],
      whatToKeepFromEach: [
        {
          url: "https://example.com/a",
          title: "Post A",
          bullets: ["Unique stat from A"],
        },
      ],
      redirectOrCanonicalNote: "301 secondary URLs to the merged post.",
      priority: "high",
      confidence: "medium",
      rationale: "Consolidate competing guides.",
    };
    const viaSchema = sitemapOptimizerMergeRecommendationSchema.parse(raw);
    expect(viaSchema.recommendedTitle).toBe("Best Blinds Guide");
    expect(viaSchema.combinedOutline).toHaveLength(3);

    const viaAgent = parseMergeRecommendationJson(JSON.stringify(raw), "c1");
    expect(viaAgent?.priority).toBe("high");
    expect(viaAgent?.whatToKeepFromEach[0]?.bullets[0]).toBe("Unique stat from A");
  });

  it("throws on invalid JSON instead of masquerading as no merges", () => {
    expect(() => parseClusterResultJson("not json")).toThrow(/no JSON|not valid JSON/);
    expect(() => parseClusterResultJson("")).toThrow(/no JSON/);
    expect(() => parseClusterResultJson(JSON.stringify({ clusters: "nope" }))).toThrow(/schema/);
  });

  it("returns null merge on invalid JSON", () => {
    expect(parseMergeRecommendationJson("{broken", "x")).toBeNull();
  });
});

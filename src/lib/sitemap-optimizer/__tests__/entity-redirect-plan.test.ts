import { describe, expect, it } from "vitest";
import {
  resolveEntityRedirectDestinationUrl,
  entityStateFromRedirectPlan,
} from "@/lib/sitemap-optimizer/build-entity-state-from-redirect-plan";
import { ensureEntityCompressCoverage } from "@/lib/sitemap-optimizer/entity-compress-coverage";
import { fillFamilyStrategyFromPillar } from "@/lib/sitemap-optimizer/entity-transform-families-agent";
import { redirectPlanRedirectCsvPairs } from "@/lib/sitemap-optimizer/entity-redirect-plan-agent";
import { entityRedirectGroupingKey } from "@/lib/sitemap-optimizer/entity-redirect-grouping-key";
import type { EntityRedirectPlan } from "@/lib/sitemap-optimizer/entity-redirect-plan-parse";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function row(
  postId: string,
  url: string,
  opts: Partial<SitemapOptimizerPostRow> = {},
): SitemapOptimizerPostRow {
  return {
    postId,
    url,
    collection: "entity",
    title: postId,
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscPageClicks: 0,
    gscPageImpressions: 0,
    gscQueries: [],
    gscFetched: true,
    ...opts,
  };
}

function aiFamily(
  id: string,
  memberIds: string[],
  pillarId: string,
  keyword: string,
): EntityRedirectPlan["families"][number] {
  return {
    familyId: id,
    destinationPostId: pillarId,
    sourcePostIds: memberIds,
    rationale: "AI grouped thin local pages.",
    recommendedPrimaryKeyword: keyword,
    recommendedTitle: `${keyword} in Example`,
    recommendedMeta: "Expert local SEO for your neighborhood.",
    sapEntity: "Example, City",
    sapModifier: "Writer brief from legacy posts.",
    combinedOutline: ["Overview", "Services"],
    whatToKeepFromEach: memberIds.map((mid) => ({
      url: `https://example.com/${mid}/`,
      title: mid,
      bullets: ["legacy angle"],
    })),
  };
}

describe("entity redirect plan", () => {
  it("builds NEO Pulse redirect pairs from AI plan families", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row(`p${i}`, `https://example.com/service-area/griesbach-blinds-${i + 1}/`, {
        gscPageClicks: i,
      }),
    );
    const plan: EntityRedirectPlan = {
      families: [
        aiFamily("f1", ["p0", "p1", "p2", "p3", "p4"], "p4", "custom blinds"),
        aiFamily("f2", ["p5"], "p5", "motorized shades"),
      ],
    };
    const rowById = new Map(rows.map((r) => [r.postId, r]));
    const { merges } = entityStateFromRedirectPlan(plan, rowById);
    const pairs = redirectPlanRedirectCsvPairs(plan, rowById);

    expect(merges).toHaveLength(2);
    expect(merges[0]?.recommendedPrimaryKeyword).toBe("custom blinds");
    expect(merges[0]?.sapModifier).toContain("Writer brief from legacy posts.");
    expect(merges[0]?.sapModifier).toMatch(/Also covers:/i);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("still emits merges when strategy fields are incomplete", () => {
    const rows = [
      row("p0", "https://example.com/service-area/blinds-a/", { title: "Blinds A", keyword: "blinds" }),
      row("p1", "https://example.com/service-area/blinds-b/", { title: "Blinds B" }),
    ];
    const plan: EntityRedirectPlan = {
      families: [
        {
          familyId: "f1",
          destinationPostId: "p0",
          sourcePostIds: ["p0", "p1"],
          rationale: "",
        },
      ],
    };
    const rowById = new Map(rows.map((r) => [r.postId, r]));
    const { merges } = entityStateFromRedirectPlan(plan, rowById);
    expect(merges).toHaveLength(1);
    expect(merges[0]?.recommendedTitle).toBeTruthy();
    expect(merges[0]?.recommendedPrimaryKeyword).toBeTruthy();
    expect(merges[0]?.lockedDestinationUrl).toContain("blinds-a");
  });

  it("strips numbered-slug duplicates from locked destination URLs", () => {
    const pillar = row(
      "p0",
      "https://example.com/service-area/window-shades-altamonte-springs-2/",
    );
    expect(resolveEntityRedirectDestinationUrl(pillar)).toBe(
      "https://example.com/service-area/window-shades-altamonte-springs/",
    );
  });

  it("packs missing consolidate ids for full coverage", () => {
    const rows = [
      row("a", "https://example.com/service-area/tampa-blinds/"),
      row("b", "https://example.com/service-area/tampa-shades/"),
      row("c", "https://example.com/service-area/orlando-blinds/"),
    ];
    const rowById = new Map(rows.map((r) => [r.postId, r]));
    const partial: EntityRedirectPlan = {
      families: [
        {
          familyId: "f1",
          destinationPostId: "a",
          sourcePostIds: ["a"],
          rationale: "Partial",
        },
      ],
    };
    const full = ensureEntityCompressCoverage(partial, ["a", "b", "c"], rowById);
    const assigned = full.families.flatMap((f) => f.sourcePostIds).sort();
    expect(assigned).toEqual(["a", "b", "c"]);
  });

  it("fills incomplete strategy from pillar catalog", () => {
    const rows = [
      row("p0", "https://example.com/service-area/x/", {
        title: "X Title",
        keyword: "x keyword",
        meta: "X meta description here.",
      }),
    ];
    const rowById = new Map(rows.map((r) => [r.postId, r]));
    const filled = fillFamilyStrategyFromPillar(
      {
        familyId: "f1",
        destinationPostId: "p0",
        sourcePostIds: ["p0"],
        rationale: "",
      },
      rowById,
    );
    expect(filled.recommendedTitle).toBe("X Title");
    expect(filled.recommendedPrimaryKeyword).toBe("x keyword");
    expect(filled.recommendedMeta).toBeTruthy();
    expect(filled.whatToKeepFromEach?.length).toBe(1);
  });

  it("groups edmonton-seo neighborhood slugs by city key", () => {
    expect(
      entityRedirectGroupingKey("https://neodigital.ca/service-area/edmonton-seo-neighborhood-1-edmonton/"),
    ).toBe("edmonton");
  });
});

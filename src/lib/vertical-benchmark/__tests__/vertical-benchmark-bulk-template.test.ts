import { describe, expect, it } from "vitest";
import {
  buildClientGscBulkAdaptPrompt,
  BENCHMARK_BULK_QUARTER_POST_ROW_CAP,
  BULK_BENCHMARK_MODIFIER_VALUES,
  capBulkBenchmarkPostRowsToQuarterGoal,
  jsonRowsToPitchRows,
  normalizeBulkBenchmarkModifier,
  sortBulkBenchmarkRowsByGsc,
  type BenchmarkClientPlan,
} from "../vertical-benchmark-bulk-template";
import { createGlobalBulkDedupeState } from "../vertical-benchmark-bulk-dedupe";
import { buildGscRagPromptInstructions, sumGscPostPagesAcrossClients } from "../vertical-benchmark-gsc-rag";

function mockPlan(gscUrlCount: number, name: string): BenchmarkClientPlan {
  const pages = Array.from({ length: gscUrlCount }, (_, i) => ({
    rank: i + 1,
    url: `https://${name.toLowerCase().replace(/\s+/g, "")}.com/post-${i + 1}`,
    clicks: 10 - i,
    impressions: 100,
    position: 3,
    content_kind: "post" as const,
  }));
  return {
    site: {
      id: `id-${name}`,
      name,
      siteUrl: `https://${name}.com`,
      username: "user",
      appPassword: "pass",
      connectedAt: 0,
    },
    siteUrl: `https://${name}.com`,
    categoryLabel: "Window Treatment",
    contentKind: "post" as const,
    siteInventoryJson: '{"posts":[]}',
    clientOfferingsBlock: "=== CLIENT_OFFERINGS_CONTEXT (mandatory for curation) ===\n{}",
    verifiedBrands: [] as string[],
    gscClusters: [],
    outputPages: pages,
    gscPayload: {
      siteId: `id-${name}`,
      siteName: name,
      siteUrl: `https://${name}.com`,
      clientTag: "Window Treatment",
      topPages: pages,
    },
    expectedRows: gscUrlCount,
  };
}

describe("buildClientGscBulkAdaptPrompt with HD cluster", () => {
  it("asks for fewer rows when three HD product URLs merge", () => {
    const pages = [
      { rank: 1, url: "https://dealer.com/hunter-douglas-skyline", clicks: 30, impressions: 100, position: 3, content_kind: "post" as const },
      { rank: 2, url: "https://dealer.com/hunter-douglas-duette", clicks: 50, impressions: 100, position: 3, content_kind: "post" as const },
      { rank: 3, url: "https://dealer.com/hunter-douglas-luminette", clicks: 20, impressions: 100, position: 3, content_kind: "post" as const },
      { rank: 4, url: "https://dealer.com/custom-window-treatments", clicks: 10, impressions: 100, position: 3, content_kind: "post" as const },
    ];
    const gscClusters = [
      {
        brandLabel: "Hunter Douglas",
        leadPage: pages[1],
        memberPages: [pages[1], pages[0], pages[2]],
      },
    ];
    const outputPages = [pages[1], pages[3]];
    const plan: BenchmarkClientPlan = {
      ...mockPlan(4, "Dealer"),
      gscPayload: { ...mockPlan(4, "Dealer").gscPayload, topPages: pages },
      gscClusters,
      outputPages,
      expectedRows: 2,
      verifiedBrands: ["Hunter Douglas"],
    };
    const { system, user } = buildClientGscBulkAdaptPrompt(plan, createGlobalBulkDedupeState());
    expect(system).toContain("exactly 2");
    expect(user).toMatch(/GSC MERGED CLUSTERS/i);
    expect(user).toMatch(/Do NOT output a separate row/i);
  });
});

describe("buildClientGscBulkAdaptPrompt", () => {
  it("includes senior SEO persona, SITE_INVENTORY first, and cannibalization rules", () => {
    const inventory = JSON.stringify({
      posts: [
        {
          url: "https://example.com/brand-a-vs-brand-b",
          fields: {
            title: "Brand A Vs. Brand B: A Comparison",
            keyword: "brand a vs brand b",
            meta: "",
          },
        },
      ],
    });
    const plan = { ...mockPlan(3, "Blind Magic"), siteInventoryJson: inventory };
    const { system, user } = buildClientGscBulkAdaptPrompt(plan, createGlobalBulkDedupeState());
    expect(system).toMatch(/SENIOR SEO CONTENT SPECIALIST/i);
    expect(system).toMatch(/SITE_INVENTORY — CANNIBALIZATION ONLY/i);
    expect(user).toMatch(/SITE_INVENTORY/);
    expect(user).toMatch(/Published inventory count: 1/i);
    expect(user).toMatch(/brand a vs brand b/i);
    const invPos = user.indexOf("SITE_INVENTORY");
    const gscPos = user.indexOf("GSC EXEMPLARS");
    expect(invPos).toBeGreaterThan(-1);
    expect(gscPos).toBeGreaterThan(invPos);
  });

  it("requires exactly as many rows as GSC URLs for that client (not a fixed 10)", () => {
    const plan = mockPlan(7, "Blind Magic");
    const { system, user } = buildClientGscBulkAdaptPrompt(plan, createGlobalBulkDedupeState());
    expect(system).toMatch(/NO DUPLICATES/i);
    expect(system).toMatch(/CANNIBALIZATION — STRICT/i);
    expect(system).toMatch(/unordered comparison pair/i);
    expect(system).toMatch(/MODIFIER column/i);
    for (const v of BULK_BENCHMARK_MODIFIER_VALUES) {
      expect(system).toContain(v);
    }
    expect(system).toMatch(/Never use "y"/i);
    expect(system).toContain("exactly 7");
    expect(system).toMatch(/CURATE FOR THIS CLIENT/i);
    expect(system).toMatch(/Never use Bali/i);
    expect(system).toMatch(/Do NOT add or remove rows beyond the required count/i);
    expect(system).toMatch(/TITLE — NO PLACES/i);
    expect(system).toMatch(/Florida Interior Design/i);
    expect(system).toMatch(/ROW COUNT LOCK/i);
    expect(user).toContain("GSC EXEMPLARS (7");
    expect(user).toMatch(/write 7 rows for Blind Magic/i);
    expect(user).toMatch(/Never mention Bali/i);
    expect(user).not.toContain("exactly 10");
    expect(user).toMatch(/CLIENT_OFFERINGS_CONTEXT/);
    expect(system).toMatch(/CLIENT OFFERINGS \(mandatory\)/i);
    expect(system).toMatch(/Forbidden: comparison or product-specific posts for brands NOT listed/i);
    expect(user).toMatch(/GSC EXEMPLARS/i);
  });

  it("entity mode requires entity column and allows geo titles", () => {
    const plan = { ...mockPlan(3, "Blinds West"), contentKind: "entity" as const };
    const { system } = buildClientGscBulkAdaptPrompt(plan, createGlobalBulkDedupeState());
    expect(system).toMatch(/entity is REQUIRED/i);
    expect(system).toMatch(/SERVICE AREA/i);
    expect(system).not.toMatch(/TITLE — NO PLACES/i);
    expect(system).not.toMatch(/entity must be "" on every row/i);
  });
});

describe("sumGscPostPagesAcrossClients", () => {
  it("sums natural per-client GSC counts", () => {
    const total = sumGscPostPagesAcrossClients([
      mockPlan(7, "A").gscPayload,
      mockPlan(3, "B").gscPayload,
    ]);
    expect(total).toBe(10);
  });
});

describe("normalizeBulkBenchmarkModifier", () => {
  it("maps y/n to title-inferred types, not featuredImage flags", () => {
    expect(normalizeBulkBenchmarkModifier("y", "Hunter Douglas vs Alta: Which Wins?")).toBe(
      "comparison",
    );
    expect(normalizeBulkBenchmarkModifier("", "Motorized Shades Installation Guide")).toBe("guide");
  });

  it("accepts canonical modifier labels", () => {
    expect(normalizeBulkBenchmarkModifier("product review", "Altex Moduline Roller Shades")).toBe(
      "product review",
    );
  });
});

describe("capBulkBenchmarkPostRowsToQuarterGoal", () => {
  it("keeps only the top quarter post rows package-wide by GSC clicks", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      keyword: `kw-${i}`,
      entity: "",
      title: `Title ${i}`,
      modifier: "guide" as const,
      featuredImage: "y" as const,
      clientName: `Client ${i % 3}`,
      verifiedBrands: [] as string[],
      gscClicks: 100 - i,
      gscImpressions: 1000,
      contentKind: "post" as const,
    }));
    const { rows: capped, trimmed } = capBulkBenchmarkPostRowsToQuarterGoal(rows);
    expect(capped).toHaveLength(BENCHMARK_BULK_QUARTER_POST_ROW_CAP);
    expect(trimmed).toBe(12 - BENCHMARK_BULK_QUARTER_POST_ROW_CAP);
    expect(capped[0]?.title).toBe("Title 0");
    expect(capped[capped.length - 1]?.title).toBe(`Title ${BENCHMARK_BULK_QUARTER_POST_ROW_CAP - 1}`);
  });

  it("does not cap entity rows", () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      keyword: `p-${i}`,
      entity: "",
      title: `P ${i}`,
      modifier: "guide" as const,
      featuredImage: "y" as const,
      clientName: "A",
      verifiedBrands: [] as string[],
      gscClicks: 10 - i,
      gscImpressions: 100,
      contentKind: "post" as const,
    }));
    const entities = [
      {
        keyword: "entity",
        entity: "City",
        title: "Entity",
        modifier: "guide" as const,
        featuredImage: "y" as const,
        clientName: "A",
        verifiedBrands: [] as string[],
        gscClicks: 1,
        gscImpressions: 10,
        contentKind: "entity" as const,
      },
    ];
    const { rows: capped, trimmed } = capBulkBenchmarkPostRowsToQuarterGoal([...posts, ...entities]);
    expect(trimmed).toBe(0);
    expect(capped).toHaveLength(6);
  });
});

describe("sortBulkBenchmarkRowsByGsc", () => {
  it("orders by clicks desc, then impressions desc", () => {
    const sorted = sortBulkBenchmarkRowsByGsc([
      { keyword: "a", entity: "", title: "A", modifier: "guide", featuredImage: "y", clientName: "A", verifiedBrands: [], gscClicks: 5, gscImpressions: 900 },
      { keyword: "b", entity: "", title: "B", modifier: "guide", featuredImage: "y", clientName: "B", verifiedBrands: [], gscClicks: 20, gscImpressions: 100 },
      { keyword: "c", entity: "", title: "C", modifier: "guide", featuredImage: "y", clientName: "C", verifiedBrands: [], gscClicks: 20, gscImpressions: 500 },
    ]);
    expect(sorted.map((r) => r.title)).toEqual(["C", "B", "A"]);
  });
});

describe("jsonRowsToPitchRows", () => {
  it("uses connected-site keywords from the model and rejects Bali", () => {
    const pages = [
      {
        rank: 1,
        url: "https://magic.com/alta-vs-hunter-douglas",
        clicks: 9,
        impressions: 100,
        position: 3,
        content_kind: "post" as const,
      },
      {
        rank: 2,
        url: "https://magic.com/roman-shades",
        clicks: 8,
        impressions: 100,
        position: 3,
        content_kind: "post" as const,
      },
    ];
    const rows = jsonRowsToPitchRows(
      [
        { keyword: "hunter douglas vs alta", title: "Hunter Douglas vs Alta Shades" },
        { keyword: "diy tutorial how to safely remove bali blinds from their brackets", title: "Window Treatment Removal Guide" },
      ],
      pages,
      "post",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.keyword).toBe("hunter douglas vs alta");
    expect(rows[1]?.keyword).toBe("roman shades");
    expect(rows.every((r) => !/bali/i.test(r.keyword))).toBe(true);
  });
});

describe("buildGscRagPromptInstructions", () => {
  it("requires one row per GSC URL without inventing extras", () => {
    expect(buildGscRagPromptInstructions()).toMatch(/ONE bulk CSV row per URL/i);
    expect(buildGscRagPromptInstructions()).toMatch(/Do not add extra rows/i);
  });
});

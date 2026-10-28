import { describe, expect, it } from "vitest";
import {
  brandExclusionPhrasesFromNames,
  entityGscRowLimitForSapBudget,
  gscAllQueryStringsForEntityKeywordFill,
  gscSapKeywordBasesForOpenRouter,
  gscSapKeywordBasesFromAllQueries,
  gscShortTailKeywordsForOpenRouter,
  isShortTailGscQuery,
  isTransactionalSapGscQuery,
  isTransactionalSapKeywordBaseGscQuery,
} from "@/lib/bulk/bulk-gsc-site-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";

describe("entityGscRowLimitForSapBudget", () => {
  it("returns SAP budget plus 20", () => {
    expect(entityGscRowLimitForSapBudget(45)).toBe(65);
    expect(entityGscRowLimitForSapBudget(10)).toBe(30);
  });
});

describe("isShortTailGscQuery", () => {
  it("accepts 2–4 word commercial phrases", () => {
    expect(isShortTailGscQuery("blinds near me")).toBe(true);
    expect(isShortTailGscQuery("alta roman shades")).toBe(true);
    expect(isShortTailGscQuery("hunter douglas repair")).toBe(true);
  });

  it("rejects questions and long queries", () => {
    expect(isShortTailGscQuery("how to fix cordless blinds that won't go up")).toBe(false);
    expect(isShortTailGscQuery("what are the 3 levels of light blocking")).toBe(false);
    expect(isShortTailGscQuery("why wont my blinds go up?")).toBe(false);
  });
});

describe("isTransactionalSapGscQuery", () => {
  it("accepts product and service phrases", () => {
    expect(isTransactionalSapGscQuery("blinds near me")).toBe(true);
    expect(isTransactionalSapGscQuery("alta roman shades")).toBe(true);
    expect(isTransactionalSapGscQuery("best black out blinds")).toBe(true);
    expect(isTransactionalSapGscQuery("custom blinds")).toBe(true);
  });

  it("accepts glamping and outdoor lodging phrases", () => {
    expect(isTransactionalSapGscQuery("glamping alberta")).toBe(true);
    expect(isTransactionalSapGscQuery("posh glamping")).toBe(true);
    expect(isTransactionalSapGscQuery("glamping retreats near me")).toBe(true);
    expect(isTransactionalSapGscQuery("canmore glamping")).toBe(true);
  });

  it("rejects informational and blog-style phrases", () => {
    expect(isTransactionalSapGscQuery("curtain opacity")).toBe(false);
    expect(isTransactionalSapGscQuery("curtain transparency levels")).toBe(false);
    expect(isTransactionalSapGscQuery("somfy competitors")).toBe(false);
    expect(isTransactionalSapGscQuery("aura illuminated shades cost")).toBe(false);
    expect(isTransactionalSapGscQuery("solar charger for blinds")).toBe(false);
  });
});

describe("isTransactionalSapKeywordBaseGscQuery", () => {
  it("accepts 2–3 word glamping bases only", () => {
    expect(isTransactionalSapKeywordBaseGscQuery("posh glamping")).toBe(true);
    expect(isTransactionalSapKeywordBaseGscQuery("glamping alberta")).toBe(true);
    expect(isTransactionalSapKeywordBaseGscQuery("glamping retreats near me")).toBe(false);
    expect(isTransactionalSapKeywordBaseGscQuery("what are the benefits of glamping?")).toBe(false);
    expect(isTransactionalSapKeywordBaseGscQuery("site:posh-outdoors.com")).toBe(false);
    expect(
      isTransactionalSapKeywordBaseGscQuery("glamping sites challenges traditional cabin structures"),
    ).toBe(false);
  });
});

describe("gscAllQueryStringsForEntityKeywordFill", () => {
  it("includes queries that fail strict SAP base filter", () => {
    const queries = [
      { query: "how to fix cordless blinds that won't go up", clicks: 1, impressions: 1 },
      { query: "designer roller blinds", clicks: 0, impressions: 332 },
    ];
    const bases = gscAllQueryStringsForEntityKeywordFill(queries);
    expect(bases).toContain("how to fix cordless blinds that won't go up");
    expect(bases).toContain("designer roller blinds");
  });

  it("drops fuzzy brand navigational queries before keyword fill", () => {
    const queries = [
      { query: "neo digital", clicks: 100, impressions: 1000, position: 1 },
      { query: "neodigital", clicks: 90, impressions: 900, position: 2 },
      { query: "local seo services", clicks: 50, impressions: 500, position: 3 },
      { query: "marketing agency", clicks: 40, impressions: 400, position: 4 },
    ];
    const brand = brandExclusionPhrasesFromNames("Neo Digital");
    const bases = gscAllQueryStringsForEntityKeywordFill(queries, brand, "Neo Digital");
    expect(bases).not.toContain("neo digital");
    expect(bases).not.toContain("neodigital");
    expect(bases).toContain("local seo services");
    expect(bases).toContain("marketing agency");
  });
});

describe("gscSapKeywordBasesForOpenRouter", () => {
  it("returns only 2–3 word transactional bases", () => {
    const queries: GscSiteQueryRow[] = [
      { query: "glamping sites challenges traditional cabin structures", clicks: 100, impressions: 1000, position: 1 },
      { query: "what are the benefits of glamping?", clicks: 90, impressions: 900, position: 2 },
      { query: "posh glamping", clicks: 80, impressions: 800, position: 3 },
      { query: "glamping alberta", clicks: 70, impressions: 700, position: 4 },
      { query: "site:posh-outdoors.com", clicks: 60, impressions: 600, position: 5 },
    ];
    expect(gscSapKeywordBasesForOpenRouter(queries, 10)).toEqual(["posh glamping", "glamping alberta"]);
  });

  it("rejects vulgar GSC queries even when they match near me", () => {
    const queries: GscSiteQueryRow[] = [
      { query: "shit near me", clicks: 100, impressions: 1000, position: 1 },
      { query: "blinds near me", clicks: 50, impressions: 500, position: 2 },
    ];
    expect(gscSapKeywordBasesForOpenRouter(queries, 10)).toEqual(["blinds near me"]);
  });
});

describe("gscShortTailKeywordsForOpenRouter", () => {
  it("returns only transactional short-tail queries sorted by stats", () => {
    const queries: GscSiteQueryRow[] = [
      { query: "how to fix blinds", clicks: 100, impressions: 1000, position: 5 },
      { query: "curtain opacity", clicks: 90, impressions: 900, position: 4 },
      { query: "custom blinds", clicks: 50, impressions: 500, position: 8 },
      { query: "drapes near me", clicks: 40, impressions: 400, position: 10 },
    ];
    const out = gscShortTailKeywordsForOpenRouter(queries, 10);
    expect(out).toEqual(["custom blinds", "drapes near me"]);
  });

  it("excludes queries containing the business brand name", () => {
    const queries: GscSiteQueryRow[] = [
      { query: "advance blinds and drapery", clicks: 100, impressions: 1000, position: 1 },
      { query: "custom blinds", clicks: 50, impressions: 500, position: 8 },
      { query: "advance blinds", clicks: 40, impressions: 400, position: 3 },
    ];
    const brand = brandExclusionPhrasesFromNames("Advance Blinds");
    const out = gscShortTailKeywordsForOpenRouter(queries, 10, brand);
    expect(out).toEqual(["custom blinds"]);
  });
});

describe("isConnectedSiteBrandAsKeyword", () => {
  it("flags Blind Magic brand keywords from the full site name", async () => {
    const { isConnectedSiteBrandAsKeyword } = await import("@/lib/bulk/bulk-gsc-site-queries");
    expect(
      isConnectedSiteBrandAsKeyword(
        "blind magic",
        "Blind Magic Window Coverings | Hunter Douglas Blinds",
      ),
    ).toBe(true);
    expect(
      isConnectedSiteBrandAsKeyword(
        "blind magic edmonton",
        "Blind Magic Window Coverings | Hunter Douglas Blinds",
      ),
    ).toBe(true);
    expect(
      isConnectedSiteBrandAsKeyword(
        "roman shades",
        "Blind Magic Window Coverings | Hunter Douglas Blinds",
      ),
    ).toBe(false);
  });
});

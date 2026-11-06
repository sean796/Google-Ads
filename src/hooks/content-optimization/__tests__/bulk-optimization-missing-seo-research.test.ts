import { describe, expect, it, vi } from "vitest";
import {
  fillMissingBulkSeoResearchFromSerp,
  hasSubstantiveSeoResearch,
} from "../bulk-optimization-missing-seo-research";

describe("hasSubstantiveSeoResearch", () => {
  it("returns false for empty / missing / placeholder JSON", () => {
    expect(hasSubstantiveSeoResearch(undefined)).toBe(false);
    expect(hasSubstantiveSeoResearch({})).toBe(false);
    expect(hasSubstantiveSeoResearch({ seo_research: "" })).toBe(false);
    expect(hasSubstantiveSeoResearch({ seo_research: "   " })).toBe(false);
    expect(hasSubstantiveSeoResearch({ seo_research: "{}" })).toBe(false);
    expect(hasSubstantiveSeoResearch({ seo_research: "[]" })).toBe(false);
  });

  it("returns true for non-empty JSON object/array and non-JSON text", () => {
    expect(hasSubstantiveSeoResearch({ seo_research: '{"k":null}' })).toBe(true);
    expect(hasSubstantiveSeoResearch({ seo_research: '{"a":1}' })).toBe(true);
    expect(hasSubstantiveSeoResearch({ seo_research: '[{"x":1}]' })).toBe(true);
    expect(hasSubstantiveSeoResearch({ seo_research: "markdown brief" })).toBe(true);
    expect(hasSubstantiveSeoResearch({ seo_research: '"quoted"' })).toBe(true);
  });
});

describe("fillMissingBulkSeoResearchFromSerp", () => {
  it("runs SERP fetch with bounded parallelism (more than one in flight)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchBrief = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 25));
      inFlight -= 1;
      return '{"ok":true}';
    });

    const n = 10;
    const urls = Array.from({ length: n }, (_, i) => `https://example.com/p${i}/`);
    const prefetchedAcfFieldsCache = new Map<number, Record<string, unknown>>();
    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();

    for (let i = 0; i < n; i++) {
      prefetchedAcfFieldsCache.set(i, { keyword_focus: `kw-${i}` });
    }

    await fillMissingBulkSeoResearchFromSerp({
      urls,
      batchKey: "bk",
      isAcfKeywordMode: true,
      seoExtraTextFieldOnly: false,
      muteToasts: true,
      prefetchedAcfFieldsCache,
      prefetchedPendingCache,
      setBulkOptimizationState: vi.fn((fn) => fn({ bk: { urlSerpResearchReady: {} } })),
      fetchBrief,
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  it("refetches SERP even when seo_research already exists", async () => {
    const fetchBrief = vi.fn().mockResolvedValue('{"ok":true}');

    const urls = ["https://example.com/a/", "https://example.com/b/"];
    const prefetchedAcfFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedAcfFieldsCache.set(0, { keyword_focus: "k0", seo_research: '{"brief":true}' });
    prefetchedAcfFieldsCache.set(1, { keyword_focus: "k1" });

    await fillMissingBulkSeoResearchFromSerp({
      urls,
      batchKey: "bk",
      isAcfKeywordMode: true,
      seoExtraTextFieldOnly: false,
      muteToasts: true,
      prefetchedAcfFieldsCache,
      prefetchedPendingCache: new Map(),
      setBulkOptimizationState: vi.fn((fn) => fn({ bk: { urlSerpResearchReady: {} } })),
      fetchBrief,
    });

    expect(fetchBrief).toHaveBeenCalledTimes(2);
  });
});

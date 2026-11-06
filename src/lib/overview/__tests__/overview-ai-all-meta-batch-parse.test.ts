import { describe, expect, it } from "vitest";
import {
  aiAllMetaBatchResultsToMap,
  parseAiAllMetaBatchJson,
} from "@/lib/overview/overview-ai-all-meta-batch-parse";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";

describe("parseAiAllMetaBatchJson", () => {
  it("parses results array with plain faqPairs", () => {
    const raw = JSON.stringify({
      results: [
        {
          url: "https://example.com/a",
          metaDescription: "Custom blinds in Manitoba for stylish windows and lasting comfort today.",
          title: "Blinds Shades Drapery Manitoba Home",
          faqPairs: [
            { question: "What styles?", answer: "We offer many." },
          ],
        },
      ],
    });
    const parsed = parseAiAllMetaBatchJson(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.faq).toBe("What styles?\nWe offer many.");
    expect(parsed[0]?.faq).not.toMatch(/^Q:/m);
  });

  it("ignores rows without meta", () => {
    const raw = JSON.stringify({
      results: [{ url: "https://a.com", metaDescription: "" }],
    });
    expect(parseAiAllMetaBatchJson(raw)).toHaveLength(0);
  });

  it("throws on empty content instead of returning an empty result", () => {
    expect(() => parseAiAllMetaBatchJson("")).toThrow(/no content/);
    expect(() => parseAiAllMetaBatchJson("   ")).toThrow(/no content/);
  });

  it("throws on non-JSON content", () => {
    expect(() => parseAiAllMetaBatchJson("the model wrote prose instead")).toThrow(/not valid JSON/);
  });

  it("throws when the JSON does not match the results schema", () => {
    expect(() => parseAiAllMetaBatchJson(JSON.stringify({ wrong: 1 }))).toThrow(/schema/);
    expect(() => parseAiAllMetaBatchJson(JSON.stringify({ results: "nope" }))).toThrow(/schema/);
  });
});

describe("aiAllMetaBatchResultsToMap", () => {
  it("maps by normalized url and respects includeTitle", () => {
    const catalogRow: AiAllMetaCatalogRow = {
      index: 0,
      url: "https://Example.COM/p",
      focusKeyword: "test kw",
      existingMeta: "old",
      existingTitle: "old title",
      seoResearchBrief: "{}",
      faqMode: "none",
      faqPairCount: 0,
      seedCount: 4,
      includeTitle: false,
    };
    const catalogByUrl = new Map([[normalizeOverviewKeywordUrlKey(catalogRow.url), catalogRow]]);
    const map = aiAllMetaBatchResultsToMap(
      [
        {
          url: "https://example.com/p",
          metaDescription: "A strong meta for test kw with enough characters to pass basic checks here.",
          title: "Should Not Apply",
        },
      ],
      catalogByUrl,
    );
    const patch = map.get(normalizeOverviewKeywordUrlKey("https://example.com/p"));
    expect(patch?.metaDescription).toBeTruthy();
    expect(patch?.title).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPlannedMetaHarnessSections,
  buildDoneMetaHarnessSections,
  metaHarnessGeneratedFiles,
  formatSeoResearchArtifact,
  resolveMetaHarnessSeoResearchBrief,
  metaHarnessPlannedSectionCount,
} from "@/lib/overview/overview-ai-all-meta-harness-sections";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import { formatPageApiPingArtifact } from "@/lib/overview/overview-ai-all-meta-page-ping";

const baseRow: AiAllMetaCatalogRow = {
  index: 0,
  url: "https://example.com/cellular-shades/",
  focusKeyword: "cellular shades",
  existingMeta: "(none)",
  existingTitle: "(none)",
  seoResearchBrief: '{"intent":"buy"}',
  faqMode: "seed",
  faqPairCount: 4,
  seedCount: 4,
  includeTitle: true,
};

describe("buildPlannedMetaHarnessSections", () => {
  it("prepends SEO research before meta outputs and FAQ pairs", () => {
    const planned = buildPlannedMetaHarnessSections(baseRow);
    expect(planned.map((s) => s.title)).toEqual([
      "SEO research",
      "Meta description",
      "Title",
      "FAQ 1",
      "FAQ 2",
      "FAQ 3",
      "FAQ 4",
    ]);
    expect(metaHarnessPlannedSectionCount(baseRow)).toBe(7);
  });

  it("omits FAQ pair sections when faqMode is none", () => {
    const row: AiAllMetaCatalogRow = { ...baseRow, faqMode: "none", faqPairCount: 0 };
    const planned = buildPlannedMetaHarnessSections(row);
    expect(planned.map((s) => s.title)).toEqual([
      "SEO research",
      "Meta description",
      "Title",
    ]);
  });
});

describe("metaHarnessGeneratedFiles", () => {
  it("includes prep artifacts and meta outputs without FAQ pair blobs", () => {
    const sections = buildDoneMetaHarnessSections(baseRow, {
      metaDescription: "Buy cellular shades today.",
      aiMeta: "Buy cellular shades today.",
      title: "Cellular Shades Winnipeg",
      aiTitle: "Cellular Shades Winnipeg",
    }, {
      pagePing: {
        ok: true,
        url: baseRow.url,
        postId: 42,
        endpoint: "Session inventory / grid row (no API)",
        title: "Cellular Shades",
        plainTextContent: "We sell shades.",
        charCount: 15,
        postFieldsSeoResearch: baseRow.seoResearchBrief,
      },
      seoResearchBrief: baseRow.seoResearchBrief,
    });

    const files = metaHarnessGeneratedFiles(sections, baseRow.url);
    const names = files.map((f) => f.name);
    expect(names.some((n) => n.includes("Page_API_ping"))).toBe(false);
    expect(names.some((n) => n.includes("SEO_research"))).toBe(true);
    expect(names.some((n) => n.includes("Meta_description"))).toBe(true);
    expect(names.some((n) => n.includes("FAQ"))).toBe(false);
    expect(formatSeoResearchArtifact("")).toContain("(none on row)");
    expect(resolveMetaHarnessSeoResearchBrief("", '{"intent":"buy"}')).toBe('{"intent":"buy"}');
    expect(formatPageApiPingArtifact({
      ok: false,
      url: baseRow.url,
      postId: null,
      endpoint: "POST /api/wordpress/get-post-content",
      title: "",
      plainTextContent: "",
      charCount: 0,
      error: "skip",
    })).toContain("```json");
  });
});

import { describe, expect, it } from "vitest";
import { buildMetaAdDeliverableFiles } from "@/lib/ppc/meta-ad-deliverable-files";
import {
  META_RESEARCH_SECTION_IDS,
  createMetaResearchSection,
} from "@/lib/ppc/meta-ad-research-sections";
import type { MetaAdRow } from "@/lib/ppc/meta-ads-types";

describe("meta-ad-deliverable-files", () => {
  it("returns at most six deliverable files", () => {
    const row: MetaAdRow = {
      id: "1",
      adName: "Edmonton SEO",
      focusKeyword: "AI SEO Edmonton",
      status: "ready",
      createdAt: "2026-08-11T00:00:00.000Z",
      copy: {
        primaryText: "Grow locally.",
        headline: "Edmonton SEO",
        description: "Local search",
        cta: "Learn More",
        finalUrl: "https://example.com",
      },
      imagePromptDescription: "# Image prompt",
      creative: {
        aspectRatio: "feed_1x1",
        imagePreviewUrl: "data:image/png;base64,abc",
      },
      researchSections: [
        createMetaResearchSection(META_RESEARCH_SECTION_IDS.contextResearch, "done", "# Context"),
        createMetaResearchSection(META_RESEARCH_SECTION_IDS.strategyBrief, "done", "# Strategy"),
        createMetaResearchSection(META_RESEARCH_SECTION_IDS.creativePlan, "done", "# Plan"),
        createMetaResearchSection(META_RESEARCH_SECTION_IDS.copyChecklist, "done", "# hidden checklist"),
      ],
    };

    const files = buildMetaAdDeliverableFiles(row, "edmonton-seo");
    expect(files.length).toBeLessThanOrEqual(6);
    expect(files.some((file) => file.name.includes("context-research"))).toBe(true);
    expect(files.some((file) => file.name.includes("strategy-brief"))).toBe(true);
    expect(files.some((file) => file.name.includes("ad-copy"))).toBe(true);
    expect(files.some((file) => file.name.includes("creative-plan"))).toBe(true);
    expect(files.some((file) => file.name.includes("image-prompt"))).toBe(true);
    expect(files.some((file) => file.name.includes("creative-image"))).toBe(true);
    expect(files.some((file) => file.name.includes("checklist"))).toBe(false);
  });
});

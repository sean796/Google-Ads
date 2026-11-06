import { describe, expect, it } from "vitest";
import {
  buildMetaInstagramLayoutAcceptanceBrief,
  buildMetaInstagramLayoutQuery,
  buildMetaInstagramNicheSubjectQuery,
  buildMetaInstagramReferencePromptSuffix,
  buildMetaInstagramReferenceTargets,
  buildMetaInstagramReferenceTargetsFromQueries,
  referenceSummaryHasRealWorldRole,
  summarizeMetaInstagramReferences,
} from "@/lib/ppc/meta-ad-agents/meta-ad-instagram-reference-agent";
import type { MetaAdCreativeBrief, MetaAdVisualReferenceElement } from "@/lib/ppc/meta-ads-types";
import { TYPOGRAPHY_PALETTE, withToolPalette } from "@/lib/ppc/__tests__/meta-ad-test-fixtures";

const sampleBrief: MetaAdCreativeBrief = withToolPalette(
  {
    strategyStatement: "Local SEO ad.",
    captionHook: "Search drives calls.",
    onImageHeadline: "Get Found Locally",
    onImageSubline: "",
    visualConcept: "Bold minimal feed graphic",
    visualVibe: "bold-minimal",
    backgroundTreatment: "Dark branded gradient",
    useMapOverlay: false,
    creativeStyle: "designed_graphic",
  },
  TYPOGRAPHY_PALETTE,
);

describe("run-meta-ad-instagram-reference", () => {
  it("builds layout query for designed feed ads", () => {
    const query = buildMetaInstagramLayoutQuery("feed_1x1");
    expect(query).toContain("instagram feed sponsored ad graphic design");
    expect(query).not.toContain("WordPress");
  });

  it("builds niche query with white background", () => {
    const query = buildMetaInstagramNicheSubjectQuery("window coverings Edmonton");
    expect(query).toContain("window coverings Edmonton");
    expect(query).toContain("white background");
    expect(query).toContain("no people");
  });

  it("builds lifestyle niche query when people allowed", () => {
    const query = buildMetaInstagramNicheSubjectQuery("window coverings Edmonton", true);
    expect(query).toContain("lifestyle photo white background professional");
    expect(query).not.toContain("no people");
  });

  it("uses layout and niche targets", () => {
    const targets = buildMetaInstagramReferenceTargets({
      placement: "feed_4x5",
      nicheSubjectLabel: "WordPress SEO",
    });
    expect(targets).toHaveLength(2);
    expect(targets[0]?.role).toBe("instagram ad layout");
    expect(targets[1]?.role).toBe("niche subject photo");
  });

  it("uses goal reference queries when provided", () => {
    const targets = buildMetaInstagramReferenceTargetsFromQueries({
      referenceQueries: [
        "instagram ad contact us minimal text",
        "digital presence branded graphic dark background",
      ],
      placement: "feed_1x1",
    });
    expect(targets).toHaveLength(2);
    expect(targets[0]?.query).toContain("contact us");
    expect(targets[1]?.query).toContain("digital presence");
  });

  it("acceptance brief rejects collages", () => {
    const brief = buildMetaInstagramLayoutAcceptanceBrief();
    expect(brief).toContain("collages");
    expect(brief).toContain("designed Instagram");
  });

  it("detects real-world reference roles", () => {
    expect(
      referenceSummaryHasRealWorldRole([
        { id: "1", role: "layout", source: "dataforseo", query: "layout" },
      ]),
    ).toBe(false);
    expect(
      referenceSummaryHasRealWorldRole([
        { id: "1", role: "prop", source: "dataforseo", query: "clipboard" },
      ]),
    ).toBe(true);
  });

  it("summarizes reference roles for UI", () => {
    const summaries = summarizeMetaInstagramReferences([
      {
        dataUrl: "data:image/png;base64,abc",
        imageUrl: "https://example.com/niche.jpg",
        query: "window coverings lifestyle photo professional",
        kind: "other",
        layer: "foreground",
        why: "Niche hero",
        visualDescription: "Living room with blinds",
        fitScore: 1,
        qualityScore: 1,
      },
    ]);
    expect(summaries[0]?.role).toBe("niche-subject");
  });

  it("uses visual reference elements for device roles and labeled prompt suffix", () => {
    const elements: MetaAdVisualReferenceElement[] = [
      {
        id: "1",
        label: "Instagram ad layout",
        kind: "layout",
        googleImageQuery: "instagram feed sponsored ad graphic design",
        acceptanceBrief: "Designed sponsored ad creative",
      },
      {
        id: "2",
        label: "Tablet on stand",
        kind: "device",
        googleImageQuery: "2026 iPad Pro on stand product photo",
        acceptanceBrief: "Current-model tablet on a stand",
      },
    ];
    const summaries = summarizeMetaInstagramReferences(
      [
        {
          dataUrl: "data:image/png;base64,layout",
          imageUrl: "https://example.com/layout.jpg",
          query: elements[0]!.googleImageQuery,
          role: elements[0]!.label,
          kind: "other",
          layer: "background",
          why: "Layout",
          visualDescription: "Minimal ad",
          fitScore: 1,
          qualityScore: 1,
        },
        {
          dataUrl: "data:image/png;base64,device",
          imageUrl: "https://example.com/device.jpg",
          query: elements[1]!.googleImageQuery,
          role: elements[1]!.label,
          kind: "other",
          layer: "foreground",
          why: "Device",
          visualDescription: "Tablet on stand",
          fitScore: 1,
          qualityScore: 1,
        },
      ],
      elements,
    );
    expect(summaries[0]?.role).toBe("layout");
    expect(summaries[1]?.role).toBe("device");
    expect(summaries[1]?.elementLabel).toBe("Tablet on stand");

    const suffix = buildMetaInstagramReferencePromptSuffix(
      [
        {
          dataUrl: "data:image/png;base64,device",
          imageUrl: "https://example.com/device.jpg",
          query: elements[1]!.googleImageQuery,
          role: elements[1]!.label,
          kind: "other",
          layer: "foreground",
          why: "Device",
          visualDescription: "Tablet on stand",
          fitScore: 1,
          qualityScore: 1,
        },
      ],
      elements,
      sampleBrief,
    );
    expect(suffix).toContain("Tablet on stand ref");
    expect(suffix).toContain("bold-minimal");
    expect(suffix).toContain("placeholder blocks only, no readable text");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildMetaAdsBulkGeneratorDetailsProps,
  metaAdRowToCsvRow,
  metaAdsDetailsCanOpen,
} from "@/lib/ppc/meta-ads-bulk-generator-bindings";
import { createDefaultMetaGenerateConfig } from "@/lib/ppc/meta-ads-field-limits";
import type { MetaAdRow } from "@/lib/ppc/meta-ads-types";

const sampleRow: MetaAdRow = {
  id: "meta-1",
  adName: "Edmonton SEO",
  focusKeyword: "AI SEO Edmonton",
  landingPageUrl: "https://example.com/edmonton-seo",
  status: "generating",
  createdAt: "2026-08-11T00:00:00.000Z",
  researchSections: [
    {
      id: "creative-brief",
      title: "Creative brief",
      status: "done",
      markdown: "# Creative brief\n\nHeadline: Get Found Locally",
    },
  ],
};

describe("meta-ads-bulk-generator-bindings", () => {
  it("maps meta rows to csv rows for the universal details drawer", () => {
    const csvRow = metaAdRowToCsvRow(sampleRow);
    expect(csvRow.keyword).toBe("AI SEO Edmonton");
    expect(csvRow.title).toBe("Edmonton SEO");
    expect(csvRow.destination_url).toBe("https://example.com/edmonton-seo");
  });

  it("builds BulkGeneratorDetailsPanelProps with generated files", () => {
    const props = buildMetaAdsBulkGeneratorDetailsProps({
      ads: [sampleRow],
      generateConfig: {
        ...createDefaultMetaGenerateConfig(),
        adCount: 1,
        placement: "feed_1x1",
        includeImage: true,
      },
      generateProgress: {
        steps: [
          { id: "read-master-rules", label: "Reading master rules", status: "done" },
          { id: "strategy", label: "Strategy brief", status: "done" },
          { id: "copy", label: "Ad copy", status: "running" },
        ],
        activeStepId: "copy",
        completed: 2,
        total: 6,
        label: "Ad copy",
      },
      isGenerating: true,
      workspaceBusy: true,
    });
    expect(props.variant).toBe("csv");
    expect(props.displayRows).toHaveLength(1);
    expect((props.filesByRow?.get(0)?.length ?? 0)).toBeLessThanOrEqual(6);
    expect(props.prepAccordionTitle).toBe("Context prep");
    expect(props.batchPrepHarnessSections?.some((section) => section.title.includes("master rules"))).toBe(
      true,
    );
  });

  it("opens details while generating or when research exists", () => {
    expect(
      metaAdsDetailsCanOpen({
        ads: [sampleRow],
        generateProgress: null,
        isGenerating: true,
      }),
    ).toBe(true);
  });
});

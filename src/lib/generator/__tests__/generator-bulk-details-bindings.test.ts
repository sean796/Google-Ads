import { describe, expect, it } from "vitest";
import { buildCompetitorBulkGeneratorDetailsProps } from "@/lib/competitor-research/competitor-bulk-details-bindings";
import { buildFlowBulkGeneratorDetailsProps } from "@/lib/generator/flow/flow-bulk-details-bindings";
import { buildImageBulkGeneratorDetailsProps } from "@/lib/generator/image/image-bulk-details-bindings";
import { buildPressReleaseBulkGeneratorDetailsProps } from "@/lib/press-release/press-release-bulk-details-bindings";

describe("buildPressReleaseBulkGeneratorDetailsProps", () => {
  it("maps single PR row with per-row harness and inventory links", () => {
    const props = buildPressReleaseBulkGeneratorDetailsProps({
      isProcessing: true,
      runPhase: "Drafting",
      keyword: "widget launch",
      title: "Acme launches widget",
      wordPressSite: null,
      harnessSections: [{ sectionIndex: 0, title: "Research", status: "generating" }],
      harnessPlannedSectionCount: 3,
      inventoryJsonLink: {
        href: "blob:pr",
        filename: "posts.json",
        rowCount: 12,
      },
    });

    expect(props.displayRows).toHaveLength(1);
    expect(props.harnessSections).toEqual([]);
    expect(props.harnessByRow?.get(0)?.[0]?.title).toBe("Research");
    expect(props.sitemapInventoryLinks).toHaveLength(1);
    expect(props.currentRow).toBe(0);
  });
});

describe("buildCompetitorBulkGeneratorDetailsProps", () => {
  it("maps competitor rows to harnessByRow without global batch summary", () => {
    const props = buildCompetitorBulkGeneratorDetailsProps({
      workspaceBusy: true,
      keyword: "plumber edmonton",
      displayRows: [
        { keyword: "competitor-a", title: "Comp A", destination_url: "https://a.test" },
        { keyword: "competitor-b", title: "Comp B", destination_url: "https://b.test" },
      ],
      progress: {
        currentMessage: "Generating",
        stepLog: [],
        harnessGroups: [
          {
            competitorKey: "comp-a",
            competitorName: "Comp A",
            domain: "a.test",
            status: "generating",
            steps: [
              { id: "BuildComparison", label: "Compare", status: "generating" },
              { id: "WriteCsvRow", label: "Draft", status: "waiting" },
            ],
          },
          {
            competitorKey: "comp-b",
            competitorName: "Comp B",
            domain: "b.test",
            status: "waiting",
            steps: [
              { id: "BuildComparison", label: "Compare", status: "waiting" },
              { id: "WriteCsvRow", label: "Draft", status: "waiting" },
            ],
          },
        ],
      },
    });

    expect(props.displayRows).toHaveLength(2);
    expect(props.harnessSections).toEqual([]);
    expect(props.harnessByRow?.get(0)?.[0]?.status).toBe("generating");
    expect(props.harnessByRow?.get(1)?.[0]?.status).toBe("waiting");
    expect(props.entitySapRowDisplay).toBe(true);
    expect(props.currentRow).toBe(0);
  });
});

describe("buildImageBulkGeneratorDetailsProps", () => {
  it("uses single pseudo-row pipeline sections", () => {
    const props = buildImageBulkGeneratorDetailsProps({
      workspaceBusy: false,
      isGenerating: true,
      isGeneratingChecklist: false,
      hasGeneratedChecklist: true,
      referenceResearch: null,
      imageDisplayUrl: null,
      userPrompt: "Hero banner",
      imageSourceMode: "solo",
      error: null,
    });

    expect(props.displayRows).toHaveLength(1);
    expect(props.harnessByRow?.get(0)).toHaveLength(3);
    expect(props.harnessSections).toEqual([]);
    expect(props.harnessByRow?.get(0)?.[1]?.status).toBe("generating");
  });
});

describe("buildFlowBulkGeneratorDetailsProps", () => {
  it("maps flow sections to display rows with prep harness", () => {
    const props = buildFlowBulkGeneratorDetailsProps({
      workspaceBusy: false,
      flowTitle: "Q4 report",
      sections: [
        { id: "s1", h2Title: "Intro", ragQuery: "intro", writerPrompt: "Write intro" },
        { id: "s2", h2Title: "Findings", ragQuery: "findings", writerPrompt: "Write findings" },
      ],
      generationResult: {
        plan: "",
        draft: "",
        final: "",
        currentStage: "planning",
        isGenerating: true,
      },
      isGenerating: true,
    });

    expect(props.displayRows).toHaveLength(2);
    expect(props.harnessSections).toEqual([]);
    expect(props.batchPrepHarnessSections?.length).toBe(2);
    expect(props.harnessByRow?.size).toBe(2);
  });
});

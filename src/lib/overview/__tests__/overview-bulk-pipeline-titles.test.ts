import { describe, expect, it } from "vitest";
import {
  isBlueprintGeneratedFileName,
  isBlueprintPipelineVisible,
  isResearchBatchState,
  isResearchBulkRowPipeline,
  resolveBulkRowPipelineTitles,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  buildContentOptimizePipelineTitles,
  buildPredeterminedBlogBodyHarnessTitles,
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  RESEARCH_HARNESS_PIPELINE_TITLES,
} from "@/lib/overview/overview-research-harness-sections";

const INIT_OPTIMIZE_PIPELINE_WITH_BODY = buildContentOptimizePipelineTitles(
  buildPredeterminedBlogBodyHarnessTitles(""),
);

describe("isBlueprintGeneratedFileName", () => {
  it("matches blueprint artifacts only", () => {
    expect(isBlueprintGeneratedFileName("blueprint-solar.json")).toBe(true);
    expect(isBlueprintGeneratedFileName("serp-research-brief-solar.json")).toBe(false);
  });
});

describe("isResearchBatchState", () => {
  it("detects research from runKind", () => {
    expect(isResearchBatchState({ runKind: "research" })).toBe(true);
  });

  it("detects research from Researching step message", () => {
    expect(
      isResearchBatchState({
        currentStep: "Researching…",
        currentStepProgress: { message: "Researching 3 page(s)…" },
      }),
    ).toBe(true);
  });

  it("detects research when planned count is 8 and harness has research titles", () => {
    const url = "https://example.com/a";
    expect(
      isResearchBatchState({
        currentStepProgress: {
          harnessPlannedSectionCount: 8,
          message: "Researching 1 page(s)…",
        },
        urlHarnessSections: {
          [url]: [{ sectionIndex: 0, title: "DataForSEO SERP", status: "waiting" }],
        },
      }),
    ).toBe(true);
  });

  it("does not detect research for idle content prep", () => {
    expect(
      isResearchBatchState({
        runKind: "content",
        currentStepProgress: { message: "Initializing batch…" },
        urlHarnessSections: {
          "https://example.com/a": [
            { sectionIndex: 0, title: "SERP research brief", status: "waiting" },
          ],
        },
      }),
    ).toBe(false);
  });
});

describe("resolveBulkRowPipelineTitles aiFaq", () => {
  it("does not expose per-pair FAQ harness rows in generated files", () => {
    expect(
      resolveBulkRowPipelineTitles(
        "aiFaq",
        [
          { sectionIndex: 0, title: "FAQ 1", status: "done" },
          { sectionIndex: 1, title: "FAQ 2", status: "waiting" },
        ],
        [{ name: "wordpress.json" }],
      ),
    ).toEqual([]);
  });
});

describe("resolveBulkRowPipelineTitles", () => {
  const staleContentPrepHarness = [
    { sectionIndex: 0, title: "SERP research brief", status: "waiting" as const },
      { sectionIndex: 1, title: "Blueprint", status: "waiting" as const },
  ];

  it("detects research pipeline from batch titles when runKind is missing", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, [], [], [...RESEARCH_HARNESS_PIPELINE_TITLES]),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
    expect(
      isResearchBulkRowPipeline(undefined, [], [...RESEARCH_HARNESS_PIPELINE_TITLES]),
    ).toBe(true);
  });

  it("detects research pipeline from row harness titles", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, [
        { sectionIndex: 0, title: "DataForSEO SERP", status: "generating" },
      ], []),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("research runKind returns 8 harness pipeline titles", () => {
    expect(
      resolveBulkRowPipelineTitles("research", staleContentPrepHarness, []),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("research ignores batch content-prep pipeline titles", () => {
    expect(
      resolveBulkRowPipelineTitles(
        "research",
        staleContentPrepHarness,
        [],
        [...CONTENT_OPTIMIZE_PIPELINE_TITLES],
      ),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("never returns 1-row brief when research batch signals are present without runKind", () => {
    const bulkState = {
      currentStep: "Researching…",
      currentStepProgress: {
        harnessPlannedSectionCount: 8,
        message: "Researching 2 page(s)…",
      },
      urlHarnessSections: {
        "https://example.com/a": [
          { sectionIndex: 0, title: "DataForSEO SERP", status: "generating" },
        ],
      },
    };
    expect(
      resolveBulkRowPipelineTitles(
        undefined,
        [{ sectionIndex: 0, title: "SERP research brief", status: "waiting" }],
        [],
        undefined,
        bulkState,
      ),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("content run before blueprint shows all optimize artifact slots", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, staleContentPrepHarness, []),
    ).toEqual([...INIT_OPTIMIZE_PIPELINE_WITH_BODY]);
  });

  it("research artifact files keep the 8-step harness after completion", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, undefined, [
        { name: "research-llm-audit-solar.json" },
      ]),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("Play brief plus blueprint uses content steps, not Overview research", () => {
    expect(
      resolveBulkRowPipelineTitles("content", undefined, [
        { name: "serp-research-brief-hunter-douglas-vs-alta.json" },
        { name: "blueprint-hunter-douglas-vs-alta.json" },
        { name: "content-hunter-douglas-vs-alta.md" },
        { name: "featured-image-hunter-douglas-vs-alta.jpg" },
      ]),
    ).toEqual([...INIT_OPTIMIZE_PIPELINE_WITH_BODY]);
    expect(
      isResearchBulkRowPipeline("content", undefined, undefined, undefined),
    ).toBe(false);
  });

  it("Play serp-research-brief alone still shows full optimize pipeline slots", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, undefined, [
        { name: "serp-research-brief-hunter-douglas-vs-alta.json" },
      ]),
    ).toEqual([...INIT_OPTIMIZE_PIPELINE_WITH_BODY]);
  });

  it("expands pipeline titles when harness includes body sections", () => {
    const harness = [
      { sectionIndex: 0, title: "SERP research brief", status: "done" as const },
      { sectionIndex: 1, title: "Checklist", status: "done" as const },
      { sectionIndex: 2, title: "Blueprint", status: "generating" as const },
      { sectionIndex: 3, title: "Answer", status: "waiting" as const },
      { sectionIndex: 4, title: "Overview", status: "waiting" as const },
      { sectionIndex: 5, title: "Post content", status: "waiting" as const },
      { sectionIndex: 6, title: "Content Markdown", status: "waiting" as const },
    ];
    expect(resolveBulkRowPipelineTitles(undefined, harness, [])).toEqual([
      "Checklist",
      "Blueprint",
      "Link targets",
      "Answer",
      "Overview",
      "Post content",
      "Content Markdown",
      "Implementation report",
      "WordPress upload",
    ]);
  });

  it("content run shows blueprint when a blueprint file exists", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, staleContentPrepHarness, [
        { name: "blueprint-solar.json" },
      ]),
    ).toEqual([...INIT_OPTIMIZE_PIPELINE_WITH_BODY]);
  });

  it("passes through batch titles for non-content run kinds", () => {
    expect(
      resolveBulkRowPipelineTitles("aiHeaders", [], [], ["AI headers"]),
    ).toEqual(["AI headers"]);
  });

  it("aiAnswer ignores stale research artifact files on the row", () => {
    expect(
      resolveBulkRowPipelineTitles(
        "aiAnswer",
        [{ sectionIndex: 0, title: "DataForSEO SERP", status: "done" }],
        [{ name: "research-llm-audit-solar.json" }],
        ["Answer"],
      ),
    ).toEqual(["Answer"]);
  });

  it("aiAnswer without batch titles still returns Answer only", () => {
    expect(
      resolveBulkRowPipelineTitles("aiAnswer", undefined, [
        { name: "research-llm-audit-solar.json" },
      ]),
    ).toEqual(["Answer"]);
  });

  it("uses provided curate step titles instead of SERP research brief", () => {
    expect(
      resolveBulkRowPipelineTitles(undefined, [
        { sectionIndex: 0, title: "GSC post top 10: Lindsey Blinds", status: "active" },
        { sectionIndex: 1, title: "Site inventory: Lindsey Blinds", status: "waiting" },
      ], [], [
        "GSC post top 10: Lindsey Blinds",
        "Site inventory: Lindsey Blinds",
      ]),
    ).toEqual([
      "GSC post top 10: Lindsey Blinds",
      "Site inventory: Lindsey Blinds",
    ]);
  });
});

describe("isBlueprintPipelineVisible", () => {
  it("is false when blueprint section is waiting and no files", () => {
    expect(
      isBlueprintPipelineVisible(
        [{ sectionIndex: 1, title: "Blueprint", status: "waiting" }],
        [],
      ),
    ).toBe(false);
  });

  it("is true when blueprint section is generating", () => {
    expect(
      isBlueprintPipelineVisible(
        [{ sectionIndex: 1, title: "Blueprint", status: "generating" }],
        [],
      ),
    ).toBe(true);
  });
});

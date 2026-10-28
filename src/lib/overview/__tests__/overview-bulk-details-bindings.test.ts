import { describe, expect, it } from "vitest";
import {
  buildOverviewBulkGeneratorDetailsProps,
  buildOverviewMicroActionDetailsProps,
  buildOverviewWarmInventoryDetailsProps,
  isOverviewBulkDetailsRun,
  resolveOverviewBulkPipelineTitles,
} from "@/lib/overview/overview-bulk-details-bindings";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  RESEARCH_HARNESS_PIPELINE_TITLES,
  RESEARCH_HARNESS_SECTION_TITLES,
} from "@/lib/overview/overview-research-harness-sections";
import { HEADERS_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-headers-harness-sections";
import { CONTENT_OPTIMIZE_PIPELINE_TITLES, buildContentOptimizePipelineTitles, buildPredeterminedBlogBodyHarnessTitles } from "@/lib/overview/overview-content-optimize-pipeline";
import { FEATURED_IMAGE_PIPELINE_TITLES } from "@/components/overview/overview-tab-constants";

const INIT_OPTIMIZE_PIPELINE_TITLES = buildContentOptimizePipelineTitles(
  buildPredeterminedBlogBodyHarnessTitles(""),
);
import { overviewBulkScopeUrlKeysFromRows } from "@/lib/overview/overview-bulk-row-scope";
import { initBulkSliceBatchHarness } from "@/lib/overview/overview-batch-pipeline-progress";

const baseBulkState = (): BulkOptimizationState => ({
  urls: ["https://example.com/a"],
  currentIndex: 0,
  urlStatuses: { "https://example.com/a": "optimizing" },
  currentStep: "Headers",
  runKind: "aiHeaders",
});

function makeOverviewRow(url: string, status: OverviewRow["status"] = "idle"): OverviewRow {
  return {
    url,
    title: `Title for ${url}`,
    metaDescription: "",
    aiTitle: "",
    aiMeta: "",
    status,
  };
}

describe("isOverviewBulkDetailsRun", () => {
  it("returns true for any batch with urls", () => {
    expect(isOverviewBulkDetailsRun(baseBulkState())).toBe(true);
  });

  it("returns false without urls", () => {
    expect(isOverviewBulkDetailsRun({ ...baseBulkState(), urls: [] })).toBe(false);
  });
});

describe("resolveOverviewBulkPipelineTitles", () => {
  it("maps research run kind to 7 harness steps", () => {
    expect(resolveOverviewBulkPipelineTitles("research")).toEqual([
      ...RESEARCH_HARNESS_PIPELINE_TITLES,
    ]);
  });

  it("maps headers run kind", () => {
    expect(resolveOverviewBulkPipelineTitles("aiHeaders")).toEqual([
      ...HEADERS_HARNESS_SECTION_TITLES,
    ]);
  });

  it("maps featured image run kind to Image requirements, Google Image, OpenRouter Image, WordPress upload", () => {
    expect(resolveOverviewBulkPipelineTitles("aiFeaturedImage")).toEqual([
      ...FEATURED_IMAGE_PIPELINE_TITLES,
    ]);
  });

  it("returns 7 research titles when runKind is missing but batch has research signals", () => {
    const url = "https://example.com/page";
    expect(
      resolveOverviewBulkPipelineTitles(undefined, {
        urls: [url],
        currentIndex: 0,
        urlStatuses: { [url]: "optimizing" },
        currentStep: "Researching…",
        currentStepProgress: {
          harnessPlannedSectionCount: 7,
          message: "Researching 1 page(s)…",
        },
        urlHarnessSections: {
          [url]: RESEARCH_HARNESS_SECTION_TITLES.map((title, sectionIndex) => ({
            sectionIndex,
            title,
            status: "waiting" as const,
          })),
        },
      }),
    ).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("returns content optimize titles when grid rows are research-faq without runKind", () => {
    const url = "https://example.com/a";
    expect(
      resolveOverviewBulkPipelineTitles(
        undefined,
        {
          urls: [url],
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "prepInventory",
          currentStepProgress: { message: "Initializing batch…" },
        },
        [
          {
            url,
            title: "Solar",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "research-faq",
          },
        ],
      ),
    ).toEqual([...INIT_OPTIMIZE_PIPELINE_TITLES]);
  });
});

describe("buildOverviewBulkGeneratorDetailsProps", () => {
  it("includes sitemap inventory props", () => {
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: baseBulkState(),
        overviewRows: [],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
        sitemapInventoryLinks: [
          { label: "Pages", href: "blob:1", filename: "pages.json", rowCount: 1, source: "pages" },
        ],
        siteKwHostedLink: null,
        sitemapInventoryLoading: false,
        sitemapSource: "sap",
      },
      true,
    );
    expect(props?.sitemapInventoryLinks).toHaveLength(1);
    expect(props?.entitySapRowDisplay).toBe(true);
    expect(props?.pipelineSectionTitles).toEqual([...HEADERS_HARNESS_SECTION_TITLES]);
    expect(props?.batchPrepHarnessSections).toEqual([]);
  });

  it("keeps isProcessing true for in-flight research when optimizing flags drop", () => {
    const url = "https://example.com/page";
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Researching…",
          runKind: "research",
        },
        overviewRows: [makeOverviewRow(url, "research-faq")],
        isOptimizingContent: {},
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props?.isProcessing).toBe(true);
  });

  it("keeps content optimize drawer when bulk state has content prep harness and research-faq rows", () => {
    const url = "https://ridgelinesolar.ca/solar-panel-efficiency/";
    const contentPrepHarness = [
      { sectionIndex: 0, title: "SERP research brief", status: "waiting" as const },
      { sectionIndex: 1, title: "Checklist", status: "waiting" as const },
      { sectionIndex: 2, title: "Blueprint", status: "waiting" as const },
    ];
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "pending" },
          currentStep: "prepInventory",
          urlHarnessSections: { [url]: contentPrepHarness },
          batchPrepHarnessSections: [
            { sectionIndex: 0, title: "Posts sitemap", status: "waiting" as const },
          ],
          currentStepProgress: {
            step: "prepInventory",
            progress: 0,
            message: "Initializing batch…",
            harnessPlannedSectionCount: 2,
          },
        },
        overviewRows: [
          {
            url,
            title: "Solar Panel Efficiency: What It Means",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "research-faq",
            focusKeyword: "solar panel efficiency",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
        bulkActionProgress: {
          research: { total: 25, completed: 0, statusMessage: "Researching 25 page(s)…" },
        },
        sitemapInventoryLinks: [
          { label: "Pages", href: "blob:1", filename: "pages.txt", rowCount: 16, source: "pages" },
        ],
      },
      true,
    );
    expect(props?.runKind).not.toBe("research");
    expect(props?.pipelineSectionTitles?.length).toBe(INIT_OPTIMIZE_PIPELINE_TITLES.length);
    expect(props?.harnessByRow?.get(0)).toHaveLength(INIT_OPTIMIZE_PIPELINE_TITLES.length);
    expect(props?.harnessByRow?.get(0)?.[0]?.title).toBe("Checklist");
    expect(props?.harnessByRow?.get(0)?.[1]?.title).toBe("Blueprint");
    expect(props?.researchRowIndices?.has(0)).toBe(true);
  });

  it("does not attach a cached brief while research is still running", () => {
    const url = "https://example.com/solar-panel-efficiency";
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Researching…",
          runKind: "research",
        },
        overviewRows: [
          {
            ...makeOverviewRow(url, "research-faq"),
            seoResearch: '{"version":1,"focusKeyword":"solar panel efficiency"}',
            focusKeyword: "solar panel efficiency",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props?.pipelineSectionTitles).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
    expect(props?.runKind).toBe("research");
    expect(props?.filesByRow?.get(0) ?? []).toEqual([]);
  });

  it("prefers research harness over active micro slice routing", () => {
    const url = "https://example.com/page";
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Researching…",
          runKind: "research",
        },
        overviewRows: [makeOverviewRow(url, "research-faq")],
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkActionProgress: {
          research: { total: 5, completed: 1 },
        },
      },
      true,
    );
    expect(props?.runKind).toBe("research");
    expect(props?.pipelineSectionTitles).toEqual([...RESEARCH_HARNESS_PIPELINE_TITLES]);
  });

  it("shows 7-step harness for research runs without collapsing", () => {
    const url = "https://example.com/page";
    const harnessSections = RESEARCH_HARNESS_SECTION_TITLES.map((title, sectionIndex) => ({
      sectionIndex,
      title,
      status: sectionIndex === 0 ? ("generating" as const) : ("waiting" as const),
    }));
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Researching…",
          runKind: "research",
          urlHarnessSections: { [url]: harnessSections },
        },
        overviewRows: [makeOverviewRow(url, "research-faq")],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    const rowHarness = props?.harnessByRow?.get(0) ?? [];
    expect(rowHarness).toHaveLength(7);
    expect(rowHarness[0]?.title).toBe("DataForSEO SERP");
  });

  it("exposes persisted harness on completed research rows and the active row", () => {
    const urlA = "https://example.com/a";
    const urlB = "https://example.com/b";
    const urlC = "https://example.com/c";
    const doneSections = RESEARCH_HARNESS_SECTION_TITLES.map((title, sectionIndex) => ({
      sectionIndex,
      title,
      status: "done" as const,
    }));
    const activeSections = RESEARCH_HARNESS_SECTION_TITLES.map((title, sectionIndex) => ({
      sectionIndex,
      title,
      status: sectionIndex === 0 ? ("generating" as const) : ("waiting" as const),
    }));
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [urlA, urlB, urlC],
          currentIndex: 1,
          currentUrl: urlB,
          urlStatuses: {
            [urlA]: "completed",
            [urlB]: "optimizing",
            [urlC]: "pending",
          },
          currentStep: "Researching…",
          runKind: "research",
          urlHarnessSections: { [urlA]: doneSections, [urlB]: activeSections },
        },
        overviewRows: [
          makeOverviewRow(urlA, "research-faq"),
          makeOverviewRow(urlB, "research-faq"),
          makeOverviewRow(urlC, "research-faq"),
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props?.harnessByRow?.get(0)).toHaveLength(7);
    expect(props?.harnessByRow?.get(0)?.every((section) => section.status === "done")).toBe(true);
    expect(props?.harnessByRow?.get(1)).toHaveLength(7);
    expect(props?.harnessByRow?.get(2)).toHaveLength(7);
    expect(props?.harnessByRow?.get(2)?.every((section) => section.status === "waiting")).toBe(true);
  });

  it("seeds 7 waiting harness rows when research batch has stale content-prep harness", () => {
    const url = "https://example.com/page";
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Researching…",
          runKind: "research",
          urlHarnessSections: {
            [url]: [
              { sectionIndex: 0, title: "SERP research brief", status: "waiting" },
              { sectionIndex: 1, title: "Checklist", status: "waiting" },
              { sectionIndex: 2, title: "Blueprint", status: "waiting" },
            ],
          },
        },
        overviewRows: [makeOverviewRow(url, "research-faq")],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    const rowHarness = props?.harnessByRow?.get(0) ?? [];
    expect(rowHarness).toHaveLength(7);
    expect(rowHarness.map((section) => section.title)).toEqual([...RESEARCH_HARNESS_SECTION_TITLES]);
    expect(props?.pipelineSectionTitles).toHaveLength(7);
  });
});

describe("buildOverviewMicroActionDetailsProps", () => {
  it("builds per-row harness for aiMeta on scoped rows", () => {
    const overviewRows = Array.from({ length: 85 }, (_, i) =>
      makeOverviewRow(`https://example.com/page-${i}`, i === 3 ? "ai-meta" : "idle"),
    );
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const slice = initBulkSliceBatchHarness(
      { total: 85, completed: 12 },
      85,
      "AI meta",
    );

    const props = buildOverviewMicroActionDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
        sitemapSource: "pages",
      },
      "aiMeta",
      slice,
    );

    expect(props.displayRows).toHaveLength(85);
    expect(props.harnessByRow?.size).toBe(85);
    expect(props.harnessSections).toEqual([]);
    expect(props.pipelineSectionTitles).toEqual(["AI meta"]);

    const generatingRow = props.harnessByRow?.get(3)?.[0];
    expect(generatingRow?.title).toBe("AI meta");
    expect(generatingRow?.status).toBe("generating");

    const waitingRow = props.harnessByRow?.get(0)?.[0];
    expect(waitingRow?.status).toBe("waiting");

    expect(props.currentRow).toBe(3);
  });

  it("does not put batch summary labels in drawer harnessSections", () => {
    const overviewRows = [makeOverviewRow("https://example.com/a", "ai-title")];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const slice = initBulkSliceBatchHarness({ total: 1, completed: 0 }, 1, "AI titles");

    const props = buildOverviewMicroActionDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
      },
      "aiTitle",
      slice,
    );

    expect(props.harnessSections).toEqual([]);
    expect(props.pipelineSectionTitles).toEqual(["AI titles"]);
    expect(slice.pipelineSteps?.[0]?.label).toContain("rows");
    expect(props.harnessByRow?.get(0)?.[0]?.title).toBe("AI titles");
  });

  it("shows wordpress.json from bulk state during aiTitle micro runs", () => {
    const url = "https://example.com/a";
    const overviewRows = [makeOverviewRow(url, "ai-title")];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const slice = initBulkSliceBatchHarness({ total: 1, completed: 0 }, 1, "AI titles");

    const props = buildOverviewMicroActionDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [],
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "",
          runKind: "wpUpload",
          urlGeneratedFiles: {
            [url]: [
              {
                name: "wordpress.json",
                content: '{"ok":true}',
                mimeType: "application/json",
              },
            ],
          },
        },
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
      },
      "aiTitle",
      slice,
    );

    expect(props.runKind).toBe("wpUpload");
    expect(props.filesByRow?.get(0)?.some((file) => file.fileName === "wordpress.json")).toBe(true);
    expect(props.pipelineSectionTitles).toEqual([]);
  });

  it("shows Image requirements, Google Image, OpenRouter Image, and WordPress upload for featured image", () => {
    const url = "https://example.com/a";
    const overviewRows = [makeOverviewRow(url)];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const slice = { total: 1, completed: 0, statusMessage: "Google Image" };

    const props = buildOverviewMicroActionDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "Featured image",
          runKind: "aiFeaturedImage",
          urlGeneratedFiles: {},
        },
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
      },
      "aiFeaturedImage",
      slice,
    );

    expect(props.pipelineSectionTitles).toEqual([...FEATURED_IMAGE_PIPELINE_TITLES]);
    expect(props.pipelineSectionTitles).not.toContain("Content");
    expect(props.harnessByRow?.get(0)?.map((section) => section.title)).toEqual([
      ...FEATURED_IMAGE_PIPELINE_TITLES,
    ]);
    expect(props.status).toBe("Google Image");
  });

  it("keeps featured image titles after wordpress.json exists", () => {
    const url = "https://example.com/a";
    const overviewRows = [makeOverviewRow(url)];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          urlStatuses: { [url]: "completed" },
          currentStep: "Featured image",
          runKind: "aiFeaturedImage",
          urlGeneratedFiles: {
            [url]: [
              { name: "google-image.png", content: "data:image/png;base64,aa", mimeType: "image/png" },
              { name: "openrouter-image.png", content: "data:image/png;base64,bb", mimeType: "image/png" },
              {
                name: "wordpress.json",
                content: JSON.stringify({ url: "https://cdn.example.com/maps.png", mediaId: 9 }),
                mimeType: "application/json",
              },
            ],
          },
        },
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
        bulkActionProgress: {
          optimizeAll: { total: 1, completed: 0, statusMessage: "Content" },
          aiFeaturedImage: { total: 1, completed: 1, statusMessage: "Featured image" },
        },
      },
      false,
    );

    expect(props?.pipelineSectionTitles).toEqual([...FEATURED_IMAGE_PIPELINE_TITLES]);
    expect(props?.pipelineSectionTitles).not.toContain("Content");
    expect(props?.filesByRow?.get(0)?.map((file) => file.fileName)).toEqual([
      "google-image.png",
      "openrouter-image.png",
      "wordpress.json",
    ]);
  });

  it("shows blog writing steps when Content is running, not a single Content dump", () => {
    const url = "https://example.com/2026-cra-mail-policy";
    const overviewRows = [makeOverviewRow(url, "optimizing")];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "Keyword research",
          urlGeneratedFiles: {
            [url]: [
              { name: "keyword-research-2026-cra-mail-policy.json", content: "{}", mimeType: "application/json" },
              { name: "selected-keyword-2026-cra-mail-policy.json", content: "{}", mimeType: "application/json" },
              { name: "serp-research-brief-2026-cra-mail-policy.json", content: "{}", mimeType: "application/json" },
              { name: "checklist-2026-cra-mail-policy.txt", content: "x", mimeType: "text/plain" },
            ],
          },
        },
        overviewRows,
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
        bulkActionProgress: {
          optimizeAll: { total: 1, completed: 0, statusMessage: "Content" },
        },
      },
      true,
    );

    expect(props?.pipelineSectionTitles?.[0]).toBe("Checklist");
    expect(props?.pipelineSectionTitles).toEqual(expect.arrayContaining([
      "Checklist",
      "Blueprint",
      "Link targets",
      "Post content",
    ]));
    expect(props?.pipelineSectionTitles).not.toEqual(["Content"]);
    expect(props?.harnessByRow?.get(0)?.map((section) => section.title)).toEqual(
      expect.arrayContaining(["Checklist", "Blueprint", "Link targets"]),
    );
    expect(props?.harnessByRow?.get(0)?.some((section) => section.title.startsWith("keyword-research-"))).toBe(false);
  });

  it("routes active micro slice through buildOverviewBulkGeneratorDetailsProps", () => {
    const overviewRows = [makeOverviewRow("https://example.com/a", "ai-meta")];
    const scopeKeys = overviewBulkScopeUrlKeysFromRows(overviewRows);

    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: { urls: [], currentIndex: 0, urlStatuses: {}, currentStep: "" },
        overviewRows,
        isOptimizingContent: {},
        optimizationFileManagers: {},
        bulkScopeUrlKeys: scopeKeys,
        bulkActionProgress: {
          aiMeta: { total: 1, completed: 0 },
        },
      },
      true,
    );

    expect(props?.displayRows).toHaveLength(1);
    expect(props?.harnessByRow?.size).toBe(1);
    expect(props?.harnessSections).toEqual([]);
  });
});

describe("details rows follow the live grid after refresh", () => {
  it("uses refreshed overview order when the completed batch list is stale", () => {
    const staleFirst = "https://example.com/how-tariffs";
    const freshFirst = "https://example.com/cra-mail-in-policy";
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [staleFirst],
          currentIndex: 0,
          urlStatuses: { [staleFirst]: "completed" },
          currentStep: "Batch complete",
          runKind: "research",
        },
        overviewRows: [makeOverviewRow(freshFirst), makeOverviewRow(staleFirst)],
        gridPageIndex: 0,
        isOptimizingContent: {},
        optimizationFileManagers: {},
      },
      false,
    );

    expect(props?.displayRows[0]?.destination_url).toBe(freshFirst);
    expect(props?.displayRows[1]?.destination_url).toBe(staleFirst);
    expect(props?.totalRows).toBe(2);
  });

  it("slices warm inventory to the same grid page", () => {
    const overviewRows = Array.from({ length: 120 }, (_, i) =>
      makeOverviewRow(`https://example.com/post-${i}`),
    );
    const props = buildOverviewWarmInventoryDetailsProps({
      overviewRows,
      gridPageIndex: 1,
      sitemapInventoryLinks: [],
      siteKwHostedLink: null,
      sitemapInventoryLoading: false,
      sitemapSource: "posts",
    });

    expect(props.detailsPageStart).toBe(100);
    expect(props.totalRows).toBe(120);
    expect(props.displayRows).toHaveLength(20);
    expect(props.displayRows[0]?.destination_url).toBe("https://example.com/post-100");
  });
});

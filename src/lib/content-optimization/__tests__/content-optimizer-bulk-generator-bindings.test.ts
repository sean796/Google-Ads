import { describe, expect, it } from "vitest";
import {
  buildContentOptimizerBulkGeneratorDetailsProps,
  buildContentOptimizerBulkMicroSnapshot,
  contentOptimizerHeaderProgressFromRun,
  contentOptimizerLiveStatus,
  isContentOptimizerBulkRun,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildContentOptimizePipelineTitles,
  buildPredeterminedBlogBodyHarnessTitles,
} from "@/lib/overview/overview-content-optimize-pipeline";

const INIT_OPTIMIZE_PIPELINE_TITLES = buildContentOptimizePipelineTitles(
  buildPredeterminedBlogBodyHarnessTitles(""),
);

const baseBulkState = (): BulkOptimizationState => ({
  urls: ["https://example.com/a", "https://example.com/b"],
  currentIndex: 1,
  currentUrl: "https://example.com/b",
  urlStatuses: {
    "https://example.com/a": "completed",
    "https://example.com/b": "optimizing",
  },
  currentStep: "",
  urlKeywords: {
    "https://example.com/b": "magic show",
  },
});

describe("isContentOptimizerBulkRun", () => {
  it("treats missing runKind as content optimizer", () => {
    expect(isContentOptimizerBulkRun(baseBulkState())).toBe(true);
  });

  it("rejects harness-only run kinds", () => {
    expect(isContentOptimizerBulkRun({ ...baseBulkState(), runKind: "research" })).toBe(false);
  });
});

describe("contentOptimizerLiveStatus", () => {
  it("prefers site progress message over step labels", () => {
    const status = contentOptimizerLiveStatus({
      bulkState: baseBulkState(),
      siteProgress: {
        stepId: "plan",
        subProgress: 0.2,
        step: "Plan",
        progress: 20,
        message: "Running keyword research...",
      },
      batchProgress: {
        stepId: "load",
        subProgress: 0,
        step: "Load",
        progress: 5,
        message: "Processing post 2 of 2…",
      },
    });
    expect(status).toBe("Running keyword research...");
  });
});

describe("contentOptimizerHeaderProgressFromRun", () => {
  it("maps research phase into harness-blended batch header progress", () => {
    const progress = contentOptimizerHeaderProgressFromRun({
      siteId: "site-1",
      batchKey: "site-1-batch",
      bulkState: baseBulkState(),
      siteProgress: {
        stepId: "plan",
        subProgress: 0.1,
        step: "Plan",
        progress: 18,
        message: "Running keyword research...",
      },
      overviewRows: [],
      isOptimizingContent: { "site-1-batch": true },
      optimizationFileManagers: {},
    });
    expect(progress?.phase).toBe("Running keyword research...");
    expect(progress?.total).toBe(2);
    expect(typeof progress?.progressPct).toBe("number");
  });

  it("uses completed post count for batch progress, not active row index", () => {
    const progress = contentOptimizerHeaderProgressFromRun({
      siteId: "site-1",
      batchKey: "site-1-batch",
      bulkState: baseBulkState(),
      siteProgress: {
        stepId: "plan",
        subProgress: 0.1,
        step: "Plan",
        progress: 18,
        message: "Building blueprint…",
      },
      overviewRows: [],
      isOptimizingContent: { "site-1-batch": true },
      optimizationFileManagers: {},
    });
    expect(progress?.completed).toBeLessThan(2);
    expect(progress?.completed).toBeGreaterThanOrEqual(1);
  });
});

describe("buildContentOptimizerBulkGeneratorDetailsProps", () => {
  it("surfaces live status on drawer props", () => {
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: baseBulkState(),
        siteProgress: {
          stepId: "plan",
          subProgress: 0.1,
          step: "Plan",
          progress: 18,
          message: "Running keyword research...",
          harnessSections: [{ sectionIndex: 0, title: "Intro", status: "generating" }],
          harnessPlannedSectionCount: 3,
        },
        overviewRows: [
          {
            url: "https://example.com/b",
            title: "Blind Magic",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "magic show",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props.status).toBe("Running keyword research...");
    expect(props.currentRow).toBe(1);
    expect(props.totalRows).toBe(2);
    expect(props.displayRows[1]?.destination_url).toBe("https://example.com/b");
    expect(props.harnessSections).toHaveLength(1);
    expect(props.batchPrepHarnessSections).toEqual([]);
    expect(props.pipelineSectionTitles).toHaveLength(INIT_OPTIMIZE_PIPELINE_TITLES.length);
    expect(props.pipelineSectionTitles?.[0]).toBe("Checklist");
    expect(props.pipelineSectionTitles?.[1]).toBe("Blueprint");
    expect(props.pipelineSectionTitles?.[2]).toBe("Link targets");
  });

  it("does not attach a cached overview seoResearch file while optimizing", () => {
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          ...baseBulkState(),
          urls: ["https://example.com/b"],
          currentIndex: 0,
          currentUrl: "https://example.com/b",
          urlStatuses: { "https://example.com/b": "optimizing" },
        },
        overviewRows: [
          {
            url: "https://example.com/b",
            title: "Solar Panel Efficiency: What It Means",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "solar panel efficiency",
            seoResearch: '{"version":1,"generatedAt":"2026-07-17T14:50:13.798Z"}',
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    const files = props.filesByRow.get(0) ?? [];
    expect(files.some((file) => file.fileName.startsWith("serp-research-brief-"))).toBe(false);
    expect(files).toEqual([]);
  });

  it("shows 7 research harness placeholders on every row from batch start", () => {
    const waiting = [
      { sectionIndex: 0, title: "DataForSEO SERP", status: "waiting" as const },
      { sectionIndex: 1, title: "GSC CSV", status: "waiting" as const },
      { sectionIndex: 2, title: "LLM audit", status: "waiting" as const },
      { sectionIndex: 3, title: "SERP dump load", status: "waiting" as const },
      { sectionIndex: 4, title: "GSC quick-wins context", status: "waiting" as const },
      { sectionIndex: 5, title: "Brief merge", status: "waiting" as const },
      { sectionIndex: 6, title: "Brief upload", status: "waiting" as const },
    ];
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: ["https://example.com/a", "https://example.com/b"],
          currentIndex: 0,
          currentUrl: "https://example.com/a",
          urlStatuses: {
            "https://example.com/a": "pending",
            "https://example.com/b": "pending",
          },
          currentStep: "Researching…",
          runKind: "research",
          urlHarnessSections: {
            "https://example.com/a": waiting,
            "https://example.com/b": waiting,
          },
        },
        overviewRows: [
          {
            url: "https://example.com/a",
            title: "Row A",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "solar",
          },
          {
            url: "https://example.com/b",
            title: "Row B",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "panels",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props.harnessByRow.get(0)).toHaveLength(7);
    expect(props.harnessByRow.get(1)).toHaveLength(7);
    expect(props.pipelineSectionTitles).toHaveLength(7);
  });

  it("keeps 7 research harness rows after batch completion when files exist", () => {
    const doneHarness = [
      { sectionIndex: 0, title: "DataForSEO SERP", status: "done" as const },
      { sectionIndex: 1, title: "GSC CSV", status: "done" as const },
      { sectionIndex: 2, title: "LLM audit", status: "done" as const },
      { sectionIndex: 3, title: "SERP dump load", status: "done" as const },
      { sectionIndex: 4, title: "GSC quick-wins context", status: "done" as const },
      { sectionIndex: 5, title: "Brief merge", status: "done" as const },
      { sectionIndex: 6, title: "Brief upload", status: "done" as const },
    ];
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: ["https://example.com/a"],
          currentIndex: 0,
          currentUrl: "https://example.com/a",
          urlStatuses: { "https://example.com/a": "completed" },
          currentStep: "Batch complete",
          runKind: "research",
          urlHarnessSections: { "https://example.com/a": doneHarness },
          urlGeneratedFiles: {
            "https://example.com/a": [
              {
                name: "research-llm-audit-solar.json",
                content: "{}",
                mimeType: "application/json",
              },
            ],
          },
        },
        overviewRows: [
          {
            url: "https://example.com/a",
            title: "Solar Panel Efficiency",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "solar panel efficiency",
          },
        ],
        isOptimizingContent: {},
        optimizationFileManagers: {},
      },
      false,
    );
    expect(props.harnessByRow.get(0)).toHaveLength(7);
    expect(props.pipelineSectionTitles).toHaveLength(7);
    expect(props.filesByRow.get(0)?.some((f) => f.fileName.includes("llm-audit"))).toBe(true);
  });

  it("keeps content optimize pipeline when grid rows are research-faq but bulk state is content prep", () => {
    const url = "https://example.com/solar";
    const contentPrepHarness = [
      { sectionIndex: 0, title: "SERP research brief", status: "waiting" as const },
      { sectionIndex: 1, title: "Checklist", status: "waiting" as const },
      { sectionIndex: 2, title: "Blueprint", status: "waiting" as const },
    ];
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
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
          currentStepProgress: {
            step: "prepInventory",
            progress: 0,
            message: "Initializing batch…",
            harnessPlannedSectionCount: 2,
          },
        },
        siteProgress: {
          stepId: "prepInventory",
          subProgress: 0,
          progress: 0,
          message: "Initializing batch…",
        },
        overviewRows: [
          {
            url,
            title: "Solar Panel Efficiency",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "research-faq",
            focusKeyword: "solar panel efficiency",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props.runKind).not.toBe("research");
    expect(props.pipelineSectionTitles?.length).toBe(INIT_OPTIMIZE_PIPELINE_TITLES.length);
    expect(props.harnessByRow.get(0)).toHaveLength(INIT_OPTIMIZE_PIPELINE_TITLES.length);
    expect(props.harnessByRow.get(0)?.[0]?.title).toBe("Checklist");
    expect(props.harnessByRow.get(0)?.[2]?.title).toBe("Link targets");
  });

  it("keeps completed-row files in filesByRow", () => {
    const url = "https://example.com/113-114-street-edmonton";
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "completed" },
          currentStep: "done",
          runKind: "content",
          urlEntities: { [url]: "113/114 Street, Edmonton" },
          urlGeneratedFiles: {
            [url]: [
              {
                name: "checklist-edmonton.json",
                content: "1. Sunlight",
                mimeType: "text/plain",
              },
              {
                name: "content-edmonton.html",
                content: "<h2>Answer</h2>",
                mimeType: "text/html",
              },
              {
                name: "content-edmonton.md",
                content: "## Answer",
                mimeType: "text/markdown",
              },
            ],
          },
        },
        overviewRows: [
          {
            url,
            title: "Edmonton Window Treatment SEO Near 113/114 Street, Edmonton",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
          },
        ],
        isOptimizingContent: {},
        optimizationFileManagers: {},
      },
      false,
    );
    const rowFiles = props.filesByRow.get(0) ?? [];
    expect(rowFiles.map((file) => file.fileName)).toEqual([
      "checklist-edmonton.json",
      "content-edmonton.html",
      "content-edmonton.md",
    ]);
  });
});

describe("FAQ bulk current row", () => {
  it("does not keep details on the first completed FAQ row", () => {
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: ["https://example.com/a", "https://example.com/b"],
          currentIndex: 0,
          currentUrl: "https://example.com/a",
          urlStatuses: {
            "https://example.com/a": "completed",
            "https://example.com/b": "optimizing",
          },
          currentStep: "AI FAQs",
          runKind: "aiFaq",
        },
        overviewRows: [],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props.currentRow).toBe(1);
  });

  it("uses FAQ harness titles only, not content optimize slots", () => {
    const url = "https://example.com/a";
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [url],
          currentIndex: 0,
          currentUrl: url,
          urlStatuses: { [url]: "optimizing" },
          currentStep: "AI FAQs",
          runKind: "aiFaq",
          urlHarnessSections: {
            [url]: [
              { sectionIndex: 0, title: "FAQ 1", status: "done" },
              { sectionIndex: 1, title: "FAQ 2", status: "generating" },
              { sectionIndex: 2, title: "FAQ 3", status: "waiting" },
              { sectionIndex: 3, title: "FAQ 4", status: "waiting" },
            ],
          },
          urlGeneratedFiles: {
            [url]: [
              {
                name: "faq.json",
                content: '[{"question":"Q1","answer":"A1"}]',
                mimeType: "application/json",
              },
              {
                name: "content-a.html",
                content: "<h2>Article</h2><div class=\"flo-faq\"></div>",
                mimeType: "text/html",
              },
              {
                name: "wordpress.json",
                content: '{"ok":true}',
                mimeType: "application/json",
              },
            ],
          },
        },
        overviewRows: [
          {
            url,
            title: "Tariffs",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "ai-faq",
            focusKeyword: "tariffs",
          },
        ],
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
      },
      true,
    );
    expect(props.pipelineSectionTitles).toEqual([]);
    expect(props.filesByRow.get(0)?.map((file) => file.fileName)).toEqual([
      "faq.json",
      "content-a.html",
      "wordpress.json",
    ]);
  });

  it("resolves urlGeneratedFiles when batch url and stored key differ by trailing slash", () => {
    const batchUrl = "https://example.com/cra-mail-in";
    const storedUrl = "https://example.com/cra-mail-in/";
    const props = buildContentOptimizerBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: {
          urls: [batchUrl],
          currentIndex: 0,
          currentUrl: batchUrl,
          urlStatuses: { [batchUrl]: "completed" },
          currentStep: "AI FAQs",
          runKind: "aiFaq",
          urlGeneratedFiles: {
            [storedUrl]: [
              { name: "faq.json", content: "[]", mimeType: "application/json" },
              { name: "wordpress.json", content: "{}", mimeType: "application/json" },
            ],
          },
        },
        overviewRows: [
          {
            url: batchUrl,
            title: "CRA Mail In",
            metaDescription: "",
            aiTitle: "",
            aiMeta: "",
            status: "idle",
            focusKeyword: "cra mail in",
          },
        ],
        isOptimizingContent: {},
        optimizationFileManagers: {},
      },
      false,
    );
    expect(props.filesByRow.get(0)?.map((file) => file.fileName)).toEqual([
      "faq.json",
      "wordpress.json",
    ]);
  });
});

describe("buildContentOptimizerBulkMicroSnapshot", () => {
  it("builds micro snapshot with phase status message", () => {
    const snap = buildContentOptimizerBulkMicroSnapshot({
      siteId: "site-1",
      batchKey: "site-1-batch",
      bulkState: baseBulkState(),
      siteProgress: {
        stepId: "plan",
        subProgress: 0.1,
        step: "Plan",
        progress: 18,
        message: "Running keyword research...",
      },
      overviewRows: [],
      isOptimizingContent: { "site-1-batch": true },
      optimizationFileManagers: {},
      siteName: "Blind Magic",
    });
    expect(snap?.statusMessage).toBe("Running keyword research...");
    expect(snap?.label).toContain("Content Optimizer");
    expect(snap?.total).toBe(2);
  });
});

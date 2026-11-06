import { describe, expect, it } from "vitest";
import {
  buildSitemapMergePublishBulkGeneratorDetailsProps,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-bulk-details-bindings";
import { buildSitemapPlanBulkGeneratorDetailsProps } from "@/lib/sitemap-optimizer/sitemap-plan-bulk-details-bindings";
import { buildSitemapMergeBulkState } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import { buildUrlOptimizerBulkGeneratorDetailsProps } from "@/lib/sitemap-optimizer/url-optimizer-bulk-details-bindings";
import { buildVerticalBenchmarkBulkGeneratorDetailsProps } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-details-bindings";

describe("buildSitemapPlanBulkGeneratorDetailsProps", () => {
  it("maps analyze progress to per-row harness without global batch summary", () => {
    const props = buildSitemapPlanBulkGeneratorDetailsProps({
      busy: true,
      workspaceBusy: true,
      headerProgress: {
        label: "Sitemap analyze",
        phase: "Search Console",
        completed: 1,
        total: 3,
      },
      analyzeProgress: {
        phase: "gsc",
        completed: 2,
        total: 10,
        runMode: "wordpress",
        entityPrimary: false,
      },
      approveProgress: null,
      selectedInventory: "posts",
      gscFileName: "pages.csv",
      gscUploadRowCount: 10,
      isRedirectMapHarness: false,
      rankMathImportSummary: null,
      error: null,
      rankMathError: null,
      siteConnected: true,
      workspaceMode: "connected",
    });

    expect(props.harnessSections).toEqual([]);
    expect(props.harnessByRow?.get(0)?.length).toBeGreaterThan(0);
    expect(props.harnessByRow?.get(0)?.some((section) => section.status === "generating")).toBe(true);
    expect(props.headerProgress?.phase).toBe("Search Console");
  });

  it("maps entity SAP analyze to entitySapRowDisplay and entity rows", () => {
    const props = buildSitemapPlanBulkGeneratorDetailsProps({
      busy: true,
      workspaceBusy: true,
      headerProgress: {
        label: "Sitemap analyze",
        phase: "Sitewide: pulling page metrics from Search Console",
        completed: 0,
        total: 12,
      },
      analyzeProgress: {
        phase: "gsc_triage",
        completed: 0,
        total: 12,
        entityPrimary: true,
        currentUrl: "https://example.com/service-area/winnipeg/",
        detail: "Sitewide: pulling page metrics from Search Console",
      },
      approveProgress: null,
      selectedInventory: "entity",
      gscFileName: null,
      gscUploadRowCount: null,
      isRedirectMapHarness: false,
      rankMathImportSummary: null,
      error: null,
      rankMathError: null,
      siteConnected: true,
      workspaceMode: "connected",
    });

    expect(props.entitySapRowDisplay).toBe(true);
    expect(props.harnessSections).toEqual([]);
    expect(props.displayRows.length).toBeGreaterThan(0);
    expect(props.displayRows[0]?.entity).toBeTruthy();
    expect(props.batchPrepHarnessSections?.some((section) => section.title === "Entity sitemap")).toBe(
      true,
    );
    expect(props.prepAccordionTitle).toBeUndefined();
  });
});

describe("buildUrlOptimizerBulkGeneratorDetailsProps", () => {
  it("maps running URL optimizer to generating harness on row 0", () => {
    const props = buildUrlOptimizerBulkGeneratorDetailsProps({
      running: true,
      progress: { phase: "fetch", completed: 1, total: 4, message: "Fetching posts" },
      siteName: "Example",
      fileName: "gsc.csv",
      rowCount: 4,
      error: null,
      result: null,
    });

    expect(props.harnessByRow?.get(0)?.some((section) => section.status === "generating")).toBe(true);
    expect(props.harnessSections).toEqual([]);
  });
});

describe("buildSitemapMergePublishBulkGeneratorDetailsProps", () => {
  it("maps approve progress to SITEMAP_APPROVE_STEPS harness", () => {
    const props = buildSitemapMergePublishBulkGeneratorDetailsProps({
      approving: true,
      approveProgress: {
        phase: "trash",
        completed: 2,
        total: 5,
        detail: "Moving posts to trash",
      },
      bulkState: null,
      workspaceBusy: true,
    });

    expect(props?.harnessSections).toEqual([]);
    expect(props?.harnessByRow?.get(0)?.length).toBe(4);
    expect(props?.harnessByRow?.get(0)?.some((section) => section.status === "generating")).toBe(true);
  });

  it("delegates bulk publish state to overview bindings", () => {
    const bulkState = buildSitemapMergeBulkState({
      rows: [{ keyword: "kw", title: "Title", destination_url: "https://example.com/a" }],
      currentRow: 0,
      totalRows: 1,
      publishing: true,
      status: "Uploading",
      harnessSections: [{ sectionIndex: 0, title: "Upload", status: "generating" }],
      harnessPlannedSectionCount: 1,
      filesByRow: new Map(),
      urlHarnessSections: {},
      publishedLinksByRowIndex: new Map(),
    });

    const props = buildSitemapMergePublishBulkGeneratorDetailsProps({
      approving: false,
      approveProgress: null,
      bulkState,
      workspaceBusy: true,
      entityPrimary: true,
    });

    expect(props?.displayRows.length).toBeGreaterThan(0);
    expect(props?.harnessSections).toEqual([]);
    expect(props?.harnessByRow?.size).toBe(0);
    expect(props?.entitySapRowDisplay).toBe(true);
  });
});

describe("buildVerticalBenchmarkBulkGeneratorDetailsProps", () => {
  it("maps curate progress to harnessByRow with inventory links", () => {
    const props = buildVerticalBenchmarkBulkGeneratorDetailsProps({
      busy: true,
      exporting: false,
      generatingBulkTemplate: true,
      exportProgress: null,
      bulkTemplateProgress: {
        phase: "inventory",
        message: "Crawling inventory",
        percent: 40,
        busy: true,
        steps: [
          { id: "inv-site-1", label: "Site inventory", status: "active" },
          { id: "gsc-site-1", label: "GSC top 10", status: "waiting" },
        ],
      },
      bulkInventoryLinks: [
        {
          siteId: "site-1",
          siteName: "Client A",
          href: "blob:inv",
          filename: "client-a-inventory.json",
          rowCount: 42,
        },
      ],
      selectedCount: 2,
      rosterCount: 10,
      tagFilter: "__all__",
      gridCsvContext: null,
      gridCsvFileName: null,
      contentTypeFilter: "post",
      blogCount: 10,
    });

    expect(props.harnessSections).toEqual([]);
    expect(props.sitemapInventoryLinks).toHaveLength(1);
    expect(props.harnessByRow?.get(0)?.[0]?.status).toBe("generating");
  });
});

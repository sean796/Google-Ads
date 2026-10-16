import { describe, expect, it } from "vitest";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { buildWpUploadBatchPipelineSteps } from "@/lib/overview/overview-batch-pipeline-progress";
import { buildOverviewWpUploadBatchDetailsProps } from "@/lib/overview/overview-wp-upload-batch-details";
import { buildOverviewBulkGeneratorDetailsProps } from "@/lib/overview/overview-bulk-details-bindings";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import { overviewBulkScopeUrlKeysFromRows } from "@/lib/overview/overview-bulk-row-scope";

function uploadState(urls: string[], steps = buildWpUploadBatchPipelineSteps(urls.length)): BulkOptimizationState {
  return {
    urls,
    currentIndex: 0,
    urlStatuses: {},
    currentStep: "Uploading to WordPress",
    runKind: "wpUpload",
    batchPipelineSteps: steps,
    currentStepProgress: {
      step: "Uploading to WordPress",
      progress: 2,
      message: "Uploading WordPress post 1/91…",
    },
  };
}

describe("buildOverviewWpUploadBatchDetailsProps", () => {
  it("shows only the current upload batch", () => {
    const urls = Array.from({ length: 4 }, (_, i) => `https://example.com/p-${i}/`);
    const props = buildOverviewWpUploadBatchDetailsProps(
      { bulkState: uploadState(urls, buildWpUploadBatchPipelineSteps([1, 1, 1, 1])) },
      true,
    );

    expect(props.displayRows).toHaveLength(1);
    expect(props.displayRows[0]?.title).toBe("WP post 1/4");
    expect(props.totalRows).toBe(4);
    expect(props.harnessPlannedSectionCount).toBeNull();
    expect(props.headerProgress).toEqual({
      phase: "WordPress upload 1/4",
      completed: 1,
      total: 4,
      progressPct: 25,
      harnessActive: true,
    });
    expect(props.runKind).toBeUndefined();
    expect(props.pipelineSectionTitles).toEqual([]);
    expect(props.filesByRow?.size).toBe(0);
    expect(props.status).toBe("Uploading WordPress post 1/91…");
  });

  it("shows the running batch only", () => {
    const urls = Array.from({ length: 3 }, (_, i) => `https://example.com/p-${i}/`);
    const steps = buildWpUploadBatchPipelineSteps([1, 1, 1]).map((step, index) => ({
      ...step,
      status: index === 0 ? ("done" as const) : index === 1 ? ("running" as const) : ("waiting" as const),
    }));
    const props = buildOverviewWpUploadBatchDetailsProps(
      { bulkState: uploadState(urls, steps) },
      true,
    );

    expect(props.currentRow).toBe(0);
    expect(props.displayRows).toHaveLength(1);
    expect(props.displayRows[0]?.title).toBe("WP post 2/3");
    expect(props.harnessPlannedSectionCount).toBeNull();
    expect(props.headerProgress?.phase).toBe("WordPress upload 2/3");
    expect(props.headerProgress?.completed).toBe(2);
    expect(props.headerProgress?.total).toBe(3);
    expect(props.harnessByRow?.size).toBe(0);
  });
});

describe("buildOverviewBulkGeneratorDetailsProps wpUpload", () => {
  it("does not list every post in Details", () => {
    const overviewRows = Array.from({ length: 4 }, (_, i) =>
      createEmptyOverviewRow(`https://example.com/p-${i}/`),
    );
    const props = buildOverviewBulkGeneratorDetailsProps(
      {
        siteId: "site-1",
        batchKey: "site-1-batch",
        bulkState: uploadState(overviewRows.map((row) => row.url)),
        overviewRows,
        isOptimizingContent: { "site-1-batch": true },
        optimizationFileManagers: {},
        bulkScopeUrlKeys: overviewBulkScopeUrlKeysFromRows(overviewRows),
      },
      true,
    );

    expect(props?.displayRows).toHaveLength(1);
    expect(props?.displayRows?.[0]?.title).toBe("WP batch 1/1 (4 posts)");
    expect(props?.pipelineSectionTitles).toEqual([]);
  });
});

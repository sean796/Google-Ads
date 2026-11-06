import { describe, expect, it } from "vitest";
import {
  pickMetaBulkMicroSnapshot,
  resolveBulkPostTicker,
} from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { buildWpUploadBatchPipelineSteps } from "@/lib/overview/overview-batch-pipeline-progress";

function leftoverBatch(): BulkOptimizationState {
  return {
    urls: ["https://example.com/a", "https://example.com/b"],
    currentIndex: 1,
    urlStatuses: {
      "https://example.com/a": "completed",
      "https://example.com/b": "pending",
    },
    currentStep: "Headers",
    runKind: "content",
  };
}

describe("pickMetaBulkMicroSnapshot", () => {
  it("does not keep a leftover incomplete batch bar when nothing is running", () => {
    expect(pickMetaBulkMicroSnapshot({}, leftoverBatch(), false)).toBeNull();
  });

  it("does not keep a finished research slice on the progress bar", () => {
    expect(
      pickMetaBulkMicroSnapshot({ research: { total: 30, completed: 30 } }, undefined, false),
    ).toBeNull();
  });

  it("shows WordPress upload 1/4 while the first post is running", () => {
    const urls = Array.from({ length: 4 }, (_, i) => `https://example.com/p-${i}/`);
    // Numeric totals batch up to 25 per WP step; four 1-post chunks give a 1/4 ticker.
    const steps = buildWpUploadBatchPipelineSteps([1, 1, 1, 1]);
    steps[0] = { ...steps[0]!, status: "running" };
    const batchState: BulkOptimizationState = {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Uploading to WordPress",
      runKind: "wpUpload",
      batchPipelineSteps: steps,
    };
    const snapshot = pickMetaBulkMicroSnapshot({}, batchState, true);
    expect(snapshot?.label).toBe("WordPress upload");
    expect(snapshot?.completed).toBe(1);
    expect(snapshot?.total).toBe(4);
    expect(snapshot?.tickerPost).toBe(1);
    expect(resolveBulkPostTicker(batchState)).toEqual({
      current: 1,
      total: 4,
      completed: 1,
    });
  });

  it("shows AI titles progress instead of leftover batch state", () => {
    const snapshot = pickMetaBulkMicroSnapshot(
      { aiTitle: { total: 506, completed: 100 } },
      leftoverBatch(),
      false,
    );
    expect(snapshot?.label).toBe("AI titles");
    expect(snapshot?.completed).toBe(100);
    expect(snapshot?.total).toBe(506);
  });
});

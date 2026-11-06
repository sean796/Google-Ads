import { describe, expect, it } from "vitest";
import {
  BATCH_PREP_WEIGHT_TOTAL,
  CONTENT_OPTIMIZER_STEPS,
  CONTENT_OPTIMIZER_URL_STEPS,
  computeBatchProgress,
  computePrepProgress,
  computeUrlProgress,
  harnessSubProgress,
  mergeRunProgress,
  type RunProgressEntry,
} from "@/lib/content-optimization/content-optimizer-run-progress";

describe("content-optimizer-run-progress", () => {
  it("URL step weights sum to 100", () => {
    const sum = CONTENT_OPTIMIZER_URL_STEPS.reduce((n, s) => n + s.urlWeight, 0);
    expect(sum).toBe(100);
  });

  it("batch prep weights sum to BATCH_PREP_WEIGHT_TOTAL", () => {
    const sum = CONTENT_OPTIMIZER_STEPS.reduce((n, s) => n + s.batchPrepWeight, 0);
    expect(sum).toBe(BATCH_PREP_WEIGHT_TOTAL);
  });

  it("computeUrlProgress reaches 100 at done", () => {
    expect(computeUrlProgress("done", 1)).toBe(100);
  });

  it("mergeRunProgress is monotonic", () => {
    let state: Record<string, RunProgressEntry | undefined> = {};
    state = mergeRunProgress(state, "site-1", { stepId: "write", subProgress: 0.5 });
    expect(state["site-1"]!.progress).toBeGreaterThan(0);
    const mid = state["site-1"]!.progress;
    state = mergeRunProgress(state, "site-1", { stepId: "plan", subProgress: 0.9 });
    expect(state["site-1"]!.progress).toBeGreaterThanOrEqual(mid);
  });

  it("computeBatchProgress blends prep and URL progress", () => {
    const prepOnly = computeBatchProgress({
      prepComplete: false,
      prepStepId: "prepInventory",
      prepSubProgress: 1,
      completedUrls: 0,
      totalUrls: 10,
      currentUrlProgress: 0,
    });
    expect(prepOnly).toBeGreaterThan(0);
    expect(prepOnly).toBeLessThan(15);

    const midBatch = computeBatchProgress({
      prepComplete: true,
      completedUrls: 5,
      totalUrls: 10,
      currentUrlProgress: 50,
    });
    expect(midBatch).toBeGreaterThan(40);
    expect(midBatch).toBeLessThan(60);
  });

  it("harnessSubProgress maps plan/write sections into 0–1", () => {
    expect(harnessSubProgress("write", 0, 4, "start")).toBe(0);
    expect(harnessSubProgress("write", 0, 4, "done")).toBe(0.25);
    expect(harnessSubProgress("plan", 3, 4, "done")).toBe(1);
  });

  it("computePrepProgress covers prep inventory and research", () => {
    expect(computePrepProgress("prepInventory", 0)).toBe(0);
    expect(computePrepProgress("prepResearch", 1)).toBe(100);
  });
});

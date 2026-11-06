import { stepLabel, computePrepProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import { updateOptimizationProgress } from "./optimization-helpers";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import { type BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import { buildContentPrepUrlHarnessMap } from "@/lib/overview/overview-content-prep-harness-run";
import {
  applyBatchPrepHarnessPayload,
  buildBatchPrepHarnessPayload,
  buildWaitingBatchPrepHarnessSections,
  resolveContentPrepBatchSectionTitles,
} from "@/lib/overview/overview-content-prep-harness-sections";
import {
  buildContentOptimizeHarnessPayload,
  buildWaitingContentOptimizeHarnessSections,
  contentOptimizeHarnessSectionIndex,
  CONTENT_OPTIMIZE_PIPELINE_TOTAL,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  buildEntityBucketHarnessMarkdown,
  buildInventoryBucketHarnessMarkdown,
  buildMergedInventoryHarnessMarkdown,
} from "@/lib/overview/overview-inventory-csv";
import { articleTitleByUrlFromPosts } from "./bulk-optimization-batch-setup";

export type BulkOptimizationBatchHarnessArgs = {
  site: WordPressSite;
  batchKey: string;
  urls: string[];
  wordPressPosts: HandleOptimizeMultipleContentParams["wordPressPosts"];
  isEntitySapRun: boolean;
  batchPrepSectionTitles: ReturnType<typeof resolveContentPrepBatchSectionTitles>;
  batchPrepHarnessTotalSections: number;
  waitingBatchPrepHarnessSections: () => ReturnType<typeof buildWaitingBatchPrepHarnessSections>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  setOptimizationProgress: HandleOptimizeMultipleContentParams["setOptimizationProgress"];
};

export function createBulkOptimizationBatchHarnessSteps(args: BulkOptimizationBatchHarnessArgs) {
  const {
    site,
    batchKey,
    urls,
    wordPressPosts,
    isEntitySapRun,
    batchPrepSectionTitles,
    batchPrepHarnessTotalSections,
    waitingBatchPrepHarnessSections,
    setBulkOptimizationState,
    setOptimizationProgress,
  } = args;
  const markBatchPrepHarnessSectionDone = (
    sectionIndex: number,
    snapshot: BulkOptimizerInventorySnapshot,
    bucket: "posts" | "pages" | "merged" | "entity",
  ) => {
    const markdownSlice =
      bucket === "merged"
        ? buildMergedInventoryHarnessMarkdown(snapshot, site.siteUrl)
        : bucket === "entity"
          ? buildEntityBucketHarnessMarkdown(snapshot, site.siteUrl)
          : buildInventoryBucketHarnessMarkdown(snapshot, site.siteUrl, bucket);
    const rowCount =
      bucket === "merged"
        ? snapshot.postsMaps.byLink.size + snapshot.pagesMaps.byLink.size
        : bucket === "entity"
          ? Object.values(snapshot.customMapsByCollection ?? {}).reduce(
              (n, maps) => n + maps.byLink.size,
              0,
            )
          : bucket === "posts"
            ? snapshot.postsMaps.byLink.size
            : snapshot.pagesMaps.byLink.size;
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const waitingSections = waitingBatchPrepHarnessSections();
      const base = current.batchPrepHarnessSections ?? waitingSections;
      const nextSections = applyBatchPrepHarnessPayload(
        base,
        buildBatchPrepHarnessPayload(sectionIndex, "done", markdownSlice, batchPrepSectionTitles),
        waitingSections,
      );
      const doneCount = nextSections.filter((s: { status: string }) => s.status === "done").length;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          batchPrepHarnessSections: nextSections,
          currentStepProgress: {
            stepId: "prepInventory" as const,
            subProgress: 0,
            step: "prepInventory",
            progress: 0,
            ...(current.currentStepProgress || {}),
            harnessSections: nextSections,
            harnessPlannedSectionCount: batchPrepHarnessTotalSections,
          },
        },
      };
    });
  };

  const setBulkStep = (
    stepId: "prepInventory" | "prepResearch",
    message: string,
    subProgress: number,
    opts?: { batchSectionIndex?: number },
  ) => {
    const progress = computePrepProgress(stepId, subProgress);
    updateOptimizationProgress(setOptimizationProgress, batchKey, stepId, subProgress, message);
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const activeUrl = (current.currentUrl || urls[current.currentIndex ?? 0] || urls[0] || "").trim();
      let batchPrepHarnessSections =
        current.batchPrepHarnessSections ?? waitingBatchPrepHarnessSections();
      let urlHarnessSections =
        current.urlHarnessSections ??
        buildContentPrepUrlHarnessMap(
          urls,
          articleTitleByUrlFromPosts(urls, wordPressPosts, current.urlKeywords),
          current.urlKeywords,
          current.urlEntities,
          isEntitySapRun,
        );
      if (stepId === "prepInventory" && opts?.batchSectionIndex !== undefined) {
        const sectionIndex = opts.batchSectionIndex;
        const existingSection = batchPrepHarnessSections.find((s) => s.sectionIndex === sectionIndex);
        if (existingSection?.status !== "done") {
          batchPrepHarnessSections = applyBatchPrepHarnessPayload(
            batchPrepHarnessSections,
            buildBatchPrepHarnessPayload(sectionIndex, "start", undefined, batchPrepSectionTitles),
            waitingBatchPrepHarnessSections(),
          );
        }
      } else if (stepId === "prepResearch" && activeUrl) {
        const serpIndex = contentOptimizeHarnessSectionIndex("SERP research brief");
        const payload = buildContentOptimizeHarnessPayload(current.currentIndex ?? 0, serpIndex, "start");
        const baseSections =
          urlHarnessSections[activeUrl] ?? buildWaitingContentOptimizeHarnessSections();
        urlHarnessSections = {
          ...urlHarnessSections,
          [activeUrl]: reduceHarnessSectionList(baseSections, payload),
        };
      }
      const harnessForProgress =
        stepId === "prepResearch" && activeUrl ? urlHarnessSections[activeUrl] : batchPrepHarnessSections;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          currentStep: stepLabel(stepId),
          currentProgress: progress,
          currentStepProgress: {
            stepId,
            subProgress,
            step: stepLabel(stepId),
            progress,
            message,
            harnessSections: harnessForProgress,
            harnessPlannedSectionCount:
              stepId === "prepResearch"
                ? CONTENT_OPTIMIZE_PIPELINE_TOTAL
                : batchPrepHarnessTotalSections,
          },
          batchPrepHarnessSections,
          urlHarnessSections,
        },
      };
    });
  };

  return { markBatchPrepHarnessSectionDone, setBulkStep };
}

import { notify } from "@/lib/app-notifications";
import { notifyProcessingXTargetsInXPagesOfX } from "@/lib/notify-messages";
import { updateOptimizationProgress } from "./optimization-helpers";
import { stepLabel } from "@/lib/content-optimization/content-optimizer-run-progress";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { Dispatch, SetStateAction } from "react";
import type { GSCQuery } from "@/lib/gsc-query-clustering";
import type { BooleanMapSetter, HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import type { PendingOptimization } from "./use-optimization-state";
import type { WpPostSnapshotFromAcfByUrl } from "@/lib/wordpress-api/fields-client";
import type { WordPressSite } from "@/components/integrations/types";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageRanges,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import { buildContentPrepUrlHarnessMap } from "@/lib/overview/overview-content-prep-harness-run";
import { buildWaitingBatchPrepHarnessSections } from "@/lib/overview/overview-content-prep-harness-sections";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { sanitizeHarnessArticleTitle } from "@/lib/overview/overview-content-optimize-pipeline";

export function articleTitleByUrlFromPosts(
  urls: string[],
  wordPressPosts?: HandleOptimizeMultipleContentParams["wordPressPosts"],
  keywordByUrl?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const url of urls) {
    const key = normalizePageUrlKey(url);
    const post = wordPressPosts?.find((entry) => normalizePageUrlKey(entry.link) === key);
    const raw = post?.title?.trim() ?? "";
    const sanitized = sanitizeHarnessArticleTitle(raw, {
      pageUrl: url,
      keyword: keywordByUrl?.[url],
    });
    if (sanitized) map[url] = sanitized;
  }
  return map;
}


export function bulkRunCancelRequested(
  batchKey: string,
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"],
): boolean {
  let cancelled = false;
  setBulkOptimizationState((prev) => {
    if (prev[batchKey]?.cancelRequested) cancelled = true;
    return prev;
  });
  return cancelled;
}

export type BulkOptimizationBatchSetupArgs = {
  site: WordPressSite;
  urls: string[];
  wordPressPosts: HandleOptimizeMultipleContentParams["wordPressPosts"];
  prefilledUrlKeywords: NonNullable<HandleOptimizeMultipleContentParams["prefilledUrlKeywords"]>;
  batchKey: string;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  setOptimizationProgress: HandleOptimizeMultipleContentParams["setOptimizationProgress"];
  optimizationFileManagers: HandleOptimizeMultipleContentParams["optimizationFileManagers"];
  setOptimizationFileManagers: HandleOptimizeMultipleContentParams["setOptimizationFileManagers"];
  continueOptimizationRef: HandleOptimizeMultipleContentParams["continueOptimizationRef"];
  setIsOptimizingContent: HandleOptimizeMultipleContentParams["setIsOptimizingContent"];
  muteToasts: boolean;
  isEntitySapRun: boolean;
  waitingBatchPrepHarnessSections: () => ReturnType<typeof buildWaitingBatchPrepHarnessSections>;
  batchPrepHarnessTotalSections: number;
};

export function setupBulkOptimizationBatch(args: BulkOptimizationBatchSetupArgs) {
  const {
    site,
    urls,
    wordPressPosts,
    prefilledUrlKeywords,
    batchKey,
    setBulkOptimizationState,
    setOptimizationProgress,
    optimizationFileManagers,
    setOptimizationFileManagers,
    continueOptimizationRef,
    setIsOptimizingContent,
    muteToasts,
    isEntitySapRun,
    waitingBatchPrepHarnessSections,
    batchPrepHarnessTotalSections,
  } = args;
  const pendingOptimizationData: Record<string, PendingOptimization> = {};
  const bulkContextRef: { current: { bulkIndex: number; totalBulkUrls: number; batchKey: string } | null } = {
    current: null,
  };
  const prefetchedPendingCache = new Map<
    number,
    { pending: Record<string, unknown>; primaryKeyword: string }
  >();
  const prefetchedAcfFieldsCache = new Map<number, Record<string, unknown>>();
  const prefetchedPostPayloadByUrlIndex = new Map<number, WpPostSnapshotFromAcfByUrl>();
  const prefetchedAcfFullPostByUrlIndex = new Map<number, Record<string, unknown>>();
  const setPendingOptimization: Dispatch<
    SetStateAction<Record<string, PendingOptimization>>
  > = (action) => {
    const updated =
      typeof action === "function"
        ? (
            action as (
              prev: Record<string, PendingOptimization>,
            ) => Record<string, PendingOptimization>
          )(pendingOptimizationData)
        : action;
    Object.assign(pendingOptimizationData, updated);
    const ctx = bulkContextRef.current;
    if (ctx && pendingOptimizationData[site.id] && typeof pendingOptimizationData[site.id] === "object") {
      Object.assign(pendingOptimizationData[site.id], {
        bulkIndex: ctx.bulkIndex,
        totalBulkUrls: ctx.totalBulkUrls,
        batchKey: ctx.batchKey,
      });
    }
  };

  const bulkContinueOptimizationRef = {
    ...continueOptimizationRef,
    current: async (
      siteId: string,
      selectedKeyword: GSCQuery,
      clusterKeywords?: string[],
      setIsKeywordSelectionOpen?: BooleanMapSetter,
      testMode?: boolean,
      secondaryKeywords?: string[]
    ) => {
      const { continueOptimizationWithKeyword: continueOptimizationWithKeywordModule } = await import(
        "./continue-optimization"
      );
      await continueOptimizationWithKeywordModule({
        siteId,
        selectedKeyword,
        clusterKeywords,
        setIsKeywordSelectionOpen,
        testMode: testMode || false,
        secondaryKeywords,
        pendingOptimization: pendingOptimizationData,
        optimizationFileManagers,
        setPendingOptimization,
        setOptimizationFileManagers: () => {},
        setOptimizationProgress,
        setIsOptimizingContent,
        setBulkOptimizationState,
      });
    },
  };

  const initialUrlStatuses: Record<string, "pending" | "optimizing" | "completed" | "skipped" | "error"> = {};
  urls.forEach((url) => {
    initialUrlStatuses[url] = "pending";
  });

  const bulkPageRanges = contentOptimizerBulkPageRanges(urls.length);
  const bulkUsesPagination = contentOptimizerBulkUsesPagination(urls.length);

  setBulkOptimizationState((prev) => {
    const existing = prev[batchKey];
    const batchPrepHarnessSections = waitingBatchPrepHarnessSections();
    const articleTitleByUrl = articleTitleByUrlFromPosts(urls, wordPressPosts, prefilledUrlKeywords);
    const urlHarnessSections = buildContentPrepUrlHarnessMap(
      urls,
      articleTitleByUrl,
      prefilledUrlKeywords,
      existing?.urlEntities,
      isEntitySapRun,
    );
    const firstUrl = urls[0]?.trim() ?? "";
    return {
      ...prev,
      [batchKey]: {
        urls,
        currentIndex: 0,
        urlStatuses: initialUrlStatuses,
        currentStep: stepLabel("prepInventory"),
        currentProgress: 0,
        currentUrl: firstUrl,
        urlKeywords: { ...prefilledUrlKeywords, ...(existing?.urlKeywords || {}) },
        urlSerpResearchReady: {},
        urlGeneratedFiles: {},
        warmingUpIndex: null,
        warmingUpIndex2: null,
        researchedUrls: [],
        urlHarnessSections,
        batchPrepHarnessSections,
        currentStepProgress: {
          stepId: "prepInventory",
          subProgress: 0,
          step: stepLabel("prepInventory"),
          progress: 0,
          message: "Initializing batch…",
          harnessSections: batchPrepHarnessSections,
          harnessPlannedSectionCount: batchPrepHarnessTotalSections,
        },
        ...(bulkUsesPagination
          ? {
              bulkPageSize: CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
              totalBulkPages: bulkPageRanges.length,
              currentBulkPage: 1,
            }
          : {}),
      },
    };
  });

  if (bulkUsesPagination && !muteToasts) {
    notify.info(
      notifyProcessingXTargetsInXPagesOfX(urls.length, bulkPageRanges.length, CONTENT_OPTIMIZER_BULK_PAGE_SIZE),
    );
  }

  const emptyFileManager = new OptimizationFileManager();
  optimizationFileManagers[site.id] = emptyFileManager;
  setOptimizationFileManagers?.((prev: Record<string, OptimizationFileManager>) => ({
    ...prev,
    [site.id]: emptyFileManager,
  }));

  updateOptimizationProgress(setOptimizationProgress, batchKey, "prepInventory", 0, "Initializing batch…", {
    bulkMeta: { totalUrls: urls.length, completedUrls: 0, prepComplete: false },
    generatedFiles: [],
    harnessSections: [],
  });
  updateOptimizationProgress(setOptimizationProgress, site.id, "prepInventory", 0, "Initializing batch…", {
    generatedFiles: [],
    harnessSections: [],
  });

  const recordGeneratedFilesForUrl = (siteId: string, url: string) => {
    const fm = optimizationFileManagers[siteId];
    if (!fm) return;
    const files = fm.getFiles();
    if (!files || files.length === 0) return;

    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlGeneratedFiles: {
            ...(current.urlGeneratedFiles || {}),
            [url]: files,
          },
        },
      };
    });
  };

  return {
    pendingOptimizationData,
    bulkContextRef,
    prefetchedPendingCache,
    prefetchedAcfFieldsCache,
    prefetchedPostPayloadByUrlIndex,
    prefetchedAcfFullPostByUrlIndex,
    setPendingOptimization,
    bulkContinueOptimizationRef,
    bulkPageRanges,
    bulkUsesPagination,
    recordGeneratedFilesForUrl,
  };
}

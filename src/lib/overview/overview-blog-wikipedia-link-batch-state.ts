import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";
import {
  buildAiseoElementJsonFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type {
  SetBulkState,
  SetIsOptimizing,
  SetOptProgress,
  WikipediaLinkCatalogRow,
  WikipediaLinkHarnessSetters,
  WikipediaLinkRowPatch,
} from "@/lib/overview/overview-blog-wikipedia-link-catalog";

export function markWikiRowActive(
  url: string,
  rowNum: number,
  setters: WikipediaLinkHarnessSetters,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
        currentUrl: url,
        currentIndex: rowNum - 1,
      },
    };
  });
}

export function writeWikiRowFiles(
  url: string,
  setters: WikipediaLinkHarnessSetters,
  patch: WikipediaLinkRowPatch,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const elementFile = buildAiseoElementJsonFile("wikipedia-link.json", {
      summary: patch.blogWikiLinkSummary,
      links: patch.blogWikiLinkList,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiWikipediaLink",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml: patch.postContentOptimized,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: mergedFiles,
        },
      },
    };
  });
}

export function markWikiRowStatus(
  url: string,
  setters: WikipediaLinkHarnessSetters,
  status: "completed" | "skipped" | "error",
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: status },
      },
    };
  });
}

export function setWikiHarnessMessage(
  setters: WikipediaLinkHarnessSetters,
  progress?: number,
): void {
  const pct = progress ?? 5;
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "Wikipedia link",
      progress: pct,
      message: "Wikipedia link",
    });
    return next;
  });
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Wikipedia link",
          progress: pct,
          message: "Wikipedia link",
        }),
      },
    };
  });
}

export function initOverviewWikipediaLinkHarnessBatchState(params: {
  site: WordPressSite;
  catalog: WikipediaLinkCatalogRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    catalog,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing Wikipedia link batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Wikipedia link",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: 1,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Wikipedia link",
      currentUrl: urls[0],
      urlKeywords: {},
      runKind: "aiWikipediaLink",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Wikipedia link",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: 1,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);
  return batchKey;
}

export function finalizeOverviewWikipediaLinkHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "Wikipedia link batch finished",
    });
    return next;
  });
}

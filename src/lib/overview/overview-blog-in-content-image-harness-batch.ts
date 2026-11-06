import type { Dispatch, SetStateAction } from "react";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { WordPressSite } from "@/components/integrations/types";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  buildAiseoElementTextFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import { IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import {
  harnessStepProgress,
  mergeOverviewHarnessProgress,
  mergeOverviewHarnessProgressSiteAndBatch,
} from "@/lib/overview/overview-harness-progress";
import type { LocalImageExistingScope } from "@/lib/overview/local-image-existing-scope";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type BlogInContentImageCatalogRow = {
  index: number;
  url: string;
  title: string;
  focusKeyword: string;
  pageHeading?: string;
  html: string;
  /** When set, skip auto heading pick. */
  forcedSectionHeader?: string;
  imageKind?: "photo" | "local";
  /** Local: both modes search peer caches first; find errors on miss, generate falls through to AI. */
  localImageMode?: "find" | "generate";
  /** Generate Local: new (default) / old (replace) / all. */
  localImageExistingScope?: LocalImageExistingScope;
};

export type InContentImageHarnessResult = {
  html: string;
  imageUrl: string;
  mediaId?: number;
  alt: string;
  sectionHeader: string;
  referenceImageUrl?: string;
  referenceSourceUrl?: string;
  entity?: string;
  sharedFromSiteName?: string;
  sharedFromPageUrl?: string;
  reusedFromCrossSite?: boolean;
  peerCsvFiles?: Array<{ name: string; content: string; mimeType: string }>;
};

export function setInContentImageHarnessMessage(
  setters: OverviewHarnessSetters,
  message: string,
  progress?: number,
): void {
  const pct = progress ?? 5;
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "In Content Image",
          progress: pct,
          message,
        }),
      },
    };
  });
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "In Content Image",
      progress: pct,
      message,
    });
    return next;
  });
}

export function writeInContentImageRowFiles(
  url: string,
  setters: OverviewHarnessSetters,
  reportMd: string,
  postHtml: string,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const elementFile = buildAiseoElementTextFile("in-content-image.md", reportMd);
    const rowSlotFiles = mergeAiseoRowFinishFiles({
      runKind: "aiInContentImage",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: rowSlotFiles,
        },
      },
    };
  });
}

export function emitInContentImageHarnessPayload(
  url: string,
  setters: OverviewHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const progressLine =
    payload.phase === "progress" && payload.markdownSlice?.trim()
      ? payload.markdownSlice.trim().split("\n").pop() || payload.title
      : payload.title;
  const message =
    payload.phase === "progress"
      ? `In Content Image: ${progressLine}`
      : `In Content Image ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
  const progress =
    10 +
    Math.round(
      ((payload.sectionIndex +
        (payload.phase === "done" ? 1 : payload.phase === "progress" ? 0.65 : 0.5)) /
        Math.max(payload.totalSections, 1)) *
        80,
    );

  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? [];
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentUrl: url,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: nextUrlSections,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "In Content Image",
          progress,
          message,
          harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
        }),
      },
    };
  });

  setters.setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, setters.siteId, {
      step: "In Content Image",
      progress,
      message,
      harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
    }),
  );
}

export function initOverviewBlogInContentImageHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogInContentImageCatalogRow[];
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
    prepMessage = "Preparing In Content Image batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword) urlKeywords[url] = entry.focusKeyword;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "In Content Image",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "In Content Image",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiInContentImage",
      harnessStartedAt: Date.now(),
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "In Content Image",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewBlogInContentImageHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
  setBulkOptimizationState?: SetBulkState,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  // Also clear leftover site-level optimizing from a prior Content Opt run.
  setIsOptimizingContent((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  // Keep the batch state so the completed report stays visible in the Details drawer.
  // It is cleared only when the user explicitly closes the batch (resetBulkBatch).
  if (setBulkOptimizationState) {
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return { ...prev, [batchKey]: { ...current, currentStep: "Complete" } };
    });
  }
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "In Content Image batch finished",
    });
    return next;
  });
}

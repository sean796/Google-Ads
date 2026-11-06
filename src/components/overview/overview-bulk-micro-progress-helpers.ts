import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import {
  META_BULK_MICRO_LABELS,
  META_BULK_MICRO_ORDER,
  type MetaBulkActionKey,
  type BulkProgressSlice,
} from "@/components/overview/overview-tab-constants";
import { wpUploadBatchDisplayCount } from "@/lib/overview/overview-batch-pipeline-progress";
import { pickLatestOptimizationStatus } from "@/lib/content-optimization/optimization-progress-humanize";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type MetaBulkMicroSnapshot = {
  label: string;
  completed: number;
  total: number;
  statusMessage?: string;
  /** Harness batch fill % for neon bar (optional). */
  progressPct?: number;
  /** 1-based active post index for header ticker (multi-post batch). */
  tickerPost?: number;
};

/** Hide inline row when it repeats the header (e.g. default BULK_INLINE_STATUS copy). */
export function shouldShowBulkInlineStatus(headerLabel: string, statusMessage?: string): boolean {
  const status = statusMessage?.trim();
  if (!status) return false;
  return status.toLowerCase() !== headerLabel.trim().toLowerCase();
}

function batchProgressBarUsesPostCompletion(batchState: BulkOptimizationState): boolean {
  if (batchState.runKind === "wpUpload" && batchState.batchPipelineSteps?.length) {
    return false;
  }
  return (batchState.urls?.length ?? 0) > 1;
}

function countBatchCurrentPost(
  batchState: BulkOptimizationState,
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (completed >= total) return total;

  const urls = batchState.urls ?? [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    if (batchState.urlStatuses?.[url] === "optimizing") {
      return i + 1;
    }
  }

  if (typeof batchState.warmingUpIndex === "number" && batchState.warmingUpIndex >= 0) {
    return Math.min(total, batchState.warmingUpIndex + 1);
  }

  const currentIndex = batchState.currentIndex ?? 0;
  if (currentIndex >= 0 && currentIndex < urls.length) {
    const url = urls[currentIndex]!;
    const status = batchState.urlStatuses?.[url];
    if (status === "optimizing" || status === "pending" || !status) {
      return currentIndex + 1;
    }
  }

  const currentUrl = batchState.currentUrl?.trim();
  if (currentUrl) {
    const key = normalizePageUrlKey(currentUrl);
    const idx = urls.findIndex((u) => normalizePageUrlKey(u) === key);
    if (idx >= 0) return idx + 1;
  }

  return Math.min(total, completed + 1);
}

export function resolveBulkPostTicker(
  batchState: BulkOptimizationState | null | undefined,
): { current: number; total: number; completed: number } | null {
  if (batchState?.runKind === "wpUpload") {
    const ticker = wpUploadBatchDisplayCount(batchState.batchPipelineSteps);
    if (!ticker) return null;
    return { current: ticker.current, total: ticker.total, completed: ticker.current };
  }
  if (!batchState?.urls?.length || !batchProgressBarUsesPostCompletion(batchState)) {
    return null;
  }
  const { completed, total } = countBatchProcessed(batchState);
  return {
    current: countBatchCurrentPost(batchState, completed, total),
    total,
    completed,
  };
}


function countBatchProcessed(batchState: BulkOptimizationState): { completed: number; total: number } {
  if (batchState.runKind === "wpUpload" && batchState.batchPipelineSteps?.length) {
    const ticker = wpUploadBatchDisplayCount(batchState.batchPipelineSteps);
    if (!ticker) return { completed: 0, total: 0 };
    return { completed: ticker.current, total: ticker.total };
  }
  const urls = batchState.urls || [];
  const total = urls.length;
  let completed = 0;
  for (const u of urls) {
    const st = batchState.urlStatuses?.[u];
    if (st === "completed" || st === "skipped" || st === "error") {
      completed += 1;
    }
  }
  return { completed: Math.min(completed, total), total };
}

function batchRunLabel(batchState: BulkOptimizationState, siteName?: string): string {
  const siteSuffix = siteName?.trim() ? ` - ${siteName.trim()}` : "";
  switch (batchState.runKind) {
    case "research":
      return `Research${siteSuffix}`;
    case "aiAllMeta":
      return `AI All Meta${siteSuffix}`;
    case "wpUpload":
      return `WordPress upload${siteSuffix}`;
    case "extraText":
      return `AI Extra Text${siteSuffix}`;
    case "aiFaq":
      return `AI FAQs${siteSuffix}`;
    case "aiHeaders":
      return `Headers${siteSuffix}`;
    case "contentCleanup":
      return `Clean Up${siteSuffix}`;
    case "aiLinks":
      return `Links${siteSuffix}`;
    case "aiWikipediaLink":
      return `Wikipedia link${siteSuffix}`;
    case "aiAnswer":
      return `Answer${siteSuffix}`;
    case "aiOverview":
      return `Overview${siteSuffix}`;
    case "aiScenario":
      return `Scenario${siteSuffix}`;
    case "aiInContentImage":
      return `In Content Image${siteSuffix}`;
    case "aiFeaturedImage":
      return `Featured image${siteSuffix}`;
    default:
      return siteName?.trim() ? `Content Optimizer - ${siteName.trim()}` : META_BULK_MICRO_LABELS.optimizeAll;
  }
}

function defaultBatchStatusMessage(batchState: BulkOptimizationState): string {
  switch (batchState.runKind) {
    case "research":
      return "Researching";
    case "aiAllMeta":
      return "Processing pages";
    case "wpUpload":
      return "Uploading to WordPress";
    case "extraText":
      return "Generating extra text";
    case "aiFaq":
      return "Processing FAQ pairs";
    case "aiHeaders":
      return "Processing H2 headers";
    case "contentCleanup":
      return "Cleaning post HTML";
    case "aiLinks":
      return "Processing internal links";
    case "aiWikipediaLink":
      return "Inserting Wikipedia links";
    case "aiAnswer":
      return "Prepending Answer";
    case "aiOverview":
      return "Prepending Overview";
    case "aiScenario":
      return "Regenerating Scenario";
    case "aiInContentImage":
      return "Generating in-content image";
    case "aiFeaturedImage":
      return "Featured image";
    default:
      return "Optimizing page content";
  }
}

function buildBatchMicroSnapshot(
  batchState: BulkOptimizationState,
  siteName?: string,
  runLabelOverride?: string,
): MetaBulkMicroSnapshot {
  const { completed, total } = countBatchProcessed(batchState);
  const step =
    (typeof batchState.currentStepProgress?.message === "string" &&
      batchState.currentStepProgress.message.trim()) ||
    (typeof batchState.currentStep === "string" && batchState.currentStep.trim()) ||
    defaultBatchStatusMessage(batchState);
  const label = runLabelOverride?.trim() || batchRunLabel(batchState, siteName);
  const rawPct = batchState.currentStepProgress?.progress ?? batchState.currentProgress;
  const pagePct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const harnessPct =
    typeof rawPct === "number" && Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
  const progressPct = batchProgressBarUsesPostCompletion(batchState)
    ? pagePct
    : Math.min(100, Math.max(pagePct, harnessPct));
  const tickerPost =
    batchState.runKind === "wpUpload"
      ? completed
      : batchProgressBarUsesPostCompletion(batchState)
        ? countBatchCurrentPost(batchState, completed, total)
        : undefined;
  return {
    label,
    completed,
    total,
    progressPct,
    tickerPost,
    statusMessage: shouldShowBulkInlineStatus(label, step) ? step : undefined,
  };
}

function isActiveBatchProgress(
  batchState: BulkOptimizationState | null | undefined,
  isBatchContentRunning: boolean,
): batchState is BulkOptimizationState {
  return Boolean(isBatchContentRunning && batchState?.urls?.length);
}

export type PickMetaBulkMicroSnapshotOptions = {
  runLabelOverride?: string;
};

export function pickMetaBulkMicroSnapshot(
  bulkActionProgress: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>,
  batchState: BulkOptimizationState | null | undefined,
  isBatchContentRunning: boolean,
  siteName?: string,
  options?: PickMetaBulkMicroSnapshotOptions,
): MetaBulkMicroSnapshot | null {
  const runLabelOverride = options?.runLabelOverride;
  if (isActiveBatchProgress(batchState, isBatchContentRunning)) {
    return buildBatchMicroSnapshot(batchState, siteName, runLabelOverride);
  }
  for (const key of META_BULK_MICRO_ORDER) {
    if (key === "loadSitemap" || key === "inventoryHydrate") continue;
    const slice = bulkActionProgress[key];
    if (slice && slice.total > 0 && slice.completed < slice.total) {
      const label = META_BULK_MICRO_LABELS[key];
      const rawStatus = slice.statusMessage?.trim();
      const completed = Math.min(slice.completed, slice.total);
      return {
        label,
        completed,
        total: slice.total,
        progressPct:
          slice.total > 0 ? Math.min(100, Math.round((completed / slice.total) * 100)) : undefined,
        statusMessage: shouldShowBulkInlineStatus(label, rawStatus) ? rawStatus : undefined,
      };
    }
  }
  return null;
}

function truncateUrlLabel(url: string, maxLen = 56): string {
  const trimmed = url.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function buildSinglePageOptimizationSnapshot(
  progress: OptimizationProgressState | undefined,
  options?: { isOptimizing?: boolean; pageUrl?: string },
): MetaBulkMicroSnapshot | null {
  const isOptimizing = options?.isOptimizing ?? false;
  const hasProgress = Boolean(
    progress?.step?.trim() ||
      (typeof progress?.progress === "number" && progress.progress > 0) ||
      (progress?.microLog?.length ?? 0) > 0 ||
      (progress?.harnessSections?.length ?? 0) > 0 ||
      (progress?.filesRevision ?? 0) > 0,
  );
  if (!isOptimizing && !hasProgress) return null;

  const pct = Math.min(
    100,
    Math.max(0, Math.round(typeof progress?.progress === "number" ? progress.progress : isOptimizing ? 0 : 0)),
  );
  const step = progress?.step?.trim() || (isOptimizing ? "Optimizing…" : "Content optimization");
  const pageUrl = options?.pageUrl?.trim();
  const label = pageUrl ? `Optimize — ${truncateUrlLabel(pageUrl)}` : "Content optimization";
  const humanStatus = pickLatestOptimizationStatus(progress);
  const statusMessage =
    humanStatus && humanStatus.toLowerCase() !== step.toLowerCase() ? humanStatus : undefined;

  return {
    label,
    completed: 0,
    total: 0,
    progressPct: pct,
    statusMessage: shouldShowBulkInlineStatus(label, statusMessage) ? statusMessage : undefined,
  };
}

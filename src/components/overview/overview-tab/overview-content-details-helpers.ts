import {
  type BulkProgressSlice,
  type MetaBulkActionKey,
} from "@/components/overview/overview-tab-constants";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { isOverviewBatchAllComplete } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { overviewBulkDetailsCanOpenFromWarm } from "@/lib/overview/overview-bulk-details-bindings";
import { hasActiveBulkActionProgress } from "@/lib/overview/overview-bulk-inline-status";

export type OverviewSinglePageDetailsContext = {
  siteId: string;
  isOptimizingContent: Record<string, boolean>;
  optimizationProgress: Record<string, OptimizationProgressState>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
};

export function hasSinglePageOptimizationDetailsActivity(
  ctx: OverviewSinglePageDetailsContext | undefined,
): boolean {
  if (!ctx?.siteId) return false;
  const { siteId } = ctx;
  if (ctx.isOptimizingContent[siteId]) return true;
  const progress = ctx.optimizationProgress[siteId];
  if (progress?.step?.trim()) return true;
  if ((progress?.progress ?? 0) > 0) return true;
  if ((progress?.microLog?.length ?? 0) > 0) return true;
  if ((progress?.harnessSections?.length ?? 0) > 0) return true;
  const fm = ctx.optimizationFileManagers[siteId];
  if (fm && fm.getFileCount() > 0) return true;
  return false;
}

export type OverviewWarmInventoryDetails = {
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading: boolean;
};

export function hasOverviewContentDetailsActivity(
  bulkActionProgress: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>,
  batchBulkState: BulkOptimizationState | undefined,
  singlePageCtx?: OverviewSinglePageDetailsContext,
  warmInventory?: OverviewWarmInventoryDetails,
): boolean {
  const hasBatch = Boolean(batchBulkState?.urls?.length);
  const hasActiveSlices = hasActiveBulkActionProgress(bulkActionProgress);
  const hasWarmInventory = warmInventory
    ? overviewBulkDetailsCanOpenFromWarm(
        warmInventory.sitemapInventoryLinks,
        warmInventory.gscHostedLink,
        warmInventory.sitemapInventoryLoading,
      )
    : false;
  return (
    hasBatch ||
    hasActiveSlices ||
    hasWarmInventory ||
    hasSinglePageOptimizationDetailsActivity(singlePageCtx)
  );
}

export function isOverviewResearchWorkerActive(
  batchBulkState: BulkOptimizationState | undefined,
  bulkBatchKey: string,
  siteId: string,
  isOptimizing: Record<string, boolean>,
): boolean {
  if (isOverviewBatchAllComplete(batchBulkState)) return false;
  if (isOptimizing[bulkBatchKey] || (siteId && isOptimizing[siteId])) return true;
  return (
    batchBulkState?.runKind === "research" &&
    batchBulkState.currentStep !== "Batch complete"
  );
}

export function overviewContentDetailsCanOpen(
  site: OverviewTabController["site"],
  bulkActionProgress: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>,
  batchBulkState: BulkOptimizationState | undefined,
  singlePageCtx?: OverviewSinglePageDetailsContext,
  warmInventory?: OverviewWarmInventoryDetails,
): boolean {
  if (!site) return false;
  return hasOverviewContentDetailsActivity(
    bulkActionProgress,
    batchBulkState,
    singlePageCtx,
    warmInventory,
  );
}

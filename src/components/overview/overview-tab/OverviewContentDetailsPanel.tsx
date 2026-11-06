import {
  type BulkProgressSlice,
  type MetaBulkActionKey,
} from "@/components/overview/overview-tab-constants";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import {
  WorkspaceDetailsStack,
} from "@/components/shared/WorkspaceDetailsStack";
import {
  isOverviewBatchAllComplete,
  isOverviewResearchBatchInFlight,
} from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { SinglePageOptimizationDetailsPanel } from "@/components/overview/overview-tab/SinglePageOptimizationDetailsPanel";
import { ContentOptimizerDetailsDrawer } from "@/components/overview/overview-tab/ContentOptimizerDetailsDrawer";
import {
  buildOverviewBulkGeneratorDetailsProps,
  buildOverviewWarmInventoryDetailsProps,
  isOverviewBulkDetailsRun,
  overviewBulkDetailsCanOpenFromWarm,
} from "@/lib/overview/overview-bulk-details-bindings";
import { isAiseoFileSlotRunKind } from "@/lib/overview/overview-aiseo-row-artifacts";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { hasActiveBulkActionProgress } from "@/lib/overview/overview-bulk-inline-status";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { WordBlacklistRunDetail } from "@/components/keyword-research/bulk/WordBlacklistRunDetail";
import { contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";

type Opt = ReturnType<typeof useWordPressOptimization>;

import {
  hasSinglePageOptimizationDetailsActivity,
  isOverviewResearchWorkerActive,
  type OverviewSinglePageDetailsContext,
} from "@/components/overview/overview-tab/overview-content-details-helpers";

export type OverviewContentDetailsPanelProps = {
  ctrl: OverviewTabController;
  batchBulkState: BulkOptimizationState | undefined;
  bulkBatchKey: string;
  batchProgress: Opt["optimizationProgress"][string] | undefined;
  opt: Opt;
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  gscHostedLink?: BulkGscKeywordsHostedLink | null;
  inventoryRows?: import("@/lib/overview/site-warm-inventory-display-rows").SiteWarmInventoryDisplayRow[];
  sitemapInventoryLoading?: boolean;
};

function isOverviewBatchRunActive(
  batchBulkState: BulkOptimizationState | undefined,
): boolean {
  if (!batchBulkState?.urls?.length) return false;
  return !isOverviewBatchAllComplete(batchBulkState);
}

export function OverviewContentDetailsPanel({
  ctrl: c,
  batchBulkState,
  bulkBatchKey,
  batchProgress,
  opt,
  sitemapInventoryLinks = [],
  gscHostedLink = null,
  inventoryRows,
  sitemapInventoryLoading = false,
}: OverviewContentDetailsPanelProps) {
  const site = c.site;
  const siteId = site?.id ?? "";
  const singlePageCtx: OverviewSinglePageDetailsContext | undefined = site
    ? {
        siteId,
        isOptimizingContent: opt.isOptimizingContent,
        optimizationProgress: opt.optimizationProgress,
        optimizationFileManagers: opt.optimizationFileManagers,
      }
    : undefined;
  const siteBatchKey = siteId ? `${siteId}-batch` : "";
  const siteBatchState = siteBatchKey ? opt.bulkOptimizationState[siteBatchKey] : undefined;
  const effectiveBatchState =
    batchBulkState?.urls?.length
      ? batchBulkState
      : siteBatchState?.runKind === "research" && siteBatchState.urls?.length
        ? siteBatchState
        : batchBulkState;
  const effectiveBatchKey =
    effectiveBatchState === siteBatchState && siteBatchKey ? siteBatchKey : bulkBatchKey;
  const hasSiteResearchBatch = Boolean(
    siteBatchState?.runKind === "research" && siteBatchState.urls?.length,
  );

  const singlePageUrl = opt.pendingOptimization[siteId]?.url;
  const batchActive = isOverviewBatchRunActive(effectiveBatchState);
  const showSinglePage = hasSinglePageOptimizationDetailsActivity(singlePageCtx);
  const keepCompletedBatch =
    isAiseoFileSlotRunKind(effectiveBatchState?.runKind) ||
    effectiveBatchState?.runKind === "research";
  const showBatch = Boolean(
    site && effectiveBatchState?.urls?.length && (batchActive || keepCompletedBatch),
  );
  const isSinglePageOptimizing = Boolean(site && opt.isOptimizingContent[siteId]);
  const hasMicroActivity = hasActiveBulkActionProgress(c.bulkActionProgress);
  const researchWorkerActive = isOverviewResearchWorkerActive(
    effectiveBatchState,
    effectiveBatchKey,
    siteId,
    opt.isOptimizingContent,
  );
  const workspaceBusy = Boolean(
    opt.isOptimizingContent[effectiveBatchKey] ||
      opt.isOptimizingContent[siteId] ||
      hasMicroActivity ||
      researchWorkerActive,
  );

  const bulkDetailsProps =
    site && (showBatch || hasMicroActivity || isOverviewBulkDetailsRun(effectiveBatchState))
      ? buildOverviewBulkGeneratorDetailsProps(
          {
            siteId,
            batchKey: effectiveBatchKey,
            bulkState: effectiveBatchState ?? { urls: [], currentIndex: 0, urlStatuses: {}, currentStep: "" },
            batchProgress,
            siteProgress: opt.optimizationProgress[siteId],
            overviewRows: c.displayRows,
            gridPageIndex: c.gridPageIndex,
            isOptimizingContent: opt.isOptimizingContent,
            optimizationFileManagers: opt.optimizationFileManagers,
            siteName: site.name,
            sitemapInventoryLinks,
            siteKwHostedLink: gscHostedLink,
            sitemapInventoryLoading,
            sitemapSource: c.sitemapSource,
            bulkActionProgress: c.bulkActionProgress,
            bulkScopeUrlKeys: c.bulkScopeUrlKeys,
          },
          workspaceBusy,
        )
      : researchWorkerActive && site && effectiveBatchState
        ? buildOverviewBulkGeneratorDetailsProps(
            {
              siteId,
              batchKey: effectiveBatchKey,
              bulkState: effectiveBatchState,
              batchProgress,
              siteProgress: opt.optimizationProgress[siteId],
              overviewRows: c.displayRows,
              gridPageIndex: c.gridPageIndex,
              isOptimizingContent: opt.isOptimizingContent,
              optimizationFileManagers: opt.optimizationFileManagers,
              siteName: site.name,
              sitemapInventoryLinks,
              siteKwHostedLink: gscHostedLink,
              sitemapInventoryLoading,
              sitemapSource: c.sitemapSource,
              bulkActionProgress: c.bulkActionProgress,
              bulkScopeUrlKeys: c.bulkScopeUrlKeys,
            },
            true,
          )
        : null;

  const warmOnlyProps =
    site && !bulkDetailsProps
      ? buildOverviewWarmInventoryDetailsProps({
          overviewRows: c.displayRows,
          gridPageIndex: c.gridPageIndex,
          sitemapInventoryLinks,
          siteKwHostedLink: gscHostedLink,
          sitemapInventoryLoading,
          sitemapSource: c.sitemapSource,
        })
      : null;

  const drawerProps = bulkDetailsProps ?? warmOnlyProps;

  const hideSinglePageForResearch =
    hasSiteResearchBatch ||
    researchWorkerActive ||
    effectiveBatchState?.runKind === "research" ||
    showBatch;

  return (
    <WorkspaceDetailsStack>
      {site && !drawerProps ? (
        <>
          <div className={contentOptimizerRowStripeClass(0)}>
            <WordBlacklistRunDetail />
          </div>
          <div className={contentOptimizerRowStripeClass(1)}>
            <BulkSitemapInventoryRunDetail
              links={sitemapInventoryLinks}
              gscHostedLink={gscHostedLink}
              inventoryRows={inventoryRows}
              pinned
            />
          </div>
        </>
      ) : null}
      {showSinglePage && (!hideSinglePageForResearch || isSinglePageOptimizing) ? (
        <SinglePageOptimizationDetailsPanel
          siteId={siteId}
          opt={opt}
          pageUrl={singlePageUrl}
          stripeIndex={0}
          hideRowBody={Boolean(batchActive && effectiveBatchState?.urls?.length && !isSinglePageOptimizing)}
        />
      ) : null}

      {drawerProps ? <ContentOptimizerDetailsDrawer {...drawerProps} /> : null}
    </WorkspaceDetailsStack>
  );
}

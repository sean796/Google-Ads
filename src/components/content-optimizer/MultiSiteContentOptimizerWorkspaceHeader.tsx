import { Wand2 } from "lucide-react";
import { ContentOptimizerSectionPills } from "@/components/content-optimizer/ContentOptimizerSectionPills";
import {
  MultiSiteContentOptimizerToolbar,
  MultiSiteSelectAllControl,
} from "@/components/content-optimizer/MultiSiteContentOptimizerToolbar";
import {
  MultiSiteSourceModePills,
  SITEMAP_MIXED_SENTINEL,
} from "@/components/content-optimizer/MultiSiteSourceModePills";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ContentOptimizerGeneratorChrome } from "@/components/content-optimizer/content-optimizer-generator-chrome";
import { BlogGeneratorWorkspaceChrome } from "@/components/blog-generator/BlogGeneratorWorkspaceChrome";
import { OverviewContentPaginationReserve } from "@/components/overview/overview-tab/OverviewContentChromeReserve";
import {
  MultiSiteContentDetailsPanel,
  multiSiteContentDetailsCanOpen,
} from "@/components/content-optimizer/MultiSiteContentDetailsPanel";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";

const DETAILS_PANEL_ID = "multi-site-batch-details-panel";

export type MultiSiteContentOptimizerWorkspaceHeaderProps = {
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  workspaceBusy: boolean;
  actionsBlocked: boolean;
  optimizeMode: "update" | "draft";
  onOptimizeModeChange: (mode: "update" | "draft") => void;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  isProcessing: boolean;
  selectedSiteCount: number;
  toolbarProps: React.ComponentProps<typeof MultiSiteContentOptimizerToolbar>;
  batchBulkState: BulkOptimizationState | null | undefined;
  bulkRunBatchKey: string;
  batchSite?: WordPressSite | null;
  batchSiteName?: string;
  rowProgressDs: OptimizationProgressState | { step?: string; message?: string } | undefined;
  isOptimizingContent: Record<string, boolean>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  onBatchClose: (abortingRun: boolean) => void;
  paginationLayoutTotal: number;
  onDetailsOpenChange?: (open: boolean) => void;
  generatorChrome?: ContentOptimizerGeneratorChrome;
};

export function MultiSiteContentOptimizerWorkspaceHeader({
  optimizerSection,
  onOptimizerSectionChange,
  workspaceBusy,
  actionsBlocked,
  optimizeMode,
  onOptimizeModeChange,
  progressSnapshot,
  isProcessing,
  toolbarProps,
  batchBulkState,
  bulkRunBatchKey,
  batchSite,
  batchSiteName,
  rowProgressDs,
  isOptimizingContent,
  optimizationFileManagers,
  paginationLayoutTotal,
  onDetailsOpenChange,
  generatorChrome,
}: MultiSiteContentOptimizerWorkspaceHeaderProps) {
  const warmDetails = useOverviewSiteWarmDetails(batchSite ?? null);

  const canOpenDetails = multiSiteContentDetailsCanOpen(batchBulkState, {
    sitemapInventoryLinks: warmDetails.sitemapInventoryLinks,
    gscHostedLink: warmDetails.gscHostedLink,
    sitemapInventoryLoading: warmDetails.sitemapInventoryLoading,
  });

  const detailsOpenSignal = null;

  const sourceModePills = (
    <MultiSiteSourceModePills
      value={
        toolbarProps.propertySiteCount === 0
          ? "post"
          : (toolbarProps.universalSourceShared ?? SITEMAP_MIXED_SENTINEL)
      }
      onSelect={toolbarProps.onUniversalSitemapSelect}
      disabled={actionsBlocked || toolbarProps.propertySiteCount === 0}
      ariaLabel="Source for all sites"
    />
  );

  const optimizerSectionPills = (
    <ContentOptimizerSectionPills
      activeSection={optimizerSection}
      onSectionChange={onOptimizerSectionChange}
      disabled={actionsBlocked}
    />
  );

  const toolbarContent = (
    <>
      <MultiSiteContentOptimizerToolbar
        {...toolbarProps}
        optimizeMode={optimizeMode}
        onOptimizeModeChange={onOptimizeModeChange}
      />
    </>
  );

  const progressLeading = (
    <div className="flex shrink-0 items-center gap-2.5">
      <MultiSiteSelectAllControl
        actionsBlocked={actionsBlocked}
        propertySiteCount={toolbarProps.propertySiteCount}
        allSitesSelected={toolbarProps.allSitesSelected}
        someSitesSelected={toolbarProps.someSitesSelected}
        onSelectAllChange={toolbarProps.onSelectAllChange}
      />
      <OverviewContentPaginationReserve layoutTotalCount={paginationLayoutTotal} />
    </div>
  );

  const detailsPanel = (
    <MultiSiteContentDetailsPanel
      batchBulkState={batchBulkState}
      bulkRunBatchKey={bulkRunBatchKey}
      batchSite={batchSite}
      batchSiteName={batchSiteName}
      rowProgressDs={rowProgressDs}
      sitemapInventoryLinks={warmDetails.sitemapInventoryLinks}
      gscHostedLink={warmDetails.gscHostedLink}
      inventoryRows={warmDetails.inventoryRows}
      sitemapInventoryLoading={warmDetails.sitemapInventoryLoading}
      isOptimizingContent={isOptimizingContent}
      optimizationFileManagers={optimizationFileManagers}
    />
  );

  const sharedProps = {
    progressLeading,
    workspaceBusy,
    progressSnapshot,
    canOpenDetails,
    isProcessing,
    detailsPanelId: DETAILS_PANEL_ID,
    toolbar: toolbarContent,
    detailsPanel,
    detailsOpenSignal,
    onDetailsOpenChange,
  };

  if (generatorChrome) {
    return (
      <BlogGeneratorWorkspaceChrome
        activeSection={generatorChrome.activeSection}
        onSectionChange={generatorChrome.onSectionChange}
        sectionSwitchDisabled={generatorChrome.sectionSwitchDisabled}
        titleRowMenu={
          <>
            {sourceModePills}
            {optimizerSectionPills}
          </>
        }
        {...sharedProps}
      />
    );
  }

  return (
    <UnifiedWorkspaceChrome
      icon={Wand2}
      title="Content"
      titleRowMenu={sourceModePills}
      titleRowEnd={optimizerSectionPills}
      {...sharedProps}
    />
  );
}

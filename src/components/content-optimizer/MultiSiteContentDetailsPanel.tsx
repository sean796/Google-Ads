import { ContentOptimizerDetailsDrawer } from "@/components/overview/overview-tab/ContentOptimizerDetailsDrawer";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { WordBlacklistRunDetail } from "@/components/keyword-research/bulk/WordBlacklistRunDetail";
import {
  buildMultiSiteBulkGeneratorDetailsProps,
  buildOverviewWarmInventoryDetailsProps,
} from "@/lib/overview/overview-bulk-details-bindings";
import { WorkspaceDetailsStack } from "@/components/shared/WorkspaceDetailsStack";

export type MultiSiteContentDetailsPanelProps = {
  batchBulkState: BulkOptimizationState | null | undefined;
  bulkRunBatchKey: string;
  batchSite?: WordPressSite | null;
  batchSiteName?: string;
  rowProgressDs: OptimizationProgressState | { step?: string; message?: string } | undefined;
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  gscHostedLink?: BulkGscKeywordsHostedLink | null;
  inventoryRows?: import("@/lib/overview/site-warm-inventory-display-rows").SiteWarmInventoryDisplayRow[];
  sitemapInventoryLoading?: boolean;
  overviewRows?: OverviewRow[];
  isOptimizingContent: Record<string, boolean>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
};

export function multiSiteContentDetailsCanOpen(
  batchBulkState: BulkOptimizationState | null | undefined,
  warmInventory?: {
    sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
    gscHostedLink: BulkGscKeywordsHostedLink | null;
    sitemapInventoryLoading: boolean;
  },
): boolean {
  if (Boolean(batchBulkState?.urls?.length)) return true;
  return Boolean(warmInventory);
}

export function MultiSiteContentDetailsPanel({
  batchBulkState,
  bulkRunBatchKey,
  batchSite,
  batchSiteName,
  rowProgressDs,
  sitemapInventoryLinks = [],
  gscHostedLink = null,
  inventoryRows,
  sitemapInventoryLoading = false,
  overviewRows = [],
  isOptimizingContent,
  optimizationFileManagers,
}: MultiSiteContentDetailsPanelProps) {
  const siteId = batchSite?.id ?? bulkRunBatchKey.replace(/-batch$/, "");
  const workspaceBusy = Boolean(
    bulkRunBatchKey && isOptimizingContent[bulkRunBatchKey],
  );

  const bulkDetailsProps =
    batchBulkState?.urls?.length && siteId
      ? buildMultiSiteBulkGeneratorDetailsProps(
          {
            siteId,
            batchKey: bulkRunBatchKey,
            bulkState: batchBulkState,
            batchProgress: rowProgressDs as OptimizationProgressState | undefined,
            siteProgress: rowProgressDs as OptimizationProgressState | undefined,
            overviewRows,
            isOptimizingContent,
            optimizationFileManagers,
            siteName: batchSiteName ?? batchSite?.name,
            sitemapInventoryLinks,
            siteKwHostedLink: gscHostedLink,
            sitemapInventoryLoading,
          },
          workspaceBusy,
        )
      : null;

  const warmOnlyProps = batchSite && !bulkDetailsProps
    ? buildOverviewWarmInventoryDetailsProps({
        overviewRows,
        sitemapInventoryLinks,
        siteKwHostedLink: gscHostedLink,
        sitemapInventoryLoading,
      })
    : null;

  const drawerProps = bulkDetailsProps ?? warmOnlyProps;

  return (
    <WorkspaceDetailsStack>
      {batchSite && !drawerProps ? (
        <>
          <WordBlacklistRunDetail />
          <BulkSitemapInventoryRunDetail
            links={sitemapInventoryLinks}
            gscHostedLink={gscHostedLink}
            inventoryRows={inventoryRows}
            pinned
          />
        </>
      ) : null}
      {drawerProps ? <ContentOptimizerDetailsDrawer {...drawerProps} /> : null}
    </WorkspaceDetailsStack>
  );
}

import { useMemo } from "react";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import {
  downloadAllHostedInventoryFiles,
  hostedInventoryDownloads,
} from "@/components/keyword-research/bulk/SitemapInventoryLinksList";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import {
  buildEntityBatchPrepHarnessSections,
} from "@/components/sap-generator/LocalAnalysisDetailsPanel";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";
import type { LocalAnalysisHeaderProgress } from "@/lib/local-analysis/header-progress";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { buildSiteWarmInventoryDisplayRows } from "@/lib/overview/site-warm-inventory-display-rows";
import { CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES } from "@/lib/overview/overview-content-prep-harness-sections";

const DETAILS_PANEL_ID = "local-grid-generated-files-panel";
const PREP_SLOT_COUNT =
  CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES.length + 1;

export type LocalGridEntityDetailsBandProps = {
  workspaceBusy: boolean;
  isProcessing: boolean;
  headerProgress: LocalAnalysisHeaderProgress | null;
  liveMessage: string;
  harnessSections: BulkHarnessSectionUi[];
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
  sitePrepLoading: boolean;
  siteWarmBundle: EntitySiteWarmBundle | null;
};

export function LocalGridEntityDetailsBand({
  workspaceBusy,
  isProcessing,
  headerProgress,
  liveMessage,
  sitemapInventoryLinks,
  gscHostedLink,
  sitePrepLoading,
  siteWarmBundle,
}: LocalGridEntityDetailsBandProps) {

  const batchPrepHarnessSections = buildEntityBatchPrepHarnessSections(
    sitemapInventoryLinks,
    sitePrepLoading,
    workspaceBusy,
    headerProgress,
    gscHostedLink,
  );

  const inventoryRows = useMemo(
    () =>
      buildSiteWarmInventoryDisplayRows(
        siteWarmBundle,
        sitemapInventoryLinks,
        gscHostedLink,
      ),
    [siteWarmBundle, sitemapInventoryLinks, gscHostedLink],
  );

  const prepReadyCount = batchPrepHarnessSections.filter((s) => s.status === "done").length;

  const activeHeadlineText =
    liveMessage.trim() ||
    headerProgress?.phase?.trim() ||
    (sitePrepLoading ? "Loading sitemap and GSC…" : "");

  const bandBusy = workspaceBusy || sitePrepLoading || isProcessing;

  const hostedFileCount = hostedInventoryDownloads(sitemapInventoryLinks, gscHostedLink).length;

  const drawerContent = (
    <BulkSitemapInventoryRunDetail
      links={sitemapInventoryLinks}
      gscHostedLink={gscHostedLink}
      inventoryRows={inventoryRows}
      loading={sitePrepLoading}
      pinned
    />
  );

  return (
    <OverviewStudioGeneratedFilesBand
      busy={bandBusy}
      activeHeadlineText={activeHeadlineText}
      displayStepCurrent={prepReadyCount}
      totalStepCount={PREP_SLOT_COUNT}
      allReadyFiles={[]}
      detailsPanelId={DETAILS_PANEL_ID}
      drawerContent={drawerContent}
      endRailTitle="Sitemap inventory and GSC"
      onDownloadAll={
        hostedFileCount > 0
          ? () => downloadAllHostedInventoryFiles(sitemapInventoryLinks, gscHostedLink)
          : undefined
      }
    />
  );
}

import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

const DETAILS_PANEL_ID = "local-grid-generated-files-panel";
const PREP_SLOT_COUNT =
  CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES.length + 1;

/** Solid drawer over the map — no backdrop blur (studio sits on black already). */
const LOCAL_GRID_GENERATED_FILES_DRAWER = cn(
  "border-x-[6px] border-b-[6px] border-t-0 border-zinc-400 bg-zinc-950 shadow-[0_20px_56px_rgba(0,0,0,0.82)]",
  "!backdrop-blur-none !backdrop-saturate-100 !bg-zinc-950",
);

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
  detailsOpenSignal: number;
  onDetailsOpenChange?: (open: boolean) => void;
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
  detailsOpenSignal,
  onDetailsOpenChange,
}: LocalGridEntityDetailsBandProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  useEffect(() => {
    if (detailsOpenSignal > 0) {
      setDrawerOpen(true);
    }
  }, [detailsOpenSignal]);

  useEffect(() => {
    onDetailsOpenChange?.(drawerOpen);
  }, [drawerOpen, onDetailsOpenChange]);

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
      drawerOpen={drawerOpen}
      onToggleDrawer={() => setDrawerOpen((open) => !open)}
      drawerContent={drawerContent}
      endRailTitle="Sitemap inventory and GSC"
      detailsDrawerClassName={LOCAL_GRID_GENERATED_FILES_DRAWER}
      onDownloadAll={
        hostedFileCount > 0
          ? () => downloadAllHostedInventoryFiles(sitemapInventoryLinks, gscHostedLink)
          : undefined
      }
    />
  );
}

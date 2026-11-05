import { useState } from "react";
import { Megaphone } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { PpcPlatformPills } from "@/components/ppc/PpcPlatformPills";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { OverviewContentSortControls } from "@/components/overview/overview-tab/OverviewContentSortControls";
import { CONTENT_PAGINATION_SLOT_CLASS } from "@/components/overview/overview-tab/OverviewContentChromeReserve";
import { MetaAdsGenerateToolbar } from "@/components/ppc/meta/MetaAdsGenerateToolbar";
import { MetaAdsWorkspaceDefaultsDialog } from "@/components/ppc/meta/MetaAdsWorkspaceDefaultsDialog";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import {
  buildMetaAdsBulkGeneratorDetailsProps,
  metaAdsDetailsCanOpen,
} from "@/lib/ppc/meta-ads-bulk-generator-bindings";
import type { PpcMetaWorkspaceController } from "@/hooks/ppc/use-ppc-meta-workspace";

export type MetaAdsWorkspaceHeaderProps = {
  ctrl: PpcMetaWorkspaceController;
  onPlatformChange: (tab: "ppc-google" | "ppc-meta") => void;
};

export function MetaAdsWorkspaceHeader({ ctrl, onPlatformChange }: MetaAdsWorkspaceHeaderProps) {
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const detailsProps = buildMetaAdsBulkGeneratorDetailsProps({
    ads: ctrl.ads,
    generateConfig: ctrl.generateConfig,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
    workspaceBusy: ctrl.workspaceBusy,
    pageBucketHostedLink: ctrl.pageBucketHostedLink,
  });

  const canOpenDetails = metaAdsDetailsCanOpen({
    ads: ctrl.ads,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
  });

  return (
    <UnifiedWorkspaceChrome
      icon={Megaphone}
      title="PPC"
      titleRowMenu={
        <PpcPlatformPills
          active="ppc-meta"
          disabled={ctrl.workspaceBusy}
          onSelect={onPlatformChange}
        />
      }
      titleRowEnd={
        <div className="flex items-center gap-1">
          <WorkspacePill
            label="Defaults"
            active={defaultsOpen}
            square
            disabled={ctrl.workspaceBusy}
            onClick={() => setDefaultsOpen(true)}
          />
          <MetaAdsWorkspaceDefaultsDialog
            open={defaultsOpen}
            onOpenChange={setDefaultsOpen}
            generateConfig={ctrl.generateConfig}
            disabled={ctrl.workspaceBusy}
            onSave={ctrl.setWorkspaceVisualDefaults}
          />
          <OverviewContentSortControls
            sortColumn={ctrl.sortColumn}
            sortDir={ctrl.sortDir}
            setSortColumn={ctrl.setSortColumn}
            setSortDir={ctrl.setSortDir}
            disabled={ctrl.workspaceBusy || ctrl.displayAds.length === 0}
            showSortLabel={false}
          />
        </div>
      }
      toolbar={<MetaAdsGenerateToolbar ctrl={ctrl} disabled={ctrl.workspaceBusy} />}
      workspaceBusy={ctrl.workspaceBusy}
      progressLeading={
        <OverviewGridPagination
          className={CONTENT_PAGINATION_SLOT_CLASS}
          pageIndex={ctrl.gridPageIndex}
          totalCount={ctrl.gridPaginationTotal}
          layoutTotalCount={ctrl.paginationLayoutTotal}
          onPageChange={ctrl.setGridPageIndex}
        />
      }
      progressSnapshot={ctrl.bulkMicroSnapshot}
      bulkActionProgress={{}}
      canOpenDetails={canOpenDetails}
      isProcessing={ctrl.isGenerating}
      detailsPanelId="ppc-meta-generate-details"
      detailsPanel={<BulkGeneratorDetailsDrawer {...detailsProps} />}
    />
  );
}

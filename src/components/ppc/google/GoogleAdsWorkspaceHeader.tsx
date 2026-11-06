import { Target } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { PpcPlatformPills } from "@/components/ppc/PpcPlatformPills";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { OverviewContentSortControls } from "@/components/overview/overview-tab/OverviewContentSortControls";
import { CONTENT_PAGINATION_SLOT_CLASS } from "@/components/overview/overview-tab/OverviewContentChromeReserve";
import { PpcGoogleWorkspaceModePills } from "@/components/ppc/google/PpcGoogleWorkspaceModePills";
import type { PpcGoogleWorkspaceMode } from "@/components/ppc/google/ppc-google-workspace-mode";
import { GoogleAdsGenerateToolbar } from "@/components/ppc/google/GoogleAdsGenerateToolbar";
import { GoogleAdsDetailsPanel } from "@/components/ppc/google/GoogleAdsDetailsPanel";
import { googleAdsDetailsCanOpen } from "@/components/ppc/google/google-ads-details-can-open";
import type { PpcGoogleWorkspaceController } from "@/hooks/ppc/use-ppc-google-workspace";

export type GoogleAdsWorkspaceHeaderProps = {
  ctrl: PpcGoogleWorkspaceController;
  workspaceMode: PpcGoogleWorkspaceMode;
  onWorkspaceModeChange: (mode: PpcGoogleWorkspaceMode) => void;
  onPlatformChange: (tab: "ppc-google" | "ppc-meta") => void;
};

export function GoogleAdsWorkspaceHeader({
  ctrl,
  workspaceMode,
  onWorkspaceModeChange,
  onPlatformChange,
}: GoogleAdsWorkspaceHeaderProps) {
  const canOpenDetails = googleAdsDetailsCanOpen(
    ctrl.generateProgress,
    ctrl.isGenerating,
    ctrl.pageBucketHostedLink,
    ctrl.isPublishing,
  );

  return (
    <UnifiedWorkspaceChrome
      icon={Target}
      title="PPC"
      titleRowMenu={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PpcGoogleWorkspaceModePills
            active={workspaceMode}
            disabled={ctrl.workspaceBusy}
            onSelect={onWorkspaceModeChange}
          />
          <PpcPlatformPills
            active="ppc-google"
            disabled={ctrl.workspaceBusy}
            onSelect={onPlatformChange}
          />
        </div>
      }
      titleRowEnd={
        <OverviewContentSortControls
          sortColumn={ctrl.sortColumn}
          sortDir={ctrl.sortDir}
          setSortColumn={ctrl.setSortColumn}
          setSortDir={ctrl.setSortDir}
          disabled={ctrl.workspaceBusy || ctrl.displayCampaigns.length === 0}
          showSortLabel={false}
        />
      }
      toolbar={<GoogleAdsGenerateToolbar ctrl={ctrl} disabled={ctrl.workspaceBusy} />}
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
      isProcessing={ctrl.isGenerating || ctrl.isPublishing}
      detailsPanelId="ppc-google-generate-details"
      detailsPanel={
        <GoogleAdsDetailsPanel
          generateProgress={ctrl.generateProgress}
          isGenerating={ctrl.isGenerating}
          isPublishing={ctrl.isPublishing}
          pageBucketHostedLink={ctrl.pageBucketHostedLink}
        />
      }
    />
  );
}

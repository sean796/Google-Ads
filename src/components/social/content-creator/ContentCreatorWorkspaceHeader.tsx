import { TrendingUp } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { SocialPlatformPills, type SocialPlatformTab } from "@/components/social/SocialPlatformPills";
import { SocialPageBucketSourcePills } from "@/components/social/SocialPageBucketSourcePills";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { CONTENT_PAGINATION_SLOT_CLASS } from "@/components/overview/overview-tab/OverviewContentChromeReserve";
import { ContentCreatorGenerateToolbar } from "@/components/social/content-creator/ContentCreatorGenerateToolbar";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import {
  buildContentCreatorBulkGeneratorDetailsProps,
  contentCreatorDetailsCanOpen,
} from "@/lib/social/content-creator-bulk-generator-bindings";
import type { ContentCreatorWorkspaceController } from "@/hooks/social/use-content-creator-workspace";

export type ContentCreatorWorkspaceHeaderProps = {
  ctrl: ContentCreatorWorkspaceController;
  onPlatformChange: (tab: SocialPlatformTab) => void;
};

export function ContentCreatorWorkspaceHeader({
  ctrl,
  onPlatformChange,
}: ContentCreatorWorkspaceHeaderProps) {
  const detailsProps = buildContentCreatorBulkGeneratorDetailsProps({
    rows: ctrl.rows,
    generateConfig: ctrl.generateConfig,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
    workspaceBusy: ctrl.workspaceBusy,
    pageBucketHostedLink: ctrl.pageBucketHostedLink,
  });

  const canOpenDetails = contentCreatorDetailsCanOpen({
    rows: ctrl.rows,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
  });

  return (
    <UnifiedWorkspaceChrome
      icon={TrendingUp}
      title="Calendar"
      titleRowMenu={
        <SocialPageBucketSourcePills
          value={ctrl.generateConfig.landingPageSource}
          disabled={ctrl.workspaceBusy}
          onChange={(landingPageSource) =>
            ctrl.setGenerateConfig((prev) => ({ ...prev, landingPageSource }))
          }
        />
      }
      titleRowEnd={
        <SocialPlatformPills
          active="content-calendar"
          disabled={ctrl.workspaceBusy}
          onSelect={onPlatformChange}
        />
      }
      toolbar={<ContentCreatorGenerateToolbar ctrl={ctrl} disabled={ctrl.workspaceBusy} />}
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
      detailsPanelId="content-creator-generate-details"
      detailsPanel={<BulkGeneratorDetailsDrawer {...detailsProps} />}
    />
  );
}

import { TrendingUp } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { SocialPlatformPills } from "@/components/social/SocialPlatformPills";
import { SocialPageBucketSourcePills } from "@/components/social/SocialPageBucketSourcePills";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { CONTENT_PAGINATION_SLOT_CLASS } from "@/components/overview/overview-tab/OverviewContentChromeReserve";
import { SocialCreatorGenerateToolbar } from "@/components/social/creator/SocialCreatorGenerateToolbar";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import {
  buildSocialCreatorBulkGeneratorDetailsProps,
  socialCreatorDetailsCanOpen,
} from "@/lib/social/social-creator-bulk-generator-bindings";
import type { SocialCreatorWorkspaceController } from "@/hooks/social/use-social-creator-workspace";

export type SocialCreatorWorkspaceHeaderProps = {
  ctrl: SocialCreatorWorkspaceController;
  onPlatformChange: (tab: "gbp-post" | "content-calendar" | "social-creator") => void;
};

export function SocialCreatorWorkspaceHeader({ ctrl, onPlatformChange }: SocialCreatorWorkspaceHeaderProps) {
  const detailsProps = buildSocialCreatorBulkGeneratorDetailsProps({
    posts: ctrl.posts,
    generateConfig: ctrl.generateConfig,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
    workspaceBusy: ctrl.workspaceBusy,
    pageBucketHostedLink: ctrl.pageBucketHostedLink,
  });

  const canOpenDetails = socialCreatorDetailsCanOpen({
    posts: ctrl.posts,
    generateProgress: ctrl.generateProgress,
    isGenerating: ctrl.isGenerating,
  });

  return (
    <UnifiedWorkspaceChrome
      icon={TrendingUp}
      title="Creator"
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
          active="social-creator"
          disabled={ctrl.workspaceBusy}
          onSelect={onPlatformChange}
        />
      }
      toolbar={<SocialCreatorGenerateToolbar ctrl={ctrl} disabled={ctrl.workspaceBusy} />}
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
      detailsPanelId="social-creator-generate-details"
      detailsPanel={<BulkGeneratorDetailsDrawer {...detailsProps} />}
    />
  );
}

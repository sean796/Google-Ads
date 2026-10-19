import type { ReactNode } from "react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import {
  blogGeneratorTitleLeadingSlotProps,
  getBlogGeneratorSectionMeta,
  type BlogGeneratorSectionId,
} from "@/components/blog-generator/blog-generator-sections";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { MetaBulkActionKey, BulkProgressSlice } from "@/components/overview/overview-tab-constants";
export type BlogGeneratorWorkspaceChromeProps = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  sectionSwitchDisabled?: boolean;
  titleRowMenu?: ReactNode;
  workspaceBusy: boolean;
  progressBand?: "full" | "empty";
  progressLeading?: ReactNode;
  progressSnapshot?: MetaBulkMicroSnapshot | null;
  bulkActionProgress?: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>;
  hideIdleProgressTrack?: boolean;
  canOpenDetails?: boolean;
  isProcessing?: boolean;
  detailsPanelId?: string;
  detailsPanel?: ReactNode;
  detailsOpenSignal?: number | string | null;
  onDetailsOpenChange?: (open: boolean) => void;
  toolbar: ReactNode | null;
  /** Hide the black toolbar band (entry controls live in the body grid). */
  hideToolbar?: boolean;
};

export function BlogGeneratorWorkspaceChrome({
  activeSection,
  onSectionChange,
  sectionSwitchDisabled = false,
  titleRowMenu,
  workspaceBusy,
  progressBand = "full",
  progressLeading,
  progressSnapshot = null,
  bulkActionProgress,
  hideIdleProgressTrack = false,
  canOpenDetails = true,
  isProcessing = false,
  detailsPanelId = "blog-generator-details",
  detailsPanel = null,
  detailsOpenSignal,
  onDetailsOpenChange,
  toolbar,
  hideToolbar = false,
}: BlogGeneratorWorkspaceChromeProps) {
  const sectionMeta = getBlogGeneratorSectionMeta(activeSection);
  const SectionIcon = sectionMeta.icon;

  const titleLeadingSlot = blogGeneratorTitleLeadingSlotProps();

  if (progressBand === "empty") {
    return (
      <UnifiedWorkspaceChrome
        icon={SectionIcon}
        title={sectionMeta.label}
        titleLeadingSlot={titleLeadingSlot}
        titleRowMenu={titleRowMenu}
        toolbar={toolbar}
        hideToolbar={hideToolbar}
        workspaceBusy={workspaceBusy}
        progressBand="empty"
      />
    );
  }

  return (
    <UnifiedWorkspaceChrome
      icon={SectionIcon}
      title={sectionMeta.label}
      titleLeadingSlot={titleLeadingSlot}
      titleRowMenu={titleRowMenu}
      toolbar={toolbar}
      hideToolbar={hideToolbar}
      workspaceBusy={workspaceBusy}
      progressLeading={progressLeading}
      progressSnapshot={progressSnapshot}
      bulkActionProgress={bulkActionProgress}
      hideIdleProgressTrack={hideIdleProgressTrack}
      canOpenDetails={canOpenDetails}
      isProcessing={isProcessing}
      detailsPanelId={detailsPanelId}
      detailsPanel={detailsPanel}
      detailsOpenSignal={detailsOpenSignal}
      onDetailsOpenChange={onDetailsOpenChange}
    />
  );
}

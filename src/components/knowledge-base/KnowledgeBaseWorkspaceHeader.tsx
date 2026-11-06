import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import {
  KnowledgeBaseDetailsPanel,
  type KnowledgeBaseDetailsPanelProps,
} from "@/components/knowledge-base/KnowledgeBaseDetailsPanel";
import {
  KnowledgeBaseSectionPills,
} from "@/components/knowledge-base/KnowledgeBaseSectionPills";
import {
  KnowledgeBaseToolbar,
  type KnowledgeBaseToolbarProps,
} from "@/components/knowledge-base/KnowledgeBaseToolbar";
import type { KnowledgeBaseSectionId } from "@/lib/knowledge-base/types";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";

const DETAILS_PANEL_ID = "knowledge-base-details-panel";

export type KnowledgeBaseWorkspaceHeaderProps = {
  activeSection: KnowledgeBaseSectionId;
  onSectionChange: (id: KnowledgeBaseSectionId) => void;
  workspaceBusy: boolean;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  canOpenDetails: boolean;
  isProcessing: boolean;
  toolbarProps: KnowledgeBaseToolbarProps;
  detailsProps: KnowledgeBaseDetailsPanelProps;
};

export function KnowledgeBaseWorkspaceHeader({
  activeSection,
  onSectionChange,
  workspaceBusy,
  progressSnapshot,
  canOpenDetails,
  isProcessing,
  toolbarProps,
  detailsProps,
}: KnowledgeBaseWorkspaceHeaderProps) {
  const toolbar = useMemo(() => <KnowledgeBaseToolbar {...toolbarProps} />, [toolbarProps]);

  const detailsPanel = useMemo(
    () => <KnowledgeBaseDetailsPanel {...detailsProps} />,
    [detailsProps],
  );

  return (
    <UnifiedWorkspaceChrome
      icon={BookOpen}
      title="Knowledge Base"
      titleRowEnd={
        <KnowledgeBaseSectionPills
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          disabled={workspaceBusy}
        />
      }
      workspaceBusy={workspaceBusy}
      progressSnapshot={progressSnapshot}
      canOpenDetails={canOpenDetails}
      isProcessing={isProcessing}
      detailsPanelId={DETAILS_PANEL_ID}
      toolbar={toolbar}
      detailsPanel={detailsPanel}
    />
  );
}

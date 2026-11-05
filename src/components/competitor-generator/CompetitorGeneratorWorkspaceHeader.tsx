import type { ReactNode } from "react";
import { BlogGeneratorWorkspaceChrome } from "@/components/blog-generator/BlogGeneratorWorkspaceChrome";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { CompetitorContentDetailsPanel } from "@/components/competitor-generator/CompetitorContentDetailsPanel";
import type { CompetitorContentDetailsPanelProps } from "@/components/competitor-generator/CompetitorContentDetailsPanel";
import { CompetitorGeneratorToolbar } from "@/components/competitor-generator/CompetitorGeneratorToolbar";
import type { CompetitorWorkspaceControls } from "@/components/competitor-generation/types";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";

export type CompetitorGeneratorWorkspaceHeaderProps = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  workspace: CompetitorWorkspaceControls;
  workspaceBusy: boolean;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  hideIdleProgressTrack?: boolean;
  canOpenDetails: boolean;
  isProcessing: boolean;
  csvParsing: boolean;
  uploadLabel: string;
  sapPageBudgetInput: string;
  onSapPageBudgetInputChange: (v: string) => void;
  suggestFocusKeyword: string;
  onSuggestFocusKeywordChange: (v: string) => void;
  runLoading: boolean;
  onPickFile: (file: File | null) => void;
  onRunClusters: () => void;
  onClear: () => void;
  hasSapRowsForCsv: boolean;
  onDownloadTargetsCsv: () => void;
  detailsProps: CompetitorContentDetailsPanelProps;
  titleRowMenu?: ReactNode;
};

export function CompetitorGeneratorWorkspaceHeader({
  activeSection,
  onSectionChange,
  workspace,
  workspaceBusy,
  progressSnapshot,
  hideIdleProgressTrack = false,
  canOpenDetails,
  isProcessing,
  csvParsing,
  uploadLabel,
  sapPageBudgetInput,
  onSapPageBudgetInputChange,
  suggestFocusKeyword,
  onSuggestFocusKeywordChange,
  runLoading,
  onPickFile,
  onRunClusters,
  onClear,
  hasSapRowsForCsv,
  onDownloadTargetsCsv,
  detailsProps,
  titleRowMenu,
}: CompetitorGeneratorWorkspaceHeaderProps) {
  const showTempUrl =
    workspace.mode === "temp" || (!workspace.showConnectedToggle && workspace.mode !== "connected");

  return (
    <BlogGeneratorWorkspaceChrome
      activeSection={activeSection}
      onSectionChange={onSectionChange}
      sectionSwitchDisabled={isProcessing}
      workspaceBusy={workspaceBusy}
      titleRowMenu={titleRowMenu}
      progressSnapshot={progressSnapshot}
      hideIdleProgressTrack={hideIdleProgressTrack}
      canOpenDetails={canOpenDetails}
      isProcessing={isProcessing}
      detailsPanelId="competitor-generator-details-panel"
      toolbar={
        <CompetitorGeneratorToolbar
          workspaceBusy={workspaceBusy}
          csvParsing={csvParsing}
          uploadLabel={uploadLabel}
          sapPageBudgetInput={sapPageBudgetInput}
          onSapPageBudgetInputChange={onSapPageBudgetInputChange}
          suggestFocusKeyword={suggestFocusKeyword}
          onSuggestFocusKeywordChange={onSuggestFocusKeywordChange}
          runLoading={runLoading}
          onPickFile={onPickFile}
          onRunClusters={onRunClusters}
          onClear={onClear}
          hasSapRowsForCsv={hasSapRowsForCsv}
          onDownloadTargetsCsv={onDownloadTargetsCsv}
          showTempUrl={showTempUrl}
          tempSeedUrl={workspace.tempSeedUrl}
          onTempSeedUrlChange={workspace.onTempSeedUrlChange}
        />
      }
      detailsPanel={<CompetitorContentDetailsPanel {...detailsProps} />}
    />
  );
}

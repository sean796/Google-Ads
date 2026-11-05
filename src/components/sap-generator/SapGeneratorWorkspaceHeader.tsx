import type { ReactNode } from "react";
import { BlogGeneratorWorkspaceChrome } from "@/components/blog-generator/BlogGeneratorWorkspaceChrome";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { LocalAnalysisDetailsPanelProps } from "@/components/sap-generator/LocalAnalysisDetailsPanel";
import { EntityDetailsDrawer } from "@/components/sap-generator/EntityDetailsDrawer";
import { SapGeneratorToolbar } from "@/components/sap-generator/SapGeneratorToolbar";
import type { LocalAnalysisWorkspaceControls } from "@/components/sap-generator/LocalAnalysisPanel";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { EntityGeographicLevel } from "@/lib/entity-geographic-level";

export type SapGeneratorWorkspaceHeaderProps = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  workspace: LocalAnalysisWorkspaceControls;
  workspaceBusy: boolean;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  hideIdleProgressTrack?: boolean;
  canOpenDetails: boolean;
  isProcessing: boolean;
  csvParsing: boolean;
  uploadLabel: string;
  entityTotalCountInput: string;
  onEntityTotalCountInputChange: (v: string) => void;
  suggestFocusKeyword: string;
  onSuggestFocusKeywordChange: (v: string) => void;
  suggestFocusLocation: string;
  onSuggestFocusLocationChange: (v: string) => void;
  runLoading: boolean;
  onPickFile: (file: File | null) => void;
  onRunClusters: () => void;
  onClear: () => void;
  entityGeographicLevel: EntityGeographicLevel;
  entityTypeFocus: string[];
  onEntityTypeFocusChange: (focus: string[]) => void;
  hasSapRowsForCsv: boolean;
  onDownloadTargetsCsv: () => void;
  detailsProps: Omit<
    LocalAnalysisDetailsPanelProps,
    "workspaceBusy" | "headerProgress"
  > & {
    headerProgress: LocalAnalysisDetailsPanelProps["headerProgress"];
  };
  showBlindMagicKeywords?: boolean;
  useBlindMagicKeywords?: boolean;
  onUseBlindMagicKeywordsChange?: (v: boolean) => void;
  onApplyRemainingEntityCount: () => void;
  titleRowMenu?: ReactNode;
};

export function SapGeneratorWorkspaceHeader({
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
  entityTotalCountInput,
  onEntityTotalCountInputChange,
  suggestFocusKeyword,
  onSuggestFocusKeywordChange,
  suggestFocusLocation,
  onSuggestFocusLocationChange,
  runLoading,
  onPickFile,
  onRunClusters,
  onClear,
  entityGeographicLevel,
  entityTypeFocus,
  onEntityTypeFocusChange,
  hasSapRowsForCsv,
  onDownloadTargetsCsv,
  detailsProps,
  showBlindMagicKeywords = false,
  useBlindMagicKeywords = false,
  onUseBlindMagicKeywordsChange,
  onApplyRemainingEntityCount,
  titleRowMenu,
}: SapGeneratorWorkspaceHeaderProps) {
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
      detailsPanelId="sap-local-analysis-details-panel"
      toolbar={
        <SapGeneratorToolbar
          workspaceBusy={workspaceBusy}
          csvParsing={csvParsing}
          uploadLabel={uploadLabel}
          entityTotalCountInput={entityTotalCountInput}
          onEntityTotalCountInputChange={onEntityTotalCountInputChange}
          suggestFocusKeyword={suggestFocusKeyword}
          onSuggestFocusKeywordChange={onSuggestFocusKeywordChange}
          suggestFocusLocation={suggestFocusLocation}
          onSuggestFocusLocationChange={onSuggestFocusLocationChange}
          runLoading={runLoading}
          onPickFile={onPickFile}
          onRunClusters={onRunClusters}
          onClear={onClear}
          entityGeographicLevel={entityGeographicLevel}
          entityTypeFocus={entityTypeFocus}
          onEntityTypeFocusChange={onEntityTypeFocusChange}
          hasSapRowsForCsv={hasSapRowsForCsv}
          onDownloadTargetsCsv={onDownloadTargetsCsv}
          showTempUrl={showTempUrl}
          tempSeedUrl={workspace.tempSeedUrl}
          onTempSeedUrlChange={workspace.onTempSeedUrlChange}
          showBlindMagicKeywords={showBlindMagicKeywords}
          useBlindMagicKeywords={useBlindMagicKeywords}
          onUseBlindMagicKeywordsChange={onUseBlindMagicKeywordsChange}
          onApplyRemainingEntityCount={onApplyRemainingEntityCount}
        />
      }
      detailsPanel={
        <EntityDetailsDrawer workspaceBusy={workspaceBusy} {...detailsProps} />
      }
    />
  );
}

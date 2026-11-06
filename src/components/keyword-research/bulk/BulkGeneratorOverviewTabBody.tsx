import type { Dispatch, ReactNode, SetStateAction } from "react";
import { OverviewStudioRevisionsPage } from "@/components/overview/studio/OverviewStudioRevisionsPage";
import { OverviewStudioTabShell } from "@/components/overview/studio/OverviewStudioTabShell";
import { OverviewVisualDocCanvas } from "@/components/overview/studio/OverviewVisualDocCanvas";
import type { BulkGeneratorStudioAction } from "@/components/overview/studio/use-overview-studio-auto-seo";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/overview-sitemap-left-dock-types";
import {
  BulkPromptComposePanel,
  type BulkPromptComposePanelProps,
} from "@/components/keyword-research/bulk/BulkPromptComposePanel";
import { bulkGeneratorDetailsPanelId } from "@/components/keyword-research/bulk/bulk-generator-studio-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { useOverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { useBulkGeneratorOverviewRowSync } from "@/hooks/bulk/use-bulk-generator-overview-row-sync";

type BulkGeneratorOverviewTabBodyProps = {
  bindings: BulkGeneratorWorkspaceBindings;
  variant: BulkGeneratorStudioVariant;
  studioEditorMode: StudioEditorModeId;
  bulkGeneratorDock: OverviewSitemapLeftDockBulkGeneratorDock;
  bulkGeneratorDetailsPanel: BulkGeneratorDetailsPanelProps | null;
  customDrawerContent?: ReactNode;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  bulkGeneratorBand2Toolbar: ReactNode;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  focusKeyword?: string;
  onFocusKeywordChange?: (v: string) => void;
  titleOverride?: string;
  onTitleOverrideChange?: (v: string) => void;
  pressReleaseComposeProps?: BulkPromptComposePanelProps["pressRelease"];
  verticalBenchmarkComposeProps?: BulkPromptComposePanelProps["verticalBenchmark"];
  ctrl: ReturnType<typeof useOverviewTabController>;
  sync: ReturnType<typeof useBulkGeneratorOverviewRowSync>;
  site: WordPressSite;
  activeRow: OverviewRow | null;
  activeRowIndex: number;
  bulkWorkspaceBusy: boolean;
  studioCenterView: "document" | "revisions";
  setStudioCenterView: Dispatch<SetStateAction<"document" | "revisions">>;
  setShowingStudioModeScreen: Dispatch<SetStateAction<boolean>>;
  setInFlightAutoSeoUrl: Dispatch<SetStateAction<string | null>>;
  showingStudioModeScreen: boolean;
  ideationMode: boolean;
  bulkGeneratorStudioActions: BulkGeneratorStudioAction | undefined;
  promptLogFile: { name: string; content: string; mimeType: string } | null;
  handleSelectStudioEditorMode: (nextMode: StudioEditorModeId) => void;
  handleSelectDockUrl: (url: string) => void;
};

export function BulkGeneratorOverviewTabBody({
  bindings,
  variant,
  studioEditorMode,
  bulkGeneratorDock,
  bulkGeneratorDetailsPanel,
  customDrawerContent,
  progressSnapshot,
  bulkGeneratorBand2Toolbar,
  optimizerSection,
  onOptimizerSectionChange,
  focusKeyword,
  onFocusKeywordChange,
  titleOverride,
  onTitleOverrideChange,
  pressReleaseComposeProps,
  verticalBenchmarkComposeProps,
  ctrl,
  sync,
  activeRow,
  activeRowIndex,
  bulkWorkspaceBusy,
  studioCenterView,
  setStudioCenterView,
  setShowingStudioModeScreen,
  setInFlightAutoSeoUrl,
  showingStudioModeScreen,
  ideationMode,
  bulkGeneratorStudioActions,
  promptLogFile,
  handleSelectStudioEditorMode,
  handleSelectDockUrl,
}: BulkGeneratorOverviewTabBodyProps) {
  const showModeComposeScreen =
    studioCenterView === "document" &&
    (studioEditorMode === "press-release" ||
      !activeRow ||
      ((studioEditorMode === "prompt" || studioEditorMode === "vertical-benchmarks") &&
        (!bindings.hasGeneratedChecklist || showingStudioModeScreen)) ||
      (studioEditorMode === "csv" &&
        (!(bulkGeneratorDock.csvFileName || bulkGeneratorDock.importedFileName) ||
          showingStudioModeScreen)));

  const studioBody: ReactNode = showModeComposeScreen ? (
      <BulkPromptComposePanel
        studioMode={studioEditorMode}
        generalIntent={bindings.generalIntent}
        onGeneralIntentChange={(v) => bindings.setGeneralIntent(v)}
        numberOfBlogs={bindings.numberOfBlogs}
        onNumberOfBlogsChange={(v) => bindings.setNumberOfBlogs(v)}
        optionalPrompt={bindings.optionalPrompt}
        onOptionalPromptChange={(v) => bindings.setOptionalPrompt(v)}
        workspaceBusy={bulkWorkspaceBusy}
        hasGeneratedChecklist={bindings.hasGeneratedChecklist}
        promptSiteContextBlocked={
          Boolean(bindings.connectedSite) && !bindings.promptSiteContextReady
        }
        csvFileName={bulkGeneratorDock.csvFileName}
        onPickCsvFile={(file) => {
          setShowingStudioModeScreen(false);
          bulkGeneratorDock.onPickCsvFile?.(file);
        }}
        csvParsing={bulkGeneratorDock.csvLoading}
        csvEnrichingTitlesUrls={bulkGeneratorDock.csvEnrichingTitlesUrls}
        importParsing={bulkGeneratorDock.importParsing}
        importedFileName={bulkGeneratorDock.importedFileName}
        focusKeyword={focusKeyword}
        onFocusKeywordChange={onFocusKeywordChange}
        titleOverride={titleOverride}
        onTitleOverrideChange={onTitleOverrideChange}
        onPickImportFiles={bulkGeneratorDock.onPickImportFiles}
        pressRelease={pressReleaseComposeProps}
        verticalBenchmark={
          verticalBenchmarkComposeProps
            ? {
                ...verticalBenchmarkComposeProps,
                onApprove: () => {
                  setShowingStudioModeScreen(false);
                  verticalBenchmarkComposeProps.onApprove();
                },
              }
            : undefined
        }
      />
  ) : undefined;

  return (
    <OverviewStudioTabShell
      dock={{
        ctrl,
        activeUrl: ideationMode && !bindings.hasGeneratedChecklist ? null : (activeRow?.url ?? null),
        optimizingRowUrl: sync.optimizingRowUrl,
        batchBulkState: undefined,
        batchRunning: false,
        onSelectUrl: handleSelectDockUrl,
        bulkWorkspaceBusy,
        optimizerSection,
        onOptimizerSectionChange,
        bulkGeneratorDock,
      }}
      main={
        studioCenterView === "revisions" && activeRow ? (
          <OverviewStudioRevisionsPage
            row={activeRow}
            wpTitlesByUrl={ctrl.wpTitlesByUrl}
            siteId={ctrl.site?.id ?? null}
            onBackToEditor={() => setStudioCenterView("document")}
          />
        ) : (
          <OverviewVisualDocCanvas
            ctrl={ctrl}
            row={showModeComposeScreen ? null : activeRow}
            rowIndex={showModeComposeScreen ? -1 : activeRowIndex}
            bulkWorkspaceBusy={bulkWorkspaceBusy}
            bulkMicroSnapshot={progressSnapshot}
            batchBulkState={undefined}
            optimizingRowUrl={sync.optimizingRowUrl}
            onInFlightAutoSeoUrlChange={setInFlightAutoSeoUrl}
            onOpenRevisions={() => setStudioCenterView("revisions")}
            bulkGeneratorStudioActions={bulkGeneratorStudioActions}
            promptLogFile={promptLogFile}
            bulkGeneratorDetailsPanel={bulkGeneratorDetailsPanel ?? undefined}
            customDrawerContent={customDrawerContent}
            bulkGeneratedFilesPanelId={bulkGeneratorDetailsPanelId(variant)}
            bulkGeneratorBand2Toolbar={bulkGeneratorBand2Toolbar}
            studioBody={studioBody}
            studioEditorMode={studioEditorMode}
            onStudioEditorModeChange={handleSelectStudioEditorMode}
            bulkTitleUrlOptimizing={Boolean(bulkGeneratorDock.csvEnrichingTitlesUrls)}
          />
        )
      }
    />
  );
}

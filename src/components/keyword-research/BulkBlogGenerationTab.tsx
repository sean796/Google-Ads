import { BulkAutoGeneratePanel } from "./BulkAutoGeneratePanel";
import {
  BLOG_GENERATOR_TAB_ROOT_CLASS,
  BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
} from "@/components/keyword-research/blog-generator-tab-classes";
import { cn } from "@/lib/utils";
import { BulkGeneratorOverviewTabContent } from "@/components/keyword-research/bulk/BulkGeneratorOverviewTabContent";
import { PressReleaseTab } from "@/components/keyword-research/PressReleaseTab";
import { useVerticalBenchmarkController } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import type { BulkBlogGenerationTabProps } from "./bulk-blog-generation-tab-types";
import { useBulkStudioEditor } from "./use-bulk-studio-editor";
import { useBulkBlogImport } from "./use-bulk-blog-import";
import { useBulkGeneratorProgress } from "./use-bulk-generator-progress";
import { useBulkGeneratorDerived } from "./use-bulk-generator-derived";

export function BulkBlogGenerationTab({
  activeSection,
  onSectionChange,
  openRouterApiKey,
  dataForSEOApiKey,
  pressReleaseDataForSeoApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowPurpose,
}: BulkBlogGenerationTabProps) {
  const effectiveDataForSeoApiKey = dataForSEOApiKey ?? pressReleaseDataForSeoApiKey;
  const {
    studioEditorMode,
    handleStudioEditorModeChange,
    optimizerSection,
    handleOptimizerSectionChange,
    isPressRelease,
    isVerticalBenchmark,
  } = useBulkStudioEditor(activeSection, onSectionChange);

  const vb = useVerticalBenchmarkController(openRouterApiKey ?? "");

  const {
    importedFileName,
    focusKeyword,
    setFocusKeyword,
    titleOverride,
    setTitleOverride,
    isParsingImport,
    bulkBindings,
    pressReleaseBindings,
    handlePickImportFiles,
    onBulkGeneratorWorkspaceBindings,
    onPressReleaseWorkspaceBindings,
    handleStudioClear,
    handleCsvPick,
  } = useBulkBlogImport({
    isVerticalBenchmark,
    studioEditorMode,
    vb,
    selectedModel,
  });

  const {
    workspaceBusy,
    progressSnapshot,
    postDestination,
    postDestinationChoices,
    mergedInventoryDetails,
    baseDetailsProps,
  } = useBulkGeneratorProgress({
    isPressRelease,
    isVerticalBenchmark,
    vb,
    bulkBindings,
    pressReleaseBindings,
  });

  const {
    studioVariant,
    bulkGeneratorDetailsProps,
    pressReleaseDrawerContent,
    bulkGeneratorBand2Toolbar,
    bulkGeneratorDock,
    pressReleaseComposeProps,
    verticalBenchmarkComposeProps,
  } = useBulkGeneratorDerived({
    bulkBindings,
    pressReleaseBindings,
    isPressRelease,
    isVerticalBenchmark,
    vb,
    workspaceBusy,
    postDestination,
    postDestinationChoices,
    baseDetailsProps,
    mergedInventoryDetails,
    effectiveDataForSeoApiKey,
    openRouterApiKey,
    studioEditorMode,
    importedFileName,
    isParsingImport,
    handlePickImportFiles,
    handleStudioClear,
    handleCsvPick,
  });

  return (
    <div className={BLOG_GENERATOR_TAB_ROOT_CLASS}>
      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex min-h-0 flex-1 flex-col overflow-hidden pb-0",
        )}
      >
        {bulkBindings && bulkGeneratorDock && bulkBindings.wordPressSite ? (
          <BulkGeneratorOverviewTabContent
            site={bulkBindings.wordPressSite}
            bindings={bulkBindings}
            variant={studioVariant}
            studioEditorMode={studioEditorMode}
            onStudioEditorModeChange={handleStudioEditorModeChange}
            workspaceBusy={workspaceBusy}
            apiKey={effectiveDataForSeoApiKey ?? ""}
            selectedModel={selectedModel ?? ""}
            temperature={temperature ?? 0.7}
            maxTokens={maxTokens ?? 4096}
            topP={topP ?? 1}
            bulkGeneratorDock={bulkGeneratorDock}
            bulkGeneratorDetailsPanel={bulkGeneratorDetailsProps}
            customDrawerContent={pressReleaseDrawerContent}
            progressSnapshot={progressSnapshot}
            bulkGeneratorBand2Toolbar={bulkGeneratorBand2Toolbar}
            optimizerSection={optimizerSection}
            onOptimizerSectionChange={handleOptimizerSectionChange}
            focusKeyword={focusKeyword}
            onFocusKeywordChange={setFocusKeyword}
            titleOverride={titleOverride}
            onTitleOverrideChange={setTitleOverride}
            pressReleaseComposeProps={pressReleaseComposeProps}
            verticalBenchmarkComposeProps={verticalBenchmarkComposeProps}
          />
        ) : null}

        <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden>
          <BulkAutoGeneratePanel
            forcedInputMode={studioEditorMode === "csv" ? "csv" : "prompt"}
            apiKey={effectiveDataForSeoApiKey}
            openRouterApiKey={openRouterApiKey}
            selectedModel={selectedModel}
            temperature={temperature}
            maxTokens={maxTokens}
            topP={topP}
            flowPurpose={flowPurpose}
            bulkGeneratorWorkspace
            onBulkGeneratorWorkspaceBindings={onBulkGeneratorWorkspaceBindings}
          />
          {isPressRelease ? (
            <PressReleaseTab
              pressReleaseWorkspace
              onPressReleaseWorkspaceBindings={onPressReleaseWorkspaceBindings}
              dataForSEOApiKey={effectiveDataForSeoApiKey ?? ""}
              openRouterApiKey={openRouterApiKey ?? ""}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

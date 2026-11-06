import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/OverviewSitemapLeftDock";
import { BulkPromptDockToolbar } from "@/components/keyword-research/bulk/bulk-generator-studio-chrome";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { PressReleaseWorkspaceBindings } from "@/components/press-release/press-release-workspace-bindings";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import { buildPromptChecklistHarnessSections } from "@/lib/bulk/prompt-bulk-checklist-harness-sections";
import { BulkGeneratorScheduleMenu } from "@/components/keyword-research/bulk/BulkGeneratorScheduleMenu";
import { resolveBulkEditorialScopeTag } from "@/lib/bulk/bulk-sitemap-mode";
import {
  buildEditorialPackageQuickPresets,
  editorialPackagePresetId,
} from "@/lib/bulk/editorial-bulk-schedule-presets";
import { resolveEditorialContentPackageForSite } from "@/lib/editorial-content-package";
import { GENERATOR_TOOLBAR_SLOT_RESERVE } from "@/components/blog-generator/generator-toolbar-theme";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { PressReleaseContentDetailsDrawer } from "@/components/press-release/PressReleaseContentDetailsDrawer";
import { buildVerticalBenchmarkBulkGeneratorDetailsProps } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-details-bindings";
import type { useVerticalBenchmarkController } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import type { useBulkGeneratorProgress } from "./use-bulk-generator-progress";

type VerticalBenchmarkController = ReturnType<typeof useVerticalBenchmarkController>;

type UseBulkGeneratorDerivedArgs = {
  bulkBindings: BulkGeneratorWorkspaceBindings | null;
  pressReleaseBindings: PressReleaseWorkspaceBindings | null;
  isPressRelease: boolean;
  isVerticalBenchmark: boolean;
  vb: VerticalBenchmarkController;
  workspaceBusy: boolean;
  postDestination: ReturnType<typeof useBulkGeneratorProgress>["postDestination"];
  postDestinationChoices: ReturnType<typeof useBulkGeneratorProgress>["postDestinationChoices"];
  baseDetailsProps: ReturnType<typeof useBulkGeneratorProgress>["baseDetailsProps"];
  mergedInventoryDetails: ReturnType<typeof useBulkGeneratorProgress>["mergedInventoryDetails"];
  effectiveDataForSeoApiKey?: string;
  openRouterApiKey?: string;
  studioEditorMode: StudioEditorModeId;
  importedFileName: string | null;
  isParsingImport: boolean;
  handlePickImportFiles: (files: File[]) => Promise<void>;
  handleStudioClear: () => void;
  handleCsvPick: (file: File | null) => Promise<void>;
};

export function useBulkGeneratorDerived({
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
}: UseBulkGeneratorDerivedArgs) {
  const scheduleMenu = useMemo(() => {
    if (!bulkBindings) {
      return <div className={cn(BULK_HEADER_ICON_TOOL_BTN, GENERATOR_TOOLBAR_SLOT_RESERVE)} aria-hidden />;
    }
    const useGapScheduling =
      bulkBindings.startDateOption === "immediate" &&
      postDestination !== "local" &&
      bulkBindings.scheduleFrequency !== "immediately" &&
      Boolean(bulkBindings.scheduleOccupancy);
    const selectedSiteId =
      Array.from(bulkBindings.selectedWordPressSites)[0] ?? bulkBindings.wordPressSite?.id ?? "";
    const activeSitemapScope = resolveBulkEditorialScopeTag(
      bulkBindings.siteConfigs[selectedSiteId],
    );
    const packageQuickPresets = buildEditorialPackageQuickPresets(
      bulkBindings.wordPressSite,
      activeSitemapScope,
    );
    const siteTier = bulkBindings.wordPressSite
      ? resolveEditorialContentPackageForSite(bulkBindings.wordPressSite)
      : undefined;
    const activePackagePresetId =
      siteTier != null ? editorialPackagePresetId(siteTier, activeSitemapScope) : null;
    return (
      <BulkGeneratorScheduleMenu
        postDestination={postDestination}
        packageQuickPresets={packageQuickPresets}
        activePackagePresetId={activePackagePresetId}
        scheduleFrequency={bulkBindings.scheduleFrequency}
        setScheduleFrequency={bulkBindings.setScheduleFrequency}
        customInterval={bulkBindings.customInterval}
        setCustomInterval={bulkBindings.setCustomInterval}
        dayOfWeek={bulkBindings.dayOfWeek}
        setDayOfWeek={bulkBindings.setDayOfWeek}
        startDateOption={bulkBindings.startDateOption}
        setStartDateOption={bulkBindings.setStartDateOption}
        customStartDate={bulkBindings.customStartDate}
        setCustomStartDate={bulkBindings.setCustomStartDate}
        startTime={bulkBindings.startTime}
        setStartTime={bulkBindings.setStartTime}
        useCsvPublishDates={bulkBindings.useCsvPublishDates}
        setUseCsvPublishDates={bulkBindings.setUseCsvPublishDates}
        wordpressDraftOnly={bulkBindings.wordpressDraftOnly}
        setWordpressDraftOnly={bulkBindings.setWordpressDraftOnly}
        useGapScheduling={useGapScheduling}
        scheduleOccupancyLoading={bulkBindings.scheduleOccupancyLoading}
        isDisabled={workspaceBusy}
        showWhenLocal={false}
      />
    );
  }, [bulkBindings, postDestination, workspaceBusy]);

  const studioVariant =
    studioEditorMode === "csv"
      ? importedFileName
        ? ("blog-import" as const)
        : ("csv" as const)
      : ("prompt" as const);

  const bulkGeneratorDetailsProps = useMemo((): BulkGeneratorDetailsPanelProps | null => {
    if (!bulkBindings || isPressRelease) return null;
    if (
      isVerticalBenchmark &&
      !bulkBindings.isProcessing &&
      (vb.generatingBulkTemplate || vb.bulkTemplateProgress || vb.exportProgress)
    ) {
      return buildVerticalBenchmarkBulkGeneratorDetailsProps({
        busy: vb.busy,
        exporting: vb.exporting,
        generatingBulkTemplate: vb.generatingBulkTemplate,
        exportProgress: vb.exportProgress,
        bulkTemplateProgress: vb.bulkTemplateProgress,
        bulkInventoryLinks: vb.bulkInventoryLinks,
        selectedCount: vb.selectedSiteIdList.length,
        rosterCount: vb.rosterSites.length,
        tagFilter: vb.tagFilter,
        gridCsvContext: vb.gridCsvContext,
        gridCsvFileName: vb.gridCsvFileName,
        contentTypeFilter: vb.contentTypeFilter,
        blogCount: vb.blogCount,
      });
    }
    return {
      ...baseDetailsProps,
      variant: "prompt",
      generatedRowCount: bulkBindings.generatedRows.length ?? 0,
      selectedCount: bulkBindings.selectedBlogIndices.size ?? 0,
      sitemapInventoryLinks: mergedInventoryDetails.links,
      siteKwHostedLink: mergedInventoryDetails.gscHostedLink,
      sitemapInventoryLoading: mergedInventoryDetails.sitemapInventoryLoading,
      isGeneratingChecklist: bulkBindings.isGeneratingChecklist,
      checklistPhase: bulkBindings.checklistPhase,
      liveMessage: bulkBindings.isGeneratingChecklist
        ? bulkBindings.checklistPhase?.trim() || "Generating blog ideas"
        : null,
      batchPrepHarnessSections: buildPromptChecklistHarnessSections(
        bulkBindings.checklistPhase ?? "",
        Boolean(bulkBindings.isGeneratingChecklist),
      ),
      prepAccordionTitle: "Ideas checklist",
      filesByRow: bulkBindings.filesByRow,
      downloadFile: bulkBindings.downloadFile,
      publishDateLabelByIndex: bulkBindings.publishDateLabelByIndex,
      draftOnly: bulkBindings.wordpressDraftOnly,
      directionsSiteName: bulkBindings.connectedSite?.name,
    };
  }, [
    bulkBindings,
    isPressRelease,
    isVerticalBenchmark,
    vb.busy,
    vb.exporting,
    vb.generatingBulkTemplate,
    vb.exportProgress,
    vb.bulkTemplateProgress,
    vb.bulkInventoryLinks,
    vb.selectedSiteIdList.length,
    vb.rosterSites.length,
    vb.tagFilter,
    vb.gridCsvContext,
    vb.gridCsvFileName,
    vb.contentTypeFilter,
    vb.blogCount,
    baseDetailsProps,
    mergedInventoryDetails,
  ]);

  const pressReleaseDrawerContent = useMemo(() => {
    if (!isPressRelease || !pressReleaseBindings) return undefined;
    return (
      <PressReleaseContentDetailsDrawer
        workspaceBusy={workspaceBusy}
        isProcessing={Boolean(pressReleaseBindings.isProcessing)}
        runPhase={pressReleaseBindings.runPhase ?? ""}
        keyword={pressReleaseBindings.keyword ?? ""}
        title={pressReleaseBindings.title ?? ""}
        wordPressSite={pressReleaseBindings.wordPressSite ?? null}
        harnessSections={pressReleaseBindings.harnessSections ?? []}
        harnessPlannedSectionCount={pressReleaseBindings.harnessPlannedSectionCount ?? null}
        inventoryJsonLink={pressReleaseBindings.inventoryJsonLink ?? null}
      />
    );
  }, [isPressRelease, pressReleaseBindings, workspaceBusy]);

  const canRunPressRelease = Boolean(
    effectiveDataForSeoApiKey?.trim() &&
      openRouterApiKey?.trim() &&
      pressReleaseBindings?.keyword.trim() &&
      pressReleaseBindings?.wordPressSite &&
      !pressReleaseBindings?.isProcessing,
  );

  const bulkGeneratorBand2Toolbar = useMemo(() => {
    if (!bulkBindings || isPressRelease) return null;
    return (
      <BulkPromptDockToolbar
        workspaceBusy={workspaceBusy}
        isProcessing={Boolean(bulkBindings.isProcessing)}
        featuredImagePerBlog={bulkBindings.featuredImagePerBlog ?? true}
        onFeaturedImagePerBlogChange={(v) => bulkBindings.setFeaturedImagePerBlog(v)}
        featuredImageType={bulkBindings.featuredImageType ?? "ai-generated"}
        onFeaturedImageTypeChange={(v) => bulkBindings.setFeaturedImageType(v)}
        postDestination={postDestination}
        onPostDestinationChange={(v) => bulkBindings.setBulkPostDestination(v)}
        postDestinationChoices={postDestinationChoices}
        onCancel={() => bulkBindings.cancelProcessing()}
        onClear={handleStudioClear}
        scheduleMenu={scheduleMenu}
      />
    );
  }, [
    bulkBindings,
    isPressRelease,
    workspaceBusy,
    postDestination,
    postDestinationChoices,
    scheduleMenu,
    handleStudioClear,
  ]);

  const bulkGeneratorDock = useMemo((): OverviewSitemapLeftDockBulkGeneratorDock | null => {
    if (!bulkBindings) return null;
    return {
      variant: studioVariant,
      csvLoading: Boolean(bulkBindings.csvLoading),
      csvEnrichingTitlesUrls: Boolean(bulkBindings.csvEnrichingTitlesUrls),
      importParsing: isParsingImport,
      importedFileName,
      csvFileName: bulkBindings.csvFileName,
      onPickCsvFile: handleCsvPick,
      onPickImportFiles: handlePickImportFiles,
      promptSelection: bulkBindings.hasGeneratedChecklist,
      selectedBlogIndices: bulkBindings.selectedBlogIndices,
      setSelectedBlogIndices: bulkBindings.setSelectedBlogIndices,
    };
  }, [
    bulkBindings,
    studioVariant,
    isParsingImport,
    importedFileName,
    handleCsvPick,
    handlePickImportFiles,
  ]);

  const handleGenerateVerticalBenchmarkIdeas = useCallback(async () => {
    if (!bulkBindings) return;
    const result = await vb.handleCreateBulkTemplate({
      skipAutoDownload: true,
      blogCountOverride: vb.blogCount,
    });
    if (result?.rows?.length) {
      bulkBindings.onLoadImportRows?.(result.rows);
      vb.setBlogCount(result.rows.length);
    }
  }, [bulkBindings, vb]);

  const pressReleaseComposeProps = useMemo(
    () =>
      pressReleaseBindings
        ? {
            keyword: pressReleaseBindings.keyword,
            onKeywordChange: (v: string) => pressReleaseBindings.setKeyword(v),
            title: pressReleaseBindings.title,
            onTitleChange: (v: string) => pressReleaseBindings.setTitle(v),
            isProcessing: Boolean(pressReleaseBindings.isProcessing),
            canRun: canRunPressRelease,
            onRun: () => pressReleaseBindings.onRun(),
            onClear: () => pressReleaseBindings.onClear(),
            resultMarkdown: pressReleaseBindings.resultMarkdown,
          }
        : undefined,
    [pressReleaseBindings, canRunPressRelease],
  );

  const verticalBenchmarkComposeProps = useMemo(
    () =>
      isVerticalBenchmark
        ? {
            contentTypeFilter: vb.contentTypeFilter,
            onContentTypeFilterChange: vb.setContentTypeFilter,
            tagFilter: vb.tagFilter,
            onTagFilterChange: vb.setTagFilter,
            tagFilterOptions: vb.tagFilterOptions,
            rosterSites: vb.rosterSites,
            selectedSiteIds: vb.selectedSiteIds,
            clientTagLabelBySiteId: vb.clientTagLabelBySiteId,
            onToggleSite: vb.toggleSiteSelected,
            onSelectAllChange: (selectAll: boolean) => {
              if (selectAll) vb.loadAllClients();
              else vb.selectNoClients();
            },
            blogCount: vb.blogCount,
            onBlogCountChange: (n: number) => {
              vb.setBlogCount(n);
              bulkBindings?.setNumberOfBlogs(n);
            },
            gridCsvContext: vb.gridCsvContext,
            gridCsvFileName: vb.gridCsvFileName,
            gridCsvParsing: vb.gridCsvParsing,
            onGridCsvFile: vb.handleGridCsvFile,
            onClearGridCsv: vb.clearGridCsv,
            generating: vb.generatingBulkTemplate,
            workspaceBusy,
            hasGeneratedChecklist: Boolean(bulkBindings?.hasGeneratedChecklist),
            canDownloadCsv: vb.canDownloadBulkTemplate,
            onGenerateIdeas: () => void handleGenerateVerticalBenchmarkIdeas(),
            onApprove: () => void bulkBindings?.handleApprove(),
            onDownloadCsv: vb.handleDownloadBulkTemplate,
          }
        : undefined,
    [
      isVerticalBenchmark,
      vb,
      workspaceBusy,
      bulkBindings,
      handleGenerateVerticalBenchmarkIdeas,
    ],
  );

  return {
    studioVariant,
    bulkGeneratorDetailsProps,
    pressReleaseDrawerContent,
    bulkGeneratorBand2Toolbar,
    bulkGeneratorDock,
    pressReleaseComposeProps,
    verticalBenchmarkComposeProps,
  };
}

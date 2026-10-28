import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BulkAutoGeneratePanel } from "./BulkAutoGeneratePanel";
import {
  BLOG_GENERATOR_TAB_ROOT_CLASS,
  BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
} from "@/components/keyword-research/blog-generator-tab-classes";
import { cn } from "@/lib/utils";
import { BulkGeneratorOverviewTabContent } from "@/components/keyword-research/bulk/BulkGeneratorOverviewTabContent";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/OverviewSitemapLeftDock";
import { BulkPromptDockToolbar } from "@/components/keyword-research/bulk/bulk-generator-studio-chrome";
import {
  readStoredContentOptimizerSection,
  writeStoredContentOptimizerSection,
  type ContentOptimizerSectionId,
} from "@/components/content-optimizer/content-optimizer-sections";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import {
  blogGeneratorSectionForStudioMode,
  isResearchStudioMode,
  readStoredStudioEditorMode,
  writeStoredStudioEditorMode,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";
import { buildPromptChecklistHarnessSections } from "@/lib/bulk/prompt-bulk-checklist-harness-sections";
import { GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES } from "@/lib/overview/overview-content-optimize-pipeline";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { BulkGeneratorScheduleMenu } from "@/components/keyword-research/bulk/BulkGeneratorScheduleMenu";
import { resolveBulkEditorialScopeTag } from "@/lib/bulk/bulk-sitemap-mode";
import {
  buildEditorialPackageQuickPresets,
  editorialPackagePresetId,
} from "@/lib/bulk/editorial-bulk-schedule-presets";
import { resolveEditorialContentPackageForSite } from "@/lib/editorial-content-package";
import { GENERATOR_TOOLBAR_SLOT_RESERVE } from "@/components/blog-generator/generator-toolbar-theme";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  BULK_POST_DESTINATION_CHOICES,
  type WordPressPostDestination,
} from "@/lib/bulk-auto-generate";
import { isBlogImportFileAccepted } from "@/lib/bulk/blog-import-parser";
import { buildImportCsvRowFromFile } from "@/lib/bulk/blog-import-direct";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
} from "@/lib/bulk/blog-import-header-progress";
import { PressReleaseTab } from "@/components/keyword-research/PressReleaseTab";
import { PressReleaseContentDetailsDrawer } from "@/components/press-release/PressReleaseContentDetailsDrawer";
import type { PressReleaseWorkspaceBindings } from "@/components/press-release/press-release-workspace-bindings";
import {
  buildPressReleaseMicroSnapshot,
  pressReleaseHeaderProgressFromState,
} from "@/lib/press-release/press-release-header-progress";
import { notify } from "@/lib/app-notifications";
import { notifyLoadedCsvX, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED } from "@/lib/notify-messages";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";

export interface BulkBlogGenerationTabProps {
  variant: "csv" | "prompt" | "blog-import" | "press-release";
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  openRouterApiKey?: string;
  dataForSEOApiKey?: string;
  /** @deprecated Use dataForSEOApiKey */
  pressReleaseDataForSeoApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
}

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

  const [studioEditorMode, setStudioEditorModeState] = useState<StudioEditorModeId>(() =>
    readStoredStudioEditorMode(activeSection),
  );

  // Sync when the user clicks Studio, PR, or Research in the top Tools → SEO menu
  useEffect(() => {
    if (activeSection === "bulk-press-release" && studioEditorMode !== "press-release") {
      setStudioEditorModeState("press-release");
      writeStoredStudioEditorMode("press-release");
      return;
    }
    if (activeSection === "research" && !isResearchStudioMode(studioEditorMode)) {
      const next = readStoredStudioEditorMode("research");
      setStudioEditorModeState(next);
      writeStoredStudioEditorMode(next);
      return;
    }
    if (
      activeSection === "bulk-prompt" &&
      (studioEditorMode === "press-release" || isResearchStudioMode(studioEditorMode))
    ) {
      setStudioEditorModeState("prompt");
      writeStoredStudioEditorMode("prompt");
    }
  }, [activeSection]);

  const handleStudioEditorModeChange = useCallback(
    (nextMode: StudioEditorModeId) => {
      setStudioEditorModeState(nextMode);
      writeStoredStudioEditorMode(nextMode);
      const nextSection = blogGeneratorSectionForStudioMode(nextMode);
      if (nextSection !== activeSection) {
        onSectionChange(nextSection);
      }
    },
    [activeSection, onSectionChange],
  );

  const [optimizerSection, setOptimizerSection] = useState<ContentOptimizerSectionId>(() =>
    readStoredContentOptimizerSection(),
  );

  const handleOptimizerSectionChange = useCallback((id: ContentOptimizerSectionId) => {
    setOptimizerSection(id);
    writeStoredContentOptimizerSection(id);
  }, []);

  const isPressRelease = studioEditorMode === "press-release";
  const isResearchMode = isResearchStudioMode(studioEditorMode);

  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [focusKeyword, setFocusKeyword] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [bulkBindings, setBulkBindings] = useState<BulkGeneratorWorkspaceBindings | null>(null);
  const [pressReleaseBindings, setPressReleaseBindings] =
    useState<PressReleaseWorkspaceBindings | null>(null);

  const handlePickImportFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !bulkBindings) return;
      const dest: WordPressPostDestination = bulkBindings.bulkPostDestination ?? "wordpress";
      let apiKey = "";
      try {
        apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
      } catch (e) {
        notify.error(e instanceof Error ? e.message : NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED);
        return;
      }
      setIsParsingImport(true);
      try {
        const accepted = files.filter((file) => isBlogImportFileAccepted(file));
        if (accepted.length === 0) {
          notify.error("Use .docx, .md, .html, or .txt");
          return;
        }
        if (accepted.length !== files.length) {
          notify.error("Skipped unsupported file types");
        }
        const featuredImageMode = bulkBindings.featuredImagePerBlog
          ? bulkBindings.featuredImageType === "google-maps"
            ? "google-maps"
            : "y"
          : "n";
        const form = {
          focusKeyword,
          titleOverride,
          featuredImageMode: featuredImageMode as "y" | "n" | "google-maps",
          entity: "",
        };
        const next: CSVRow[] = [];
        for (const file of accepted) {
          try {
            next.push(
              await buildImportCsvRowFromFile(file, form, dest, apiKey, selectedModel),
            );
          } catch (error) {
            notify.error(error instanceof Error ? error.message : `Failed to read ${file.name}`);
          }
        }
        if (next.length === 0) return;
        setImportedFileName(
          next.length === 1
            ? next[0]?.import_file_name ?? accepted[0]?.name ?? "1 file"
            : `${next.length} files`,
        );
        bulkBindings.onLoadImportRows?.(next);
      } finally {
        setIsParsingImport(false);
      }
    },
    [bulkBindings, focusKeyword, titleOverride, selectedModel],
  );

  const onBulkGeneratorWorkspaceBindings = useCallback((bindings: BulkGeneratorWorkspaceBindings) => {
    setBulkBindings(bindings);
  }, []);

  const onPressReleaseWorkspaceBindings = useCallback((bindings: PressReleaseWorkspaceBindings) => {
    setPressReleaseBindings(bindings);
  }, []);

  const workspaceBusy = isPressRelease
    ? Boolean(pressReleaseBindings?.isProcessing)
    : Boolean(bulkBindings?.isProcessing) ||
      Boolean(bulkBindings?.isGeneratingChecklist) ||
      Boolean(bulkBindings?.csvEnrichingTitlesUrls);

  const headerProgress = useMemo(() => {
    if (isPressRelease) {
      return pressReleaseHeaderProgressFromState({
        isProcessing: Boolean(pressReleaseBindings?.isProcessing),
        runPhase: pressReleaseBindings?.runPhase,
        harnessSections: pressReleaseBindings?.harnessSections ?? [],
        harnessPlannedSectionCount: pressReleaseBindings?.harnessPlannedSectionCount ?? null,
      });
    }
    if (bulkBindings?.isGeneratingChecklist) {
      const pct = bulkBindings.checklistProgressPct;
      return {
        phase: bulkBindings.checklistPhase?.trim() || "Generating blog ideas",
        completed: 0,
        total: 1,
        progressPct: typeof pct === "number" ? pct : 0,
        harnessActive: false,
      };
    }
    return blogImportHeaderProgressFromBulk({
      status: bulkBindings?.status,
      isProcessing: bulkBindings?.isProcessing,
      harnessSections: bulkBindings?.harnessSections,
      harnessPlannedSectionCount: bulkBindings?.harnessPlannedSectionCount,
      currentRow: bulkBindings?.currentRow ?? 0,
      batchRowProgress:
        Boolean(bulkBindings?.isProcessing) &&
        (bulkBindings?.totalRows ?? 0) > 0
          ? {
              current: bulkBindings!.currentRow,
              total: bulkBindings!.totalRows,
            }
          : undefined,
    });
  }, [isPressRelease, pressReleaseBindings, bulkBindings]);

  const progressSnapshot = useMemo(() => {
    if (isPressRelease) {
      return buildPressReleaseMicroSnapshot(headerProgress);
    }
    return buildBlogImportMicroSnapshot(headerProgress, "Studio");
  }, [headerProgress, isPressRelease]);

  const postDestinationChoices = BULK_POST_DESTINATION_CHOICES;
  const postDestination = bulkBindings?.bulkPostDestination ?? "wordpress";

  const warmSiteDetails = useOverviewSiteWarmDetails(bulkBindings?.wordPressSite ?? null);

  const mergedInventoryDetails = useMemo(() => {
    const bindingLinks = bulkBindings?.sitemapInventoryLinks ?? [];
    const links =
      warmSiteDetails.sitemapInventoryLinks.length > 0
        ? warmSiteDetails.sitemapInventoryLinks
        : bindingLinks;
    const gscHostedLink =
      warmSiteDetails.gscHostedLink ??
      bulkBindings?.gscHostedLink ??
      bulkBindings?.siteKwHostedLink ??
      null;
    const sitemapInventoryLoading =
      warmSiteDetails.sitemapInventoryLoading ||
      Boolean(bulkBindings?.sitemapInventoryLoading);
    return { links, gscHostedLink, sitemapInventoryLoading };
  }, [bulkBindings, warmSiteDetails]);

  const googleImagePipelineTitles =
    bulkBindings?.featuredImageType === "google-maps"
      ? [...GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES]
      : undefined;

  const wpConfig = bulkBindings
    ? {
        selectedWordPressSites: bulkBindings.selectedWordPressSites,
        setSelectedWordPressSites: bulkBindings.setSelectedWordPressSites,
        siteConfigs: bulkBindings.siteConfigs,
        setSiteConfigs: bulkBindings.setSiteConfigs,
        scheduleFrequency: bulkBindings.scheduleFrequency,
        setScheduleFrequency: bulkBindings.setScheduleFrequency,
        customInterval: bulkBindings.customInterval,
        setCustomInterval: bulkBindings.setCustomInterval,
        dayOfWeek: bulkBindings.dayOfWeek,
        setDayOfWeek: bulkBindings.setDayOfWeek,
        startDateOption: bulkBindings.startDateOption,
        setStartDateOption: bulkBindings.setStartDateOption,
        customStartDate: bulkBindings.customStartDate,
        setCustomStartDate: bulkBindings.setCustomStartDate,
        startTime: bulkBindings.startTime,
        setStartTime: bulkBindings.setStartTime,
        useCsvPublishDates: bulkBindings.useCsvPublishDates,
        setUseCsvPublishDates: bulkBindings.setUseCsvPublishDates,
        wordpressDraftOnly: bulkBindings.wordpressDraftOnly,
        setWordpressDraftOnly: bulkBindings.setWordpressDraftOnly,
        previewRows: bulkBindings.previewRows,
        rowOrder: bulkBindings.rowOrder,
        setRowOrder: bulkBindings.setRowOrder,
        connectedSite: bulkBindings.connectedSite,
        postDestination: bulkBindings.bulkPostDestination,
        setPostDestination: bulkBindings.setBulkPostDestination,
        postDestinationChoices,
        scheduleOccupancy: bulkBindings.scheduleOccupancy,
        scheduleOccupancyLoading: bulkBindings.scheduleOccupancyLoading,
      }
    : null;

  const baseDetailsProps = {
    workspaceBusy,
    headerProgress,
    isProcessing: Boolean(bulkBindings?.isProcessing),
    status: bulkBindings?.status ?? "",
    processingStepLog: bulkBindings?.processingStepLog ?? [],
    harnessSections: bulkBindings?.harnessSections ?? [],
    harnessByRow: bulkBindings?.harnessByRow ?? new Map(),
    harnessPlannedSectionCount: bulkBindings?.harnessPlannedSectionCount ?? null,
    currentRow: bulkBindings?.currentRow ?? 0,
    totalRows: bulkBindings?.totalRows ?? 0,
    displayRows: bulkBindings?.displayRows ?? [],
    postDestination,
    wpConfig,
    runKind: "content" as const,
    pipelineSectionTitles: googleImagePipelineTitles,
    entitySapRowDisplay: bulkBindings?.featuredImageType === "google-maps",
    sitemapInventoryLinks: mergedInventoryDetails.links,
    siteKwHostedLink: mergedInventoryDetails.gscHostedLink,
    sitemapInventoryLoading: mergedInventoryDetails.sitemapInventoryLoading,
  };

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
      ? ("csv" as const)
      : studioEditorMode === "blog-import"
        ? ("blog-import" as const)
        : ("prompt" as const);

  const bulkGeneratorDetailsProps = useMemo((): BulkGeneratorDetailsPanelProps | null => {
    if (!bulkBindings || isPressRelease) return null;
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
  }, [bulkBindings, isPressRelease, baseDetailsProps, mergedInventoryDetails]);

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

  const bulkGeneratedFilesStepMetrics = useMemo(() => {
    if (isPressRelease) {
      return {
        stepTotal: headerProgress?.total ?? 0,
        stepCompleted: headerProgress?.completed ?? 0,
      };
    }
    if (!bulkBindings) {
      return { stepTotal: 0, stepCompleted: 0 };
    }
    const hasActiveBatch =
      bulkBindings.isProcessing ||
      bulkBindings.hasGeneratedChecklist ||
      (bulkBindings.rows?.length ?? 0) > 0 ||
      (bulkBindings.displayRows?.length ?? 0) > 0;
    if (!hasActiveBatch) {
      return { stepTotal: 0, stepCompleted: 0 };
    }
    const harnessTotal = bulkBindings.harnessPlannedSectionCount ?? bulkBindings.harnessSections.length;
    return {
      stepTotal: harnessTotal > 0 ? harnessTotal : bulkBindings.totalRows,
      stepCompleted: bulkBindings.isProcessing
        ? bulkBindings.currentRow + 1
        : bulkBindings.stats.completed,
    };
  }, [isPressRelease, headerProgress, bulkBindings]);

  const canRunPressRelease = Boolean(
    effectiveDataForSeoApiKey?.trim() &&
      openRouterApiKey?.trim() &&
      pressReleaseBindings?.keyword.trim() &&
      pressReleaseBindings?.wordPressSite &&
      !pressReleaseBindings?.isProcessing,
  );

  const handleStudioClear = useCallback(() => {
    setImportedFileName(null);
    setFocusKeyword("");
    setTitleOverride("");
    bulkBindings?.onClearCsv();
    bulkBindings?.onClearPrompt();
  }, [bulkBindings]);

  const handleCsvPick = useCallback(
    async (file: File | null) => {
      if (!file || !bulkBindings) return;
      try {
        await bulkBindings.onPickCsvFile(file);
        notify.success(notifyLoadedCsvX(file.name));
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Failed to load CSV");
      }
    },
    [bulkBindings],
  );

  const bulkGeneratorBand2Toolbar = useMemo(() => {
    if (!bulkBindings || isPressRelease || isResearchMode) return null;
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
    isResearchMode,
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
      emptyListCopy: "Start a batch from the studio mode selector.",
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

  return (
    <div className={BLOG_GENERATOR_TAB_ROOT_CLASS}>
      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex min-h-0 flex-1 flex-col overflow-hidden pb-0",
        )}
      >
        {bulkBindings && bulkGeneratorDock ? (
          bulkBindings.wordPressSite ? (
            <BulkGeneratorOverviewTabContent
              site={bulkBindings.wordPressSite}
              bindings={bulkBindings}
              variant={studioVariant}
              studioEditorMode={studioEditorMode}
              onStudioEditorModeChange={handleStudioEditorModeChange}
              activeGeneratorSection={activeSection}
              onGeneratorSectionChange={onSectionChange}
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
              bulkGeneratedFilesStepTotal={bulkGeneratedFilesStepMetrics.stepTotal}
              bulkGeneratedFilesStepCompleted={bulkGeneratedFilesStepMetrics.stepCompleted}
              bulkGeneratorBand2Toolbar={bulkGeneratorBand2Toolbar}
              optimizerSection={optimizerSection}
              onOptimizerSectionChange={handleOptimizerSectionChange}
              focusKeyword={focusKeyword}
              onFocusKeywordChange={setFocusKeyword}
              titleOverride={titleOverride}
              onTitleOverrideChange={setTitleOverride}
              pressReleaseComposeProps={pressReleaseComposeProps}
            />
          ) : (
            <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 border border-white/10 bg-black px-6 text-center text-base text-muted-foreground">
              <p>Connect a WordPress site under Integrations to use the studio editor.</p>
            </div>
          )
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
        </div>
      </div>
    </div>
  );
}

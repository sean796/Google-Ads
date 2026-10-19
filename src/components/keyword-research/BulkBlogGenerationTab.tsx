import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BulkAutoGeneratePanel } from "./BulkAutoGeneratePanel";
import { BLOG_GENERATOR_TAB_ROOT_CLASS, BLOG_GENERATOR_WORKSPACE_BODY_CLASS, BLOG_GENERATOR_WORKSPACE_HEADER_CLASS, BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { WORKSPACE_DETAILS_DIM_OVERLAY_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { BulkGeneratorOverviewTabContent } from "@/components/keyword-research/bulk/BulkGeneratorOverviewTabContent";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/OverviewSitemapLeftDock";
import {
  BulkCsvDockToolbar,
  BulkImportDockToolbar,
  BulkPromptDockToolbar,
} from "@/components/keyword-research/bulk/bulk-generator-studio-chrome";
import {
  readStoredContentOptimizerSection,
  writeStoredContentOptimizerSection,
  type ContentOptimizerSectionId,
} from "@/components/content-optimizer/content-optimizer-sections";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import { buildPromptChecklistHarnessSections } from "@/lib/bulk/prompt-bulk-checklist-harness-sections";
import { GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES } from "@/lib/overview/overview-content-optimize-pipeline";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { BLOG_IMPORT_PIPELINE_TITLES } from "@/lib/bulk/blog-import-minimal";
import { BulkGeneratorScheduleMenu } from "@/components/keyword-research/bulk/BulkGeneratorScheduleMenu";
import { GENERATOR_TOOLBAR_SLOT_RESERVE } from "@/components/blog-generator/generator-toolbar-theme";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  BLOG_IMPORT_POST_DESTINATION_CHOICES,
  BULK_POST_DESTINATION_CHOICES,
  type WordPressPostDestination,
} from "@/lib/bulk-auto-generate";
import type { BlogImportFeaturedImage } from "@/lib/bulk/blog-import-parser";
import { isBlogImportFileAccepted } from "@/lib/bulk/blog-import-parser";
import { buildImportCsvRowFromFile } from "@/lib/bulk/blog-import-direct";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
} from "@/lib/bulk/blog-import-header-progress";
import { countBulkCsvRowsDone } from "@/lib/bulk/bulk-csv-row-run-status";
import { PressReleaseTab } from "@/components/keyword-research/PressReleaseTab";
import { PressReleaseWorkspaceBody } from "@/components/press-release/PressReleaseWorkspaceBody";
import { PressReleaseWorkspaceHeader } from "@/components/press-release/PressReleaseWorkspaceHeader";
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
  /** DataForSEO key for keyword research (CSV, Prompt, Blog import). */
  dataForSEOApiKey?: string;
  /** @deprecated Use dataForSEOApiKey */
  pressReleaseDataForSeoApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
}

const PROGRESS_LABELS = {
  csv: "CSV",
  prompt: "Prompt",
  "blog-import": "Import",
  "press-release": "PR",
} as const;

export function BulkBlogGenerationTab({
  variant,
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

  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [optimizerSection, setOptimizerSection] = useState<ContentOptimizerSectionId>(() =>
    readStoredContentOptimizerSection(),
  );

  const handleOptimizerSectionChange = useCallback((id: ContentOptimizerSectionId) => {
    setOptimizerSection(id);
    writeStoredContentOptimizerSection(id);
  }, []);

  const isCsv = variant === "csv";
  const isBlogImport = variant === "blog-import";
  const isPrompt = variant === "prompt";
  const isPressRelease = variant === "press-release";

  const [importedRows, setImportedRows] = useState<CSVRow[]>([]);
  const [uploadedImportFile, setUploadedImportFile] = useState<File | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [focusKeyword, setFocusKeyword] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [featuredImageMode, setFeaturedImageMode] = useState<BlogImportFeaturedImage>("n");
  const [entity, setEntity] = useState("");
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [bulkBindings, setBulkBindings] = useState<BulkGeneratorWorkspaceBindings | null>(null);
  const [pressReleaseBindings, setPressReleaseBindings] =
    useState<PressReleaseWorkspaceBindings | null>(null);

  const importForm = useMemo(
    () => ({ focusKeyword, titleOverride, featuredImageMode, entity }),
    [focusKeyword, titleOverride, featuredImageMode, entity],
  );

  const handleImportClear = useCallback(() => {
    setUploadedImportFile(null);
    setImportedRows([]);
    setImportedFileName(null);
    setFocusKeyword("");
    setTitleOverride("");
    setFeaturedImageMode("n");
    setEntity("");
  }, []);

  const handlePickImportFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const dest: WordPressPostDestination = bulkBindings?.bulkPostDestination ?? "direct";
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
        const next: CSVRow[] = [];
        for (const file of accepted) {
          try {
            next.push(
              await buildImportCsvRowFromFile(file, importForm, dest, apiKey, selectedModel),
            );
          } catch (error) {
            notify.error(error instanceof Error ? error.message : `Failed to read ${file.name}`);
          }
        }
        if (next.length === 0) return;
        setImportedRows((prev) => {
          const merged = [...prev, ...next];
          setImportedFileName(
            merged.length === 1
              ? merged[0]?.import_file_name ?? accepted[0]?.name ?? "1 file"
              : `${merged.length} files`,
          );
          return merged;
        });
        setUploadedImportFile(accepted[0] ?? null);
      } finally {
        setIsParsingImport(false);
      }
    },
    [bulkBindings?.bulkPostDestination, importForm, selectedModel],
  );

  const handleImportDestinationChange = useCallback(
    (v: WordPressPostDestination) => {
      bulkBindings?.setBulkPostDestination(v);
      setImportedRows((prev) => prev.map((row) => ({ ...row, post_destination: v })));
    },
    [bulkBindings],
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
      Boolean(bulkBindings?.isGeneratingChecklist);

  const headerProgress = useMemo(() => {
    if (isPressRelease) {
      return pressReleaseHeaderProgressFromState({
        isProcessing: Boolean(pressReleaseBindings?.isProcessing),
        runPhase: pressReleaseBindings?.runPhase,
        harnessSections: pressReleaseBindings?.harnessSections ?? [],
        harnessPlannedSectionCount: pressReleaseBindings?.harnessPlannedSectionCount ?? null,
      });
    }
    if (isPrompt && bulkBindings?.isGeneratingChecklist) {
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
        (isPrompt || isBlogImport) &&
        Boolean(bulkBindings?.isProcessing) &&
        (bulkBindings?.totalRows ?? 0) > 0
          ? {
              current: bulkBindings!.currentRow,
              total: bulkBindings!.totalRows,
            }
          : undefined,
      csvRowProgress:
        isCsv &&
        Boolean(bulkBindings?.isProcessing) &&
        (bulkBindings?.displayRows.length ?? 0) > 0
          ? {
              total: bulkBindings!.displayRows.length,
              done: countBulkCsvRowsDone({
                totalRows: bulkBindings!.displayRows.length,
                currentRow: bulkBindings!.currentRow,
                isProcessing: true,
                filesByRow: bulkBindings!.filesByRow,
                failedRowIndices: bulkBindings!.failedRowIndices,
              }),
            }
          : undefined,
    });
  }, [isPressRelease, pressReleaseBindings, bulkBindings, isCsv, isPrompt, isBlogImport]);

  const progressSnapshot = useMemo(() => {
    if (isPressRelease) {
      return buildPressReleaseMicroSnapshot(headerProgress);
    }
    return buildBlogImportMicroSnapshot(headerProgress, PROGRESS_LABELS[variant]);
  }, [headerProgress, variant, isPressRelease]);

  const postDestinationChoices = isBlogImport
    ? BLOG_IMPORT_POST_DESTINATION_CHOICES
    : BULK_POST_DESTINATION_CHOICES;

  const postDestination = bulkBindings?.bulkPostDestination ?? (isBlogImport ? "direct" : "wordpress");

  const warmSiteDetails = useOverviewSiteWarmDetails(
    !isPressRelease ? bulkBindings?.wordPressSite ?? null : null,
  );

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
    !isBlogImport && bulkBindings?.featuredImageType === "google-maps"
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
    pipelineSectionTitles: isBlogImport
      ? [...BLOG_IMPORT_PIPELINE_TITLES]
      : googleImagePipelineTitles,
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
    return (
      <BulkGeneratorScheduleMenu
        postDestination={postDestination}
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
        showWhenLocal={isBlogImport}
      />
    );
  }, [bulkBindings, isBlogImport, postDestination, workspaceBusy]);

  const placeholderOnlyBody = isPressRelease && !pressReleaseBindings?.resultMarkdown;

  const studioVariant = isBlogImport ? "blog-import" : isPrompt ? "prompt" : "csv";
  const showGeneratorStudio = !isPressRelease && Boolean(bulkBindings);

  const canOpenDetails =
    workspaceBusy ||
    Boolean(pressReleaseBindings?.inventoryJsonLink) ||
    Boolean(pressReleaseBindings?.resultMarkdown) ||
    Boolean(pressReleaseBindings?.keyword.trim()) ||
    Boolean(pressReleaseBindings?.title.trim());

  const canRunCsv =
    Boolean((bulkBindings?.rows.length ?? 0) > 0 && !bulkBindings?.isProcessing);

  const canRunImport = Boolean(
    importedRows.length > 0 && !bulkBindings?.isProcessing,
  );

  const blogContentFile = useMemo((): BulkGeneratedFile | undefined => {
    if (!bulkBindings) return undefined;
    const files = bulkBindings.filesByRow.get(bulkBindings.currentRow) ?? [];
    const completed = files.filter(
      (f) =>
        f.status === "completed" &&
        f.fileName.startsWith("content-") &&
        f.fileName.endsWith(".md"),
    );
    if (completed.length === 0) return undefined;
    return completed.reduce((latest, f) => (f.timestamp >= latest.timestamp ? f : latest));
  }, [bulkBindings?.filesByRow, bulkBindings?.currentRow]);

  const canDownloadBlog = Boolean(
    blogContentFile || bulkBindings?.runContentCsvAvailable,
  );

  const handleDownloadBlog = useCallback(() => {
    if (!bulkBindings) return;
    if (blogContentFile) {
      bulkBindings.downloadFile(blogContentFile);
      return;
    }
    if (bulkBindings.runContentCsvAvailable) {
      bulkBindings.downloadRunContentCsv();
    }
  }, [bulkBindings, blogContentFile]);

  const bulkGeneratorDetailsProps = useMemo((): BulkGeneratorDetailsPanelProps | null => {
    if (!bulkBindings || isPressRelease) return null;
    if (isCsv) {
      return {
        ...baseDetailsProps,
        variant: "csv",
        csvFileName: bulkBindings.csvFileName ?? null,
        rowCount: bulkBindings.rows.length ?? 0,
        filesByRow: bulkBindings.filesByRow,
        downloadFile: bulkBindings.downloadFile,
        publishDateLabelByIndex: bulkBindings.publishDateLabelByIndex,
        draftOnly: bulkBindings.wordpressDraftOnly,
        directionsSiteName: bulkBindings.connectedSite?.name,
      };
    }
    if (isPrompt) {
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
    }
    return {
      ...baseDetailsProps,
      variant: "blog-import",
      importedFileName,
      filesByRow: bulkBindings.filesByRow,
      downloadFile: bulkBindings.downloadFile,
      canDownloadBlog,
      onDownloadBlog: handleDownloadBlog,
      publishDateLabelByIndex: bulkBindings.publishDateLabelByIndex,
      draftOnly: bulkBindings.wordpressDraftOnly,
      directionsSiteName: bulkBindings.connectedSite?.name,
    };
  }, [
    bulkBindings,
    isPressRelease,
    isCsv,
    isPrompt,
    baseDetailsProps,
    mergedInventoryDetails,
    importedFileName,
    canDownloadBlog,
    handleDownloadBlog,
  ]);

  const bulkGeneratedFilesStepMetrics = useMemo(() => {
    if (!bulkBindings) {
      return { stepTotal: 0, stepCompleted: 0 };
    }
    const harnessTotal = bulkBindings.harnessPlannedSectionCount ?? bulkBindings.harnessSections.length;
    return {
      stepTotal: harnessTotal > 0 ? harnessTotal : bulkBindings.totalRows,
      stepCompleted: bulkBindings.isProcessing
        ? bulkBindings.currentRow + 1
        : bulkBindings.stats.completed,
    };
  }, [bulkBindings]);

  const canRunPressRelease = Boolean(
    effectiveDataForSeoApiKey?.trim() &&
      openRouterApiKey?.trim() &&
      pressReleaseBindings?.keyword.trim() &&
      pressReleaseBindings?.wordPressSite &&
      !pressReleaseBindings?.isProcessing,
  );

  const handleCsvClear = () => {
    bulkBindings?.onClearCsv();
  };

  const handlePromptClear = () => {
    bulkBindings?.onClearPrompt();
  };

  const handleCsvPick = async (file: File | null) => {
    if (!file || !bulkBindings) return;
    try {
      await bulkBindings.onPickCsvFile(file);
      notify.success(notifyLoadedCsvX(file.name));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load CSV");
    }
  };

  const bulkGeneratorBand2Toolbar = useMemo(() => {
    if (!bulkBindings) return null;
    if (isPrompt) {
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
          onClear={handlePromptClear}
          scheduleMenu={scheduleMenu}
        />
      );
    }
    if (isCsv) {
      return (
        <BulkCsvDockToolbar
          workspaceBusy={workspaceBusy}
          isProcessing={Boolean(bulkBindings.isProcessing)}
          rowCount={bulkBindings.rows.length ?? 0}
          postDestination={postDestination}
          onPostDestinationChange={(v) => bulkBindings.setBulkPostDestination(v)}
          postDestinationChoices={postDestinationChoices}
          featuredImagePerBlog={bulkBindings.featuredImagePerBlog ?? true}
          onFeaturedImagePerBlogChange={(v) => bulkBindings.setFeaturedImagePerBlog(v)}
          featuredImageType={bulkBindings.featuredImageType ?? "ai-generated"}
          onFeaturedImageTypeChange={(v) => bulkBindings.setFeaturedImageType(v)}
          onApplyFeaturedImageToRows={(value) => {
            const rows = bulkBindings.rows ?? [];
            rows.forEach((_, i) => bulkBindings.onCsvRowChange(i, { featuredImage: value }));
          }}
          canRun={canRunCsv}
          onRun={() => void bulkBindings.handleStartProcessing()}
          onCancel={() => bulkBindings.cancelProcessing()}
          onClear={handleCsvClear}
          scheduleMenu={scheduleMenu}
        />
      );
    }
    if (isBlogImport) {
      return (
        <BulkImportDockToolbar
          workspaceBusy={workspaceBusy}
          isProcessing={Boolean(bulkBindings.isProcessing)}
          focusKeyword={focusKeyword}
          onFocusKeywordChange={setFocusKeyword}
          titleOverride={titleOverride}
          onTitleOverrideChange={setTitleOverride}
          featuredImageMode={featuredImageMode}
          onFeaturedImageModeChange={setFeaturedImageMode}
          entity={entity}
          onEntityChange={setEntity}
          postDestination={postDestination}
          onPostDestinationChange={handleImportDestinationChange}
          postDestinationChoices={postDestinationChoices}
          canRun={canRunImport}
          onRun={() => void bulkBindings.handleStartProcessing()}
          onCancel={() => bulkBindings.cancelProcessing()}
          onClear={handleImportClear}
          canDownloadBlog={canDownloadBlog}
          onDownloadBlog={handleDownloadBlog}
          scheduleMenu={scheduleMenu}
        />
      );
    }
    return null;
  }, [
    bulkBindings,
    isPrompt,
    isCsv,
    isBlogImport,
    workspaceBusy,
    postDestination,
    postDestinationChoices,
    scheduleMenu,
    handlePromptClear,
    handleCsvClear,
    canRunCsv,
    canRunImport,
    focusKeyword,
    titleOverride,
    featuredImageMode,
    entity,
    handleImportDestinationChange,
    canDownloadBlog,
    handleDownloadBlog,
  ]);

  const bulkGeneratorDock = useMemo((): OverviewSitemapLeftDockBulkGeneratorDock | null => {
    if (!bulkBindings) return null;
    const emptyListCopy =
      studioVariant === "prompt"
        ? "Set blog count and run Ideas to fill this list."
        : studioVariant === "blog-import"
          ? "Upload blog files with the Files control above."
          : "Upload a CSV with the CSV control above.";
    return {
      variant: studioVariant,
      emptyListCopy,
      csvLoading: false,
      importParsing: isParsingImport,
      importedFileName,
      csvFileName: bulkBindings.csvFileName,
      onPickCsvFile: handleCsvPick,
      onPickImportFiles: handlePickImportFiles,
      promptSelection: studioVariant === "prompt" && bulkBindings.hasGeneratedChecklist,
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

  return (
    <div className={BLOG_GENERATOR_TAB_ROOT_CLASS}>
      {isPressRelease ? (
        <div className={BLOG_GENERATOR_WORKSPACE_HEADER_CLASS}>
          <PressReleaseWorkspaceHeader
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            workspaceBusy={workspaceBusy}
            progressSnapshot={progressSnapshot}
            canOpenDetails={canOpenDetails}
            isProcessing={Boolean(pressReleaseBindings?.isProcessing)}
            keyword={pressReleaseBindings?.keyword ?? ""}
            onKeywordChange={(v) => pressReleaseBindings?.setKeyword(v)}
            title={pressReleaseBindings?.title ?? ""}
            onTitleChange={(v) => pressReleaseBindings?.setTitle(v)}
            canRun={canRunPressRelease}
            onRun={() => pressReleaseBindings?.onRun()}
            onClear={() => pressReleaseBindings?.onClear()}
            detailsProps={{
              isProcessing: Boolean(pressReleaseBindings?.isProcessing),
              runPhase: pressReleaseBindings?.runPhase ?? "",
              keyword: pressReleaseBindings?.keyword ?? "",
              title: pressReleaseBindings?.title ?? "",
              wordPressSite: pressReleaseBindings?.wordPressSite ?? null,
              harnessSections: pressReleaseBindings?.harnessSections ?? [],
              harnessPlannedSectionCount: pressReleaseBindings?.harnessPlannedSectionCount ?? null,
              inventoryJsonLink: pressReleaseBindings?.inventoryJsonLink ?? null,
            }}
            onDetailsOpenChange={setDetailsDrawerOpen}
          />
        </div>
      ) : null}

      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex min-h-0 flex-1 flex-col",
          placeholderOnlyBody && "overflow-y-hidden",
          showGeneratorStudio && "overflow-hidden pb-0",
        )}
      >
        {isPressRelease && detailsDrawerOpen ? (
          <div className={WORKSPACE_DETAILS_DIM_OVERLAY_CLASS} aria-hidden />
        ) : null}

        {showGeneratorStudio && bulkBindings && bulkGeneratorDock && bulkGeneratorDetailsProps ? (
          bulkBindings.wordPressSite ? (
            <BulkGeneratorOverviewTabContent
              site={bulkBindings.wordPressSite}
              bindings={bulkBindings}
              variant={studioVariant}
              workspaceBusy={workspaceBusy}
              apiKey={effectiveDataForSeoApiKey ?? ""}
              selectedModel={selectedModel ?? ""}
              temperature={temperature ?? 0.7}
              maxTokens={maxTokens ?? 4096}
              topP={topP ?? 1}
              bulkGeneratorDock={bulkGeneratorDock}
              bulkGeneratorDetailsPanel={bulkGeneratorDetailsProps}
              progressSnapshot={progressSnapshot}
              bulkGeneratedFilesStepTotal={bulkGeneratedFilesStepMetrics.stepTotal}
              bulkGeneratedFilesStepCompleted={bulkGeneratedFilesStepMetrics.stepCompleted}
              bulkGeneratorBand2Toolbar={bulkGeneratorBand2Toolbar}
              optimizerSection={optimizerSection}
              onOptimizerSectionChange={handleOptimizerSectionChange}
            />
          ) : (
            <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 border border-white/10 bg-black px-6 text-center text-base text-muted-foreground">
              <p>Connect a WordPress site under Integrations to use the studio editor.</p>
            </div>
          )
        ) : null}

        {isPressRelease ? (
          <>
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
            {pressReleaseBindings ? (
              <PressReleaseWorkspaceBody
                keyword={pressReleaseBindings.keyword}
                resultMarkdown={pressReleaseBindings.resultMarkdown}
                placeholderRowCount={BULK_GENERATOR_EMPTY_ROW_COUNT}
              />
            ) : null}
          </>
        ) : (
          <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden>
            <BulkAutoGeneratePanel
              forcedInputMode={isBlogImport ? "blog-import" : variant}
              injectedRows={isBlogImport ? importedRows : undefined}
              blogImportSourceFile={isBlogImport ? uploadedImportFile : null}
              blogImportForm={isBlogImport ? importForm : undefined}
              apiKey={effectiveDataForSeoApiKey}
              openRouterApiKey={openRouterApiKey}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              flowPurpose={flowPurpose}
              initialBulkPostDestination={isBlogImport ? "direct" : undefined}
              postDestinationChoices={isBlogImport ? BLOG_IMPORT_POST_DESTINATION_CHOICES : undefined}
              bulkGeneratorWorkspace
              onBulkGeneratorWorkspaceBindings={onBulkGeneratorWorkspaceBindings}
            />
          </div>
        )}
      </div>
    </div>
  );
}

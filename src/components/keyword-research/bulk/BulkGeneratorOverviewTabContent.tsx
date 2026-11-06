import React, { useEffect, useMemo, useRef, useState } from "react";
import { OverviewStudioRevisionsPage } from "@/components/overview/studio/OverviewStudioRevisionsPage";
import { OverviewStudioTabShell } from "@/components/overview/studio/OverviewStudioTabShell";
import {
  OverviewVisualDocCanvas,
  type BulkGeneratorStudioAction,
} from "@/components/overview/studio/OverviewVisualDocCanvas";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import { useOverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { useBulkGeneratorOverviewRowSync } from "@/hooks/bulk/use-bulk-generator-overview-row-sync";
import { usePulseAssistOverviewBridge } from "@/hooks/use-pulse-assist-overview-bridge";
import { setStudioDocRevisionsViewBridge } from "@/lib/overview/studio-doc-revisions-view-bridge";
import {
  pickLatestRowContentHtml,
  type BulkGeneratorStudioVariant,
} from "@/lib/bulk/bulk-generator-studio-rows";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { PROMPT_LOG_FILE_TYPE } from "@/lib/openrouter-prompt-trace";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/OverviewSitemapLeftDock";
import {
  bulkCsvRowPatchForSitemapSource,
  bulkGeneratorPushBindingsFromFiles,
} from "@/lib/bulk/bulk-generator-overview-row-bridge";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { getSitePrefetchOverviewRowsForSourceSync } from "@/lib/local-analysis/entity-site-warm-cache";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  BulkPromptComposePanel,
  type BulkPromptComposePanelProps,
} from "@/components/keyword-research/bulk/BulkPromptComposePanel";
import { bulkGeneratorDetailsPanelId } from "@/components/keyword-research/bulk/bulk-generator-studio-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import {
  overviewSitemapSourceToScopeTag,
  overviewSitemapSourceToUploadConfig,
} from "@/lib/bulk/bulk-sitemap-mode";
import { editorialPackageScheduleFieldsForSite } from "@/lib/bulk/editorial-bulk-schedule-presets";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ReactNode } from "react";

export type BulkGeneratorOverviewTabContentProps = {
  site: WordPressSite;
  bindings: BulkGeneratorWorkspaceBindings;
  variant: BulkGeneratorStudioVariant;
  studioEditorMode: StudioEditorModeId;
  onStudioEditorModeChange: (mode: StudioEditorModeId) => void;
  workspaceBusy: boolean;
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
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
};

export function BulkGeneratorOverviewTabContent({
  site,
  bindings,
  variant,
  studioEditorMode,
  onStudioEditorModeChange,
  workspaceBusy,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
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
}: BulkGeneratorOverviewTabContentProps) {
  const [followRunRow, setFollowRunRow] = useState(true);
  const [studioCenterView, setStudioCenterView] = useState<"document" | "revisions">("document");
  const [inFlightAutoSeoUrl, setInFlightAutoSeoUrl] = useState<string | null>(null);
  const [showingStudioModeScreen, setShowingStudioModeScreen] = useState(true);

  const patchHandlerRef = React.useRef<(displayIndex: number, patch: Partial<OverviewRow>) => void>(() => {});

  const bulkGeneratorPushContextRef = useRef<{
    displayRows: BulkGeneratorWorkspaceBindings["displayRows"];
    filesByRow: BulkGeneratorWorkspaceBindings["filesByRow"];
    siteBaseUrl: string | null;
    sitemapSource: OverviewSitemapSource;
    site: WordPressSite;
    sapInventoryRows: ReturnType<typeof getSitePrefetchOverviewRowsForSourceSync>;
  }>({
    displayRows: bindings.displayRows,
    filesByRow: bindings.filesByRow,
    siteBaseUrl: bindings.connectedSite?.siteUrl ?? site.siteUrl ?? null,
    sitemapSource: "posts",
    site,
    sapInventoryRows: [],
  });

  const ctrl = useOverviewTabController({
    site,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    optimizerSection,
    onOptimizerSectionChange,
    paginationLayoutTotal: Math.max(bindings.displayRows.length, bindings.numberOfBlogs, 1),
    studioRowSource: "bulk-generator",
    onBulkGeneratorOverviewRowPatched: (index, patch) => {
      patchHandlerRef.current(index, patch);
    },
    getBulkGeneratorPushBindings: () =>
      bulkGeneratorPushBindingsFromFiles(bulkGeneratorPushContextRef.current),
  });

  bulkGeneratorPushContextRef.current = {
    displayRows: bindings.displayRows,
    filesByRow: bindings.filesByRow,
    siteBaseUrl: bindings.connectedSite?.siteUrl ?? site.siteUrl ?? null,
    sitemapSource: ctrl.sitemapSource,
    site,
    sapInventoryRows: site?.id ? getSitePrefetchOverviewRowsForSourceSync(site, "sap") : [],
  };

  const sync = useBulkGeneratorOverviewRowSync({
    ctrl,
    bindings,
    variant,
    followRunRow,
    onFollowRunRowChange: setFollowRunRow,
  });

  patchHandlerRef.current = sync.onBulkGeneratorOverviewRowPatched;

  // When a batch starts processing, switch to document view so the user sees live streaming
  useEffect(() => {
    if (bindings.isProcessing) {
      setShowingStudioModeScreen(false);
    }
  }, [bindings.isProcessing]);

  const prevImportedFileNameRef = useRef<string | null>(null);
  const prevCsvFileNameRef = useRef<string | null>(null);

  // CSV / blog-import: show dock rows after a file is newly uploaded
  useEffect(() => {
    if (variant === "blog-import") {
      if (
        bulkGeneratorDock.importedFileName &&
        bulkGeneratorDock.importedFileName !== prevImportedFileNameRef.current
      ) {
        prevImportedFileNameRef.current = bulkGeneratorDock.importedFileName;
        setShowingStudioModeScreen(false);
      }
    } else if (variant === "csv") {
      if (bulkGeneratorDock.csvFileName) {
        prevCsvFileNameRef.current = bulkGeneratorDock.csvFileName;
        setShowingStudioModeScreen(false);
      }
    }
  }, [variant, bulkGeneratorDock.importedFileName, bulkGeneratorDock.csvFileName]);

  useEffect(() => {
    if (variant !== "csv" && variant !== "blog-import") return;
    if (ctrl.displayRows.length === 0) return;
    if (ctrl.selectedCount > 0) return;
    ctrl.toggleSelectPageRows(ctrl.displayRows);
  }, [
    variant,
    bindings.csvFileName,
    ctrl,
    ctrl.displayRows,
    ctrl.displayRows.length,
    ctrl.selectedCount,
    ctrl.toggleSelectPageRows,
  ]);

  const sapInventoryRows = useMemo(
    () => (site?.id ? getSitePrefetchOverviewRowsForSourceSync(site, "sap") : []),
    [site],
  );

  const prevEditorialScheduleKeyRef = useRef("");
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Left dock Posts / Pages / SAP → site upload config (only when source or site changes).
  useEffect(() => {
    const siteId = bindings.wordPressSite?.id;
    if (!siteId) return;
    const upload = overviewSitemapSourceToUploadConfig(ctrl.sitemapSource);
    const scopeTag = overviewSitemapSourceToScopeTag(ctrl.sitemapSource);
    bindings.setSiteConfigs((prev) => {
      const cur = prev[siteId];
      if (
        cur?.sitemapType === upload.sitemapType &&
        cur?.wordpressRestEndpoint === upload.wordpressRestEndpoint &&
        cur?.scopeTags?.[0] === scopeTag
      ) {
        return prev;
      }
      return {
        ...prev,
        [siteId]: {
          ...cur,
          sitemapType: upload.sitemapType,
          wordpressRestEndpoint: upload.wordpressRestEndpoint,
          scopeTags: [scopeTag],
        },
      };
    });

    const editorialKey = `${siteId}:${scopeTag}`;
    if (prevEditorialScheduleKeyRef.current !== editorialKey) {
      prevEditorialScheduleKeyRef.current = editorialKey;
      const fields = editorialPackageScheduleFieldsForSite(
        site,
        scopeTag,
        bindings.customStartDate,
      );
      if (fields) {
        bindings.setScheduleFrequency(fields.scheduleFrequency);
        bindings.setCustomInterval(fields.customInterval);
        bindings.setDayOfWeek(1);
        bindings.setStartDateOption(fields.startDateOption);
        bindings.setCustomStartDate(fields.customStartDate);
        bindings.setStartTime(fields.startTime);
      }
    }
  }, [ctrl.sitemapSource, bindings, bindings.wordPressSite?.id, bindings.setSiteConfigs, site, site?.id, site?.siteUrl]);

  // Rewrite CSV destination paths when dock source (or SAP inventory) changes — not during URL enrich.
  useEffect(() => {
    const b = bindingsRef.current;
    if (variant !== "csv" || b.csvEnrichingTitlesUrls || b.displayRows.length === 0) return;
    const siteBase = b.connectedSite?.siteUrl ?? site?.siteUrl ?? null;
    const changedPatches: Array<{ index: number; patch: Partial<CSVRow> }> = [];
    b.displayRows.forEach((row, index) => {
      const patch = bulkCsvRowPatchForSitemapSource(row, siteBase, ctrl.sitemapSource, {
        site,
        sapInventoryRows,
      });
      if (
        row.destination_url !== patch.destination_url ||
        row.sitemap_type !== patch.sitemap_type
      ) {
        changedPatches.push({ index, patch });
      }
    });
    if (changedPatches.length === 0) return;
    if (b.onBatchDisplayRowsChange) {
      b.onBatchDisplayRowsChange(changedPatches);
    } else {
      changedPatches.forEach(({ index, patch }) => {
        b.onDisplayRowChange(index, patch);
      });
    }
  }, [variant, ctrl.sitemapSource, site, site?.id, site?.siteUrl, sapInventoryRows, sapInventoryRows.length]);

  useEffect(() => {
    if (
      (variant === "prompt" && !bindings.hasGeneratedChecklist) ||
      (variant === "blog-import" && !bulkGeneratorDock.importedFileName) ||
      (variant === "csv" && !bulkGeneratorDock.csvFileName)
    ) {
      ctrl.setExpandedPageUrl(null);
      return;
    }
    if (ctrl.expandedPageUrl) {
      const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
      const exists = ctrl.displayRows.some((r) => normalizePageUrlKey(r.url) === activeKey);
      if (exists) return;
    }
    const firstUrl = ctrl.displayRows[0]?.url;
    if (firstUrl) ctrl.setExpandedPageUrl(firstUrl);
  }, [
    ctrl,
    ctrl.expandedPageUrl,
    ctrl.displayRows,
    ctrl.setExpandedPageUrl,
    variant,
    bindings.hasGeneratedChecklist,
    bulkGeneratorDock.importedFileName,
    bulkGeneratorDock.csvFileName,
  ]);

  const activeRowIndex = useMemo(() => sync.resolveActiveDocRowIndex(), [sync]);

  const activeRow = activeRowIndex >= 0 ? ctrl.rows[activeRowIndex] ?? null : null;

  const expandedPageTitle = useMemo(() => {
    if (!activeRow) return null;
    return activeRow.title || ctrl.wpTitlesByUrl[activeRow.url] || null;
  }, [activeRow, ctrl.wpTitlesByUrl]);

  usePulseAssistOverviewBridge({
    sitemapSource: ctrl.sitemapSource,
    expandedPageUrl: activeRow?.url ?? ctrl.expandedPageUrl,
    expandedPageTitle,
  });

  useEffect(() => {
    setStudioDocRevisionsViewBridge({
      openRevisions: () => setStudioCenterView("revisions"),
    });
    return () => setStudioDocRevisionsViewBridge(null);
  }, []);

  useEffect(() => {
    setStudioCenterView("document");
  }, [activeRow?.url]);

  const bulkWorkspaceBusy = workspaceBusy || bindings.isProcessing;

  const canGenerateContent = useMemo(() => {
    if (bulkWorkspaceBusy) return false;
    if (studioEditorMode === "press-release") return false;
    if (variant === "csv") return (bindings.rows.length ?? 0) > 0;
    if (variant === "prompt") return bindings.hasGeneratedChecklist;
    return (bindings.displayRows.length ?? 0) > 0;
  }, [
    bulkWorkspaceBusy,
    studioEditorMode,
    variant,
    bindings.rows.length,
    bindings.hasGeneratedChecklist,
    bindings.displayRows.length,
  ]);

  const activeRowPublishable =
    activeRowIndex >= 0 &&
    Boolean(pickLatestRowContentHtml(bindings.filesByRow.get(activeRowIndex)).trim());

  const promptLogFile = useMemo(() => {
    if (activeRowIndex < 0) return null;
    const logs = (bindings.filesByRow.get(activeRowIndex) ?? []).filter(
      (f) => f.status === "completed" && f.fileName.startsWith(`${PROMPT_LOG_FILE_TYPE}-`),
    );
    const newest = logs.reduce<(typeof logs)[number] | null>(
      (best, f) => (!best || f.timestamp > best.timestamp ? f : best),
      null,
    );
    return newest ? { name: newest.fileName, content: newest.content, mimeType: newest.mimeType } : null;
  }, [activeRowIndex, bindings.filesByRow]);

  const ideationMode = studioEditorMode === "prompt" || studioEditorMode === "vertical-benchmarks";

  const bulkGeneratorStudioActions = useMemo((): BulkGeneratorStudioAction | undefined => {
    if (studioEditorMode === "press-release" && pressReleaseComposeProps) {
      return {
        stage: "generate",
        running: pressReleaseComposeProps.isProcessing,
        canRun: pressReleaseComposeProps.canRun,
        onRun: pressReleaseComposeProps.onRun,
      };
    }
    if (studioEditorMode === "press-release") return undefined;
    if (ideationMode && !bindings.hasGeneratedChecklist) {
      const generating = Boolean(
        bindings.isGeneratingChecklist || verticalBenchmarkComposeProps?.generating,
      );
      return {
        stage: "ideas",
        running: generating,
        canRun:
          !bulkWorkspaceBusy &&
          !generating &&
          (studioEditorMode === "vertical-benchmarks"
            ? (verticalBenchmarkComposeProps?.blogCount ?? 0) >= 1
            : bindings.numberOfBlogs >= 1),
        onRun: () => {
          if (studioEditorMode === "vertical-benchmarks") {
            verticalBenchmarkComposeProps?.onGenerateIdeas();
            return;
          }
          void bindings.handleGenerateChecklist();
        },
      };
    }
    if (activeRowPublishable && !bulkWorkspaceBusy) {
      return { stage: "publish", running: false, canRun: true, onRun: () => {} };
    }
    return {
      stage: ideationMode ? "approve" : "generate",
      running: bulkWorkspaceBusy,
      canRun: canGenerateContent,
      onRun: () => {
        setShowingStudioModeScreen(false);
        void bindings.handleStartProcessing();
      },
    };
  }, [
    studioEditorMode,
    pressReleaseComposeProps,
    ideationMode,
    bindings,
    verticalBenchmarkComposeProps,
    bulkWorkspaceBusy,
    activeRowPublishable,
    canGenerateContent,
  ]);

  const handleSelectStudioEditorMode = (nextMode: StudioEditorModeId) => {
    setShowingStudioModeScreen(true);
    onStudioEditorModeChange(nextMode);
  };

  const handleSelectDockUrl = (url: string) => {
    setShowingStudioModeScreen(false);
    sync.selectDocUrl(url);
  };

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

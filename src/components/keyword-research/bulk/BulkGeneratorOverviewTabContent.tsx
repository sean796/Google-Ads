import React, { useEffect, useMemo, useRef, useState } from "react";
import { OverviewStudioRevisionsPage } from "@/components/overview/studio/OverviewStudioRevisionsPage";
import { OverviewStudioTabShell } from "@/components/overview/studio/OverviewStudioTabShell";
import { OverviewVisualDocCanvas } from "@/components/overview/studio/OverviewVisualDocCanvas";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import { useOverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { useBulkGeneratorOverviewRowSync } from "@/hooks/bulk/use-bulk-generator-overview-row-sync";
import { usePulseAssistOverviewBridge } from "@/hooks/use-pulse-assist-overview-bridge";
import { setStudioDocRevisionsViewBridge } from "@/lib/overview/studio-doc-revisions-view-bridge";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
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
import { bulkGeneratorDetailsPanelId } from "@/components/keyword-research/bulk/bulk-generator-studio-chrome";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import {
  isResearchStudioMode,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";
import {
  overviewSitemapSourceToScopeTag,
  overviewSitemapSourceToUploadConfig,
} from "@/lib/bulk/bulk-sitemap-mode";
import { editorialPackageScheduleFieldsForSite } from "@/lib/bulk/editorial-bulk-schedule-presets";
import { ProposalResearchTab } from "@/components/research/proposal/ProposalResearchTab";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ReactNode } from "react";

export type BulkGeneratorOverviewTabContentProps = {
  site: WordPressSite;
  bindings: BulkGeneratorWorkspaceBindings;
  variant: BulkGeneratorStudioVariant;
  studioEditorMode: StudioEditorModeId;
  onStudioEditorModeChange: (mode: StudioEditorModeId) => void;
  activeGeneratorSection: BlogGeneratorSectionId;
  onGeneratorSectionChange: (section: BlogGeneratorSectionId) => void;
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
  bulkGeneratedFilesStepTotal: number;
  bulkGeneratedFilesStepCompleted: number;
  bulkGeneratorBand2Toolbar: ReactNode;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  focusKeyword?: string;
  onFocusKeywordChange?: (v: string) => void;
  titleOverride?: string;
  onTitleOverrideChange?: (v: string) => void;
  pressReleaseComposeProps?: BulkPromptComposePanelProps["pressRelease"];
};

export function BulkGeneratorOverviewTabContent({
  site,
  bindings,
  variant,
  studioEditorMode,
  onStudioEditorModeChange,
  activeGeneratorSection,
  onGeneratorSectionChange,
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
  bulkGeneratedFilesStepTotal,
  bulkGeneratedFilesStepCompleted,
  bulkGeneratorBand2Toolbar,
  optimizerSection,
  onOptimizerSectionChange,
  focusKeyword,
  onFocusKeywordChange,
  titleOverride,
  onTitleOverrideChange,
  pressReleaseComposeProps,
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
      if (
        bulkGeneratorDock.csvFileName &&
        bulkGeneratorDock.csvFileName !== prevCsvFileNameRef.current
      ) {
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
  }, [ctrl.sitemapSource, bindings.wordPressSite?.id, bindings.setSiteConfigs, site, bindings.customStartDate]);

  // Rewrite CSV destination paths when dock source (or SAP inventory) changes — not during URL enrich.
  useEffect(() => {
    const b = bindingsRef.current;
    if (b.csvEnrichingTitlesUrls || b.displayRows.length === 0) return;
    const siteBase = b.connectedSite?.siteUrl ?? site.siteUrl ?? null;
    b.displayRows.forEach((row, index) => {
      b.onDisplayRowChange(
        index,
        bulkCsvRowPatchForSitemapSource(row, siteBase, ctrl.sitemapSource, {
          site,
          sapInventoryRows,
        }),
      );
    });
  }, [ctrl.sitemapSource, site, sapInventoryRows]);

  useEffect(() => {
    if (ctrl.expandedPageUrl) {
      const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
      const exists = ctrl.displayRows.some((r) => normalizePageUrlKey(r.url) === activeKey);
      if (exists) return;
    }
    if (
      (variant === "prompt" && !bindings.hasGeneratedChecklist) ||
      (variant === "blog-import" && !bulkGeneratorDock.importedFileName) ||
      (variant === "csv" && !bulkGeneratorDock.csvFileName)
    ) {
      ctrl.setExpandedPageUrl(null);
      return;
    }
    const firstUrl = ctrl.displayRows[0]?.url;
    if (firstUrl) ctrl.setExpandedPageUrl(firstUrl);
  }, [
    ctrl.expandedPageUrl,
    ctrl.displayRows,
    ctrl.setExpandedPageUrl,
    variant,
    bindings.hasGeneratedChecklist,
    bulkGeneratorDock.importedFileName,
    bulkGeneratorDock.csvFileName,
  ]);

  const activeRowIndex = useMemo(
    () => sync.resolveActiveDocRowIndex(),
    [sync.resolveActiveDocRowIndex, ctrl.expandedPageUrl, ctrl.rows, ctrl.sitemapSource],
  );

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
    if (studioEditorMode === "press-release" || isResearchStudioMode(studioEditorMode)) {
      return false;
    }
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

  const bulkGeneratorStudioActions = useMemo(() => {
    if (studioEditorMode === "press-release" || isResearchStudioMode(studioEditorMode)) {
      return undefined;
    }
    return {
      onGenerateContent: () => void bindings.handleStartProcessing(),
      canGenerateContent,
    };
  }, [studioEditorMode, bindings.handleStartProcessing, canGenerateContent]);

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
    (isResearchStudioMode(studioEditorMode) ||
      studioEditorMode === "press-release" ||
      showingStudioModeScreen ||
      !activeRow ||
      (studioEditorMode === "prompt" && !bindings.hasGeneratedChecklist) ||
      (studioEditorMode === "blog-import" && !bulkGeneratorDock.importedFileName) ||
      (studioEditorMode === "csv" && !bulkGeneratorDock.csvFileName));

  const generatorChrome = useMemo(
    () => ({
      activeSection: activeGeneratorSection,
      onSectionChange: onGeneratorSectionChange,
    }),
    [activeGeneratorSection, onGeneratorSectionChange],
  );

  const studioBody: ReactNode = showModeComposeScreen ? (
    studioEditorMode === "research-proposal" ? (
      <ProposalResearchTab generatorChrome={generatorChrome} studioEmbedded />
    ) : (
      <BulkPromptComposePanel
        studioMode={studioEditorMode}
        generalIntent={bindings.generalIntent}
        onGeneralIntentChange={(v) => bindings.setGeneralIntent(v)}
        numberOfBlogs={bindings.numberOfBlogs}
        onNumberOfBlogsChange={(v) => bindings.setNumberOfBlogs(v)}
        optionalPrompt={bindings.optionalPrompt}
        onOptionalPromptChange={(v) => bindings.setOptionalPrompt(v)}
        workspaceBusy={bulkWorkspaceBusy}
        isGeneratingChecklist={bindings.isGeneratingChecklist}
        hasGeneratedChecklist={bindings.hasGeneratedChecklist}
        promptSiteContextBlocked={
          Boolean(bindings.connectedSite) && !bindings.promptSiteContextReady
        }
        onGenerateChecklist={() => void bindings.handleGenerateChecklist()}
        onApprove={() => {
          setShowingStudioModeScreen(false);
          void bindings.handleApprove();
        }}
        csvFileName={bulkGeneratorDock.csvFileName}
        onPickCsvFile={bulkGeneratorDock.onPickCsvFile}
        csvParsing={bulkGeneratorDock.csvLoading}
        csvEnrichingTitlesUrls={bulkGeneratorDock.csvEnrichingTitlesUrls}
        canStartCsvProcessing={canGenerateContent}
        onStartCsvProcessing={() => void bindings.handleStartProcessing()}
        importParsing={bulkGeneratorDock.importParsing}
        importedFileName={bulkGeneratorDock.importedFileName}
        focusKeyword={focusKeyword}
        onFocusKeywordChange={onFocusKeywordChange}
        titleOverride={titleOverride}
        onTitleOverrideChange={onTitleOverrideChange}
        onPickImportFiles={bulkGeneratorDock.onPickImportFiles}
        pressRelease={pressReleaseComposeProps}
      />
    )
  ) : undefined;

  return (
    <OverviewStudioTabShell
      dock={{
        ctrl,
        activeUrl: activeRow?.url ?? null,
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
            bulkGeneratorDetailsPanel={bulkGeneratorDetailsPanel ?? undefined}
            customDrawerContent={customDrawerContent}
            bulkGeneratedFilesPanelId={bulkGeneratorDetailsPanelId(variant)}
            bulkGeneratedFilesStepTotal={bulkGeneratedFilesStepTotal}
            bulkGeneratedFilesStepCompleted={bulkGeneratedFilesStepCompleted}
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

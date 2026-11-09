import { useEffect, useMemo, useRef } from "react";
import { FileText, Play, RefreshCw, Sparkles, Upload } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { OverviewDocSectionBlocks } from "@/components/overview/studio/OverviewDocSectionBlock";
import { buildElementorPageHtml } from "@/lib/elementor-page-content/elementor-page-html";
import {
  isTruncatedAiseoSourceBody,
  resolveAiseoHarnessSourceHtml,
  resolveAiseoHarnessSourceHtmlFromCache,
  scoreAiseoSourceBody,
} from "@/lib/overview/overview-aiseo-source-html";
import { overviewStudioRowFromWarmInventory } from "@/lib/overview/overview-studio-row-inventory-merge";
import { isOverviewRowOptimizationActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { metaDisplayTitle, bulkStudioRowPathLabel, bulkStudioRowPublicUrl, overviewRowUrlPathLabel, overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { setStudioDocMetaInspectorBridge } from "@/lib/overview/studio-doc-meta-bridge";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import { useBulkSplashAiStatus } from "@/hooks/bulk/use-bulk-splash-ai-status";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { ContentOptimizerSplashOverlay } from "@/components/overview/studio/ContentOptimizerSplashOverlay";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import { UniversalStudioHeader } from "@/components/overview/studio/UniversalStudioHeader";
import { OverviewStudioDetailsDrawerContent } from "@/components/overview/studio/OverviewStudioDetailsDrawerContent";
import { useOverviewStudioDrawerSteps } from "@/components/overview/studio/use-overview-studio-drawer-steps";
import { useOverviewStudioAutoSeo, STUDIO_ACTION_STATES, type OverviewVisualDocCanvasProps } from "@/components/overview/studio/use-overview-studio-auto-seo";
import { cn } from "@/lib/utils";
import { ActionButton, Button } from "@/ui";

export function OverviewVisualDocCanvas({
  ctrl: c,
  row,
  rowIndex,
  bulkWorkspaceBusy,
  bulkMicroSnapshot,
  batchBulkState,
  optimizingRowUrl,
  onInFlightAutoSeoUrlChange,
  onOpenRevisions,
  bulkGeneratorStudioActions,
  promptLogFile = null,
  bulkGeneratorDetailsPanel,
  customDrawerContent,
  bulkGeneratedFilesPanelId = "bulk-generator-generated-files-panel",
  bulkGeneratorBand2Toolbar,
  studioBody,
  studioEditorMode,
  onStudioEditorModeChange,
  bulkTitleUrlOptimizing = false,
  bulkSplashStatusText,
  bulkSplashStatusVisual,
  composeSplashVisible = false,
  composeSplashStatusText,
  composeSplashStatusVisual,
}: OverviewVisualDocCanvasProps) {
  const isBulkGeneratorStudio = Boolean(bulkGeneratorStudioActions || studioEditorMode);
  const siteWarm = useOverviewSiteWarmDetails(c.site ?? undefined);
  const hasRow = Boolean(row && rowIndex >= 0);
  const showStudioEmptyPrompt = !c.site?.id;
  const { setSidebarOpen, setSidebarPanel } = useAgentRunsContext();
  const studioRow = useMemo(() => {
    if (!row || !c.site) return row ?? null;
    return overviewStudioRowFromWarmInventory(row, c.site, c.sitemapSource);
  }, [row, c.site, c.sitemapSource]);

  const isElementorRow = Boolean(
    !isBulkGeneratorStudio &&
      studioRow &&
      (c.sitemapSource === "pages" ||
        studioRow.contentFormat === "elementor" ||
        Boolean(studioRow.elementorDataJson?.trim())),
  );

  const bodyHtml = useMemo(() => {
    if (!studioRow) return "";
    const liveHtml = studioRow.postContentOptimized?.trim() || studioRow.postContent?.trim() || "";
    const optimizingThisRow = isOverviewRowOptimizationActive(studioRow.url, optimizingRowUrl);

    if (isBulkGeneratorStudio) {
      return liveHtml;
    }

    if (isElementorRow) {
      if (optimizingThisRow && liveHtml) return liveHtml;
      if (studioRow.elementorDataJson?.trim()) {
        return buildElementorPageHtml(studioRow.elementorDataJson);
      }
      if (c.site) {
        return (
          resolveAiseoHarnessSourceHtmlFromCache({
            row: studioRow,
            site: c.site,
            sitemapSource: c.sitemapSource,
            getInventoryMatchForUrl: c.getInventoryMatchForUrl,
          }) || liveHtml
        );
      }
      return liveHtml;
    }

    if (optimizingThisRow && liveHtml) {
      return liveHtml;
    }

    if (c.site) {
      return resolveAiseoHarnessSourceHtmlFromCache({
        row: studioRow,
        site: c.site,
        sitemapSource: c.sitemapSource,
        getInventoryMatchForUrl: c.getInventoryMatchForUrl,
      });
    }
    return liveHtml;
  }, [
    studioRow,
    isElementorRow,
    optimizingRowUrl,
    c.site,
    c.sitemapSource,
    c.getInventoryMatchForUrl,
    isBulkGeneratorStudio,
  ]);

  const siteId = c.site?.id ?? "";
  const batchKey = siteId ? `${siteId}-batch` : "";
  const activeBatchState =
    batchBulkState ?? (batchKey ? c.opt.bulkOptimizationState[batchKey] : undefined);
  const singleProgress = siteId ? c.opt.optimizationProgress[siteId] : undefined;
  const batchProgress = batchKey ? c.opt.optimizationProgress[batchKey] : undefined;
  const isViewedRowOptimizing = Boolean(
    row && isOverviewRowOptimizationActive(row.url, optimizingRowUrl),
  );
  const busy = isViewedRowOptimizing;

  const { site, sitemapSource, getInventoryMatchForUrl, updateRow } = c;
  const autoHydratedUrlSetRef = useRef(new Set<string>());
  useEffect(() => {
    if (isBulkGeneratorStudio || busy) return;
    if (!site || !studioRow?.url?.trim() || rowIndex < 0) return;
    const urlKey = studioRow.url.trim().toLowerCase();
    const hasElementorData = Boolean(
      studioRow.elementorDataJson?.trim() ||
        (studioRow.elementorSectionHeaders && studioRow.elementorSectionHeaders.length > 0),
    );
    if (isElementorRow ? (hasElementorData || Boolean(bodyHtml.trim())) : (bodyHtml.trim() && !isTruncatedAiseoSourceBody(bodyHtml))) {
      return;
    }
    if (autoHydratedUrlSetRef.current.has(urlKey)) return;
    autoHydratedUrlSetRef.current.add(urlKey);

    let cancelled = false;
    void resolveAiseoHarnessSourceHtml({
      row: studioRow,
      site,
      sitemapSource,
      getInventoryMatchForUrl,
    }).then((res) => {
      if (cancelled) return;
      const resolved = res.html?.trim() ?? "";
      if (resolved && scoreAiseoSourceBody(resolved) > scoreAiseoSourceBody(bodyHtml)) {
        updateRow(rowIndex, {
          postContent: resolved,
          postContentOptimized: studioRow.postContentOptimized?.trim()
            ? studioRow.postContentOptimized
            : resolved,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isBulkGeneratorStudio,
    isElementorRow,
    busy,
    site,
    sitemapSource,
    getInventoryMatchForUrl,
    updateRow,
    studioRow,
    rowIndex,
    bodyHtml,
  ]);

  const { handleAutoSeo, fullAutoRunning, passageStatus, setPassageStatus } =
    useOverviewStudioAutoSeo({
      c,
      row,
      bodyHtml,
      onInFlightAutoSeoUrlChange,
      isViewedRowOptimizing,
    });

  const { drawerStepRows, effectiveSnapshot, activeOptimizingSectionTitle } =
    useOverviewStudioDrawerSteps({
      c,
      row,
      isBulkGeneratorStudio,
      activeBatchState,
      busy,
      isViewedRowOptimizing,
      bulkMicroSnapshot,
      passageStatus,
      fullAutoRunning,
      studioRow,
      isElementorRow,
      bodyHtml,
      siteId,
    });


  const bandBusy =
    isBulkGeneratorStudio ? bulkWorkspaceBusy || busy || bulkTitleUrlOptimizing : busy;

  const rowPipelineActive = Boolean(
    row?.status &&
      row.status !== "idle" &&
      row.status !== "error" &&
      row.status !== "uploading",
  );

  const optimizerSplashActive =
    !isBulkGeneratorStudio &&
    !studioBody &&
    hasRow &&
    row?.status !== "error" &&
    (busy || fullAutoRunning || rowPipelineActive);

  const rawTitleForSplash = hasRow && row ? metaDisplayTitle(row, c.wpTitlesByUrl) : "";
  const optimizerLatestStep =
    passageStatus?.label?.trim() ||
    effectiveSnapshot?.statusMessage?.trim() ||
    effectiveSnapshot?.label?.trim() ||
    activeBatchState?.currentStepProgress?.message?.trim() ||
    activeBatchState?.currentStep?.trim() ||
    (row?.status === "scraping" ? "Syncing live WordPress post and fields" : "") ||
    (fullAutoRunning ? "Optimizing all article sections, title, meta, and FAQs" : "") ||
    "Optimizing article sections";

  const optimizerSplashStatus = useBulkSplashAiStatus({
    active: optimizerSplashActive,
    latestStep: optimizerLatestStep,
    articleTitle: rawTitleForSplash || row?.title || undefined,
    keyword: row?.focusKeyword || undefined,
    siteName: c.site?.name || undefined,
  });

  const bulkContentSplashVisible =
    !studioBody &&
    hasRow &&
    row?.status !== "error" &&
    (isBulkGeneratorStudio
      ? bulkWorkspaceBusy || busy || rowPipelineActive
      : optimizerSplashActive);

  const effectiveSplashStatusText = isBulkGeneratorStudio
    ? bulkSplashStatusText
    : optimizerSplashStatus.status;
  const effectiveSplashStatusVisual = isBulkGeneratorStudio
    ? bulkSplashStatusVisual
    : optimizerSplashStatus.visual;

  // Sync the active row's SERP & Meta inspector into the existing right-hand Pulse Engine sidebar
  useEffect(() => {
    if (!row || rowIndex < 0) {
      setStudioDocMetaInspectorBridge(null);
      return;
    }
    setStudioDocMetaInspectorBridge({
      row,
      rowIndex,
      busy,
      onUpdateRow: c.updateRow,
      onAiKeyword: c.handleAiKeywordRow,
      onAiUrl: c.handleAiUrlRow,
      onAiTitle: c.handleAiTitleRow,
      onAiMeta: c.handleAiMetaRow,
      onAiAllMeta: c.handleAiAllMetaRow,
      onResearchRow: c.handleDataForSeoResearch,
      onSetDateToday: c.handleSetDateToday,
      onCommitDateModifier: c.commitRowDateModifier,
    });
  }, [
    row,
    rowIndex,
    busy,
    c.updateRow,
    c.handleAiKeywordRow,
    c.handleAiUrlRow,
    c.handleAiTitleRow,
    c.handleAiMetaRow,
    c.handleAiAllMetaRow,
    c.handleDataForSeoResearch,
    c.handleSetDateToday,
    c.commitRowDateModifier,
  ]);

  useEffect(() => {
    return () => {
      setStudioDocMetaInspectorBridge(null);
    };
  }, []);

  const openMastraSidebar = () => {
    setSidebarPanel("seo");
    writeSidebarPanel("seo");
    setSidebarOpen(true);
    writeSidebarOpen(true);
  };

  const rawTitle = hasRow && row ? metaDisplayTitle(row, c.wpTitlesByUrl) : "";
  const displayTitle =
    hasRow && row
      ? overviewTitlePrimarySegment(rawTitle) ||
        (isBulkGeneratorStudio ? bulkStudioRowPathLabel(row) : overviewRowUrlPathLabel(row.url)) ||
        row.url
      : isBulkGeneratorStudio
        ? "Blog batch studio"
        : "Visual document studio";

  const drawerBody = (
    <OverviewStudioDetailsDrawerContent
      customDrawerContent={customDrawerContent}
      bulkGeneratorDetailsPanel={bulkGeneratorDetailsPanel}
      hasSite={Boolean(c.site)}
      siteWarm={siteWarm}
      drawerStepRows={drawerStepRows}
    />
  );

  const studioActionButtons = (
    <>
      {!isBulkGeneratorStudio && hasRow ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void c.handleScrapeRow(rowIndex)}
          title="Re-scrape live WordPress HTML & ACF fields"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>Sync</span>
        </Button>
      ) : null}

      {!isBulkGeneratorStudio && hasRow && row ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={handleAutoSeo}
          title="Execute Auto SEO pipeline (chains all selected posts if multiple are selected)"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="break-words">{c.selectedCount > 1 ? `Auto SEO (${c.selectedCount})` : "Auto SEO"}</span>
        </Button>
      ) : null}

      {bulkGeneratorStudioActions ? (
        (() => {
          const a = bulkGeneratorStudioActions;
          const publishing = a.stage === "publish" && row?.status === "uploading";
          const running = a.running || publishing;
          const label =
            a.stage === "publish"
              ? publishing
                ? "Publishing"
                : "Publish"
              : running
                ? a.stage === "ideas"
                  ? "Curating"
                  : "Generating"
                : a.stage === "approve"
                  ? "Approve"
                  : a.stage === "ideas"
                    ? "Ideas"
                    : "Generate";

          return (
            <ActionButton
              states={STUDIO_ACTION_STATES}
              state={label}
              icon={Play}
              disabled={
                running || (a.stage === "publish" ? !hasRow || !row : busy || !a.canRun)
              }
              onClick={() => {
                if (a.stage === "publish") {
                  if (!row) return;
                  void c.handleUpdateWordPressForRow(row, { rowIndex });
                  return;
                }
                a.onRun();
              }}
            />
          );
        })()
      ) : null}

      {!bulkGeneratorStudioActions ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy || !hasRow || !row || row?.status === "uploading"}
          onClick={() => {
            if (!row) return;
            void c.handleUpdateWordPressForRow(row, { rowIndex });
          }}
          title="Publish staged meta, prose, and FAQs to WordPress"
        >
          {row?.status === "uploading" ? (
            null
          ) : (
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="break-words">{row?.status === "uploading" ? "Publishing..." : "Publish"}</span>
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-black font-sans text-base text-white">
      {/* Universal Stacked Studio Header: Row 1 (Studio Mode + External URL Link Out + Drawer Toggle), Row 2 (Filters + Actions), Details Drawer */}
      <UniversalStudioHeader
        studioEditorMode={studioEditorMode}
        onStudioEditorModeChange={onStudioEditorModeChange}
        bulkWorkspaceBusy={bulkWorkspaceBusy}
        activeUrl={row?.url ?? null}
        publicUrl={row ? bulkStudioRowPublicUrl(row, c.site?.siteUrl) : (c.site?.siteUrl ?? null)}
        titleUrlOptimizing={bulkTitleUrlOptimizing}
        urlDisplayLabel={
          bulkTitleUrlOptimizing
            ? null
            : row
              ? (bulkStudioRowPathLabel(row) || overviewRowUrlPathLabel(row.url) || row.url)
              : (c.site?.siteUrl ?? null)
        }
        siteUrl={c.site?.siteUrl ?? null}
        promptLogFile={promptLogFile}
        filters={bulkGeneratorBand2Toolbar}
        actions={studioActionButtons}
        busy={bandBusy}
        drawerContent={drawerBody}
        detailsPanelId={
          isBulkGeneratorStudio ? bulkGeneratedFilesPanelId : "opt-generated-files-panel"
        }
      />

      {studioBody ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {studioBody}
          <ContentOptimizerSplashOverlay
            visible={composeSplashVisible}
            statusText={composeSplashStatusText}
            statusVisual={composeSplashStatusVisual}
          />
        </div>
      ) : !hasRow || !row ? (
        showStudioEmptyPrompt ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-black p-8 text-center text-base text-muted-foreground">
            <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <p className="max-w-md text-white">
              {isBulkGeneratorStudio
                ? "Select a row from the left list to open it in the studio editor."
                : "Select an article from the Left Sitemap Dock to open it in the Visual Document Studio."}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 bg-black" aria-hidden />
        )
      ) : (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        <ContentOptimizerSplashOverlay
          visible={bulkContentSplashVisible}
          statusText={effectiveSplashStatusText}
          statusVisual={effectiveSplashStatusVisual}
        />
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-black px-4 py-6 sm:px-8",
            bulkContentSplashVisible && "invisible pointer-events-none",
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col bg-black px-6 py-7 sm:px-10 sm:py-9">
            <OverviewDocSectionBlocks
              row={studioRow ?? row}
              rowIndex={rowIndex}
              sitemapSource={c.sitemapSource}
              siteId={c.site?.id}
              siteUrl={c.site?.siteUrl}
              businessName={c.site?.name}
              isElementorRow={isElementorRow}
              bodyHtml={bodyHtml}
              busy={busy}
              onUpdateRow={c.updateRow}
              onAiAnswer={c.handleAiAnswerRow}
              onAiOverview={c.handleAiOverviewRow}
              onAiHeaders={c.handleAiHeadersRow}
              onAiLinks={c.handleAiLinksRow}
              onAiWikipediaLink={c.handleAiWikipediaLinkRow}
              onAiScenario={c.handleAiScenarioRow}
              onAiInContentImage={c.handleAiInContentImageRow}
              onAiFaqAll={c.handleAiFaqRowAll}
              onAiFaqQuestion={c.handleAiFaqQuestion}
              onAiFaqAnswer={c.handleAiFaqAnswer}
              onPassageStatusChange={setPassageStatus}
              activeOptimizingSectionTitle={activeOptimizingSectionTitle}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
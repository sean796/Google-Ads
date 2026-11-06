import { GitMerge } from "lucide-react";
import { SitemapUrlOptimizerPanel } from "@/components/research/sitemap-optimizer/SitemapUrlOptimizerPanel";
import { SitemapOptimizerContentSheetGrid } from "@/components/research/sitemap-optimizer/SitemapOptimizerContentSheetGrid";
import { SitemapOptimizerGridRankMathGrid } from "@/components/research/sitemap-optimizer/SitemapOptimizerGridRankMathGrid";
import { SitemapMergePublishWorkspace } from "@/components/research/sitemap-optimizer/SitemapMergePublishWorkspace";
import { SitemapOptimizerUnifiedHeader } from "@/components/research/sitemap-optimizer/SitemapOptimizerUnifiedHeader";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { WorkspaceEmptyRowStripes } from "@/components/shared/WorkspaceEmptyRowStripes";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import { useSitemapOptimizerResearchWorkspace } from "@/components/research/sitemap-optimizer/use-sitemap-optimizer-research-workspace";

export function SitemapOptimizerResearchTab() {
  const {
    workspaceSubMode,
    handleWorkspaceSubModeChange,
    modeSwitchDisabled,
    workspaceBusy,
    busy,
    showToolbarOptions,
    showSetupToolbar,
    showResultToolbar,
    showAnalyzeAction,
    showGscCsvUpload,
    showRankMathUpload,
    inPublishWorkspace,
    isGridHarness,
    isGridFlow,
    isRedirectMapHarness,
    hasResult,
    siteReady,
    workspaceMode,
    site,
    approving,
    approveProgress,
    rankMathImport,
    running,
    cancel,
    mergeGroupCount,
    collectionOptions,
    selected,
    selectCollection,
    gscFileName,
    gscPagesUpload,
    setGscPagesUpload,
    setGscFileName,
    setResult,
    result,
    replacementSheet,
    handleDownloadRedirectMapTemplate,
    handleGscFile,
    handleRankMathFile,
    handleAnalyze,
    handleApprovePlan,
    handleDownloadRedirects,
    handleExportContentSheetCsv,
    handleCopyMd,
    planProgressSnapshot,
    planCanOpenDetails,
    mergePublishActive,
    mergePublishCanOpenDetails,
    mergePublishProgressSnapshot,
    mergePublishDetailsInput,
    planHeaderProgress,
    activeProgress,
    selectedInventoryKey,
    error,
    progress,
    urlBindings,
    onUrlOptimizerWorkspaceBindings,
    placeholderOnlyBody,
    isGridResult,
    gridResultTab,
    setGridResultTab,
    gscUploadCount,
    resultSummaryLine,
    resultBreakdownLine,
    setPublishWorkspaceActive,
  } = useSitemapOptimizerResearchWorkspace();
  return (
    <div className={SEO_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
      <SitemapOptimizerUnifiedHeader
        workspaceSubMode={workspaceSubMode}
        onWorkspaceSubModeChange={handleWorkspaceSubModeChange}
        modeSwitchDisabled={modeSwitchDisabled}
        workspaceBusy={workspaceBusy}
        planToolbarProps={{
          busy,
          workspaceBusy: busy,
          showToolbarOptions,
          showSetupToolbar,
          showResultToolbar,
          showAnalyzeAction,
          showGscCsvUpload,
          showRankMathUpload,
          inPublishWorkspace,
          isGridHarness,
          isGridFlow,
          isRedirectMapHarness,
          hasResult,
          siteReady,
          workspaceMode,
          siteConnected: Boolean(site),
          approving,
          rankMathImportRunning: rankMathImport.running,
          mergeGroupCount,
          collectionOptions,
          selected,
          selectCollection,
          gscFileName,
          gscUploadRowCount: gscPagesUpload?.length,
          resultRowCount: result?.rows.length ?? 0,
          resultContentSheetCount: replacementSheet.length,
          onDownloadRedirectMapTemplate: handleDownloadRedirectMapTemplate,
          onGscFile: handleGscFile,
          onRankMathFile: handleRankMathFile,
          onClearGscUpload: () => {
            setGscPagesUpload(null);
            setGscFileName(null);
            setResult(null);
          },
          onAnalyze: handleAnalyze,
          onCancel: () => {
            if (rankMathImport.running) {
              rankMathImport.cancel();
            } else if (running) {
              cancel();
            }
          },
          onBackToMergePlan: () => setPublishWorkspaceActive(false),
          onApprovePlan: () => void handleApprovePlan(),
          onDownloadRedirects: handleDownloadRedirects,
          onExportContentSheetCsv: handleExportContentSheetCsv,
          onCopyReport: handleCopyMd,
        }}
        planProgressSnapshot={planProgressSnapshot}
        planCanOpenDetails={planCanOpenDetails}
        planIsProcessing={busy}
        planBusy={busy}
        mergePublishActive={mergePublishActive}
        mergePublishCanOpenDetails={mergePublishCanOpenDetails}
        mergePublishProgressSnapshot={mergePublishProgressSnapshot}
        mergePublishIsProcessing={approving}
        mergePublishDetailsInput={mergePublishDetailsInput}
        planDetailsProps={{
          workspaceBusy: busy,
          headerProgress: planHeaderProgress,
          analyzeProgress: activeProgress,
          approveProgress: approving ? approveProgress : null,
          selectedInventory: selectedInventoryKey,
          gscFileName,
          gscUploadRowCount: gscPagesUpload?.length,
          isRedirectMapHarness,
          rankMathImportSummary: rankMathImport.importSummary,
          error,
          rankMathError: rankMathImport.error,
          siteConnected: Boolean(site),
          workspaceMode,
        }}
        urlBindings={urlBindings}
      />
      </div>

      <div
        className={cn(
          SEO_WORKSPACE_BODY_SCROLL_CLASS,
          "relative",
          placeholderOnlyBody && "overflow-y-hidden",
        )}
      >
      {workspaceSubMode === "url_optimizer" ? (
        <SitemapUrlOptimizerPanel
          urlOptimizerWorkspace
          onUrlOptimizerWorkspaceBindings={onUrlOptimizerWorkspaceBindings}
        />
      ) : result ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3 pt-0">
          {inPublishWorkspace ? (
            <SitemapMergePublishWorkspace
              approveProgress={approveProgress}
              approving={approving}
            />
          ) : (
            <>
              {isGridResult ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      pressed={gridResultTab === "redirects"}
                      type="button"
                      onClick={() => setGridResultTab("redirects")}
                    >
                      Redirects ({result.rows.length})
                    </Button>
                    <Button
                      pressed={gridResultTab === "content"}
                      type="button"
                      onClick={() => setGridResultTab("content")}
                    >
                      Content plans ({replacementSheet.length})
                    </Button>
                    <span className="text-base text-muted-foreground">
                      {gscUploadCount != null ? `${gscUploadCount} CSV rows · ` : ""}
                      {result.merges.length} destination(s)
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    {gridResultTab === "redirects" ? (
                      <SitemapOptimizerGridRankMathGrid result={result} />
                    ) : (
                      <SitemapOptimizerContentSheetGrid
                        sheet={replacementSheet}
                        runMode={result.runMode}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="shrink-0 py-2 text-base text-muted-foreground">
                    <GitMerge className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom text-primary" />
                    {gscUploadCount != null ? `${gscUploadCount} in CSV · ` : ""}
                    {resultSummaryLine}
                    {resultBreakdownLine ? (
                      <>
                        <br />
                        {resultBreakdownLine}
                      </>
                    ) : null}
                  </p>
                  <div className="min-h-0 flex-1">
                    {replacementSheet.length > 0 ? (
                      <SitemapOptimizerContentSheetGrid
                        sheet={replacementSheet}
                        runMode={result.runMode}
                        replacementsOnly
                      />
                    ) : (
                      <p className="text-base text-muted-foreground">
                        No replacement posts needed. Nothing to redirect or generate.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <WorkspaceEmptyRowStripes />
      )}
      </div>
    </div>
  );
}

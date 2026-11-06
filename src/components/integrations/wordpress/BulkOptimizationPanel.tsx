import React from "react";

import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { partitionPeerDetailFiles } from "@/lib/overview/overview-peer-csv-details";
import {
  Button,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
} from "@/ui";
import {
  downloadFile,
  type BulkOptimizationPanelProps,
} from "./bulk-optimization-panel-helpers";
import { useBulkOptimizationPanelState } from "./use-bulk-optimization-panel-state";
import { BulkOptimizationDetailsDrawerView } from "./BulkOptimizationDetailsDrawerView";
import { BulkOptimizationTargetRowItem } from "./BulkOptimizationTargetRowItem";

function BulkProgressBar({
  value,
  indeterminate,
}: {
  value?: number;
  indeterminate?: boolean;
}) {
  if (indeterminate) {
    return (
      <div className="neo-pulse-competitor-progress-track rounded-sm">
        <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
      </div>
    );
  }
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="neo-pulse-competitor-progress-track rounded-sm">
      <div
        className="neo-pulse-competitor-progress-fill rounded-sm transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

export const BulkOptimizationPanel: React.FC<BulkOptimizationPanelProps> = (
  props,
) => {
  const panel = useBulkOptimizationPanelState(props);
  const {
    variant, isDetailsOnly, bulkState, onRequestClose, pageTitle, pageSubtitle,
    onUploadToWordPress, totalCount, completedCount, skippedCount, errorCount,
    currentIndex, allComplete, isHarnessParallelRun, harnessDetailsOpen,
    setHarnessDetailsOpen, harnessPagesDone, totalBulkPages, showBulkPagination,
    uiPageIndex, setUiPageIndex, bulkPageSize, visibleUrls,
    harnessPagesPct, isBulkAiAllMetaRun, batchPeerLibraryFiles,
    showWpUploadBatchHarness, wpUploadBatchHarnessSections, isInitialLoading,
    initialLoadingMessage, overallProgress, processedCount, isBulkExtraTextRun,
    isBulkResearchRun, isBulkWpUploadRun, showBatchPrepHarness,
    batchPrepHarnessSections, BULK_ROW_GRID, handleCopyReport,
    handleDownloadCSV, urls, urlKeywords,
  } = panel;

  if (isDetailsOnly) {
    return <BulkOptimizationDetailsDrawerView panel={panel} />;
  }


  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-transparent shadow-none",
        isDetailsOnly ? "min-h-0" : "min-h-0 flex-1 overflow-hidden",
        variant === "modal" && "max-h-[90vh]",
        variant === "page" &&
          !isDetailsOnly &&
          (!isHarnessParallelRun || harnessDetailsOpen) &&
          "max-h-[min(85vh,1200px)]",
      )}
    >
        {variant === "modal" ? (
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            Bulk optimization
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {totalCount > 0 ? (
              <>Targets: {totalCount} · Done: {completedCount}
                {skippedCount > 0 ? ` · Skipped: ${skippedCount}` : ""}
                {errorCount > 0 ? ` · Errors: ${errorCount}` : ""}
                {currentIndex < totalCount && !allComplete ? " · In progress" : ""}
              </>
            ) : (
              <>No active operations</>
            )}
          </DialogDescription>
        </DialogHeader>
        ) : !isDetailsOnly ? (
        <div className="shrink-0 px-4 pb-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {pageTitle || "Content Optimizer"}
            </h2>
            {isHarnessParallelRun && variant === "page" ? (
              <Button
                variant="quiet"
                type="button"
                onClick={() => setHarnessDetailsOpen((open) => !open)}
                aria-expanded={harnessDetailsOpen}
              >
                <ChevronDown
                  className={cn(
                    "mr-1 h-4 w-4 transition-transform",
                    harnessDetailsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
                {harnessDetailsOpen ? "Hide details" : "Show details"}
              </Button>
            ) : null}
          </div>
          {!isHarnessParallelRun ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {pageSubtitle ||
                (totalCount > 0
                  ? `Targets: ${totalCount} · Done: ${completedCount}${skippedCount > 0 ? ` · Skipped: ${skippedCount}` : ""}${errorCount > 0 ? ` · Errors: ${errorCount}` : ""}`
                  : "Bulk run")}
            </p>
          ) : null}
        </div>
        ) : null}

        <div className={cn("flex min-h-0 flex-1 flex-col", isDetailsOnly ? "overflow-hidden" : "space-y-4 px-4 pb-4")}>
        {/* Harness runs: pages-done ticker (matches workspace MetaBulkMicroProgress bar) */}
        {totalCount > 0 && isHarnessParallelRun && !isDetailsOnly && (
          <div className="shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-base font-medium leading-tight text-foreground">
                {!allComplete ? (
                  null
                ) : null}
                <span>Pages</span>
              </span>
              <span
                className="shrink-0 text-base tabular-nums text-muted-foreground"
                aria-label={`${harnessPagesDone} of ${totalCount} pages`}
              >
                {harnessPagesDone} / {totalCount}
              </span>
            </div>
            <Progress
              className="h-1.5"
              value={harnessPagesPct}
              aria-label={`${harnessPagesDone} of ${totalCount} pages`}
            />
            {variant === "page" && !harnessDetailsOpen ? (
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  onClick={() => onRequestClose({ abortingRun: false })}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Close
                </Button>
                {isBulkAiAllMetaRun && allComplete && completedCount > 0 && onUploadToWordPress ? (
                  <Button
                    variant="run"
                    type="button"
                    onClick={() => onUploadToWordPress()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload to WordPress
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {(isHarnessParallelRun && variant === "page" ? harnessDetailsOpen : true) ? (
        <>
        {(() => {
          const { planFile, combinedCsvFile, summaryFile } = partitionPeerDetailFiles({
            peers: [],
            files: batchPeerLibraryFiles,
          });
          if (!planFile && !combinedCsvFile && !summaryFile) return null;
          return (
            <div className="space-y-0 border-0 bg-transparent px-2.5 pb-2 pt-0 sm:px-3">
              <div className="flex min-h-9 w-full items-center justify-between gap-2 border-0 px-2.5 py-1.5 text-white sm:px-3">
                <span className="text-white">
                  {summaryFile && !planFile && !combinedCsvFile
                    ? "Local Image summary"
                    : "City sitemap plan"}
                </span>
              </div>
              <div className="flex min-h-9 w-full items-center justify-between gap-2 border-0 px-2.5 py-1.5 text-white sm:px-3">
                {planFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(planFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Plan
                  </Button>
                ) : null}
                {combinedCsvFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(combinedCsvFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </Button>
                ) : null}
                {summaryFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(summaryFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Summary
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })()}
        {showWpUploadBatchHarness && wpUploadBatchHarnessSections ? (
          <BulkHarnessSectionsPanel
            harnessSections={wpUploadBatchHarnessSections}
            harnessPlannedSectionCount={wpUploadBatchHarnessSections.length}
            currentRow={harnessPagesDone}
            totalRows={totalCount}
            isProcessing={!allComplete}
            hideHeader={false}
            activeIndicator="spinner"
            variant="default"
            hideProgressMicroLines={false}
          />
        ) : null}
        {totalCount > 0 && isInitialLoading && !isDetailsOnly && (
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between text-base font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Loading sitemap &amp; site data</span>
              {!isDetailsOnly ? (
                null
              ) : null}
            </div>
            <BulkProgressBar indeterminate />
            <div className="break-words text-xs text-muted-foreground" title={initialLoadingMessage}>
              {initialLoadingMessage}
            </div>
          </div>
        )}

        {/* Batch progress (content optimizer only; harness runs use per-URL status column) */}
        {totalCount > 0 && !isHarnessParallelRun && !isDetailsOnly && (
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Batch progress</span>
              <span className="tabular-nums text-foreground">{overallProgress}%</span>
            </div>
            <BulkProgressBar value={overallProgress} />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 break-words" title={isInitialLoading || isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun ? initialLoadingMessage : undefined}>
                {isInitialLoading || ((isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun) && !allComplete)
                  ? initialLoadingMessage
                  : `${processedCount} of ${totalCount} targets processed`}
              </span>
              <span className="shrink-0 tabular-nums">
                {isInitialLoading || ((isBulkAiAllMetaRun || isBulkResearchRun || isBulkWpUploadRun) && !allComplete && processedCount === 0)
                  ? `${Object.keys(urlKeywords).length} keywords ready`
                  : (isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun || isBulkWpUploadRun) &&
                      !allComplete
                    ? `${completedCount + errorCount} of ${totalCount} done`
                    : `${completedCount} done · ${skippedCount} skipped`}
              </span>
            </div>
          </div>
        )}

        {/* Target list */}
        <section
          aria-label="Bulk targets"
          className={cn(isDetailsOnly ? undefined : "min-h-0 flex-1 overflow-y-auto")}
        >
          {urls.length > 0 && (
            <div className="space-y-2">
              {showBatchPrepHarness && batchPrepHarnessSections ? (
                <div className={cn("px-3 py-2", "rounded-md bg-black/20")}>
                  <BulkHarnessSectionsPanel
                    harnessSections={batchPrepHarnessSections}
                    harnessPlannedSectionCount={batchPrepHarnessSections.length}
                    currentRow={0}
                    totalRows={1}
                    isProcessing={!allComplete}
                    hideHeader={false}
                    activeIndicator="spinner"
                    variant="default"
                    hideProgressMicroLines={false}
                  />
                </div>
              ) : null}
              {showBulkPagination ? (
                <div className="space-y-2">
                  <OverviewGridPagination
                    pageIndex={uiPageIndex}
                    totalCount={totalCount}
                    pageSize={bulkPageSize}
                    onPageChange={setUiPageIndex}
                    className="rounded-none bg-ui-field"
                  />
                  {bulkState?.currentBulkPage && !allComplete ? (
                    <p className="px-1 text-base text-muted-foreground">
                      Processing page {bulkState.currentBulkPage}/{totalBulkPages}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div
                className={cn(
                  "sticky top-0 z-10 rounded-md bg-black/40 px-3 py-2 text-base font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-sm",
                  BULK_ROW_GRID,
                )}
                role="row"
              >
                <div aria-hidden className="w-4" />
                <div className="whitespace-nowrap">Status</div>
                <div className="min-w-0">Keyword</div>
                <div className="text-right">Progress</div>
              </div>

              <ul className="space-y-2" role="list">
                {visibleUrls.map((url, localIndex) => (
                  <BulkOptimizationTargetRowItem
                    key={url}
                    url={url}
                    localIndex={localIndex}
                    panel={panel}
                  />
                ))}

              </ul>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className={cn("shrink-0 space-y-3 pt-2", isDetailsOnly ? "pb-2" : "px-4 pb-4")}>
          {/* Completion Message */}
          {allComplete && (
            <div className="flex items-center justify-center gap-2 rounded-md bg-black/20 py-3 text-base font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span>All targets finished.</span>
            </div>
          )}

          {/* Footer actions: primary button doubles as Abort/Close controller; Copy/Export when there are completed targets */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isDetailsOnly
                ? (() => {
                    const isRunningNow = totalCount > 0 && !allComplete;
                    const label = isRunningNow ? "Abort Operation" : "Close";
                    return (
                      <Button
                        onClick={() => {
                          onRequestClose({ abortingRun: isRunningNow });
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        {label}
                      </Button>
                    );
                  })()
                : null}
            </div>
            {completedCount > 0 && (
              <div className="flex items-center gap-2">
                {isBulkAiAllMetaRun && allComplete && onUploadToWordPress ? (
                  <Button
                    variant="run"
                    type="button"
                    onClick={() => onUploadToWordPress()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload to WordPress
                  </Button>
                ) : null}
                {completedCount > 0 ? (
                  <>
                <Button
                  onClick={handleCopyReport}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Copy Report
                </Button>
                <Button
                  onClick={handleDownloadCSV}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
        </>
        ) : null}
        </div>
    </div>
  );
};

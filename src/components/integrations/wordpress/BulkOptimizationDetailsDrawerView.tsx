import React from "react";

import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import {
  BulkDetailsDrawerStack,
  BulkDetailsTileSections,
} from "@/components/shared/bulk-details-tile-sections";
import {
  resolveDetailsPipelineSections,
  resolveSerpBriefDownloadable,
} from "@/components/shared/bulk-details-tile-sections-helpers";
import {
  isAiseoSimpleHarnessRunKind,
  resolveBulkRowPipelineTitles,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  buildAiseoRowDisplaySections,
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveOverviewBulkPipelineTitles } from "@/lib/overview/overview-bulk-details-bindings";
import {
  mergeGeneratedFilesByName,
  partitionPeerDetailFiles,
} from "@/lib/overview/overview-peer-csv-details";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { isOverviewRowBulkActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { MetaOptimizerPageRowCompact } from "@/components/overview/MetaOptimizerPageRowCompact";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  bulkRowLinkLabel,
  downloadAllForUrl,
  downloadFile,
  sortFilesForDisplay,
} from "./bulk-optimization-panel-helpers";
import type { useBulkOptimizationPanelState } from "./use-bulk-optimization-panel-state";

export const BulkOptimizationDetailsDrawerView: React.FC<{
  panel: ReturnType<typeof useBulkOptimizationPanelState>;
}> = ({ panel }) => {
  const {
    batchPrepHarnessSections, wpUploadBatchHarnessSections, detailsPrepOpen,
    setDetailsPrepOpen, isBulkWpUploadRun, visibleUrls, overviewRowByUrl,
    showBulkPagination, visibleStart, urlStatuses, currentIndex, bulkState,
    allComplete, urlHarnessSections, currentStepProgress, isParallelHarnessRow,
    urlGeneratedFiles, siteProgress, totalCount, expandedUrls, wpTitlesByUrl,
    drawerDateEditable, onRowDateModifierChange, onRowDateModifierCommit,
    detailsLiveMessage, setRowExpanded, urlKeywords,
  } = panel;

  const prepSections =
    batchPrepHarnessSections?.length
      ? batchPrepHarnessSections
      : wpUploadBatchHarnessSections?.length
        ? wpUploadBatchHarnessSections
        : null;
  return (
    <BulkDetailsDrawerStack
      prepSections={prepSections}
      prepOpen={detailsPrepOpen}
      onPrepOpenChange={setDetailsPrepOpen}
    >
      {(stripeBase) =>
        !(isBulkWpUploadRun && !prepSections) &&
        visibleUrls.map((url, localIndex) => {
          const row = overviewRowByUrl.get(normalizePageUrlKey(url));
          if (!row) return null;
          const index = showBulkPagination ? visibleStart + localIndex : localIndex;
          const stripeIndex = stripeBase + localIndex;
          const status =
            urlStatuses[url] ||
            (index < currentIndex
              ? "completed"
              : index === currentIndex
                ? "optimizing"
                : "pending");
          const isActive = isOverviewRowBulkActive(row.url, bulkState, !allComplete);
          const isExpanded = expandedUrls.has(url);
          const persistedHarness = urlHarnessSections[url] as BulkHarnessSectionUi[] | undefined;
          const liveHarness =
            isActive && !isParallelHarnessRow
              ? (currentStepProgress?.harnessSections as BulkHarnessSectionUi[] | undefined)
              : undefined;
          const rowGeneratedFiles = generatedFilesForUrl(urlGeneratedFiles, url);
          const rawFiles = mergeGeneratedFilesByName(
            rowGeneratedFiles,
            isActive ? siteProgress?.generatedFiles ?? [] : [],
          );
          const { otherFiles } = partitionPeerDetailFiles({ peers: [], files: rawFiles });
          const runKind = bulkState?.runKind;
          const isFileSlotRun = isAiseoFileSlotRunKind(runKind);
          const fileSlotRunKind = isFileSlotRun ? runKind : undefined;
          const displayFiles = sortFilesForDisplay(
            isFileSlotRun
              ? filterAiseoRowDisplayFiles(bulkState!.runKind, otherFiles)
              : otherFiles,
          );
          const batchPipelineTitles = bulkState
            ? resolveOverviewBulkPipelineTitles(bulkState.runKind, bulkState)
            : undefined;
          const rowPipelineTitles = isFileSlotRun
            ? []
            : resolveBulkRowPipelineTitles(
                bulkState?.runKind,
                persistedHarness,
                displayFiles,
                batchPipelineTitles,
                bulkState ?? undefined,
              );
          const rowHarnessSectionsList = isFileSlotRun
            ? buildAiseoRowDisplaySections(bulkState!.runKind, persistedHarness, displayFiles)
            : resolveDetailsPipelineSections(
                persistedHarness,
                liveHarness,
                rowPipelineTitles,
                displayFiles,
              );
          const rowKeyword = row.focusKeyword?.trim() || bulkRowLinkLabel(url, urlKeywords[url]);
          const serpBriefDownload = resolveSerpBriefDownloadable(
            rowKeyword,
            displayFiles,
            row.seoResearch,
          );
          const toggleRow = () => {
            setRowExpanded(url, !isExpanded);
          };
          const panelId = `bulk-details-row-${index}`;
          const activeStatus = isActive && detailsLiveMessage ? detailsLiveMessage : "";
          const isSimpleAiseoHarness = isAiseoSimpleHarnessRunKind(bulkState?.runKind);
          const fileSlotProgress =
            isFileSlotRun && isActive && (persistedHarness?.length ?? 0) > 0
              ? `${persistedHarness!.filter((section) => section.status === "done").length}/${persistedHarness!.length}`
              : "";
          const activeProgressLabel =
            fileSlotProgress ||
            (isActive && totalCount > 0 ? `${index + 1}/${totalCount}` : "");
          const showGeneratedFiles = isFileSlotRun
            ? isExpanded || isActive
            : isSimpleAiseoHarness
              ? isExpanded
              : isExpanded || Boolean(activeStatus) || Boolean(activeProgressLabel);

          if (isExpanded || (isActive && (!isSimpleAiseoHarness || isFileSlotRun))) {
            return (
              <div key={url} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                <div className={contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: isActive })}>
                  <MetaOptimizerPageRowCompact
                    row={row}
                    wpTitlesByUrl={wpTitlesByUrl}
                    isExpanded={isExpanded}
                    embedded
                    stripeIndex={stripeIndex}
                    isActiveOptimize={isActive}
                    panelId={panelId}
                    onToggle={toggleRow}
                    editableDate={drawerDateEditable}
                    onDateModifierChange={
                      drawerDateEditable
                        ? (dateIso) => onRowDateModifierChange!(url, dateIso)
                        : undefined
                    }
                    onDateModifierCommit={
                      drawerDateEditable
                        ? () => onRowDateModifierCommit?.(url)
                        : undefined
                    }
                  />
                  {showGeneratedFiles ? (
                    <BulkDetailsTileSections
                      harnessSections={rowHarnessSectionsList}
                      pipelineSectionTitles={rowPipelineTitles}
                      files={displayFiles}
                      onDownloadFile={downloadFile}
                      onDownloadAll={downloadAllForUrl}
                      stripeBaseIndex={stripeIndex + 1}
                      serpBriefDownload={serpBriefDownload}
                      statusMessage={activeStatus || undefined}
                      progressLabel={activeProgressLabel || undefined}
                      defaultFilesOpen={isFileSlotRun && isActive}
                      filesOnly={isFileSlotRun}
                      fileSlotRunKind={fileSlotRunKind}
                    />
                  ) : null}
                </div>
              </div>
            );
          }

          return (
            <div key={url} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
              <MetaOptimizerPageRowCompact
                row={row}
                wpTitlesByUrl={wpTitlesByUrl}
                isExpanded={false}
                stripeIndex={stripeIndex}
                isActiveOptimize={isActive}
                panelId={panelId}
                onToggle={toggleRow}
                editableDate={drawerDateEditable}
                onDateModifierChange={
                  drawerDateEditable
                    ? (dateIso) => onRowDateModifierChange!(url, dateIso)
                    : undefined
                }
                onDateModifierCommit={
                  drawerDateEditable ? () => onRowDateModifierCommit?.(url) : undefined
                }
              />
            </div>
          );
        })
      }
    </BulkDetailsDrawerStack>
  );
};

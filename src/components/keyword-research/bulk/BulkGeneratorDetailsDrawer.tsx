import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetaOptimizerPageRowCompact } from "@/components/overview/MetaOptimizerPageRowCompact";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { WordBlacklistRunDetail } from "@/components/keyword-research/bulk/WordBlacklistRunDetail";
import {
  csvRowToEntitySapOverviewRowDisplay,
  csvRowToOverviewRowDisplay,
  detailsDrawerRowKey,
  publishDateLabelForRow,
  rowFilesToDownloadables,
} from "@/components/shared/bulk-details-row-display";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import {
  BulkDetailsDrawerStack,
  BulkDetailsTileSections,
  resolveSerpBriefDownloadable,
  resolveDetailsPipelineSections,
  type BulkDetailsDownloadable,
} from "@/components/shared/bulk-details-tile-sections";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  isAiseoSimpleHarnessRunKind,
  resolveBulkRowPipelineTitlesWithGoogleImage,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  GOOGLE_IMAGE_PIPELINE_TITLE,
  rowUsesGoogleImageFeatured,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  buildAiseoRowDisplaySections,
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  RESEARCH_HARNESS_PIPELINE_TITLES,
  isResearchHarnessPipelineTitles,
} from "@/lib/overview/overview-research-harness-sections";
import { publishedLinkFromRowFiles } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import { isBulkDetailsDrawerRowActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import {
  BLOG_IMPORT_PIPELINE_TITLES,
  filterBlogImportRowFiles,
} from "@/lib/bulk/blog-import-minimal";

function downloadBlob(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BulkGeneratorDetailsDrawer(props: BulkGeneratorDetailsPanelProps) {
  const {
    variant,
    headerProgress,
    isProcessing,
    status = "",
    harnessSections,
    harnessByRow,
    batchPrepHarnessSections,
    currentRow,
    displayRows,
    filesByRow,
    downloadFile,
    sitemapInventoryLinks,
    siteKwHostedLink,
    inventoryRows,
    sitemapInventoryLoading = false,
    publishDateLabelByIndex,
    draftOnly,
    prepAccordionTitle,
    pipelineSectionTitles,
    runKind,
    researchBatchSignals,
    researchRowIndices,
    liveMessage,
    totalRows,
    entitySapRowDisplay = false,
    urlStatuses,
    detailsPageStart = 0,
  } = props;

  const isSimpleAiseoHarness = isAiseoSimpleHarnessRunKind(runKind);
  const isBlogImportVariant = variant === "blog-import";

  const effectivePipelineSectionTitles = isBlogImportVariant
    ? [...BLOG_IMPORT_PIPELINE_TITLES]
    : pipelineSectionTitles?.length
      ? pipelineSectionTitles
      : undefined;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const pinnedExpandedRowsRef = useRef<Set<string>>(new Set());
  const [detailsPrepOpen, setDetailsPrepOpen] = useState(true);

  const livePhase = headerProgress?.phase?.trim() || (isProcessing ? status.trim() : "");

  const setRowExpanded = useCallback((rowKey: string, open: boolean) => {
    if (open) pinnedExpandedRowsRef.current.add(rowKey);
    else pinnedExpandedRowsRef.current.delete(rowKey);
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (open) next.add(rowKey);
      else next.delete(rowKey);
      return next;
    });
  }, []);

  const commitAutoExpandedRows = useCallback((auto: Set<string>) => {
    const merged = new Set(auto);
    for (const rowKey of pinnedExpandedRowsRef.current) merged.add(rowKey);
    setExpandedRows((prev) => {
      if (prev.size === merged.size) {
        let same = true;
        for (const rowKey of merged) {
          if (!prev.has(rowKey)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return merged;
    });
  }, []);

  const prepSections =
    batchPrepHarnessSections?.length ? batchPrepHarnessSections : null;

  const rows = displayRows.length > 0 ? displayRows : [];

  const isResearchBatch =
    runKind === "research" ||
    researchBatchSignals?.runKind === "research" ||
    isResearchHarnessPipelineTitles(effectivePipelineSectionTitles) ||
    (researchRowIndices?.size ?? 0) > 0;

  const researchBatchInFlight =
    isResearchBatch &&
    isProcessing &&
    researchBatchSignals?.currentStep !== "Batch complete";

  const showInventory = !isResearchBatch;

  const entityRowExpandSignature = useMemo(() => {
    if (!entitySapRowDisplay) return "";
    return displayRows
      .map((row) => {
        const entityRow = row as { entity?: string; keyword?: string };
        return `${entityRow.entity?.trim() ?? ""}|${entityRow.keyword?.trim() ?? ""}`;
      })
      .join("\n");
  }, [displayRows, entitySapRowDisplay]);

  useEffect(() => {
    const keyForIndex = (index: number) => detailsDrawerRowKey(displayRows[index], index);

    if (isSimpleAiseoHarness && runKind !== "aiFaq" && runKind !== "aiScenario") {
      commitAutoExpandedRows(new Set());
      return;
    }

    if ((runKind === "aiFaq" || runKind === "aiScenario") && isProcessing) {
      let activeIndex = currentRow;
      if (activeIndex < 0) {
        for (let i = 0; i < displayRows.length; i += 1) {
          const url = displayRows[i]?.destination_url?.trim();
          if (!url || !urlStatuses) continue;
          const key = normalizePageUrlKey(url);
          const status =
            urlStatuses[url] ??
            Object.entries(urlStatuses).find(
              ([candidate]) => normalizePageUrlKey(candidate) === key,
            )?.[1];
          if (status === "optimizing") {
            activeIndex = i;
            break;
          }
        }
      }
      if (activeIndex >= 0 && activeIndex < displayRows.length) {
        commitAutoExpandedRows(new Set([keyForIndex(activeIndex)]));
      }
      return;
    }

    if (entitySapRowDisplay) {
      if (isProcessing && currentRow >= 0 && currentRow < displayRows.length) {
        commitAutoExpandedRows(new Set([keyForIndex(currentRow)]));
      } else {
        commitAutoExpandedRows(new Set());
      }
      return;
    }

    if (researchBatchInFlight && currentRow >= 0 && currentRow < displayRows.length) {
      commitAutoExpandedRows(new Set([keyForIndex(currentRow)]));
      return;
    }

    if (!isProcessing) {
      commitAutoExpandedRows(new Set());
      return;
    }

    const next = new Set<string>();
    if (currentRow >= 0 && currentRow < displayRows.length) {
      next.add(keyForIndex(currentRow));
    }
    commitAutoExpandedRows(next);
  }, [
    commitAutoExpandedRows,
    currentRow,
    displayRows,
    entityRowExpandSignature,
    isProcessing,
    entitySapRowDisplay,
    researchBatchInFlight,
    isSimpleAiseoHarness,
    runKind,
    urlStatuses,
  ]);

  const saveDownloadable = (file: BulkDetailsDownloadable) => {
    if (downloadFile) {
      const match = [...(filesByRow?.values() ?? [])]
        .flat()
        .find((f) => f.fileName === file.name && f.content === file.content);
      if (match) {
        downloadFile(match);
        return;
      }
    }
    downloadBlob(file);
  };

  const handleDownloadFile = (file: BulkDetailsDownloadable) => {
    saveDownloadable(file);
    notify.success(NOTIFY_CSV_DOWNLOADED);
  };

  const handleDownloadAll = (files: BulkDetailsDownloadable[]) => {
    files.forEach((file, index) => {
      setTimeout(() => saveDownloadable(file), index * 300);
    });
  };

  return (
    <BulkDetailsDrawerStack
      liveMessage={liveMessage}
      showLiveMessage={!isProcessing || Boolean(liveMessage?.trim())}
      prepSections={prepSections}
      prepOpen={detailsPrepOpen}
      onPrepOpenChange={setDetailsPrepOpen}
      prepAccordionTitle={prepAccordionTitle}
    >
      {(stripeBase) => {
        let rowStripeBase = stripeBase;

        return (
          <>
            {showInventory ? (
              <>
                <div className={contentOptimizerRowStripeClass(rowStripeBase++)}>
                  <WordBlacklistRunDetail />
                </div>
                <div className={contentOptimizerRowStripeClass(rowStripeBase++)}>
                  <BulkSitemapInventoryRunDetail
                    links={sitemapInventoryLinks ?? []}
                    gscHostedLink={siteKwHostedLink ?? null}
                    inventoryRows={inventoryRows}
                    pinned
                  />
                </div>
              </>
            ) : null}

            {rows.map((row, index) => {
              const globalRowIndex = detailsPageStart + index;
              const stripeIndex = rowStripeBase + index;
              const rowKey = detailsDrawerRowKey(row, globalRowIndex);
              const isExpanded = expandedRows.has(rowKey);
              const rowUsesGoogleImage =
                entitySapRowDisplay ||
                rowUsesGoogleImageFeatured(row, undefined) ||
                effectivePipelineSectionTitles?.[0] === GOOGLE_IMAGE_PIPELINE_TITLE;
              let rowFiles = filesByRow?.get(globalRowIndex) ?? [];
              if (isBlogImportVariant) {
                rowFiles = filterBlogImportRowFiles(rowFiles);
              }
              const previewUrl = publishedLinkFromRowFiles(rowFiles) ?? undefined;
              const displayRow = entitySapRowDisplay
                ? csvRowToEntitySapOverviewRowDisplay(row, index, previewUrl)
                : csvRowToOverviewRowDisplay(row, index, previewUrl);
              const isActive = isBulkDetailsDrawerRowActive(
                displayRow.url,
                isProcessing,
                globalRowIndex,
                currentRow,
                urlStatuses,
              );
              const dateLabelOverride = publishDateLabelForRow(
                globalRowIndex,
                publishDateLabelByIndex,
                draftOnly,
              );
              const persistedHarness = harnessByRow?.get(globalRowIndex);
              const liveHarnessForRow = isActive ? harnessSections : undefined;
              const hasGeneratingHarness = (liveHarnessForRow ?? persistedHarness)?.some(
                (section) => section.status === "generating",
              );
              const rowIsResearch = runKind === "research";
              const rowPipelineTitles = isBlogImportVariant
                ? [...BLOG_IMPORT_PIPELINE_TITLES]
                : rowIsResearch
                ? [...RESEARCH_HARNESS_PIPELINE_TITLES]
                : resolveBulkRowPipelineTitlesWithGoogleImage(
                    runKind,
                    persistedHarness,
                    rowFiles.map((file) => ({
                      name: file.fileName,
                      fileName: file.fileName,
                      content: file.content,
                    })),
                    rowUsesGoogleImage,
                    effectivePipelineSectionTitles,
                    researchBatchSignals,
                  );
              const isFileSlotRun = isAiseoFileSlotRunKind(runKind);
              const tilePipelineTitles = isFileSlotRun ? [] : rowPipelineTitles;
              const displayFiles = rowFilesToDownloadables(
                isFileSlotRun ? filterAiseoRowDisplayFiles(runKind, rowFiles) : rowFiles,
              );
              const rowHarnessSectionsList = isFileSlotRun
                ? buildAiseoRowDisplaySections(
                    runKind,
                    persistedHarness,
                    rowFiles.map((file) => ({ name: file.fileName })),
                  )
                : resolveDetailsPipelineSections(
                    persistedHarness,
                    liveHarnessForRow,
                    tilePipelineTitles,
                    displayFiles,
                  );
              const serpBriefDownload = resolveSerpBriefDownloadable(
                row.keyword?.trim() || row.url?.trim() || "brief",
                displayFiles,
                row.seo_research,
              );
              const panelId = `bulk-generator-details-row-${rowKey}`;
              const toggleRow = () => setRowExpanded(rowKey, !isExpanded);
              const activeProgressLabel =
                isActive && totalRows > 0
                  ? `${detailsPageStart + index + 1}/${totalRows}`
                  : "";
              const rowStepProgress = isFileSlotRun
                ? isActive && (persistedHarness?.length ?? 0) > 0
                  ? `${persistedHarness!.filter((section) => section.status === "done").length}/${persistedHarness!.length}`
                  : ""
                : isActive && !isSimpleAiseoHarness && rowHarnessSectionsList.length > 0
                  ? `${rowHarnessSectionsList.filter((section) => section.status === "done").length}/${rowHarnessSectionsList.length}`
                  : "";
              const showGeneratedFiles = isBlogImportVariant
                ? isExpanded || isActive
                : isFileSlotRun
                ? isExpanded || isActive
                : isSimpleAiseoHarness
                  ? isExpanded
                  : isExpanded ||
                    Boolean(activeProgressLabel) ||
                    hasGeneratingHarness ||
                    isActive;
              const useRowShell = isFileSlotRun
                ? isExpanded || isActive
                : isSimpleAiseoHarness
                  ? isExpanded
                  : isExpanded || isActive || hasGeneratingHarness;

              if (useRowShell) {
                return (
                  <div key={rowKey} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                    <div
                      className={contentOptimizerRowStripeClass(stripeIndex, {
                        isActiveOptimize: isActive,
                      })}
                    >
                      <MetaOptimizerPageRowCompact
                        row={displayRow}
                        wpTitlesByUrl={{}}
                        isExpanded={isExpanded}
                        embedded
                        stripeIndex={stripeIndex}
                        isActiveOptimize={isActive}
                        panelId={panelId}
                        dateLabelOverride={dateLabelOverride}
                        onToggle={toggleRow}
                      />
                      {showGeneratedFiles ? (
                        <BulkDetailsTileSections
                          harnessSections={rowHarnessSectionsList}
                          pipelineSectionTitles={tilePipelineTitles}
                          files={displayFiles}
                          onDownloadFile={handleDownloadFile}
                          onDownloadAll={handleDownloadAll}
                          stripeBaseIndex={stripeIndex + 1}
                          serpBriefDownload={serpBriefDownload}
                          statusMessage={isActive ? livePhase || undefined : undefined}
                          progressLabel={rowStepProgress || activeProgressLabel || undefined}
                          defaultFilesOpen={isFileSlotRun && isActive}
                          filesOnly={isFileSlotRun || isBlogImportVariant}
                          fileSlotRunKind={isFileSlotRun ? runKind : undefined}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              }

              return (
                <div key={rowKey} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                  <MetaOptimizerPageRowCompact
                    row={displayRow}
                    wpTitlesByUrl={{}}
                    isExpanded={false}
                    stripeIndex={stripeIndex}
                    isActiveOptimize={isActive}
                    panelId={panelId}
                    dateLabelOverride={dateLabelOverride}
                    onToggle={toggleRow}
                  />
                </div>
              );
            })}

            {rows.length === 0 && variant === "csv" ? (
              <div className={contentOptimizerRowStripeClass(rowStripeBase)}>
                <p className="px-2.5 py-1.5 text-base text-muted-foreground sm:px-3">
                  Select a CSV file to load rows.
                </p>
              </div>
            ) : null}

            {rows.length === 0 && variant === "prompt" ? (
              <div className={contentOptimizerRowStripeClass(rowStripeBase)}>
                <p className="px-2.5 py-1.5 text-base text-muted-foreground sm:px-3">
                  Generate blog ideas from the toolbar, then run processing on selected rows.
                </p>
              </div>
            ) : null}

            {rows.length === 0 && variant === "blog-import" ? (
              <div className={contentOptimizerRowStripeClass(rowStripeBase)}>
                <p className="px-2.5 py-1.5 text-base text-muted-foreground sm:px-3">
                  Upload a draft file to preview and run.
                </p>
              </div>
            ) : null}
          </>
        );
      }}
    </BulkDetailsDrawerStack>
  );
}

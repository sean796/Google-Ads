import React from "react";

import { AlertCircle, CheckCircle2, ChevronDown, Circle, CircleDot, Copy, Download, MinusCircle } from "lucide-react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_COPIED_TO_CLIPBOARD } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { stepLabel } from "@/lib/content-optimization/content-optimizer-step-labels";
import { GscPerformancePreviewRow } from "@/components/integrations/wordpress/GscPerformancePreviewRow";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import { OptimizationArtifactDownloads } from "./OptimizationArtifactDownloads";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { BULK_ACTIVE_SEMANTIC_BORDER_CLASS } from "@/lib/bulk/bulk-active-semantic-border";
import { contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, RowButton } from "@/ui";
import { URL_STEP_PILLS, bulkRowLinkLabel, deriveBulkTargetRowState, downloadAllForUrl, downloadFile, resolveRowHarnessPlannedCount, sortFilesForDisplay } from "./bulk-optimization-panel-helpers";
import type { useBulkOptimizationPanelState } from "./use-bulk-optimization-panel-state";

const TargetingSequence: React.FC<{ currentStepIndex: number; flat?: boolean }> = ({
  currentStepIndex,
  flat = false,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {URL_STEP_PILLS.map((step, index) => {
        const isCompleted = currentStepIndex > index;
        const isCurrent = currentStepIndex === index;

        return (
          <span
            key={step.key}
            className={cn(
              "font-mono text-sm transition-all",
              flat
                ? cn("text-white", isCurrent && "font-semibold")
                : cn(
                    "rounded px-1.5 py-0.5",
                    isCompleted && "bg-primary/15 text-primary",
                    isCurrent && "bg-primary/25 font-semibold text-foreground",
                    currentStepIndex < index && "bg-muted text-muted-foreground",
                  ),
            )}
          >
            {!flat && isCompleted && "✓ "}
            {!flat && isCurrent && "● "}
            {step.shortLabel}
          </span>
        );
      })}
    </div>
  );
};

export const BulkOptimizationTargetRowItem: React.FC<{
  url: string;
  localIndex: number;
  panel: ReturnType<typeof useBulkOptimizationPanelState>;
}> = ({ url, localIndex, panel }) => {
  const { isDetailsOnly, setRowExpanded, publishedLinksByUrl, urlKeywords, urlGeneratedFiles, gscPreviewByUrl, gscFetching, gscActiveUrl, siteProgress, currentStepProgress, urls, bulkState, currentStepId, currentStep, isBulkAiAllMetaRun, currentStepIndex, urlSkipReasons, postProgress, showBulkPagination, visibleStart, urlStatuses, currentIndex, isParallelHarnessRow, allComplete, urlLocalImageOutcomes, warmingUpIndex, warmingUpIndex2, researchedUrls, prepStepLower, isInContentImageRun, showEntityDetail, urlEntities, expandedUrls, urlHarnessSections, detailsCurrentIndex } = panel;
  const { index, status, isActive, isCompleted, isSkipped, isError, isPending, localImageOutcome, rowGeneratedFiles, isWarmingUp, isReady, showActiveRowBorder, getStatusLabel, keyword, isExpanded, closedOutcomeLabel, entityLabel, persistedHarness, liveHarness, rowHarnessSectionsList, showRowHarness, showHarnessForRow, isDetailsActivePost, showOptimizationSequence, showDetailsFlatBody, isDetailsCurrentRow, detailsStepLabel } = deriveBulkTargetRowState({ url, localIndex, showBulkPagination, visibleStart, urlStatuses, currentIndex, isParallelHarnessRow, allComplete, urlLocalImageOutcomes, urlGeneratedFiles, warmingUpIndex, warmingUpIndex2, researchedUrls, prepStepLower, postProgress, isInContentImageRun, showEntityDetail, urlEntities, expandedUrls, urlKeywords, urlHarnessSections, currentStepProgress, isDetailsOnly, detailsCurrentIndex, currentStepId });
  return (

                    <li key={url} className={cn(showActiveRowBorder && !isDetailsOnly && "relative z-10")}>
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={(open) => {
                        setRowExpanded(url, open);
                      }}
                      className={cn(
                        isDetailsOnly
                          ? contentOptimizerRowStripeClass(index, {
                              isActiveOptimize: isDetailsCurrentRow,
                            })
                          : cn(
                              "rounded-md border border-transparent bg-black/20",
                              showActiveRowBorder ? "overflow-visible" : "overflow-hidden",
                            ),
                        showActiveRowBorder && !isDetailsOnly && BULK_ACTIVE_SEMANTIC_BORDER_CLASS,
                        isCompleted && "opacity-95",
                        isSkipped && "bg-semantic-warning/[0.06]",
                        isError && "bg-ui-danger/[0.06]",
                      )}
                    >
                      <CollapsibleTrigger asChild>
                        <RowButton
                          type="button"
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 text-foreground/70 transition-transform",
                              isDetailsOnly && "mt-0.5 text-white/70",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden
                          />
                          {!isDetailsOnly ? (
                            <div className="flex justify-center">
                              {isActive && null}
                              {isWarmingUp && null}
                              {isReady && <CircleDot className="h-4 w-4 text-semantic-analysis-foreground" />}
                              {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              {isSkipped && <MinusCircle className="h-4 w-4 text-semantic-warning-foreground" />}
                              {isError && <AlertCircle className="h-4 w-4 text-ui-danger-hover" />}
                              {isPending && !isWarmingUp && !isReady && (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ) : null}
                          {isDetailsOnly ? (
                            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                              <div className="min-w-0 flex-1 whitespace-normal text-base [overflow-wrap:anywhere]">
                                {(() => {
                                  const liveHref =
                                    isCompleted && publishedLinksByUrl[url]?.trim()
                                      ? publishedLinksByUrl[url]!.trim()
                                      : url;
                                  return (
                                    <a
                                      href={liveHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "font-normal underline-offset-2 hover:underline",
                                        isDetailsCurrentRow
                                          ? "text-[hsl(var(--semantic-data-foreground))]"
                                          : cn(
                                              "text-foreground",
                                              isCompleted &&
                                                (urlKeywords[url]
                                                  ? "text-primary/90"
                                                  : "text-semantic-warning-foreground/80"),
                                              isSkipped && "text-semantic-warning-foreground",
                                              isError && "text-ui-danger-hover",
                                            ),
                                      )}
                                      title={liveHref}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {bulkRowLinkLabel(url, keyword)}
                                    </a>
                                  );
                                })()}
                                {detailsStepLabel ? (
                                  <span className="text-[hsl(var(--semantic-data-foreground))]">
                                    {" "}
                                    · {detailsStepLabel}
                                  </span>
                                ) : null}
                                {closedOutcomeLabel ? (
                                  <span
                                    className={cn(
                                      "ml-2 font-semibold uppercase tracking-wide",
                                      closedOutcomeLabel === "Found" && "text-primary",
                                      closedOutcomeLabel === "Generated" && "text-primary",
                                      closedOutcomeLabel === "Skipped" && "text-semantic-warning-foreground",
                                      closedOutcomeLabel === "Failed" && "text-ui-danger-hover",
                                      closedOutcomeLabel === "Done" && "text-primary",
                                    )}
                                  >
                                    · {closedOutcomeLabel}
                                  </span>
                                ) : null}
                              </div>
                              {entityLabel ? (
                                <div className="min-w-0 shrink-0 whitespace-normal text-right text-base text-white [overflow-wrap:anywhere]">
                                  Entity · {entityLabel}
                                </div>
                              ) : null}
                              {generatedFilesForUrl(urlGeneratedFiles, url).length > 0 ? (
                                <Button
                                  variant="quiet"
                                  type="button"
                                  title={`Download ${generatedFilesForUrl(urlGeneratedFiles, url).length} file(s)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadAllForUrl(generatedFilesForUrl(urlGeneratedFiles, url));
                                  }}
                                >
                                  <Download className="mr-1 h-3.5 w-3.5" />
                                  {generatedFilesForUrl(urlGeneratedFiles, url).length}
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                          <div className="min-w-0 overflow-visible whitespace-normal text-base [overflow-wrap:anywhere]">
                            {(() => {
                              const liveHref =
                                isCompleted && publishedLinksByUrl[url]?.trim()
                                  ? publishedLinksByUrl[url]!.trim()
                                  : url;
                              return (
                            <a
                              href={liveHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "font-normal text-foreground underline-offset-2 hover:underline",
                                isCompleted &&
                                  (urlKeywords[url] ? "text-primary/90" : "text-semantic-warning-foreground/80"),
                                isSkipped && "text-semantic-warning-foreground",
                                isError && "text-ui-danger-hover",
                              )}
                              title={liveHref}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {bulkRowLinkLabel(url, keyword)}
                            </a>
                              );
                            })()}
                          </div>
                          )}
                          {!isDetailsOnly ? (
                            <div
                              className={cn(
                                "shrink-0 text-right text-base font-semibold uppercase tracking-wide",
                                isActive && "text-foreground",
                                isWarmingUp && "text-semantic-publish-foreground",
                                isReady && "text-semantic-analysis-foreground",
                                isCompleted && "text-primary",
                                isSkipped && "text-semantic-warning-foreground",
                                isError && "text-ui-danger-hover",
                                isPending && !isWarmingUp && !isReady && "text-muted-foreground",
                              )}
                            >
                              {getStatusLabel()}
                            </div>
                          ) : null}
                        </RowButton>
                      </CollapsibleTrigger>

                      {!isDetailsOnly ? (
                      <CollapsibleContent
                        className={cn(
                          "space-y-3 px-3 pb-3",
                          "data-[state=closed]:animate-none",
                        )}
                      >
                        <>
                        {entityLabel ? (
                          <div className="text-base">
                            <span className="text-muted-foreground">Entity · </span>
                            <span className="font-medium text-foreground">{entityLabel}</span>
                          </div>
                        ) : null}

                      {(() => {
                        const gscSnap = gscPreviewByUrl[url];
                        const showGscRow =
                          gscSnap?.queries?.length ||
                          (gscFetching && isActive && gscActiveUrl === url && !gscSnap?.queries?.length);
                        if (!showGscRow) return null;
                        return (
                          <div className="mt-1 rounded-md bg-black/15 px-3 py-2">
                            <GscPerformancePreviewRow
                              snapshot={gscSnap ?? null}
                              loading={
                                Boolean(gscFetching && isActive && gscActiveUrl === url && !gscSnap?.queries?.length)
                              }
                            />
                          </div>
                        );
                      })()}

                      {showHarnessForRow &&
                      showRowHarness &&
                      rowHarnessSectionsList ? (
                        <>
                          {isActive ? (
                            <OptimizationArtifactDownloads
                              files={
                                rowGeneratedFiles.length
                                  ? rowGeneratedFiles
                                  : siteProgress?.generatedFiles ?? []
                              }
                              className="mt-2"
                            />
                          ) : null}
                            <BulkHarnessSectionsPanel
                              harnessSections={rowHarnessSectionsList}
                              harnessPlannedSectionCount={resolveRowHarnessPlannedCount(
                                rowHarnessSectionsList,
                                isParallelHarnessRow,
                                isActive,
                                currentStepProgress?.harnessPlannedSectionCount,
                                persistedHarness?.length ?? 0,
                              )}
                              currentRow={index}
                              totalRows={Math.max(urls.length, 1)}
                              isProcessing={isActive || isWarmingUp}
                              hideHeader={isParallelHarnessRow}
                              activeIndicator="spinner"
                              variant="default"
                              hideSectionDownloads={
                                bulkState?.runKind === "aiInContentImage"
                              }
                            />
                        </>
                          ) : null}

                      {showOptimizationSequence ? (
                        <div className="mt-1 space-y-3">
                          <div className="flex items-center justify-between gap-2 text-base">
                            <div className="min-w-0 flex-1">
                              <span className="text-muted-foreground">Sequence · </span>
                              <span className="font-medium text-primary">
                                {isWarmingUp ? stepLabel(currentStepId) : currentStep}
                              </span>
                            </div>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {isWarmingUp ? bulkState?.currentProgress ?? postProgress : postProgress}%
                            </span>
                          </div>

                          {showOptimizationSequence && currentStepProgress?.message && (
                            <div className="flex items-start gap-1.5">
                              <span
                                className="flex-1 break-words text-sm text-muted-foreground"
                                title={
                                  currentStepProgress.message.length > 120
                                    ? currentStepProgress.message
                                    : undefined
                                }
                              >
                                {currentStepProgress.message.length > 200
                                  ? `${currentStepProgress.message.slice(0, 200).trim()}…`
                                  : currentStepProgress.message}
                              </span>
                              <Button
                                variant="quiet"
                                onClick={() => {
                                  navigator.clipboard.writeText(currentStepProgress.message || "");
                                  notify.success(NOTIFY_COPIED_TO_CLIPBOARD);
                                }}
                                title="Copy"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}

                          {(() => {
                            const files = generatedFilesForUrl(urlGeneratedFiles, url);
                            if (!files || files.length === 0) return null;
                            const sorted = sortFilesForDisplay(files);
                            return (
                              <Collapsible className="space-y-2">
                                <CollapsibleTrigger
                                  className="flex w-full items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-2 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-black/30 [&[data-state=open]>svg]:rotate-180"
                                >
                                  <span>Generated files</span>
                                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2 data-[state=closed]:animate-none">
                                  <Button
                                    type="button"
                                    onClick={() => downloadAllForUrl(sorted)}
                                  >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Download all
                                  </Button>
                                  <div className="max-h-28 overflow-y-auto rounded-md bg-black/20 px-2 py-2">
                                    <div className="space-y-1">
                                      {sorted.map((file, idx) => (
                                        <div
                                          key={file.name + idx}
                                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1"
                                        >
                                          <span
                                            className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-base text-muted-foreground"
                                            title={file.name}
                                          >
                                            {file.name}
                                          </span>
                                          <Button
                                            variant="quiet"
                                            onClick={() => downloadFile(file)}
                                          >
                                            <Download className="mr-1 h-3 w-3" />
                                            File
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })()}

                          {!isBulkAiAllMetaRun ? (
                            <TargetingSequence
                              currentStepIndex={currentStepIndex}
                              flat={false}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      {!isDetailsOnly &&
                      isCompleted &&
                        !isActive &&
                        (() => {
                          const files = generatedFilesForUrl(urlGeneratedFiles, url);
                          if (!files || files.length === 0) return null;
                          const sorted = sortFilesForDisplay(files);
                          return (
                            <Collapsible className="space-y-2">
                              <CollapsibleTrigger
                                className="flex w-full items-center justify-between gap-2 rounded-md bg-black/25 px-2 py-2 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-black/35 [&[data-state=open]>svg]:rotate-180"
                              >
                                <span>Generated files</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-2 data-[state=closed]:animate-none">
                                <Button
                                  type="button"
                                  onClick={() => downloadAllForUrl(sorted)}
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  Download all
                                </Button>
                                <div className="max-h-32 overflow-y-auto rounded-md bg-black/25 px-2 py-2">
                                  <div className="space-y-1">
                                    {sorted.map((file, idx) => (
                                      <div
                                        key={file.name + idx}
                                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-1"
                                      >
                                        <span
                                          className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-base text-muted-foreground"
                                          title={file.name}
                                        >
                                          {file.name}
                                        </span>
                                        <Button
                                          variant="quiet"
                                          onClick={() => downloadFile(file)}
                                        >
                                          <Download className="mr-1 h-3 w-3" />
                                          File
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}

                      {isSkipped && (
                        <div className="rounded-md bg-semantic-warning/[0.07] px-3 py-2">
                          <div className="mb-1 text-base font-semibold uppercase tracking-wide text-semantic-warning-foreground">
                            Skipped
                          </div>
                          <div className="text-base text-semantic-warning-foreground/80">
                            {urlSkipReasons[url]?.trim() ||
                              "Could not derive a keyword from sitemap or page context. Check the URL, title, and entity sitemap settings, then retry."}
                          </div>
                        </div>
                      )}

                      {isError && (
                        <div className="rounded-md bg-ui-danger/[0.07] px-3 py-2">
                          <div className="text-sm text-ui-danger-hover/85">
                            {urlSkipReasons[url]?.trim() || "Processing failed for this target."}
                          </div>
                        </div>
                      )}
                          </>
                      </CollapsibleContent>
                      ) : null}
                    </Collapsible>
                    </li>
  );
};

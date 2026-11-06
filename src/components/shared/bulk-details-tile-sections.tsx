import { useState, useEffect, type ReactNode } from "react";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { ChevronDown, Download, FileDown, Map as MapIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  resolveAiseoPipelineDownloadFile,
  type AiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { MetaAccordionStripeRow } from "@/components/overview/MetaOptimizerRowParts";
import {
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
  META_TRIGGER_FLAT,
  zoneMetaAccordionStack,
} from "@/components/overview/meta-optimizer-row-constants";
import {
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  isContentOptimizePipelineTitles,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { isResearchHarnessPipelineTitles } from "@/lib/overview/overview-research-harness-sections";
import {
  buildAllDownloadables,
  buildPipelineSectionDownloadables,
  resolveDetailsPipelineSections,
  type BulkDetailsDownloadable,
} from "@/components/shared/bulk-details-tile-sections-helpers";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";



export function BulkDetailsTileSections({
  harnessSections,
  files,
  onDownloadFile,
  onDownloadAll,
  stripeBaseIndex,
  serpBriefDownload,
  statusMessage,
  progressLabel,
  pipelineSectionTitles,
  defaultFilesOpen,
  downloadsLocked = false,
  filesOnly = false,
  fileSlotRunKind,
}: {
  harnessSections: BulkHarnessSectionUi[];
  files: BulkDetailsDownloadable[];
  onDownloadFile: (file: BulkDetailsDownloadable) => void;
  onDownloadAll: (files: BulkDetailsDownloadable[]) => void;
  stripeBaseIndex: number;
  serpBriefDownload?: BulkDetailsDownloadable | null;
  statusMessage?: string | null;
  /** Active-row batch counter (e.g. 20/115), inline before file count. */
  progressLabel?: string | null;
  pipelineSectionTitles?: readonly string[];
  defaultFilesOpen?: boolean;
  /** @deprecated Row-level lock; per-step gating uses harness status === done. */
  downloadsLocked?: boolean;
  /** FAQ-style runs: list generated files only (no harness pipeline rows). */
  filesOnly?: boolean;
  /** Registry runKind for fixed Element | Post content | WordPress upload slots. */
  fileSlotRunKind?: AiseoFileSlotRunKind;
}) {
  const resolvedFileSlotRunKind = fileSlotRunKind;
  const useFileSlotsOnly = Boolean(resolvedFileSlotRunKind);
  const aiseoPipelineDownloadFile = (title: string): BulkDetailsDownloadable | undefined => {
    if (!resolvedFileSlotRunKind) return undefined;
    return resolveAiseoPipelineDownloadFile(resolvedFileSlotRunKind, title, files);
  };
  const [filesOpen, setFilesOpen] = useState(defaultFilesOpen ?? false);
  useEffect(() => {
    if (defaultFilesOpen) setFilesOpen(true);
  }, [defaultFilesOpen]);
  const useExplicitPipeline = Boolean(pipelineSectionTitles?.length);
  const isResearchPipeline =
    useExplicitPipeline && isResearchHarnessPipelineTitles(pipelineSectionTitles);
  const isContentOptimizePipeline =
    useExplicitPipeline && isContentOptimizePipelineTitles(pipelineSectionTitles);
  const pipelineDownloadOptions = isResearchPipeline
    ? { researchArtifactsOnly: true as const }
    : isContentOptimizePipeline
      ? { noFallback: true as const, requireDoneStatus: true as const }
      : undefined;
  const pipelineSections = useFileSlotsOnly
    ? []
    : resolveDetailsPipelineSections(
        harnessSections,
        undefined,
        useExplicitPipeline ? pipelineSectionTitles : harnessSections.length ? undefined : [...CONTENT_OPTIMIZE_PIPELINE_TITLES],
        files,
      );
  const pipelineDownloadables = buildPipelineSectionDownloadables(
    pipelineSections,
    files,
    serpBriefDownload,
    pipelineDownloadOptions,
  );
  const claimedPipelineNames = new Set(
    pipelineDownloadables.filter((file): file is BulkDetailsDownloadable => file != null).map((file) => file.name),
  );
  const extraFiles = isContentOptimizePipeline
    ? []
    : files.filter((file) => !claimedPipelineNames.has(file.name));
  const readyPipelineDownloadables = pipelineDownloadables.filter(
    (file): file is BulkDetailsDownloadable => file != null,
  );
  const wpPayloadForDownloadAll = isContentOptimizePipeline
    ? files.filter(
        (file) =>
          file.name.startsWith("upload-payload-") && !claimedPipelineNames.has(file.name),
      )
    : [];
  const allDownloadables = isContentOptimizePipeline
    ? [...readyPipelineDownloadables, ...wpPayloadForDownloadAll]
    : buildAllDownloadables(pipelineSections, extraFiles, serpBriefDownload, pipelineDownloadOptions);
  const fileSlotDisplaySections = useFileSlotsOnly ? harnessSections : [];
  const downloadableCount = useFileSlotsOnly
    ? fileSlotDisplaySections.filter((section) =>
        Boolean(aiseoPipelineDownloadFile(section.title || "")),
      ).length
    : pipelineDownloadables.filter((file) => file != null).length + extraFiles.length;
  const headerItemCount = useFileSlotsOnly
    ? Math.max(fileSlotDisplaySections.length, 2)
    : useExplicitPipeline
      ? pipelineSections.length
      : downloadableCount;
  const trimmedStatus = statusMessage?.trim();
  const trimmedProgress = progressLabel?.trim();
  const activePipelineIndex = useFileSlotsOnly
    ? fileSlotDisplaySections.findIndex((section) => section.status === "generating")
    : pipelineSections.reduce(
        (acc, section, index) => (section.status === "generating" ? index : acc),
        -1,
      );

  if (
    !useFileSlotsOnly &&
    pipelineSections.length === 0 &&
    downloadableCount === 0 &&
    !trimmedStatus &&
    !trimmedProgress
  ) {
    return null;
  }

  return (
    <div className={zoneMetaAccordionStack} role="region" aria-label="Generated files">
      <MetaAccordionStripeRow stripeIndex={stripeBaseIndex}>
        <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
          <div className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
            <CollapsibleTrigger asChild>
              <Button
              >
                <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                <span className="shrink-0 text-left">Generated files</span>
                {trimmedStatus ? (
                  <span
                    className="min-w-0 flex-1 break-words text-left font-normal text-white"
                    role="status"
                    aria-live="polite"
                  >
                    {trimmedStatus}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1" aria-hidden />
                )}
                {trimmedProgress ? (
                  <span
                    className="shrink-0 tabular-nums text-muted-foreground"
                    aria-label={`Progress ${trimmedProgress}`}
                  >
                    {trimmedProgress}
                  </span>
                ) : null}
              </Button>
            </CollapsibleTrigger>
            <div className={cn(META_FIELD_END_RAIL, "shrink-0")}>
              <span
                className={cn(
                  META_FIELD_COUNT,
                  META_FIELD_END_RAIL_CELL,
                  "min-w-[1.75rem] tabular-nums font-semibold",
                )}
              >
                {headerItemCount.toLocaleString()}
              </span>
              {allDownloadables.length > 0 ? (
                <Button
                  size="icon" icon={Download}
                  variant="quiet"
                  title="Download all"
                  aria-label="Download all generated files"
                  onClick={() => onDownloadAll(allDownloadables)}
                ></Button>
              ) : null}
            </div>
            <CollapsibleTrigger asChild>
              <Button
                size="icon" icon={ChevronDown}
                aria-label={filesOpen ? "Collapse generated files" : "Expand generated files"}
              ></Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-2 text-base">
              {useFileSlotsOnly
                ? fileSlotDisplaySections.map((s, i) => {
                    const downloadable = aiseoPipelineDownloadFile(s.title || "");
                    const isActiveStep = i === activePipelineIndex;
                    const stepReady = Boolean(downloadable);
                    return (
                      <div
                        key={`file-slot-${i}-${s.title}`}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-none px-1 py-0.5",
                          isActiveStep && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                        )}
                      >
                        <span
                          className={cn(
                            "w-6 shrink-0 tabular-nums",
                            isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1",
                            isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                          )}
                        >
                          {s.title}
                        </span>
                        <Button
                          variant="quiet"
                          disabled={!stepReady}
                          onClick={() => downloadable && onDownloadFile(downloadable)}
                        >
                          <Download className="mr-1 h-3 w-3" />
                          File
                        </Button>
                      </div>
                    );
                  })
                : null}
              {!useFileSlotsOnly
                ? pipelineSections.map((s, i) => {
                const downloadable = pipelineDownloadables[i];
                const isActiveStep = i === activePipelineIndex;
                const stepReady = Boolean(downloadable);
                return (
                  <div
                    key={`${i}-${s.sectionIndex}-${s.title || "section"}`}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-none px-1 py-0.5",
                      isActiveStep && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 shrink-0 tabular-nums",
                        isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                      )}
                    >
                      {s.title || `Section ${s.sectionIndex + 1}`}
                    </span>
                    <Button
                      variant="quiet"
                      disabled={!stepReady}
                      onClick={() => downloadable && onDownloadFile(downloadable)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      File
                    </Button>
                  </div>
                );
              })
                : null}
              {!filesOnly
                ? extraFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                    {pipelineSections.length + idx + 1}
                  </span>
                  <span
                    className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-white"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <Button
                    variant="quiet"
                    disabled={downloadsLocked}
                    onClick={() => onDownloadFile(file)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    File
                  </Button>
                </div>
              ))
                : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </MetaAccordionStripeRow>
    </div>
  );
}

export type BulkDetailsDrawerStackProps = {
  liveMessage?: string | null;
  /** When false, skip the live stripe even if `liveMessage` is set (Content Optimizer parallel-run gating). */
  showLiveMessage?: boolean;
  prepSections?: BulkHarnessSectionUi[] | null;
  prepOpen?: boolean;
  onPrepOpenChange?: (open: boolean) => void;
  prepAccordionTitle?: string;
  pagination?: ReactNode;
  /** Receives stripe index after live/prep/pagination stripes for row numbering. */
  children: (stripeBase: number) => ReactNode;
};

export function BulkDetailsDrawerStack({
  liveMessage,
  showLiveMessage = true,
  prepSections,
  prepOpen = true,
  onPrepOpenChange,
  prepAccordionTitle = "Sitemap prep",
  pagination,
  children,
}: BulkDetailsDrawerStackProps) {
  let stripeBase = 0;
  const trimmedLive = liveMessage?.trim();
  const liveStripe =
    showLiveMessage && trimmedLive ? (
      <div className={contentOptimizerRowStripeClass(stripeBase++)}>
        <div className="border-0 px-2.5 py-1.5 text-base text-white sm:px-3">{trimmedLive}</div>
      </div>
    ) : null;

  const prepStripeIndex = prepSections?.length ? stripeBase++ : null;

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      {liveStripe}
      {prepSections?.length ? (
        <BulkDetailsPrepAccordion
          sections={prepSections}
          stripeIndex={prepStripeIndex!}
          open={prepOpen}
          onOpenChange={onPrepOpenChange ?? (() => {})}
          title={prepAccordionTitle}
        />
      ) : null}
      {pagination}
      {children(stripeBase)}
    </div>
  );
}

export function BulkDetailsPrepAccordion({
  sections,
  stripeIndex,
  open,
  onOpenChange,
  title = "Sitemap prep",
}: {
  sections: BulkHarnessSectionUi[];
  stripeIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  return (
    <MetaAccordionStripeRow stripeIndex={stripeIndex}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <Button variant="quiet">
            <MapIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words text-left">{title}</span>
            <div className={cn(META_FIELD_END_RAIL, "pointer-events-auto shrink-0")}>
              <span
                className={cn(
                  META_FIELD_COUNT,
                  META_FIELD_END_RAIL_CELL,
                  "min-w-[1.75rem] tabular-nums font-semibold",
                )}
              >
                {sections.length.toLocaleString()}
              </span>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2 text-base">
            {sections.map((s, i) => {
              const md = s.markdown?.trim();
              const mdLines = md?.split("\n") ?? [];
              const downloadHref = mdLines.length >= 2 ? mdLines[1]?.trim() : "";
              const downloadName = mdLines[0]?.trim();
              return (
                <div key={s.sectionIndex} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-white">
                      {s.title || `Section ${s.sectionIndex + 1}`}
                    </span>
                  </div>
                  {downloadHref && downloadName ? (
                    <a
                      href={downloadHref}
                      download={downloadName}
                      className="ml-8 text-primary underline-offset-2 hover:underline"
                    >
                      {downloadName}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </MetaAccordionStripeRow>
  );
}

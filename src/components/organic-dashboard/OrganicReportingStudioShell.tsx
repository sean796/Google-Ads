import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Link2,
  Square,
} from "lucide-react";
import { ContentOptimizerSplashOverlay } from "@/components/overview/studio/ContentOptimizerSplashOverlay";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
  OVERVIEW_TAB_TYPO_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import {
  clampLeftDockWidth,
  readLeftDockWidth,
  triggerBlobDownload,
  LEFT_DOCK_WIDTH_KEY,
  type OrganicReportingStudioShellProps,
} from "@/components/organic-dashboard/organic-reporting-studio-shell-helpers";
import { useOrganicReportingOutlineItems } from "@/components/organic-dashboard/use-organic-reporting-outline-items";
import { OrganicReportingStudioLeftDock } from "@/components/organic-dashboard/OrganicReportingStudioLeftDock";

export function OrganicReportingStudioShell({
  siteName,
  dateHarness,
  onDateHarnessApply,
  todayYmdMax,
  dateRangePopoverOpen,
  onDateRangePopoverOpenChange,
  splashVisible,
  busy,
  activeStatusText,
  reportContent,
  highlightsLoading,
  localGridNarrativeLoading = false,
  highlightsError,
  onRefresh,
  onShareLink,
  shareCopied,
  onDownloadMarkdown,
  onDownloadPdf,
  downloadPdfBusy,
  exportDisabled,
  clientLogoBoxTheme,
  onToggleLogoBoxTheme,
  reportIdleMessage = null,
}: OrganicReportingStudioShellProps) {
  const [dockWidth, setDockWidth] = useState<number>(() => readLeftDockWidth());
  const [isResizing, setIsResizing] = useState(false);
  const [activeAnchorId, setActiveAnchorId] = useState<string>("report-cover");
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => setDockWidth((prev) => clampLeftDockWidth(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  const finishResize = useCallback((nextWidth: number) => {
    const clamped = clampLeftDockWidth(nextWidth);
    setDockWidth(clamped);
    try {
      window.localStorage.setItem(LEFT_DOCK_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore storage errors */
    }
    setIsResizing(false);
    dragRef.current = null;
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: dockWidth };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [dockWidth],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setDockWidth(clampLeftDockWidth(drag.startWidth + (e.clientX - drag.startX)));
  }, []);

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      finishResize(drag.startWidth + (e.clientX - drag.startX));
    },
    [finishResize],
  );


  const outlineItems = useOrganicReportingOutlineItems(reportContent);

  const scrollToSection = useCallback((anchorId: string) => {
    setActiveAnchorId(anchorId);
    const container = scrollContainerRef.current;
    if (!container) return;
    if (anchorId === "report-cover" || anchorId === "report-hero") {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const target = document.getElementById(anchorId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const readyFiles = useMemo(
    () =>
      outlineItems
        .map((item) => item.downloadFile)
        .filter((f): f is BulkDetailsDownloadable => f != null),
    [outlineItems],
  );

  const readyCount = useMemo(
    () => outlineItems.filter((item) => item.isReady).length,
    [outlineItems],
  );

  const coverTitle = useMemo(
    () => `${siteName.trim()} Organic Performance`,
    [siteName],
  );

  const drawerContent = (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-white/5">
        {outlineItems.map((step, idx) => {
          const canDownload = Boolean(step.downloadFile);
          return (
            <li
              key={step.id}
              className={cn(
                "flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-base",
                contentOptimizerRowStripeClass(idx),
              )}
            >
              <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{idx + 1}</span>
              <Button
                pressed={Boolean(step.isReady)}
                variant="quiet"
                onClick={() => scrollToSection(step.anchorId)}
              >
                {step.title}
              </Button>
              <Button
                variant="quiet"
                type="button"
                disabled={!canDownload}
                onClick={() => {
                  if (!step.downloadFile) return;
                  triggerBlobDownload(step.downloadFile);
                  notify.success(NOTIFY_CSV_DOWNLOADED);
                }}
              >
                <Download className="mr-1 h-3 w-3" />
                File
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div
      className={cn(
        OVERVIEW_TAB_TYPO_CLASS,
        CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
        "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background",
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-black">
        <ContentOptimizerSplashOverlay visible={splashVisible} />
        <div
          className={cn(
            "flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden",
            splashVisible && "invisible pointer-events-none",
          )}
        >
        {/* Left Studio Dock */}
        <OrganicReportingStudioLeftDock
          dockWidth={dockWidth}
          busy={busy}
          onRefresh={onRefresh}
          dateHarness={dateHarness}
          onDateHarnessApply={onDateHarnessApply}
          todayYmdMax={todayYmdMax}
          dateRangePopoverOpen={dateRangePopoverOpen}
          onDateRangePopoverOpenChange={onDateRangePopoverOpenChange}
          outlineItems={outlineItems}
          readyCount={readyCount}
          activeAnchorId={activeAnchorId}
          scrollToSection={scrollToSection}
          isResizing={isResizing}
          onResizePointerDown={onResizePointerDown}
          onResizePointerMove={onResizePointerMove}
          onResizePointerUp={onResizePointerUp}
          finishResize={finishResize}
        />

        {/* Right Studio Document Canvas */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black font-sans text-base text-white">
            {/* Studio Top Header */}
            <header
              className={cn(
                "relative z-30 flex shrink-0 flex-col border-b bg-black transition-colors",
                busy ? "animate-meta-opt-breathe border-semantic-data/40" : "border-white/10",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <h1
                  className={cn(
                    "min-w-0 break-words text-base font-semibold",
                    busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                  )}
                >
                  {coverTitle}
                </h1>

                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {onToggleLogoBoxTheme ? (
                    <Button
                      variant="quiet"
                      type="button"
                      onClick={onToggleLogoBoxTheme}
                      title="Toggle cover logo box between black and white"
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {clientLogoBoxTheme === "white" ? "Logo Box: White" : "Logo Box: Black"}
                    </Button>
                  ) : null}

                  <Button
                    variant="quiet"
                    type="button"
                    onClick={onShareLink}
                  >
                    <Link2 className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    {shareCopied ? "Copied" : "Share link"}
                  </Button>

                  <Button
                    variant="quiet"
                    type="button"
                    disabled={exportDisabled}
                    onClick={onDownloadMarkdown}
                    title="Markdown report"
                  >
                    <FileText className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    Markdown
                  </Button>

                  <Button
                    variant="quiet"
                    type="button"
                    disabled={exportDisabled || downloadPdfBusy}
                    onClick={onDownloadPdf}
                    title="Client report PDF"
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden />
                    {downloadPdfBusy ? "Preparing…" : "PDF"}
                  </Button>
                </div>
              </div>

              <OverviewStudioGeneratedFilesBand
                busy={busy}
                activeHeadlineText={activeStatusText}
                displayStepCurrent={readyCount}
                totalStepCount={outlineItems.length}
                allReadyFiles={readyFiles}
                detailsPanelId="organic-reporting-generated-files-panel"
                drawerContent={drawerContent}
                endRailTitle="Report sections & artifacts"
              />
            </header>

            {/* Studio Document Canvas Body */}
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto bg-ui-field/40 px-4 py-6 sm:px-8"
            >
              {reportContent ? (
                <div className="mx-auto w-full max-w-[52rem]">
                  <OrganicClientReportExportDocument
                    content={reportContent}
                    highlightsLoading={highlightsLoading}
                    localGridNarrativeLoading={localGridNarrativeLoading}
                    highlightsError={highlightsError}
                    onToggleLogoBoxTheme={onToggleLogoBoxTheme}
                  />
                </div>
              ) : reportIdleMessage ? (
                <div className="mx-auto flex min-h-[12rem] w-full max-w-[52rem] flex-col items-center justify-center gap-2 px-4 text-center text-base text-muted-foreground">
                  <p>{reportIdleMessage}</p>
                </div>
              ) : (
                <div className="min-h-0 flex-1" aria-hidden />
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

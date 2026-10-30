import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Link2,
  RefreshCw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentOptimizerSplashOverlay } from "@/components/overview/studio/ContentOptimizerSplashOverlay";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
  OVERVIEW_TAB_TYPO_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import {
  Ga4ReportingDateRangePopover,
  type Ga4ReportingDateHarness,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import { cn } from "@/lib/utils";

const LEFT_DOCK_WIDTH_KEY = "neo-pulse:organic-reporting-left-dock-width:v1";
const LEFT_DOCK_DEFAULT_WIDTH = 320;
const LEFT_DOCK_MIN_WIDTH = 240;
const LEFT_DOCK_MAX_WIDTH = 520;

function clampLeftDockWidth(width: number): number {
  const maxByViewport =
    typeof window !== "undefined"
      ? Math.max(LEFT_DOCK_MIN_WIDTH, Math.min(LEFT_DOCK_MAX_WIDTH, window.innerWidth - 360))
      : LEFT_DOCK_MAX_WIDTH;
  return Math.round(Math.min(maxByViewport, Math.max(LEFT_DOCK_MIN_WIDTH, width)));
}

function readLeftDockWidth(): number {
  if (typeof window === "undefined") return LEFT_DOCK_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(LEFT_DOCK_WIDTH_KEY);
    if (!raw) return LEFT_DOCK_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return LEFT_DOCK_DEFAULT_WIDTH;
    return clampLeftDockWidth(parsed);
  } catch {
    return LEFT_DOCK_DEFAULT_WIDTH;
  }
}

function triggerBlobDownload(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ReportOutlineItem = {
  id: string;
  title: string;
  subtitle: string;
  anchorId: string;
  isReady: boolean;
  downloadFile: BulkDetailsDownloadable | null;
};

export type OrganicReportingStudioShellProps = {
  siteName: string;
  dateHarness: Ga4ReportingDateHarness;
  onDateHarnessApply: (next: Ga4ReportingDateHarness) => void;
  todayYmdMax: string;
  dateRangePopoverOpen: boolean;
  onDateRangePopoverOpenChange: (open: boolean) => void;
  splashVisible: boolean;
  busy: boolean;
  activeStatusText: string;
  reportContent: OrganicClientReportContent | null;
  highlightsLoading: boolean;
  localGridNarrativeLoading?: boolean;
  highlightsError: string | null;
  onRefresh: () => void;
  onShareLink: () => void;
  shareCopied: boolean;
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
  downloadPdfBusy: boolean;
  exportDisabled: boolean;
  clientLogoBoxTheme?: "black" | "white";
  onToggleLogoBoxTheme?: () => void;
  /** Shown when the shell is idle but reportContent is still null (failed or blocked load). */
  reportIdleMessage?: string | null;
};

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const outlineItems = useMemo((): ReportOutlineItem[] => {
    if (!reportContent) return [];
    const items: ReportOutlineItem[] = [];

    const hasInsights =
      Boolean(reportContent.highlights.executiveSummary.trim()) ||
      reportContent.highlights.keyTakeaways.length > 0;
    const hasCover =
      Boolean(reportContent.siteName.trim()) && Boolean(reportContent.periodLine.trim());
    items.push({
      id: "outline-cover",
      title: "Executive cover & insights",
      subtitle: "/cover",
      anchorId: "report-cover",
      isReady: hasCover,
      downloadFile: hasInsights
        ? {
            name: "insights-summary.json",
            content: JSON.stringify(
              {
                executiveSummary: reportContent.highlights.executiveSummary,
                keyTakeaways: reportContent.highlights.keyTakeaways,
              },
              null,
              2,
            ),
            mimeType: "application/json;charset=utf-8",
          }
        : null,
    });



    if (reportContent.showPerformanceSection) {
      items.push({
        id: "outline-performance",
        title: "Performance Summary (GA4 & GSC)",
        subtitle: "/performance-summary",
        anchorId: "export-section-performance-summary",
        isReady: reportContent.traffic.length > 0 || reportContent.search.length > 0,
        downloadFile: {
          name: "performance-summary.json",
          content: JSON.stringify(
            {
              narrative: reportContent.performanceNarrative,
              ga4Traffic: reportContent.traffic,
              gscSearch: reportContent.search,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showSemrushSection) {
      items.push({
        id: "outline-semrush",
        title: "Semrush Estimates",
        subtitle: "/semrush-estimates",
        anchorId: "export-section-semrush-estimates",
        isReady:
          reportContent.semrushDeckRows.length > 0 ||
          reportContent.topSemrushKeywords.length > 0,
        downloadFile: {
          name: "semrush-estimates.json",
          content: JSON.stringify(
            {
              summary: reportContent.semrushDeckRows,
              topKeywords: reportContent.topSemrushKeywords,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showKeywordSection) {
      items.push({
        id: "outline-keywords",
        title: "Keyword Performance",
        subtitle: "/keyword-performance",
        anchorId: "export-section-keyword-performance",
        isReady: reportContent.topQueries.length > 0,
        downloadFile: {
          name: "keyword-performance.json",
          content: JSON.stringify(
            {
              narrative: reportContent.keywordNarrative,
              topQueries: reportContent.topQueries,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showHighlightsSection) {
      items.push({
        id: "outline-highlights",
        title: "Highlights & Opportunities",
        subtitle: "/highlights",
        anchorId: "export-section-highlights",
        isReady:
          reportContent.highlightStats.length > 0 || reportContent.opportunities.length > 0,
        downloadFile: {
          name: "opportunities.json",
          content: JSON.stringify(
            {
              stats: reportContent.highlightStats,
              opportunities: reportContent.opportunities,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showLocalGridSection && reportContent.localGridSection) {
      items.push({
        id: "outline-local-grid",
        title: "Local map visibility",
        subtitle: "/local-map",
        anchorId: "export-section-local-map-visibility",
        isReady: true,
        downloadFile: {
          name: "local-grid.json",
          content: JSON.stringify(
            {
              meta: reportContent.localGridSection.meta,
              summaryRows: reportContent.localGridSection.summaryRows,
              narrative: reportContent.localGridNarrative,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showGoogleAdsSection) {
      items.push({
        id: "outline-google-ads",
        title: "Google Ads",
        subtitle: "/google-ads",
        anchorId: "export-section-google-ads",
        isReady:
          reportContent.googleAdsAccountCard != null ||
          reportContent.googleAdsDeckRows.length > 0,
        downloadFile: {
          name: "google-ads.json",
          content: JSON.stringify(
            {
              narrative: reportContent.googleAdsNarrative,
              summary: reportContent.googleAdsDeckRows,
              opportunities: reportContent.googleAdsOpportunities,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    return items;
  }, [reportContent]);

  const scrollToSection = useCallback((anchorId: string) => {
    setActiveAnchorId(anchorId);
    setDrawerOpen(false);
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
              <button
                type="button"
                onClick={() => scrollToSection(step.anchorId)}
                className={cn(
                  "min-w-0 flex-1 truncate text-left hover:underline",
                  step.isReady ? "text-white" : "text-muted-foreground",
                )}
              >
                {step.title}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canDownload}
                onClick={() => {
                  if (!step.downloadFile) return;
                  triggerBlobDownload(step.downloadFile);
                  notify.success(NOTIFY_CSV_DOWNLOADED);
                }}
                className={cn(
                  "h-7 shrink-0 px-2 text-base hover:bg-white/10 hover:text-white",
                  canDownload ? "text-white" : "text-muted-foreground opacity-45",
                )}
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
        "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background px-5 py-3 md:px-8 md:py-4",
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden border border-white/10 bg-black">
        <ContentOptimizerSplashOverlay visible={splashVisible} />
        <div
          className={cn(
            "flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden",
            splashVisible && "invisible pointer-events-none",
          )}
        >
        {/* Left Studio Dock */}
        <aside
          aria-label="Reporting studio navigator"
          style={{ width: `${dockWidth}px` }}
          className="relative flex h-full shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
        >
          {/* Top Mode Row */}
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 bg-zinc-900 px-3">
            <span className="inline-flex h-8 items-center bg-primary px-3 text-base font-semibold text-black">
              Performance
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              title="Refresh report metrics and AI overview"
              aria-label="Refresh report"
              onClick={onRefresh}
              className={cn(
                "h-8 w-8 shrink-0 rounded-none border-0 bg-black text-muted-foreground hover:bg-zinc-800 hover:text-white",
                busy && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {/* Date Range Filter Row */}
          <div className="flex flex-col gap-1.5 border-b border-white/10 bg-black p-2.5">
            <Ga4ReportingDateRangePopover
              busy={busy}
              value={dateHarness}
              onApply={onDateHarnessApply}
              todayYmdMax={todayYmdMax}
              open={dateRangePopoverOpen}
              onOpenChange={onDateRangePopoverOpenChange}
            />
            <div className="flex items-center justify-between px-1 text-base text-muted-foreground">
              <span className="tabular-nums">{outlineItems.length} report sections</span>
              <span className="tabular-nums text-primary">
                {readyCount}/{outlineItems.length} ready
              </span>
            </div>
          </div>

          {/* Scrollable Report Sections List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {outlineItems.length === 0 ? (
              <div className="min-h-48" aria-hidden />
            ) : (
              <ul className="divide-y divide-white/5" aria-label="Report sections">
                {outlineItems.map((item) => {
                  const isActive = activeAnchorId === item.anchorId;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "group flex items-start gap-2.5 px-3.5 py-3 transition-colors",
                        isActive
                          ? "border-l-2 border-primary bg-zinc-900"
                          : "bg-black hover:bg-zinc-950",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => scrollToSection(item.anchorId)}
                        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none"
                      >
                        <span
                          className={cn(
                            "line-clamp-1 text-base font-medium leading-snug",
                            isActive ? "text-primary" : "text-white group-hover:text-primary/90",
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="w-full truncate text-base text-muted-foreground">
                          {item.subtitle}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right-edge click & drag resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize reporting dock"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            onDoubleClick={() => finishResize(LEFT_DOCK_DEFAULT_WIDTH)}
            className={cn(
              "absolute inset-y-0 -right-1 z-20 w-2 cursor-ew-resize touch-none transition-colors hover:bg-primary/40",
              isResizing && "bg-primary/60",
            )}
          />
        </aside>

        {/* Right Studio Document Canvas */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 font-sans text-base text-white">
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
                    "min-w-0 truncate text-base font-semibold",
                    busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                  )}
                >
                  {coverTitle}
                </h1>

                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {onToggleLogoBoxTheme ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onToggleLogoBoxTheme}
                      className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-white hover:bg-zinc-800"
                      title="Toggle cover logo box between black and white"
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {clientLogoBoxTheme === "white" ? "Logo Box: White" : "Logo Box: Black"}
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onShareLink}
                    className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-white hover:bg-zinc-800"
                  >
                    <Link2 className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    {shareCopied ? "Copied" : "Share link"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={exportDisabled}
                    onClick={onDownloadMarkdown}
                    className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-white hover:bg-zinc-800"
                    title="Markdown report"
                  >
                    <FileText className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    Markdown
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={exportDisabled || downloadPdfBusy}
                    onClick={onDownloadPdf}
                    className="h-8 rounded-none border-0 bg-primary px-3 text-base font-semibold text-black hover:bg-primary/90"
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
                drawerOpen={drawerOpen}
                onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
                drawerContent={drawerContent}
                endRailTitle="Report sections & artifacts"
              />
            </header>

            {/* Studio Document Canvas Body */}
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto bg-zinc-900/40 px-4 py-6 sm:px-8"
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

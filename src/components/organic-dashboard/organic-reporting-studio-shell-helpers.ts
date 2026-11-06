import type { PointerEventHandler } from "react";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import type {
  Ga4ReportingDateHarness,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover-types";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";

export const LEFT_DOCK_WIDTH_KEY = "neo-pulse:organic-reporting-left-dock-width:v1";
export const LEFT_DOCK_DEFAULT_WIDTH = 320;
const LEFT_DOCK_MIN_WIDTH = 240;
const LEFT_DOCK_MAX_WIDTH = 520;

export function clampLeftDockWidth(width: number): number {
  const maxByViewport =
    typeof window !== "undefined"
      ? Math.max(LEFT_DOCK_MIN_WIDTH, Math.min(LEFT_DOCK_MAX_WIDTH, window.innerWidth - 360))
      : LEFT_DOCK_MAX_WIDTH;
  return Math.round(Math.min(maxByViewport, Math.max(LEFT_DOCK_MIN_WIDTH, width)));
}

export function readLeftDockWidth(): number {
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

export function triggerBlobDownload(file: BulkDetailsDownloadable) {
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

export type ReportOutlineItem = {
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

export type OrganicReportingStudioLeftDockProps = {
  dockWidth: number;
  busy: boolean;
  onRefresh: () => void;
  dateHarness: Ga4ReportingDateHarness;
  onDateHarnessApply: (next: Ga4ReportingDateHarness) => void;
  todayYmdMax: string;
  dateRangePopoverOpen: boolean;
  onDateRangePopoverOpenChange: (open: boolean) => void;
  outlineItems: ReportOutlineItem[];
  readyCount: number;
  activeAnchorId: string;
  scrollToSection: (anchorId: string) => void;
  isResizing: boolean;
  onResizePointerDown: PointerEventHandler<HTMLDivElement>;
  onResizePointerMove: PointerEventHandler<HTMLDivElement>;
  onResizePointerUp: PointerEventHandler<HTMLDivElement>;
  finishResize: (nextWidth: number) => void;
};

import type { ReactNode } from "react";
import { ChevronDown, Download, FileDown } from "lucide-react";
import {
  DETAILS_DRAWER_PANEL,
  DETAILS_DRAWER_SHELL,
} from "@/components/integrations/wordpress/bulk-details-drawer-styles";
import {
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
} from "@/components/overview/MetaOptimizerPageRowDetails";
import { CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import { cn } from "@/lib/utils";

export type OverviewStudioGeneratedFilesBandProps = {
  busy?: boolean;
  activeHeadlineText: string;
  displayStepCurrent: number;
  totalStepCount: number;
  allReadyFiles: BulkDetailsDownloadable[];
  detailsPanelId: string;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  drawerContent: ReactNode;
  endRailTitle?: string;
  onDownloadAll?: () => void;
  /** Override drawer surface (e.g. solid panel over a map instead of glass). */
  detailsDrawerClassName?: string;
};

function triggerBlobDownload(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export function OverviewStudioGeneratedFilesBand({
  busy = false,
  activeHeadlineText,
  displayStepCurrent,
  totalStepCount,
  allReadyFiles,
  detailsPanelId,
  drawerOpen,
  onToggleDrawer,
  drawerContent,
  endRailTitle = "Sections & SEO artifacts",
  onDownloadAll,
  detailsDrawerClassName,
}: OverviewStudioGeneratedFilesBandProps) {
  const displayTotal = Math.max(totalStepCount, 0);
  const displayCompleted =
    displayTotal > 0 ? Math.min(displayStepCurrent, displayTotal) : 0;

  const handleDownloadAll = () => {
    if (onDownloadAll) {
      onDownloadAll();
      return;
    }
    allReadyFiles.forEach((f, idx) => {
      setTimeout(() => triggerBlobDownload(f), idx * 200);
    });
    notify.success(NOTIFY_CSV_DOWNLOADED);
  };

  return (
    <div className="relative flex h-11 w-full shrink-0 items-center gap-3 border-t border-white/10 bg-zinc-900 px-4">
      <button
        type="button"
        onClick={onToggleDrawer}
        aria-expanded={drawerOpen}
        className="flex min-w-0 shrink-0 items-center gap-2 border-0 bg-transparent p-0 text-left text-base font-semibold text-white hover:text-primary"
      >
        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
        <span>Generated files</span>
      </button>

      {activeHeadlineText ? (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-base font-normal",
            busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
          )}
          role="status"
          aria-live="polite"
        >
          {activeHeadlineText}
        </span>
      ) : (
        <span className="min-w-0 flex-1" aria-hidden />
      )}

      <span className="inline-flex min-w-[4.5rem] shrink-0 justify-end tabular-nums text-muted-foreground">
        {displayTotal > 0 ? (
          <>
            <span className={cn(busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white")}>
              {displayCompleted}
            </span>
            /{displayTotal}
          </>
        ) : (
          <span className="text-muted-foreground">0/0</span>
        )}
      </span>

      <div className={cn(META_FIELD_END_RAIL, "shrink-0")}>
        <span
          className={cn(
            META_FIELD_COUNT,
            META_FIELD_END_RAIL_CELL,
            "min-w-[1.75rem] tabular-nums font-semibold",
          )}
          title={endRailTitle}
        >
          {displayTotal > 0 ? displayTotal : "0"}
        </span>
        {allReadyFiles.length > 0 || onDownloadAll ? (
          <button
            type="button"
            className={META_FIELD_END_RAIL_BTN}
            title="Download all files"
            aria-label="Download all files"
            onClick={handleDownloadAll}
          >
            <Download className="h-4 w-4 shrink-0" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggleDrawer}
        aria-expanded={drawerOpen}
        aria-controls={detailsPanelId}
        aria-label={drawerOpen ? "Close sections & files drawer" : "Open sections & files drawer"}
        className="inline-flex h-8 shrink-0 items-center gap-1 px-1.5 text-base text-white hover:text-primary"
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", drawerOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {drawerOpen ? (
        <div
          id={detailsPanelId}
          className={cn(
            DETAILS_DRAWER_SHELL,
            DETAILS_DRAWER_PANEL,
            detailsDrawerClassName,
          )}
          aria-hidden={false}
        >
          {drawerContent}
        </div>
      ) : null}
    </div>
  );
}

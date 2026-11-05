import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { DetailsDockPortal } from "@/components/pulse-assist/details-dock";
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
import { Button } from "@/ui";

export type OverviewStudioGeneratedFilesBandProps = {
  busy?: boolean;
  activeHeadlineText: string;
  displayStepCurrent: number;
  totalStepCount: number;
  allReadyFiles: BulkDetailsDownloadable[];
  detailsPanelId: string;
  drawerContent: ReactNode;
  endRailTitle?: string;
  onDownloadAll?: () => void;
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
  drawerContent,
  endRailTitle = "Sections & SEO artifacts",
  onDownloadAll,
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
    <div className="relative flex h-11 w-full shrink-0 items-center gap-3 border-t border-white/10 bg-ui-field px-4">
      {activeHeadlineText ? (
        <span
          className={cn(
            "min-w-0 flex-1 break-words text-base font-normal",
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
          <Button
            size="icon" icon={Download}
            variant="quiet"
            title="Download all files"
            aria-label="Download all files"
            onClick={handleDownloadAll}
          ></Button>
        ) : null}
      </div>
      <DetailsDockPortal id={detailsPanelId}>{drawerContent}</DetailsDockPortal>
    </div>
  );
}

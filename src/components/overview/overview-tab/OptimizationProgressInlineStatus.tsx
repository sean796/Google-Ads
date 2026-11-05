import React from "react";
import { Download } from "lucide-react";
import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import {
  downloadOptimizationProgressLog,
  formatRawOptimizationProgressLog,
  pickLatestOptimizationStatus,
} from "@/lib/content-optimization/optimization-progress-humanize";
import { Button } from "@/ui";

export function OptimizationProgressInlineStatus({
  progress,
  isOptimizing,
  reserveBand = false,
}: {
  progress: OptimizationProgressState | undefined;
  isOptimizing: boolean;
  /** Details drawer: keep min-h-9 even before first milestone. */
  reserveBand?: boolean;
}) {
  const latestStatus = pickLatestOptimizationStatus(progress);
  const canDownload = formatRawOptimizationProgressLog(progress).trim().length > 0;

  if (!latestStatus.trim() && !reserveBand) return null;

  return (
    <div
      className="flex min-h-9 min-w-0 items-center gap-2 px-2.5 py-1.5 sm:px-3"
      role="status"
      aria-live="polite"
    >
      {isOptimizing ? (
        null
      ) : null}
      <span
        className="min-w-0 flex-1 break-words text-base leading-snug text-muted-foreground"
        title={latestStatus || undefined}
      >
        {latestStatus || "\u00A0"}
      </span>
      {canDownload ? (
        <Button
          variant="quiet"
          type="button"
          onClick={() => downloadOptimizationProgressLog(progress)}
          aria-label="Download log"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Download log
        </Button>
      ) : null}
    </div>
  );
}

import React from "react";
import { Dialog, DialogContent } from "@/ui";

import type { BulkOptimizationState } from "@/hooks/use-content-optimization";
import type { LinkCheckResult } from "@/lib/wordpress-api/validate-internal-links";
import { BulkOptimizationPanel } from "./BulkOptimizationPanel";

interface BulkOptimizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkState: BulkOptimizationState | null;
  batchKey: string;
  onApproveKeywords?: (batchKey: string) => void;
  siteProgress?: { step: string; progress: number; message?: string; linkCheckResults?: LinkCheckResult[] };
}

function isBulkRunActive(bulkState: BulkOptimizationState | null): boolean {
  const urls = bulkState?.urls || [];
  const urlStatuses = bulkState?.urlStatuses || {};
  if (urls.length === 0) return false;
  const completedCount = Object.values(urlStatuses).filter((s) => s === "completed").length;
  const skippedCount = Object.values(urlStatuses).filter((s) => s === "skipped").length;
  const errorCount = Object.values(urlStatuses).filter((s) => s === "error").length;
  const processedCount = completedCount + skippedCount + errorCount;
  const allComplete = processedCount === urls.length;
  return !allComplete;
}

/** Optional modal shell around {@link BulkOptimizationPanel} (e.g. legacy flows). */
export const BulkOptimizationModal: React.FC<BulkOptimizationModalProps> = ({
  open,
  onOpenChange,
  bulkState,
  batchKey,
  onApproveKeywords,
  siteProgress,
}) => {
  const isRunning = isBulkRunActive(bulkState);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isRunning) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => {
          if (isRunning) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isRunning) e.preventDefault();
        }}
      >
        <BulkOptimizationPanel
          variant="modal"
          bulkState={bulkState}
          batchKey={batchKey}
          siteProgress={siteProgress}
          onApproveKeywords={onApproveKeywords}
          onRequestClose={({ abortingRun }) => {
            onOpenChange(false);
            if (abortingRun) {
              /* caller may reset batch */
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

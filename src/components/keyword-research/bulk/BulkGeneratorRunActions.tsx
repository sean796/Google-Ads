import { Play, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  BULK_HEADER_DANGER_ICON_BTN,
  BULK_HEADER_ICON_RUN_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";

export type BulkGeneratorRunActionsProps = {
  isProcessing: boolean;
  canRun: boolean;
  workspaceBusy: boolean;
  onRun: () => void;
  /** Omit when the section has no cancellable run. */
  onCancel?: () => void;
  onClear: () => void;
  runLabel?: string;
  /** Prompt tab: run lives on generated rows, not the header play icon. */
  hideRunButton?: boolean;
  trailing?: ReactNode;
  className?: string;
};

export function BulkGeneratorRunActions({
  isProcessing,
  canRun,
  workspaceBusy,
  onRun,
  onCancel,
  onClear,
  runLabel = "Run",
  hideRunButton = false,
  trailing,
  className,
}: BulkGeneratorRunActionsProps) {
  return (
    <div className={cn("flex shrink-0 flex-nowrap items-center gap-1.5", className)} role="group" aria-label="Run and clear">
      {isProcessing && onCancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={BULK_HEADER_DANGER_ICON_BTN}
          aria-label="Cancel"
          title="Cancel"
          onClick={onCancel}
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : hideRunButton ? null : (
        <Button
          type="button"
          size="sm"
          className={BULK_HEADER_ICON_RUN_BTN}
          disabled={!canRun}
          aria-label={runLabel}
          title={runLabel}
          onClick={onRun}
        >
          <Play className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      )}
      {trailing}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 rounded-none border border-white/10 bg-zinc-900 p-0 text-muted-foreground hover:bg-zinc-800 hover:text-red-400"
        disabled={workspaceBusy}
        aria-label="Clear"
        title="Clear"
        onClick={onClear}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

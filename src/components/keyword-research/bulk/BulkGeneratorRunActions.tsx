import { Play, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui";
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
        <Button variant="danger" size="icon" icon={Square} aria-label="Cancel" title="Cancel" onClick={onCancel} />
      ) : hideRunButton ? null : (
        <Button
          variant="run"
          size="icon"
          icon={Play}
          disabled={!canRun}
          aria-label={runLabel}
          title={runLabel}
          onClick={onRun}
        />
      )}
      {trailing}
      <Button
        variant="tool"
        size="icon"
        icon={Trash2}
        disabled={workspaceBusy}
        aria-label="Clear"
        title="Clear"
        onClick={onClear}
      />
    </div>
  );
}

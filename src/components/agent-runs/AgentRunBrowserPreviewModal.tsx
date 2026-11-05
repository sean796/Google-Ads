import { useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentRunLogTimelineRow } from "@/lib/agent-runs/agent-run-log-format";
import {
  agentRunBrowserPreviewBase64FromArtifact,
  agentRunBrowserPreviewImageSrc,
  findAgentRunBrowserPreviewArtifact,
} from "@/lib/agent-runs/agent-run-browser-preview";
import type { AgentRun } from "@/lib/agent-runs-types";
import { cn } from "@/lib/utils";
import { AgentRunProgressLog } from "./AgentRunProgressLog";

type AgentRunBrowserPreviewModalProps = {
  run: AgentRun;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timelineRows: AgentRunLogTimelineRow[];
  liveScreenshotBase64?: string | null;
  liveLabel?: string | null;
  previewCacheKey?: string | null;
};

export function AgentRunBrowserPreviewModal({
  run,
  open,
  onOpenChange,
  timelineRows,
  liveScreenshotBase64 = null,
  liveLabel = null,
  previewCacheKey = null,
}: AgentRunBrowserPreviewModalProps) {
  const artifact = findAgentRunBrowserPreviewArtifact(run);
  const imageSrc = useMemo(
    () => agentRunBrowserPreviewImageSrc(artifact, liveScreenshotBase64, previewCacheKey),
    [artifact, liveScreenshotBase64, previewCacheKey],
  );

  const statusLabel = liveLabel?.trim() || timelineRows[timelineRows.length - 1]?.label || "Waiting for browser…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay
          className={cn(
            "agent-run-browser-preview-overlay fixed inset-0 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "agent-run-browser-preview-content fixed left-[50%] top-[50%] grid w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] gap-4 border-0 bg-black p-6 text-white shadow-xl duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white">Browser preview</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-base text-muted-foreground">{statusLabel}</p>

            <div className="overflow-hidden bg-black">
              {imageSrc ? (
                <img
                  key={imageSrc.slice(0, 80)}
                  src={imageSrc}
                  alt="Puppeteer browser preview"
                  className="max-h-[min(60vh,540px)] w-full object-contain object-left-top"
                />
              ) : (
                <div className="flex min-h-[240px] items-center justify-center px-4 py-8 text-base text-muted-foreground">
                  Waiting for the first screenshot…
                </div>
              )}
            </div>

            <AgentRunProgressLog rows={timelineRows} />
          </div>

          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

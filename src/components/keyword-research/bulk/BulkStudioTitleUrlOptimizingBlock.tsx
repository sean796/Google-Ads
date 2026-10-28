import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type BulkStudioTitleUrlOptimizingBlockProps = {
  className?: string;
  compact?: boolean;
};

/** Breathing blueprint graphic while CSV/Prompt agents rewrite title and URL slug. */
export function BulkStudioTitleUrlOptimizingBlock({
  className,
  compact = false,
}: BulkStudioTitleUrlOptimizingBlockProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-none border border-dashed border-primary/35 bg-zinc-900/50 p-2.5 animate-meta-opt-breathe",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Optimizing title and URL"
    >
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-none border border-primary/30 bg-gradient-to-b from-zinc-800 to-zinc-900 shadow-inner",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          className={cn("text-primary/80", compact ? "h-5 w-5" : "h-6 w-6")}
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <rect x="2" y="2" width="24" height="24" rx="3" strokeDasharray="2.5 2.5" />
          <rect x="6" y="6" width="6" height="6" rx="1.5" className="fill-primary/15" />
          <line x1="15" y1="7" x2="22" y2="7" strokeLinecap="round" />
          <line x1="15" y1="10.5" x2="20" y2="10.5" strokeLinecap="round" className="opacity-70" />
          <line x1="6" y1="16" x2="22" y2="16" strokeLinecap="round" className="opacity-60" />
          <line x1="6" y1="19.5" x2="17" y2="19.5" strokeLinecap="round" className="opacity-50" />
        </svg>
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="inline-flex w-fit items-center gap-1 rounded-none bg-zinc-800/90 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
          Optimizing title & URL
        </span>
        <div className="flex w-full flex-col gap-1 pt-0.5">
          <div className="h-2.5 w-4/5 max-w-full rounded-none bg-zinc-800/90" />
          <div className="h-2 w-3/5 max-w-full rounded-none bg-zinc-800/70" />
        </div>
      </div>
    </div>
  );
}

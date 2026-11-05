import React from "react";
import { cn } from "@/lib/utils";
import type { GscPerformancePreviewSnapshot } from "@/hooks/content-optimization/gsc-preview-types";

export interface GscPerformancePreviewRowProps {
  snapshot: GscPerformancePreviewSnapshot | null | undefined;
  /** True while GSC request is in flight for this URL */
  loading?: boolean;
  className?: string;
}

/** Compact single-line GSC summary for fleet rows or single-post optimizer (no full table card). */
export function GscPerformancePreviewRow({ snapshot, loading, className }: GscPerformancePreviewRowProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs font-mono text-muted-foreground", className)}>
        
        <span className="font-semibold text-primary/90">GSC</span>
        <span>Fetching page queries…</span>
      </div>
    );
  }

  if (!snapshot?.queries?.length) return null;

  const top = snapshot.queries.slice(0, 5);
  const rest = snapshot.queries.length - top.length;
  const topLabel = top
    .map((q) => `"${q.query}" (${(q.impressions ?? 0).toLocaleString()} impr.)`)
    .join(" · ");
  const fullTitle = snapshot.queries.map((q) => `${q.query} (${q.impressions} impr.)`).join("\n");

  return (
    <div
      className={cn("text-xs font-mono text-muted-foreground leading-snug", className)}
      title={fullTitle}
    >
      <span className="font-semibold text-primary/90">GSC</span>
      <span className="text-foreground"> · </span>
      <span>
        {snapshot.dateRange.startDate} → {snapshot.dateRange.endDate}
      </span>
      <span className="text-foreground"> · </span>
      <span>{snapshot.queries.length} queries (top by impr.)</span>
      <span className="text-foreground"> · </span>
      <span className="text-foreground/90">
        Top: {topLabel}
        {rest > 0 ? ` · +${rest} more` : ""}
      </span>
    </div>
  );
}

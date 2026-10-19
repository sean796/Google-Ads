import React from "react";
import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";
import { revisionRowTitle } from "@/lib/overview/studio-doc-revisions-grouping";
import { cn } from "@/lib/utils";

export { revisionRowTitle };

export function formatRevisionTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function OverviewRevisionComparePanes({
  rev,
  className,
}: {
  rev: OverviewStudioRevision;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-0 flex-1 grid-cols-2 gap-3", className)}>
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <span className="text-base text-muted-foreground">Before</span>
        <div className="min-h-[20rem] min-w-0 flex-1 overflow-y-auto bg-zinc-900 px-4 py-3 text-base leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {rev.beforePlain.trim() || "(empty)"}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-1">
        <span className="text-base text-muted-foreground">After</span>
        <div className="min-h-[20rem] min-w-0 flex-1 overflow-y-auto bg-zinc-900 px-4 py-3 text-base leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {rev.afterPlain.trim() || "(empty)"}
        </div>
      </div>
    </div>
  );
}

export function OverviewRevisionListItem({
  rev,
  selected,
  onSelect,
}: {
  rev: OverviewStudioRevision;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = revisionRowTitle(rev);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 border-b border-white/10 px-3 py-2.5 text-left text-base transition-colors",
          selected ? "bg-zinc-900 text-white" : "text-zinc-200 hover:bg-zinc-900/60",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span
          className={cn(
            "shrink-0 px-2 py-0.5 text-base tabular-nums",
            rev.changed ? "text-emerald-400" : "text-muted-foreground",
          )}
        >
          {rev.changed ? "Changed" : "Unchanged"}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatRevisionTime(rev.at)}
        </span>
      </button>
    </li>
  );
}

export function triggerRevisionsJsonDownload(
  list: OverviewStudioRevision[],
  filename = "studio-revisions.json",
): void {
  const blob = new Blob([JSON.stringify(list, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

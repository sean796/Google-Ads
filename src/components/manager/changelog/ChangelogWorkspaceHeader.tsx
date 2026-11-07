import { RotateCw, ScrollText } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { Button } from "@/ui";
import { cn } from "@/lib/utils";
import type { ChangelogSourceStatus } from "@/lib/changelog/changelog-api";

export type ChangelogWorkspaceHeaderProps = {
  due: boolean;
  newestEntryDate: string | null;
  sourceStatus: ChangelogSourceStatus | null;
  generating: boolean;
  onGenerate: () => void;
  onRefresh: () => void;
};

export function ChangelogWorkspaceHeader({
  due,
  newestEntryDate,
  sourceStatus,
  generating,
  onGenerate,
  onRefresh,
}: ChangelogWorkspaceHeaderProps) {
  const sourceLine = sourceStatus
    ? `${sourceStatus.uncoveredCount} commit${sourceStatus.uncoveredCount === 1 ? "" : "s"} waiting · covered through ${sourceStatus.coveredThrough ?? "nothing yet"}`
    : "Loading archive...";

  return (
    <UnifiedWorkspaceChrome
      icon={ScrollText}
      title="Changelog"
      titleRowEnd={
        due ? (
          <span className="bg-amber-400/15 px-2.5 py-1 text-base text-amber-300">New entry due</span>
        ) : (
          <span className="px-2.5 py-1 text-base text-muted-foreground tabular-nums">
            Latest entry {newestEntryDate}
          </span>
        )
      }
      toolbar={
        <>
          <span className="min-w-0 truncate text-base text-muted-foreground tabular-nums">{sourceLine}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={generating}
              className={cn(BULK_HEADER_TOOL_BTN, "inline-flex items-center gap-1.5")}
              aria-label="Refresh changelog archive"
            >
              <RotateCw className={cn("h-4 w-4", generating && "animate-pulse")} aria-hidden />
              Refresh
            </button>
            <Button variant="run" type="button" onClick={onGenerate} disabled={generating}>
              {generating ? "Writing..." : "Generate entry"}
            </Button>
          </div>
        </>
      }
      workspaceBusy={generating}
      progressBand="empty"
    />
  );
}

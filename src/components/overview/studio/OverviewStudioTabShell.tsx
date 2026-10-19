import type { ReactNode } from "react";
import { OverviewSitemapLeftDock, type OverviewSitemapLeftDockProps } from "@/components/overview/studio/OverviewSitemapLeftDock";
import {
  CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
  OVERVIEW_TAB_TYPO_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";

export type OverviewStudioTabShellProps = {
  dock: OverviewSitemapLeftDockProps;
  /** Right column: canvas or revisions (direct flex-1 child, OPT parity). */
  main: ReactNode;
};

export function OverviewStudioTabShell({ dock, main }: OverviewStudioTabShellProps) {
  return (
    <div
      className={cn(
        OVERVIEW_TAB_TYPO_CLASS,
        CONTENT_OPTIMIZER_SQUARE_CONTROLS_CLASS,
        "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background px-5 py-3 md:px-8 md:py-4",
      )}
    >
      <div className="flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden border border-white/10 bg-black">
        <OverviewSitemapLeftDock {...dock} />
        {main}
      </div>
    </div>
  );
}

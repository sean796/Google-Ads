import { Loader2, Lock, LockOpen, Plus, X } from "lucide-react";
import type { WordPressSite } from "@/components/integrations/types";
import type { LocalGridWorkspacePanel } from "@/lib/local-grid-studio/local-grid-workspace-panels";
import { cn } from "@/lib/utils";
import type { LocalGridPanelDockSummary } from "./use-local-grid-panel";

export type LocalGridLeftDockProps = {
  panels: LocalGridWorkspacePanel[];
  activePanelId: string;
  sites: WordPressSite[];
  dockSummaries: Record<string, LocalGridPanelDockSummary | undefined>;
  onSelectPanel: (panelId: string) => void;
  onAddPanel: () => void;
  onRemovePanel: (panelId: string) => void;
  onToggleLayoutLock: (panelId: string) => void;
};

function resolveSiteName(sites: WordPressSite[], siteId: string): string | null {
  return sites.find((s) => s.id === siteId)?.name?.trim() ?? null;
}

export function LocalGridLeftDock({
  panels,
  activePanelId,
  sites,
  dockSummaries,
  onSelectPanel,
  onAddPanel,
  onRemovePanel,
  onToggleLayoutLock,
}: LocalGridLeftDockProps) {
  const canRemove = panels.length > 1;

  return (
    <aside
      className="local-grid-left-dock flex w-[280px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-200"
      aria-label="Grid workspaces"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-zinc-800 px-3 text-base font-semibold text-zinc-100">
        Grids
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1.5 p-2">
          {panels.map((panel, index) => {
            const isActive = panel.id === activePanelId;
            const summary = dockSummaries[panel.id];
            const siteValid = sites.some((s) => s.id === panel.siteId);
            const keywordDisplay =
              siteValid && summary?.keyword && summary.keyword !== "—"
                ? summary.keyword
                : `Grid ${index + 1}`;
            const scanDateDisplay = summary?.lastScanDateLabel || "No scans yet";

            return (
              <li key={panel.id}>
                <div
                  className={cn(
                    "flex min-h-[3.25rem] flex-col rounded-none px-2.5 py-2 transition-colors",
                    isActive
                      ? "border-l-2 border-primary bg-zinc-900 shadow-none"
                      : "border border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-800",
                  )}
                >
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectPanel(panel.id)}
                      className="min-w-0 flex-1 text-left rounded-none"
                    >
                      <span
                        className={cn(
                          "block truncate text-base font-semibold",
                          isActive ? "text-primary" : "text-primary/90",
                        )}
                      >
                        {keywordDisplay}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {scanDateDisplay}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end justify-start gap-1 tabular-nums">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLayoutLock(panel.id);
                          }}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-none",
                            panel.layoutLocked
                              ? "text-primary"
                              : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title={
                            panel.layoutLocked
                              ? "Unlock grid position and settings"
                              : "Lock grid position and settings"
                          }
                          aria-label={
                            panel.layoutLocked ? "Unlock grid layout" : "Lock grid layout"
                          }
                          aria-pressed={panel.layoutLocked}
                        >
                          {panel.layoutLocked ? (
                            <Lock className="h-4 w-4" aria-hidden />
                          ) : (
                            <LockOpen className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      {summary?.scanning ? (
                        <span className="inline-flex items-center gap-1 text-base text-primary">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          <span className="sr-only">Scanning</span>
                        </span>
                      ) : summary?.avgRank != null && Number.isFinite(summary.avgRank) ? (
                        <span className={cn("text-base font-semibold", isActive ? "text-primary" : "text-zinc-300")}>
                          {summary.avgRank.toFixed(2)}
                        </span>
                      ) : (
                        <span className="min-w-[2.5rem] text-right text-base text-zinc-500">—</span>
                      )}
                      </div>
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => onRemovePanel(panel.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-none text-zinc-500 hover:text-red-400"
                          aria-label={`Remove grid ${index + 1}`}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="shrink-0 border-t border-zinc-800 p-2">
        <button
          type="button"
          onClick={onAddPanel}
          disabled={sites.length === 0}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-none bg-primary text-base font-semibold text-black shadow-none hover:bg-[#92cf00] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add grid
        </button>
      </div>
    </aside>
  );
}

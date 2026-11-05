import { Lock, LockOpen, Plus, X } from "lucide-react";
import type { WordPressSite } from "@/components/integrations/types";
import type { LocalGridWorkspacePanel } from "@/lib/local-grid-studio/local-grid-workspace-panels";
import { cn } from "@/lib/utils";
import type { LocalGridPanelDockSummary } from "./use-local-grid-panel";
import { Button, CheckField, RowButton } from "@/ui";

export type LocalGridLeftDockProps = {
  panels: LocalGridWorkspacePanel[];
  activePanelId: string;
  sites: WordPressSite[];
  dockSummaries: Record<string, LocalGridPanelDockSummary | undefined>;
  onSelectPanel: (panelId: string) => void;
  onAddPanel: () => void;
  onRemovePanel: (panelId: string) => void;
  onToggleLayoutLock: (panelId: string) => void;
  checkedIds: string[];
  onToggleChecked: (panelId: string) => void;
  onToggleAllChecked: () => void;
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
  checkedIds,
  onToggleChecked,
  onToggleAllChecked,
}: LocalGridLeftDockProps) {
  const canRemove = panels.length > 1;

  return (
    <aside
      className="local-grid-left-dock flex w-[280px] shrink-0 flex-col border-r border-border bg-black text-foreground"
      aria-label="Grid workspaces"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-border px-3 text-base font-semibold text-foreground">
        <CheckField
          label="Grids"
          aria-label="Select all grids"
          checked={checkedIds.length === panels.length ? true : checkedIds.length === 0 ? false : "indeterminate"}
          onCheckedChange={onToggleAllChecked}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1.5 p-2">
          {panels.map((panel, index) => {
            const isActive = panel.id === activePanelId;
            const summary = dockSummaries[panel.id];
            const site = sites.find((s) => s.id === panel.siteId);
            const snapKw = panel.layoutSnapshot?.keyword?.trim() ?? "";
            const siteKw = site?.primaryLocalKeyword?.trim() ?? "";
            const summaryKw = summary?.keyword && summary.keyword !== "—" ? summary.keyword.trim() : "";
            const keywordDisplay = summaryKw || snapKw || siteKw || "blinds near me";
            const locationDisplay =
              summary?.locationLabel ||
              panel.layoutSnapshot?.activeBusiness?.address?.trim() ||
              "";
            const scanDateDisplay = summary?.lastScanDateLabel || "No scans yet";

            return (
              <li key={panel.id}>
                <div
                  className={cn(
                    "flex min-h-[3.25rem] min-w-0 flex-col overflow-hidden rounded-none px-2.5 py-2 transition-colors",
                    isActive
                      ? "border-l-2 border-primary bg-ui-field shadow-none"
                      : "border border-border/80 bg-ui-field/60 hover:border-border hover:bg-ui-field-hover",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <CheckField
                      aria-label={`Select grid ${index + 1}`}
                      checked={checkedIds.includes(panel.id)}
                      onCheckedChange={() => onToggleChecked(panel.id)}
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                      onClick={() => onSelectPanel(panel.id)}
                    >
                      <span
                        className={cn(
                          "block w-full break-words text-base font-semibold text-primary",
                          
                        )}
                      >
                        {keywordDisplay}
                      </span>
                      {locationDisplay ? (
                        <span className="block w-full break-words text-xs text-foreground">
                          {locationDisplay}
                        </span>
                      ) : null}
                      <span className="block w-full break-words text-xs text-muted-foreground">
                        {scanDateDisplay}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end justify-start gap-1 tabular-nums">
                      <div className="flex items-center gap-0.5">
                        <Button
                          pressed={Boolean(panel.layoutLocked)}
                          variant="quiet"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLayoutLock(panel.id);
                          }}
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
                        </Button>
                      {summary?.scanning ? (
                        <span className="inline-flex items-center gap-1 text-base text-primary">
                          
                          <span className="sr-only">Scanning</span>
                        </span>
                      ) : summary?.avgRank != null && Number.isFinite(summary.avgRank) ? (
                        <span className={cn("text-base font-semibold", isActive ? "text-primary" : "text-foreground")}>
                          {summary.avgRank.toFixed(2)}
                        </span>
                      ) : (
                        <span className="min-w-[2.5rem] text-right text-base text-muted-foreground">—</span>
                      )}
                      </div>
                      {canRemove ? (
                        <Button
                          size="icon" icon={X}
                          variant="quiet"
                          onClick={() => onRemovePanel(panel.id)}
                          aria-label={`Remove grid ${index + 1}`}
                        ></Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2">
        <RowButton
          type="button"
          onClick={onAddPanel}
          disabled={sites.length === 0}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add grid
        </RowButton>
      </div>
    </aside>
  );
}

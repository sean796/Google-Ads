import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  fetchLocalGridWorkspace,
  saveLocalGridWorkspace,
} from "@/lib/local-grid-studio/local-grid-api";
import type { LocalGridLayoutSnapshot } from "@/lib/local-grid-studio/local-grid-types";
import {
  createFallbackWorkspace,
  parsePersistedWorkspace,
  workspaceStateToDocument,
} from "@/lib/local-grid-studio/local-grid-workspace-persist";
import {
  addPanel,
  removePanel,
  setPanelLayoutLock,
  type LocalGridWorkspacePanel,
} from "@/lib/local-grid-studio/local-grid-workspace-panels";
import { createDefaultPanelsForSite } from "./local-grid-default-panels";
import { LocalGridLeftDock } from "./LocalGridLeftDock";
import { LocalGridPanelRunner } from "./LocalGridPanelRunner";
import type { LocalGridPanelDockSummary } from "./use-local-grid-panel";

export type LocalGridWorkspaceShellProps = {
  sites: WordPressSite[];
  defaultSiteId: string;
  reportError: (message: string) => void;
};

function createPanelId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}


export function LocalGridWorkspaceShell({
  sites,
  defaultSiteId,
  reportError,
}: LocalGridWorkspaceShellProps) {
  const siteById = useMemo(() => {
    const map = new Map<string, WordPressSite>();
    for (const s of sites) {
      map.set(s.id, s);
    }
    return map;
  }, [sites]);

  const [{ panels, activePanelId }, setWorkspace] = useState(() =>
    createDefaultPanelsForSite(siteById.get(defaultSiteId), defaultSiteId, createPanelId),
  );
  const [hydrated, setHydrated] = useState(false);
  const [dockSummaries, setDockSummaries] = useState<
    Record<string, LocalGridPanelDockSummary | undefined>
  >({});
  const abortByPanelRef = useRef<Map<string, () => void>>(new Map());
  const snapshotByPanelRef = useRef<Map<string, () => LocalGridLayoutSnapshot>>(new Map());
  const generateByPanelRef = useRef<Map<string, (count: number) => void>>(new Map());
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setDockSummaries({});
    void (async () => {
      const raw = await fetchLocalGridWorkspace(defaultSiteId);
      if (cancelled) return;
      const defaultSite = siteById.get(defaultSiteId);
      const parsed = parsePersistedWorkspace(raw, defaultSiteId, createPanelId);
      if (parsed) {
        const clientPanels = parsed.panels.filter((p) => p.siteId === defaultSiteId);
        if (clientPanels.length > 0) {
          const activeOk = clientPanels.some((p) => p.id === parsed.activePanelId);
          setWorkspace({
            panels: clientPanels,
            activePanelId: activeOk ? parsed.activePanelId : clientPanels[0]!.id,
          });
        } else {
          setWorkspace(createDefaultPanelsForSite(defaultSite, defaultSiteId, createPanelId));
        }
      } else {
        setWorkspace(createDefaultPanelsForSite(defaultSite, defaultSiteId, createPanelId));
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultSiteId, siteById]);

  const persistWorkspace = useCallback(
    (state: { panels: LocalGridWorkspacePanel[]; activePanelId: string }) => {
      void saveLocalGridWorkspace(workspaceStateToDocument(state), defaultSiteId).then((ok) => {
        if (!ok) {
          reportError("Local Grid · Could not save grid workspace to the server.");
        }
      });
    },
    [defaultSiteId, reportError],
  );

  useEffect(() => {
    if (!hydrated) return;
    persistWorkspace({ panels, activePanelId });
  }, [hydrated, panels, activePanelId, persistWorkspace]);

  const handleDockSummaryChange = useCallback((panelId: string, summary: LocalGridPanelDockSummary) => {
    setDockSummaries((prev) => {
      const cur = prev[panelId];
      if (
        cur &&
        cur.businessLabel === summary.businessLabel &&
        cur.locationLabel === summary.locationLabel &&
        cur.keyword === summary.keyword &&
        cur.scanning === summary.scanning &&
        cur.avgRank === summary.avgRank &&
        cur.lastScanDateLabel === summary.lastScanDateLabel
      ) {
        return prev;
      }
      return { ...prev, [panelId]: summary };
    });
  }, []);

  const handleSaveSnapshot = useCallback((panelId: string, snapshot: LocalGridLayoutSnapshot) => {
    setWorkspace((prev) => ({
      ...prev,
      panels: prev.panels.map((p) =>
        p.id === panelId ? { ...p, layoutSnapshot: snapshot } : p,
      ),
    }));
  }, []);

  const registerAbort = useCallback((panelId: string, abort: () => void) => {
    abortByPanelRef.current.set(panelId, abort);
  }, []);

  const unregisterAbort = useCallback((panelId: string) => {
    abortByPanelRef.current.delete(panelId);
  }, []);

  const registerLayoutSnapshot = useCallback(
    (panelId: string, getter: () => LocalGridLayoutSnapshot) => {
      snapshotByPanelRef.current.set(panelId, getter);
    },
    [],
  );

  const unregisterLayoutSnapshot = useCallback((panelId: string) => {
    snapshotByPanelRef.current.delete(panelId);
  }, []);

  const registerGenerateEntities = useCallback((panelId: string, run: (count: number) => void) => {
    generateByPanelRef.current.set(panelId, run);
  }, []);

  const unregisterGenerateEntities = useCallback((panelId: string) => {
    generateByPanelRef.current.delete(panelId);
  }, []);

  const handleToggleChecked = useCallback((panelId: string) => {
    setCheckedIds((prev) => (prev.includes(panelId) ? prev.filter((id) => id !== panelId) : [...prev, panelId]));
  }, []);

  const handleToggleAllChecked = useCallback(() => {
    setCheckedIds((prev) => (prev.length === panels.length ? [] : panels.map((p) => p.id)));
  }, [panels]);

  const handleSelectPanel = useCallback((panelId: string) => {
    setWorkspace((prev) => ({ ...prev, activePanelId: panelId }));
  }, []);

  const handleAddPanel = useCallback(() => {
    setWorkspace((prev) => addPanel(prev.panels, defaultSiteId, createPanelId));
  }, [defaultSiteId]);

  const handleToggleLayoutLock = useCallback((panelId: string) => {
    setWorkspace((prev) => {
      const panel = prev.panels.find((p) => p.id === panelId);
      if (!panel) return prev;
      const nextLocked = !panel.layoutLocked;
      const snapshot = nextLocked ? snapshotByPanelRef.current.get(panelId)?.() ?? null : null;
      return {
        ...prev,
        panels: setPanelLayoutLock(prev.panels, panelId, nextLocked, snapshot),
      };
    });
  }, []);

  const handleRemovePanel = useCallback(
    (panelId: string) => {
      abortByPanelRef.current.get(panelId)?.();
      abortByPanelRef.current.delete(panelId);
      snapshotByPanelRef.current.delete(panelId);
      setDockSummaries((prev) => {
        const next = { ...prev };
        delete next[panelId];
        return next;
      });
      setWorkspace((prev) => {
        const removed = removePanel(prev.panels, prev.activePanelId, panelId);
        if (!removed) return prev;
        return removed;
      });
    },
    [],
  );

  const renderPanel = (panel: LocalGridWorkspacePanel) => {
    const site = siteById.get(panel.siteId);
    if (!site) {
      return null;
    }
    const isActive = panel.id === activePanelId;
    return (
      <LocalGridPanelRunner
        key={panel.id}
        panelId={panel.id}
        site={site}
        isActive={isActive}
        layoutLocked={panel.layoutLocked}
        persistedLayout={panel.layoutSnapshot ?? null}
        reportError={reportError}
        onDockSummaryChange={handleDockSummaryChange}
        onSaveSnapshot={handleSaveSnapshot}
        registerAbort={registerAbort}
        unregisterAbort={unregisterAbort}
        registerLayoutSnapshot={registerLayoutSnapshot}
        unregisterLayoutSnapshot={unregisterLayoutSnapshot}
        registerGenerateEntities={registerGenerateEntities}
        unregisterGenerateEntities={unregisterGenerateEntities}
      />
    );
  };

  if (!hydrated) {
    return (
      <div className="local-grid-studio-viewport local-grid-studio-with-dock flex min-h-0 flex-1 bg-black" />
    );
  }

  return (
    <div className="local-grid-studio-viewport local-grid-studio-with-dock">
      <LocalGridLeftDock
        panels={panels}
        activePanelId={activePanelId}
        sites={sites}
        dockSummaries={dockSummaries}
        onSelectPanel={handleSelectPanel}
        onAddPanel={handleAddPanel}
        onRemovePanel={handleRemovePanel}
        onToggleLayoutLock={handleToggleLayoutLock}
        checkedIds={checkedIds}
        onToggleChecked={handleToggleChecked}
        onToggleAllChecked={handleToggleAllChecked}
      />
      <div className="local-grid-panel-stack flex min-h-0 min-w-0 flex-1 flex-col">
        {panels.map((panel) => renderPanel(panel))}
      </div>
    </div>
  );
}

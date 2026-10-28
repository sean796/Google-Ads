import type { LocalGridLayoutSnapshot } from "./local-grid-types";

export type LocalGridWorkspacePanel = {
  id: string;
  siteId: string;
  layoutLocked: boolean;
  layoutSnapshot?: LocalGridLayoutSnapshot | null;
};

export function createInitialPanels(
  activeSiteId: string,
  createId: () => string,
): { panels: LocalGridWorkspacePanel[]; activePanelId: string } {
  const id = createId();
  return { panels: [{ id, siteId: activeSiteId, layoutLocked: false }], activePanelId: id };
}

export function addPanel(
  panels: LocalGridWorkspacePanel[],
  defaultSiteId: string,
  createId: () => string,
): { panels: LocalGridWorkspacePanel[]; activePanelId: string } {
  const id = createId();
  return {
    panels: [...panels, { id, siteId: defaultSiteId, layoutLocked: false }],
    activePanelId: id,
  };
}

export function removePanel(
  panels: LocalGridWorkspacePanel[],
  activePanelId: string,
  panelId: string,
): { panels: LocalGridWorkspacePanel[]; activePanelId: string } | null {
  if (panels.length <= 1) return null;
  const nextPanels = panels.filter((p) => p.id !== panelId);
  if (nextPanels.length === panels.length) {
    return { panels, activePanelId };
  }
  let nextActiveId = activePanelId;
  if (activePanelId === panelId) {
    const removedIndex = panels.findIndex((p) => p.id === panelId);
    nextActiveId = nextPanels[Math.min(removedIndex, nextPanels.length - 1)]!.id;
  }
  return { panels: nextPanels, activePanelId: nextActiveId };
}

export function setPanelSite(
  panels: LocalGridWorkspacePanel[],
  panelId: string,
  siteId: string,
): LocalGridWorkspacePanel[] {
  return panels.map((p) => (p.id === panelId ? { ...p, siteId } : p));
}

export function togglePanelLayoutLock(
  panels: LocalGridWorkspacePanel[],
  panelId: string,
): LocalGridWorkspacePanel[] {
  return panels.map((p) =>
    p.id === panelId ? { ...p, layoutLocked: !p.layoutLocked } : p,
  );
}

export function setPanelLayoutLock(
  panels: LocalGridWorkspacePanel[],
  panelId: string,
  locked: boolean,
  layoutSnapshot?: LocalGridLayoutSnapshot | null,
): LocalGridWorkspacePanel[] {
  return panels.map((p) => {
    if (p.id !== panelId) return p;
    if (!locked) {
      return { ...p, layoutLocked: false };
    }
    return {
      ...p,
      layoutLocked: true,
      layoutSnapshot: layoutSnapshot ?? p.layoutSnapshot ?? null,
    };
  });
}

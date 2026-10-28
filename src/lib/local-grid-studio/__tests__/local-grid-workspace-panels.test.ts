import { describe, expect, it } from "vitest";
import {
  addPanel,
  createInitialPanels,
  removePanel,
  setPanelSite,
  togglePanelLayoutLock,
} from "../local-grid-workspace-panels";

describe("local-grid-workspace-panels", () => {
  let n = 0;
  const createId = () => `panel-${++n}`;

  it("starts with one panel on the active site", () => {
    const init = createInitialPanels("site-a", createId);
    expect(init.panels[0]).toMatchObject({ id: "panel-1", siteId: "site-a", layoutLocked: false });
    expect(init.activePanelId).toBe("panel-1");
  });

  it("adds a panel and selects it", () => {
    n = 0;
    const init = createInitialPanels("site-a", createId);
    const added = addPanel(init.panels, "site-a", createId);
    expect(added.panels).toHaveLength(2);
    expect(added.activePanelId).toBe(added.panels[1]!.id);
  });

  it("removes a panel and picks a neighbor when active was removed", () => {
    n = 0;
    const init = createInitialPanels("site-a", createId);
    const added = addPanel(init.panels, "site-a", createId);
    const removed = removePanel(added.panels, added.activePanelId, added.activePanelId);
    expect(removed?.panels).toHaveLength(1);
    expect(removed?.activePanelId).toBe(init.activePanelId);
  });

  it("does not remove the last panel", () => {
    const init = createInitialPanels("site-a", createId);
    expect(removePanel(init.panels, init.activePanelId, init.activePanelId)).toBeNull();
  });

  it("updates site on one panel", () => {
    const init = createInitialPanels("site-a", createId);
    const next = setPanelSite(init.panels, init.activePanelId, "site-b");
    expect(next[0]?.siteId).toBe("site-b");
  });

  it("toggles layout lock on one panel", () => {
    n = 0;
    const init = createInitialPanels("site-a", createId);
    const locked = togglePanelLayoutLock(init.panels, init.activePanelId);
    expect(locked[0]?.layoutLocked).toBe(true);
    const unlocked = togglePanelLayoutLock(locked, init.activePanelId);
    expect(unlocked[0]?.layoutLocked).toBe(false);
  });
});

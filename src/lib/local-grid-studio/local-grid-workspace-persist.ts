import type {
  LocalGridLayoutSnapshot,
  LocalGridScanSize,
  LocalGridShape,
  LocalGridWorkspaceDocument,
} from "./local-grid-types";
import { LOCAL_GRID_DISTANCE_MEASURES, LOCAL_GRID_SCAN_SIZES, LOCAL_GRID_SHAPES } from "./local-grid-types";
import type { LocalGridWorkspacePanel } from "./local-grid-workspace-panels";

const SCAN_SIZE_SET = new Set<string>(LOCAL_GRID_SCAN_SIZES);
const SHAPE_SET = new Set<string>(LOCAL_GRID_SHAPES);
const MEASURE_SET = new Set<string>(LOCAL_GRID_DISTANCE_MEASURES);

function parseLayoutSnapshot(raw: unknown): LocalGridLayoutSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const keyword = typeof o.keyword === "string" ? o.keyword.trim() : "";
  const centerLat = typeof o.centerLat === "number" && Number.isFinite(o.centerLat) ? o.centerLat : null;
  const centerLng = typeof o.centerLng === "number" && Number.isFinite(o.centerLng) ? o.centerLng : null;
  const scanSize = typeof o.scanSize === "string" && SCAN_SIZE_SET.has(o.scanSize) ? (o.scanSize as LocalGridScanSize) : null;
  const shape = typeof o.shape === "string" && SHAPE_SET.has(o.shape) ? (o.shape as LocalGridShape) : null;
  const distance = typeof o.distance === "number" && Number.isFinite(o.distance) ? o.distance : null;
  const distanceMeasure =
    typeof o.distanceMeasure === "string" && MEASURE_SET.has(o.distanceMeasure)
      ? (o.distanceMeasure as LocalGridLayoutSnapshot["distanceMeasure"])
      : null;
  const activeBusiness = o.activeBusiness;
  if (
    !keyword ||
    centerLat === null ||
    centerLng === null ||
    !scanSize ||
    !shape ||
    distance === null ||
    !distanceMeasure ||
    !activeBusiness ||
    typeof activeBusiness !== "object"
  ) {
    return null;
  }
  const activeScanId =
    typeof o.activeScanId === "string" && o.activeScanId.trim()
      ? o.activeScanId.trim()
      : o.activeScanId === null
        ? null
        : null;
  return {
    keyword,
    centerLat,
    centerLng,
    scanSize,
    shape,
    distance,
    distanceMeasure,
    activeBusiness: activeBusiness as LocalGridLayoutSnapshot["activeBusiness"],
    activeScanId,
  };
}

export function workspaceStateToDocument(state: {
  panels: LocalGridWorkspacePanel[];
  activePanelId: string;
}): LocalGridWorkspaceDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    activePanelId: state.activePanelId,
    panels: state.panels.map((p) => ({
      id: p.id,
      siteId: p.siteId,
      layoutLocked: p.layoutLocked,
      layoutSnapshot: p.layoutSnapshot ?? null,
    })),
  };
}

export function parsePersistedWorkspace(
  raw: unknown,
  fallbackSiteId: string,
  createId: () => string,
): { panels: LocalGridWorkspacePanel[]; activePanelId: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (doc.version !== 1) return null;
  const rawPanels = doc.panels;
  if (!Array.isArray(rawPanels) || rawPanels.length === 0 || rawPanels.length > 12) return null;

  const panels: LocalGridWorkspacePanel[] = [];
  for (const row of rawPanels) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : "";
    const siteId = typeof r.siteId === "string" && r.siteId.trim() ? r.siteId.trim() : fallbackSiteId;
    const layoutLocked = r.layoutLocked === true;
    if (!id) return null;
    const layoutSnapshot = layoutLocked ? parseLayoutSnapshot(r.layoutSnapshot) : parseLayoutSnapshot(r.layoutSnapshot);
    panels.push({
      id,
      siteId,
      layoutLocked,
      layoutSnapshot: layoutSnapshot ?? undefined,
    });
  }

  let activePanelId =
    typeof doc.activePanelId === "string" && doc.activePanelId.trim() ? doc.activePanelId.trim() : panels[0]!.id;
  if (!panels.some((p) => p.id === activePanelId)) {
    activePanelId = panels[0]!.id;
  }

  return { panels, activePanelId };
}

export function createFallbackWorkspace(activeSiteId: string, createId: () => string) {
  const id = createId();
  return {
    panels: [{ id, siteId: activeSiteId, layoutLocked: false }],
    activePanelId: id,
  };
}

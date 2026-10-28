import { backendApiUrl } from "@/lib/wordpress-api/connection";

/** Bump when report snapshot framing changes so clients recapture once. */
export const LOCAL_GRID_MAP_SNAPSHOT_CAPTURE_GENERATION = 5;

function captureGenerationStorageKey(siteId: string, scanId: string): string {
  return `neo-pulse:local-grid-map-gen:${siteId}:${scanId}`;
}

export function localGridMapSnapshotNeedsRecapture(siteId: string, scanId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = Number(localStorage.getItem(captureGenerationStorageKey(siteId, scanId)));
    return !Number.isFinite(stored) || stored < LOCAL_GRID_MAP_SNAPSHOT_CAPTURE_GENERATION;
  } catch {
    return true;
  }
}

export function markLocalGridMapSnapshotCaptured(siteId: string, scanId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      captureGenerationStorageKey(siteId, scanId),
      String(LOCAL_GRID_MAP_SNAPSHOT_CAPTURE_GENERATION),
    );
  } catch {
    /* ignore */
  }
}

export function localGridMapSnapshotImageUrl(siteId: string, scanId: string): string {
  const qs = new URLSearchParams({ siteId, scanId });
  return backendApiUrl(`/organic-dashboard/local-grid/map-image?${qs.toString()}`);
}

export async function localGridMapSnapshotExists(
  siteId: string,
  scanId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(localGridMapSnapshotImageUrl(siteId, scanId), {
    method: "GET",
    credentials: "include",
    signal,
  });
  return res.ok;
}

export async function uploadLocalGridMapSnapshot(
  siteId: string,
  scanId: string,
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/map-image"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, scanId, imageDataUrl }),
    signal,
  });
  const data = (await res.json()) as { ok?: boolean };
  const ok = res.ok && data.ok === true;
  if (ok) {
    markLocalGridMapSnapshotCaptured(siteId, scanId);
  }
  return ok;
}

const memorySnapshots = new Map<string, string>();

export function setLocalGridMapMemorySnapshot(siteId: string, scanId: string, dataUrl: string): void {
  const key = `${siteId.trim()}:${scanId.trim()}`;
  if (dataUrl.startsWith("data:image/")) {
    memorySnapshots.set(key, dataUrl);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(`neo-pulse:local-grid-map-snapshot:${key}`, dataUrl);
      }
    } catch {
      /* ignore quota errors */
    }
  }
}

export function getLocalGridMapMemorySnapshot(siteId: string, scanId: string): string | null {
  const key = `${siteId.trim()}:${scanId.trim()}`;
  const inMem = memorySnapshots.get(key);
  if (inMem && inMem.startsWith("data:image/")) return inMem;
  try {
    if (typeof sessionStorage !== "undefined") {
      const inSession = sessionStorage.getItem(`neo-pulse:local-grid-map-snapshot:${key}`);
      if (inSession && inSession.startsWith("data:image/")) {
        memorySnapshots.set(key, inSession);
        return inSession;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function waitForLeafletTiles(container: HTMLElement, timeoutMs: number = 8000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const loaded = container.querySelectorAll(".leaflet-tile-loaded").length;
      const total = container.querySelectorAll(".leaflet-tile").length;
      if (loaded >= 4 || (total > 0 && loaded >= total)) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

export async function captureLocalGridMapElement(element: HTMLElement): Promise<string> {
  await waitForLeafletTiles(element, 8000);
  await new Promise((r) => window.setTimeout(r, 400));
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(element, {
    useCORS: true,
    backgroundColor: "#ffffff",
    scale: 2,
    logging: false,
  });
  return canvas.toDataURL("image/png");
}

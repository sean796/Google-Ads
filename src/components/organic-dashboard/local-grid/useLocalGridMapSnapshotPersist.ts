import { useEffect, useRef, type RefObject } from "react";
import {
  captureLocalGridMapElement,
  localGridMapSnapshotExists,
  uploadLocalGridMapSnapshot,
} from "@/lib/local-grid-studio/local-grid-map-snapshot";

/** Saves a PNG map snapshot for the active scan when the Local Grid map is on screen. */
export function useLocalGridMapSnapshotPersist(options: {
  siteId: string;
  scanId: string | null | undefined;
  scanning: boolean;
  pointCount: number;
  mapShellRef: RefObject<HTMLElement | null>;
}) {
  const { siteId, scanId, scanning, pointCount, mapShellRef } = options;
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scanId || scanning || pointCount <= 0) return;
    const key = `${siteId}:${scanId}`;
    if (inflightRef.current === key) return;

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        if (await localGridMapSnapshotExists(siteId, scanId, controller.signal)) {
          return;
        }
        const shell = mapShellRef.current;
        if (!shell || cancelled) return;
        inflightRef.current = key;
        await new Promise((r) => window.setTimeout(r, 900));
        if (cancelled || !mapShellRef.current) return;
        const dataUrl = await captureLocalGridMapElement(mapShellRef.current);
        if (cancelled) return;
        await uploadLocalGridMapSnapshot(siteId, scanId, dataUrl, controller.signal);
      } catch {
        /* snapshot is best-effort; report can capture later */
      } finally {
        if (inflightRef.current === key) {
          inflightRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [siteId, scanId, scanning, pointCount, mapShellRef]);
}

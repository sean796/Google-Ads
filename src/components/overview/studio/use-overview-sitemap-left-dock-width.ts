import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

const LEFT_DOCK_WIDTH_KEY = "neo-pulse:overview-sitemap-left-dock-width:v1";
export const LEFT_DOCK_DEFAULT_WIDTH = 320;
const LEFT_DOCK_MIN_WIDTH = 240;
const LEFT_DOCK_MAX_WIDTH = 680;

function clampLeftDockWidth(width: number): number {
  const maxByViewport =
    typeof window !== "undefined"
      ? Math.max(LEFT_DOCK_MIN_WIDTH, Math.min(LEFT_DOCK_MAX_WIDTH, window.innerWidth - 360))
      : LEFT_DOCK_MAX_WIDTH;
  return Math.round(Math.min(maxByViewport, Math.max(LEFT_DOCK_MIN_WIDTH, width)));
}

function readLeftDockWidth(): number {
  if (typeof window === "undefined") return LEFT_DOCK_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(LEFT_DOCK_WIDTH_KEY);
    if (!raw) return LEFT_DOCK_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return LEFT_DOCK_DEFAULT_WIDTH;
    return clampLeftDockWidth(parsed);
  } catch {
    return LEFT_DOCK_DEFAULT_WIDTH;
  }
}

export function useOverviewSitemapLeftDockWidth() {
  const [dockWidth, setDockWidth] = useState<number>(() => readLeftDockWidth());
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onResize = () => setDockWidth((prev) => clampLeftDockWidth(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  const finishResize = useCallback((nextWidth: number) => {
    const clamped = clampLeftDockWidth(nextWidth);
    setDockWidth(clamped);
    try {
      window.localStorage.setItem(LEFT_DOCK_WIDTH_KEY, String(clamped));
    } catch {
      // Ignore storage errors
    }
    setIsResizing(false);
    dragRef.current = null;
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: dockWidth };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [dockWidth],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextWidth = drag.startWidth + (e.clientX - drag.startX);
    setDockWidth(clampLeftDockWidth(nextWidth));
  }, []);

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      finishResize(drag.startWidth + (e.clientX - drag.startX));
    },
    [finishResize],
  );
  return {
    dockWidth,
    isResizing,
    finishResize,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
  };
}

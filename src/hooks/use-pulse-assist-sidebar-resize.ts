import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
} from "@/lib/pulse-assist/storage";

const MOBILE_QUERY = "(max-width: 767px)";

type DragState = {
  startX: number;
  startWidth: number;
};

export function usePulseAssistSidebarResize(enabled: boolean) {
  const [width, setWidth] = useState(() => readSidebarWidth());
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY).matches : false,
  );
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setWidth((current) => clampSidebarWidth(current));
    };
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
    const clamped = clampSidebarWidth(nextWidth);
    setWidth(clamped);
    writeSidebarWidth(clamped);
    setIsResizing(false);
    dragRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || isMobile || event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width };
      setIsResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [enabled, isMobile, width],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextWidth = drag.startWidth + (drag.startX - event.clientX);
    setWidth(clampSidebarWidth(nextWidth));
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishResize(drag.startWidth + (drag.startX - event.clientX));
    },
    [finishResize],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishResize(drag.startWidth + (drag.startX - event.clientX));
    },
    [finishResize],
  );

  const ensureWidthAtLeast = useCallback((minWidth: number) => {
    setWidth((current) => {
      const next = clampSidebarWidth(Math.max(current, minWidth));
      if (next !== current) writeSidebarWidth(next);
      return next;
    });
  }, []);

  return {
    width,
    isResizing,
    isMobile,
    ensureWidthAtLeast,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}

import { useEffect } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { LocalGridLayoutSnapshot } from "@/lib/local-grid-studio/local-grid-types";
import { LocalGridPanelViewport } from "./LocalGridPanelViewport";
import type { LocalGridPanelDockSummary } from "./use-local-grid-panel";
import { useLocalGridPanel } from "./use-local-grid-panel";

export type LocalGridPanelRunnerProps = {
  panelId: string;
  site: WordPressSite;
  isActive: boolean;
  layoutLocked: boolean;
  persistedLayout: LocalGridLayoutSnapshot | null;
  reportError: (message: string) => void;
  onDockSummaryChange: (panelId: string, summary: LocalGridPanelDockSummary) => void;
  registerAbort: (panelId: string, abort: () => void) => void;
  unregisterAbort: (panelId: string) => void;
  registerLayoutSnapshot: (panelId: string, getter: () => LocalGridLayoutSnapshot) => void;
  unregisterLayoutSnapshot: (panelId: string) => void;
};

export function LocalGridPanelRunner({
  panelId,
  site,
  isActive,
  layoutLocked,
  persistedLayout,
  reportError,
  onDockSummaryChange,
  registerAbort,
  unregisterAbort,
  registerLayoutSnapshot,
  unregisterLayoutSnapshot,
}: LocalGridPanelRunnerProps) {
  const { dockSummary, abortScan, getLayoutSnapshot, viewportProps } = useLocalGridPanel(
    site,
    reportError,
    layoutLocked,
    persistedLayout,
  );

  useEffect(() => {
    onDockSummaryChange(panelId, dockSummary);
  }, [panelId, dockSummary, onDockSummaryChange]);

  useEffect(() => {
    registerAbort(panelId, abortScan);
    return () => unregisterAbort(panelId);
  }, [panelId, abortScan, registerAbort, unregisterAbort]);

  useEffect(() => {
    registerLayoutSnapshot(panelId, getLayoutSnapshot);
    return () => unregisterLayoutSnapshot(panelId);
  }, [panelId, getLayoutSnapshot, registerLayoutSnapshot, unregisterLayoutSnapshot]);

  if (!isActive) {
    return null;
  }

  return <LocalGridPanelViewport {...viewportProps} />;
}

import type { OverviewRow } from "@/components/overview/overview-meta-row-types";

export type StudioDocMetaInspectorBridge = {
  row: OverviewRow;
  rowIndex: number;
  busy: boolean;
  onUpdateRow: (index: number, patch: Partial<OverviewRow>) => void;
  onAiKeyword: (index: number) => void | Promise<unknown>;
  onAiUrl: (index: number) => void | Promise<unknown>;
  onAiTitle: (index: number) => void | Promise<unknown>;
  onAiMeta: (index: number) => void | Promise<unknown>;
  onAiAllMeta: (index: number) => void | Promise<unknown>;
  onResearchRow: (index: number) => void | Promise<unknown>;
  onSetDateToday: (index: number) => void;
  onCommitDateModifier: (index: number) => void;
};

let currentBridge: StudioDocMetaInspectorBridge | null = null;
const listeners = new Set<() => void>();

export function setStudioDocMetaInspectorBridge(
  next: StudioDocMetaInspectorBridge | null,
): void {
  currentBridge = next;
  for (const listener of listeners) {
    listener();
  }
}

export function getStudioDocMetaInspectorBridge(): StudioDocMetaInspectorBridge | null {
  return currentBridge;
}

export function subscribeStudioDocMetaInspectorBridge(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

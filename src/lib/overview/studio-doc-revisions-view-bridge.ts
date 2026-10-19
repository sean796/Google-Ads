export type StudioDocRevisionsViewBridge = {
  openRevisions: () => void;
};

let currentBridge: StudioDocRevisionsViewBridge | null = null;
const listeners = new Set<() => void>();

export function setStudioDocRevisionsViewBridge(
  next: StudioDocRevisionsViewBridge | null,
): void {
  currentBridge = next;
  for (const listener of listeners) {
    listener();
  }
}

export function getStudioDocRevisionsViewBridge(): StudioDocRevisionsViewBridge | null {
  return currentBridge;
}

export function subscribeStudioDocRevisionsViewBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

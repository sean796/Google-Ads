import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export const OVERVIEW_STUDIO_REVISION_PLAIN_MAX = 24_000;
export const OVERVIEW_STUDIO_REVISION_HTML_MAX = 48_000;

export type OverviewStudioRevision = {
  id: string;
  urlKey: string;
  stepLabel: string;
  sectionTitle?: string;
  runId?: string;
  at: number;
  beforeHtml: string;
  afterHtml: string;
  beforePlain: string;
  afterPlain: string;
  changed: boolean;
};

const revisionsByUrlKey = new Map<string, OverviewStudioRevision[]>();
const listeners = new Set<() => void>();

/** Stable empty snapshot for useSyncExternalStore (must not allocate [] per read). */
const EMPTY_REVISIONS: OverviewStudioRevision[] = [];

let revisionSeq = 0;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function normalizeRevisionPlain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function capRevisionPlain(text: string): string {
  const t = text.trim();
  if (t.length <= OVERVIEW_STUDIO_REVISION_PLAIN_MAX) return t;
  return `${t.slice(0, OVERVIEW_STUDIO_REVISION_PLAIN_MAX)}\n\n[truncated]`;
}

export function capRevisionHtml(html: string): string {
  const t = html.trim();
  if (t.length <= OVERVIEW_STUDIO_REVISION_HTML_MAX) return t;
  return `${t.slice(0, OVERVIEW_STUDIO_REVISION_HTML_MAX)}\n<!-- truncated -->`;
}

export function revisionPlainFromHtml(html: string): string {
  return capRevisionPlain(prosePlainText(html || ""));
}

export function computeRevisionChanged(beforePlain: string, afterPlain: string): boolean {
  return normalizeRevisionPlain(beforePlain) !== normalizeRevisionPlain(afterPlain);
}

export function appendOverviewStudioRevision(entry: Omit<OverviewStudioRevision, "id" | "at">): OverviewStudioRevision {
  const urlKey = entry.urlKey.trim();
  if (!urlKey) {
    throw new Error("appendOverviewStudioRevision requires urlKey");
  }
  revisionSeq += 1;
  const full: OverviewStudioRevision = {
    ...entry,
    id: `rev-${revisionSeq}-${Date.now()}`,
    at: Date.now(),
    beforeHtml: capRevisionHtml(entry.beforeHtml),
    afterHtml: capRevisionHtml(entry.afterHtml),
    beforePlain: capRevisionPlain(entry.beforePlain),
    afterPlain: capRevisionPlain(entry.afterPlain),
    changed: computeRevisionChanged(entry.beforePlain, entry.afterPlain),
  };
  const list = revisionsByUrlKey.get(urlKey) ?? [];
  revisionsByUrlKey.set(urlKey, [full, ...list]);
  notify();
  return full;
}

export function getRevisionsForUrl(url: string | null | undefined): OverviewStudioRevision[] {
  const key = url?.trim() ? normalizePageUrlKey(url) : "";
  if (!key) return EMPTY_REVISIONS;
  return revisionsByUrlKey.get(key) ?? EMPTY_REVISIONS;
}

export function clearOverviewStudioRevisions(url: string | null | undefined): void {
  const key = url?.trim() ? normalizePageUrlKey(url) : "";
  if (!key) return;
  if (!revisionsByUrlKey.has(key)) return;
  revisionsByUrlKey.delete(key);
  notify();
}

export function subscribeOverviewStudioRevisions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset */
export function resetOverviewStudioRevisionsStoreForTests(): void {
  revisionsByUrlKey.clear();
  revisionSeq = 0;
}

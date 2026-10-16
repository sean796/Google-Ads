import {
  normalizeOrganicReportingHighlights,
  type OrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  normalizeOrganicDashboardViewModelForDeck,
  type OrganicDashboardViewModel,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";

export type OrganicClientReportDeckPayload = {
  siteId: string;
  highlights: OrganicReportingHighlights;
  viewModel: OrganicDashboardViewModel;
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  preparedOn: string;
};

const STORAGE_PREFIX = "neo-pulse:organic-client-report:";
const EPHEMERAL_CACHE_PREFIXES = [
  STORAGE_PREFIX,
  "neo-pulse-site-prefetch:v1:",
  "neo-pulse-chat-session-",
  "keyword_api_cache_",
];

function storageKey(deckId: string): string {
  return `${STORAGE_PREFIX}${deckId}`;
}

function removeKeysByPrefix(storage: Storage, prefixes: readonly string[], keepKey?: string): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || k === keepKey) continue;
      if (prefixes.some((prefix) => k.startsWith(prefix))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      storage.removeItem(k);
    }
  } catch {
    /* ignore storage iteration errors */
  }
}

function trySessionStorageWrite(key: string, serialized: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    removeKeysByPrefix(sessionStorage, [STORAGE_PREFIX], key);
    sessionStorage.setItem(key, serialized);
  } catch {
    /* ignore sessionStorage quota errors */
  }
}

function readFromStorage(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Persists the report deck for cross-tab preview, evicting stale decks and ephemeral caches if quota is tight. */
export function writeOrganicClientReportDeckSession(
  deckId: string,
  payload: OrganicClientReportDeckPayload,
): void {
  const key = storageKey(deckId);
  const serialized = JSON.stringify(payload);

  trySessionStorageWrite(key, serialized);

  if (typeof localStorage === "undefined") return;

  removeKeysByPrefix(localStorage, [STORAGE_PREFIX], key);
  try {
    localStorage.setItem(key, serialized);
    return;
  } catch {
    removeKeysByPrefix(localStorage, EPHEMERAL_CACHE_PREFIXES, key);
  }

  try {
    localStorage.setItem(key, serialized);
  } catch {
    /* sessionStorage still holds the deck if localStorage remains full */
  }
}

export function deckHighlightsNeedsAgentNarratives(
  highlights: OrganicClientReportDeckPayload["highlights"],
): boolean {
  const staleOpportunities = highlights.topOpportunities.some(
    (o) => o.comparisonRows.length < 1,
  );
  return (
    highlights.performanceNarrative.length < 2 ||
    highlights.keywordNarrative.length < 1 ||
    staleOpportunities
  );
}

export function readOrganicClientReportDeckSession(
  deckId: string,
  siteId: string,
): OrganicClientReportDeckPayload | null {
  const key = storageKey(deckId);
  const raw =
    (typeof localStorage !== "undefined" ? readFromStorage(localStorage, key) : null) ??
    (typeof sessionStorage !== "undefined" ? readFromStorage(sessionStorage, key) : null);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.siteId !== siteId) return null;
  if (typeof o.siteName !== "string" || typeof o.siteUrl !== "string") return null;
  if (typeof o.showCompare !== "boolean" || typeof o.preparedOn !== "string") return null;
  if (!o.highlights || typeof o.highlights !== "object") return null;
  if (!o.viewModel || typeof o.viewModel !== "object") return null;
  const highlights = normalizeOrganicReportingHighlights(o.highlights);
  if (!highlights) return null;
  return {
    siteId,
    siteName: o.siteName,
    siteUrl: o.siteUrl,
    showCompare: o.showCompare,
    preparedOn: o.preparedOn,
    viewModel: normalizeOrganicDashboardViewModelForDeck(o.viewModel),
    highlights,
  };
}

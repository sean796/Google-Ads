import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import type { EntityGscKeywordBundle } from "@/lib/bulk/bulk-gsc-site-queries";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { parseCompactInventoryUrls } from "@/lib/bulk/inventory-json-slim";
import type { EntitySiteWarmBundle, EntitySiteWarmCounts } from "@/lib/local-analysis/entity-site-warm-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

const DB_NAME = "neo-pulse-site-prefetch";
const DB_VERSION = 1;
const STORE = "bundles";
const STORAGE_PREFIX = "neo-pulse-site-prefetch:v1:";
const WARM_URL_MIRROR_PREFIX = "neo-pulse-warm-url-mirror:v1:";

function warmUrlMirrorKey(siteId: string, source: OverviewSitemapSource): string {
  return `${WARM_URL_MIRROR_PREFIX}${siteId}:${source}`;
}

function writeWarmUrlMirrorsFromBundle(bundle: EntitySiteWarmBundle): void {
  for (const source of ["pages", "posts", "sap"] as const) {
    const json = bundle.inventory.buckets[source]?.json?.trim();
    if (!json) continue;
    try {
      const urls = parseCompactInventoryUrls(json);
      if (!urls.length) continue;
      localStorage.setItem(warmUrlMirrorKey(bundle.siteId, source), JSON.stringify(urls));
    } catch {
      /* quota or parse */
    }
  }
}

/** Compact URL list for sync first paint when full bundle is not in localStorage. */
export function readWarmUrlMirrorSync(siteId: string, source: OverviewSitemapSource): string[] {
  try {
    const raw = localStorage.getItem(warmUrlMirrorKey(siteId, source));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  } catch {
    return [];
  }
}

export function deleteWarmUrlMirrorsForSite(siteId: string): void {
  try {
    for (const source of ["pages", "posts", "sap"] as const) {
      localStorage.removeItem(warmUrlMirrorKey(siteId, source));
    }
  } catch {
    /* ignore */
  }
}

export type PersistedSitePrefetch = {
  siteId: string;
  credentialsKey: string;
  fetchedAt: number;
  inventory: {
    buckets: PromptBulkSitemapInventoryBuckets;
    totalRows: number;
    sources: EntitySiteWarmBundle["inventory"]["sources"];
    errors: Record<string, string>;
    postsMetadata: EntitySiteWarmBundle["inventory"]["postsMetadata"];
  };
  gsc: EntityGscKeywordBundle;
  counts: EntitySiteWarmCounts;
  bulkInventoryRows: SiteInventoryBulkRow[];
  error?: string;
};

function storageKey(siteId: string, credentialsKey: string): string {
  return `${STORAGE_PREFIX}${siteId}:${credentialsKey}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet(key: string): Promise<PersistedSitePrefetch | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as PersistedSitePrefetch | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(key: string, value: PersistedSitePrefetch): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function readLocalStorage(key: string): PersistedSitePrefetch | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSitePrefetch;
  } catch {
    return null;
  }
}

function slimBulkRowsForLocalStorage(rows: SiteInventoryBulkRow[]): SiteInventoryBulkRow[] {
  return rows.map((row) => {
    if (!row) return row;
    const { acf: _acf, ...restRow } = row as SiteInventoryBulkRow & { acf?: unknown };
    if (!restRow.fields) return restRow;
    const { content: _c, extraText: _e, ...restFields } = restRow.fields as Record<string, unknown>;
    return {
      ...restRow,
      fields: restFields as SiteInventoryBulkRow["fields"],
    };
  });
}

function slimPersistedForLocalStorage(value: PersistedSitePrefetch): PersistedSitePrefetch {
  return {
    ...value,
    bulkInventoryRows: slimBulkRowsForLocalStorage(value.bulkInventoryRows ?? []),
  };
}

/** Reclaim multi-MB localStorage keys from older builds that stored full HTML in LS. */
export function reclaimBloatedLocalStorageQuota(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keysToProcess: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith(STORAGE_PREFIX) ||
        k.startsWith("neo-pulse-overview-rows-local:v4:")
      ) {
        const raw = localStorage.getItem(k);
        if (raw && raw.length > 300_000) {
          keysToProcess.push(k);
        }
      }
    }
    for (const k of keysToProcess) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      if (k.startsWith(STORAGE_PREFIX)) {
        try {
          const parsed = JSON.parse(raw) as PersistedSitePrefetch;
          localStorage.setItem(k, JSON.stringify(slimPersistedForLocalStorage(parsed)));
        } catch {
          localStorage.removeItem(k);
        }
      } else if (k.startsWith("neo-pulse-overview-rows-local:v4:")) {
        try {
          const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
          if (Array.isArray(parsed)) {
            const slimmed = parsed.map((row) => {
              const {
                postContent: _pc,
                postContentOptimized: _pco,
                elementorDataJson: _edj,
                blogH2OptimizedHtml: _h2h,
                blogFaqAppendedHtml: _faqh,
                blogLinksWeavedHtml: _lwh,
                blogWikipediaLinkedHtml: _wiki,
                seoResearch: _sr,
                contentAnalyzeBulletsMarkdown: _cab,
                blogH2PlanJson: _h2p,
                ...rest
              } = row;
              return rest;
            });
            localStorage.setItem(k, JSON.stringify(slimmed));
          }
        } catch {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function writeLocalStorage(key: string, value: PersistedSitePrefetch): void {
  const payload = JSON.stringify(slimPersistedForLocalStorage(value));
  try {
    localStorage.setItem(key, payload);
  } catch {
    reclaimBloatedLocalStorageQuota();
    try {
      localStorage.setItem(key, payload);
    } catch {
      /* quota */
    }
  }
}

function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function bundleToPersisted(bundle: EntitySiteWarmBundle): PersistedSitePrefetch {
  return {
    siteId: bundle.siteId,
    credentialsKey: bundle.credentialsKey,
    fetchedAt: bundle.fetchedAt,
    inventory: {
      buckets: bundle.inventory.buckets,
      totalRows: bundle.inventory.totalRows,
      sources: bundle.inventory.sources,
      errors: bundle.inventory.errors,
      postsMetadata: bundle.inventory.postsMetadata,
    },
    gsc: bundle.gsc,
    counts: bundle.counts,
    bulkInventoryRows: bundle.bulkInventoryRows ?? [],
    error: bundle.error,
  };
}

function persistedToWarmBundle(persisted: PersistedSitePrefetch): EntitySiteWarmBundle {
  return {
    siteId: persisted.siteId,
    credentialsKey: persisted.credentialsKey,
    fetchedAt: persisted.fetchedAt,
    inventory: {
      links: [],
      buckets: persisted.inventory.buckets,
      totalRows: persisted.inventory.totalRows,
      sources: persisted.inventory.sources,
      errors: persisted.inventory.errors,
      postsMetadata: persisted.inventory.postsMetadata,
    },
    gsc: persisted.gsc,
    counts: persisted.counts,
    bulkInventoryRows: persisted.bulkInventoryRows,
    error: persisted.error,
  };
}

function readSitePrefetchPersistSyncByStorageKey(key: string, siteId: string): EntitySiteWarmBundle | null {
  const persisted = readLocalStorage(key);
  if (!persisted || persisted.siteId !== siteId) return null;
  return persistedToWarmBundle(persisted);
}

/** Synchronous read (localStorage only) for first-paint Details inventory. */
export function readSitePrefetchPersistSync(
  siteId: string,
  credentialsKey: string,
): EntitySiteWarmBundle | null {
  const key = storageKey(siteId, credentialsKey);
  const direct = readSitePrefetchPersistSyncByStorageKey(key, siteId);
  if (direct && direct.credentialsKey === credentialsKey) return direct;
  try {
    const prefix = `${STORAGE_PREFIX}${siteId}:`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKeyName = localStorage.key(i);
      if (!storageKeyName?.startsWith(prefix)) continue;
      const match = readSitePrefetchPersistSyncByStorageKey(storageKeyName, siteId);
      if (match && match.counts.inventoryTotal > 0) return match;
    }
  } catch {
    /* ignore */
  }
  return direct;
}

export async function readSitePrefetchPersist(
  siteId: string,
  credentialsKey: string,
): Promise<EntitySiteWarmBundle | null> {
  const key = storageKey(siteId, credentialsKey);
  const fromIdb = await idbGet(key);
  const persisted = fromIdb ?? readLocalStorage(key);
  if (!persisted || persisted.siteId !== siteId || persisted.credentialsKey !== credentialsKey) {
    return null;
  }
  return persistedToWarmBundle(persisted);
}

export async function writeSitePrefetchPersist(bundle: EntitySiteWarmBundle): Promise<void> {
  if (bundle.error && bundle.counts.inventoryTotal === 0 && bundle.counts.gscQueries === 0) {
    return;
  }
  const key = storageKey(bundle.siteId, bundle.credentialsKey);
  const persisted = bundleToPersisted(bundle);
  writeLocalStorage(key, persisted);
  writeWarmUrlMirrorsFromBundle(bundle);
  await idbSet(key, persisted);
}

export async function deleteSitePrefetchPersist(siteId: string): Promise<void> {
  if (typeof indexedDB !== "undefined") {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const key = String(cursor.key);
          if (key.startsWith(`${STORAGE_PREFIX}${siteId}:`)) {
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${STORAGE_PREFIX}${siteId}:`)) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
  deleteWarmUrlMirrorsForSite(siteId);
}

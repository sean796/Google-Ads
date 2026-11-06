import type { WordPressSite } from "@/components/integrations/types";
import {
  clearBulkGenerationWpInventoryCache,
  seedBulkGenerationWpInventoryFromBundle,
} from "@/lib/bulk/bulk-generation-inventory-cache-store";
import {
  deleteSitePrefetchPersist,
  readSitePrefetchPersistSync,
} from "@/lib/local-analysis/site-prefetch-persist";
import {
  hydrateInventoryLinks,
  siteWarmCredentialsKey,
} from "@/lib/local-analysis/entity-site-warm-helpers";
import {
  SITE_PREFETCH_TTL_MS,
  type EntitySiteWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-types";

export const cacheBySiteId = new Map<string, EntitySiteWarmBundle>();
export const coldInflightBySiteId = new Map<string, Promise<EntitySiteWarmBundle>>();
export const backgroundInflightBySiteId = new Map<string, Promise<void>>();
/** Top-bar Refresh site data (content walk + force warm). */
export const forceRefreshInflightBySiteId = new Set<string>();
export const credentialsKeyBySiteId = new Map<string, string>();
const warmingListeners = new Set<() => void>();
/** Bumped on every cache/inflight notify so useSyncExternalStore re-renders on persist hydrate (inflight size alone stays 0). */
let warmCacheEpoch = 0;
/** WP inventory leg of the warm fetch; resolves before GSC so hydration never waits on GSC. */
export const inventoryLegBySiteId = new Map<string, Promise<void>>();
export const inventoryLegResolveBySiteId = new Map<string, () => void>();
export const metadataSeedInflightBySiteId = new Set<string>();

export function resolveInventoryLeg(siteId: string): void {
  inventoryLegResolveBySiteId.get(siteId)?.();
  inventoryLegResolveBySiteId.delete(siteId);
}

export function notifyEntitySiteWarmInflightChanged(): void {
  warmCacheEpoch += 1;
  for (const listener of warmingListeners) {
    listener();
  }
}

export function isSitePrefetchStale(bundle: EntitySiteWarmBundle): boolean {
  return Date.now() - bundle.fetchedAt > SITE_PREFETCH_TTL_MS;
}

export function isEntitySiteWarmInflight(siteId: string): boolean {
  if (!coldInflightBySiteId.has(siteId)) return false;
  const ready = getEntitySiteWarmCacheIfReady(siteId);
  return !(ready && ready.counts.inventoryTotal > 0);
}

export function isSitePrefetchBackgroundRefreshing(siteId: string): boolean {
  return backgroundInflightBySiteId.has(siteId);
}

/** True while top-bar Refresh / cold warm / background SWR is in flight. */
export function isSitePrefetchRefreshing(siteId: string): boolean {
  return (
    forceRefreshInflightBySiteId.has(siteId) ||
    backgroundInflightBySiteId.has(siteId) ||
    coldInflightBySiteId.has(siteId)
  );
}

export function subscribeEntitySiteWarmInflight(listener: () => void): () => void {
  warmingListeners.add(listener);
  return () => warmingListeners.delete(listener);
}

export function getEntitySiteWarmInflightSnapshot(): number {
  return warmCacheEpoch;
}

export function clearEntitySiteWarmCache(siteId?: string): void {
  if (siteId) {
    cacheBySiteId.delete(siteId);
    coldInflightBySiteId.delete(siteId);
    backgroundInflightBySiteId.delete(siteId);
    forceRefreshInflightBySiteId.delete(siteId);
    credentialsKeyBySiteId.delete(siteId);
    clearBulkGenerationWpInventoryCache(siteId);
    void deleteSitePrefetchPersist(siteId);
    notifyEntitySiteWarmInflightChanged();
    return;
  }
  cacheBySiteId.clear();
  coldInflightBySiteId.clear();
  backgroundInflightBySiteId.clear();
  forceRefreshInflightBySiteId.clear();
  credentialsKeyBySiteId.clear();
  clearBulkGenerationWpInventoryCache();
  notifyEntitySiteWarmInflightChanged();
}

export function invalidateEntitySiteWarmCacheIfCredentialsChanged(site: WordPressSite): void {
  const key = siteWarmCredentialsKey(site);
  const prev = credentialsKeyBySiteId.get(site.id);
  if (prev !== undefined && prev !== key) {
    clearEntitySiteWarmCache(site.id);
  }
  credentialsKeyBySiteId.set(site.id, key);
}

export function getEntitySiteWarmCacheIfReady(siteId: string): EntitySiteWarmBundle | null {
  const cached = cacheBySiteId.get(siteId);
  if (!cached || cached.error || cached.counts.inventoryTotal <= 0) return null;
  const credKey = credentialsKeyBySiteId.get(siteId);
  if (credKey !== undefined && cached.credentialsKey !== credKey) return null;
  return cached;
}

/** Memory warm bundle, else synchronous localStorage persist (first paint, no network). */
export function resolveEntitySiteWarmBundleSync(site: WordPressSite): EntitySiteWarmBundle | null {
  const fromMemory = peekEntitySiteWarmCache(site.id);
  if (fromMemory) return fromMemory;
  const credKey = siteWarmCredentialsKey(site);
  const fromPersist = readSitePrefetchPersistSync(site.id, credKey);
  if (!fromPersist) return null;
  const hydrated = hydrateInventoryLinks(site, fromPersist);
  cacheBySiteId.set(site.id, hydrated);
  credentialsKeyBySiteId.set(site.id, credKey);
  seedBulkGenerationWpInventoryFromBundle(site, hydrated);
  return hydrated;
}

/** Latest in-memory warm bundle for UI (hosted sitemap links); not gated on GSC readiness. */
export function peekEntitySiteWarmCache(siteId: string): EntitySiteWarmBundle | null {
  const cached = cacheBySiteId.get(siteId);
  if (!cached) return null;
  const credKey = credentialsKeyBySiteId.get(siteId);
  if (credKey !== undefined && cached.credentialsKey !== credKey) return null;
  return cached;
}


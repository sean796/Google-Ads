import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import { ACTIVE_WP_SITE_STORAGE_KEY } from "@/contexts/active-wordpress-site-context";
import { seedBulkInventorySessionFromSiteWarmCache } from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";
import {
  hydrateEntitySiteWarmCacheFromPersist,
  peekEntitySiteWarmCache,
  resolveEntitySiteWarmBundleSync,
  seedOverviewSessionCachesFromWarm,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { reclaimBloatedLocalStorageQuota } from "@/lib/local-analysis/site-prefetch-persist";
import { dispatchOverviewCacheHydrated } from "@/lib/overview/overview-cache-hydrated-event";
import { syncOverviewRowsFromWarmCache } from "@/lib/overview/overview-sitemap-warm-rows-sync";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

const SOURCES: OverviewSitemapSource[] = ["pages", "posts", "sap"];

let appInventoryInitDone = false;

export function resolveActiveSiteForInventory(sites: WordPressSite[]): WordPressSite | null {
  const enabled = sites.filter((s) => s.enabled !== false);
  const pool = enabled.length > 0 ? enabled : sites;
  if (pool.length === 0) return null;

  let storedActiveId: string | null = null;
  try {
    storedActiveId = localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  return (
    (storedActiveId ? pool.find((s) => s.id === storedActiveId) : undefined) ?? pool[0] ?? null
  );
}

/** One place: warm memory + overview row session cache from local persist. */
export function applyOverviewStudioInventoryFromCache(site: WordPressSite): void {
  if (!site.id || !site.siteUrl?.trim()) return;
  resolveEntitySiteWarmBundleSync(site);
  seedBulkInventorySessionFromSiteWarmCache(site);
  seedOverviewSessionCachesFromWarm(site);
  for (const source of SOURCES) {
    syncOverviewRowsFromWarmCache(site, source);
  }
}

/**
 * Call once from main.tsx before React render.
 * Synchronous localStorage init + parallel IndexedDB hydrate so the splash logo renders on Frame 1.
 */
export function initOverviewStudioInventoryOnce(): void {
  if (appInventoryInitDone) return;
  appInventoryInitDone = true;

  reclaimBloatedLocalStorageQuota();

  const sites = getStoredSites();
  const active = resolveActiveSiteForInventory(sites);
  if (!active) return;

  applyOverviewStudioInventoryFromCache(active);

  void hydrateEntitySiteWarmCacheFromPersist(active).then((bundle) => {
    if (!bundle) return;
    applyOverviewStudioInventoryFromCache(active);
    dispatchOverviewCacheHydrated(active.id);
  });
}

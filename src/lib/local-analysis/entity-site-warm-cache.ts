import type { WordPressSite } from "@/components/integrations/types";
import {
  getBulkGenerationWpInventoryIfReady,
  seedBulkGenerationWpInventoryFromBundle,
  setBulkGenerationWpInventoryEntry,
} from "@/lib/bulk/bulk-generation-inventory-cache-store";
import { loadBulkSitemapInventoryForSite } from "@/lib/bulk/bulk-sitemap-inventory-session";
import {
  ENTITY_SITE_WARM_GSC_ROW_LIMIT,
  sortGscQueriesByStats,
} from "@/lib/bulk/bulk-gsc-site-queries";
import { fetchCompetitorGscQueries } from "@/lib/competitor-research/competitor-gsc-queries";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  readSitePrefetchPersist,
  writeSitePrefetchPersist,
} from "@/lib/local-analysis/site-prefetch-persist";
import { getDefaultSitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  buildBundleFromLegs,
  canWarmEntitySite,
  countsFromInventory,
  emptyInventoryResult,
  emptyWarmBundle,
  hydrateInventoryLinks,
  isUsableBundle,
  siteWarmCredentialsKey,
} from "@/lib/local-analysis/entity-site-warm-helpers";
import { seedOverviewSessionCachesFromWarm } from "@/lib/local-analysis/entity-site-warm-rows";
import {
  mergeSitePrefetchBulkInventoryRows,
  seedWarmBulkInventoryMetadata,
} from "@/lib/local-analysis/entity-site-warm-merge";
import {
  backgroundInflightBySiteId,
  cacheBySiteId,
  coldInflightBySiteId,
  credentialsKeyBySiteId,
  forceRefreshInflightBySiteId,
  getEntitySiteWarmCacheIfReady,
  inventoryLegBySiteId,
  inventoryLegResolveBySiteId,
  isSitePrefetchStale,
  notifyEntitySiteWarmInflightChanged,
  resolveEntitySiteWarmBundleSync,
  resolveInventoryLeg,
} from "@/lib/local-analysis/entity-site-warm-state";
import type {
  EntitySiteWarmBundle,
  EnsureSitePrefetchOptions,
} from "@/lib/local-analysis/entity-site-warm-types";
export { SITE_PREFETCH_TTL_MS } from "@/lib/local-analysis/entity-site-warm-types";
export type {
  EntitySiteWarmBundle,
  EntitySiteWarmCounts,
  EnsureSitePrefetchOptions,
} from "@/lib/local-analysis/entity-site-warm-types";
export {
  canWarmEntitySite,
  gscAllQueriesFromWarmBundle,
  gscQueriesFromWarmBundleForSapBudget,
  siteWarmCredentialsKey,
} from "@/lib/local-analysis/entity-site-warm-helpers";
export {
  clearEntitySiteWarmCache,
  getEntitySiteWarmCacheIfReady,
  getEntitySiteWarmInflightSnapshot,
  invalidateEntitySiteWarmCacheIfCredentialsChanged,
  isEntitySiteWarmInflight,
  isSitePrefetchBackgroundRefreshing,
  isSitePrefetchRefreshing,
  isSitePrefetchStale,
  peekEntitySiteWarmCache,
  resolveEntitySiteWarmBundleSync,
  subscribeEntitySiteWarmInflight,
} from "@/lib/local-analysis/entity-site-warm-state";
export {
  getSitePrefetchOverviewRowsForSource,
  getSitePrefetchOverviewRowsForSourceSync,
  getSitePrefetchUrlsForSource,
  getSitePrefetchUrlsForSourceSync,
  seedOverviewSessionCachesFromWarm,
} from "@/lib/local-analysis/entity-site-warm-rows";
export {
  mergeSitePrefetchBulkInventoryRows,
  mergeSitePrefetchBulkMetadataRows,
  seedWarmBulkInventoryMetadata,
} from "@/lib/local-analysis/entity-site-warm-merge";

/** Matches `ACTIVE_WP_SITE_STORAGE_KEY` in active-wordpress-site-context. */
const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

/** Fired after top-bar "Refresh site data" finishes a forced warm recrawl. Content Opt listens and force-reloads. */
export const NEO_PULSE_SITE_DATA_REFRESHED_EVENT = "neo-pulse-site-data-refreshed";

async function commitPartialBundle(site: WordPressSite, bundle: EntitySiteWarmBundle): Promise<void> {
  const hydrated = hydrateInventoryLinks(site, bundle);
  cacheBySiteId.set(site.id, hydrated);
  credentialsKeyBySiteId.set(site.id, siteWarmCredentialsKey(site));
  if (bundle.bulkInventoryRows?.length) {
    seedBulkGenerationWpInventoryFromBundle(site, hydrated);
    seedOverviewSessionCachesFromWarm(site);
  }
  notifyEntitySiteWarmInflightChanged();
}

async function commitBundle(site: WordPressSite, bundle: EntitySiteWarmBundle): Promise<EntitySiteWarmBundle> {
  const hydrated = hydrateInventoryLinks(site, bundle);
  cacheBySiteId.set(site.id, hydrated);
  credentialsKeyBySiteId.set(site.id, siteWarmCredentialsKey(site));
  seedBulkGenerationWpInventoryFromBundle(site, hydrated);
  seedOverviewSessionCachesFromWarm(site);
  await writeSitePrefetchPersist(hydrated);
  notifyEntitySiteWarmInflightChanged();
  return hydrated;
}

async function runWarmFetch(site: WordPressSite): Promise<EntitySiteWarmBundle> {
  const credKey = siteWarmCredentialsKey(site);
  const dateRange = getDefaultSitemapOptimizerGscDateRange();
  const siteUrl = getPublicSiteUrl(site).trim() || site.siteUrl!.trim();
  const hasWpCreds = canWarmEntitySite(site);

  let inventory = emptyInventoryResult();
  let gscRes: Awaited<ReturnType<typeof fetchCompetitorGscQueries>> = {
    ok: false,
    dateRange,
    error: "GSC pending",
  };

  const gscPromise = fetchCompetitorGscQueries({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    rowLimit: ENTITY_SITE_WARM_GSC_ROW_LIMIT,
  }).then(async (res) => {
    gscRes = res;
    const queries = res.ok ? sortGscQueriesByStats(res.queries.filter((q) => q.query?.trim())) : [];
    await commitPartialBundle(site, {
      siteId: site.id,
      credentialsKey: credKey,
      fetchedAt: Date.now(),
      inventory,
      gsc: { queries, dateRange: res.dateRange },
      counts: countsFromInventory(inventory, queries.length),
      bulkInventoryRows: getBulkGenerationWpInventoryIfReady(site.id) ?? [],
    });
    return res;
  });

  const inventoryPromise = hasWpCreds
    ? loadBulkSitemapInventoryForSite(site)
        .then(async (inv) => {
          inventory = inv;
          const bulkInventoryRows = getBulkGenerationWpInventoryIfReady(site.id) ?? [];
          const queries = gscRes.ok
            ? sortGscQueriesByStats(gscRes.queries.filter((q) => q.query?.trim()))
            : [];
          await commitPartialBundle(site, {
            siteId: site.id,
            credentialsKey: credKey,
            fetchedAt: Date.now(),
            inventory: inv,
            gsc: { queries, dateRange: gscRes.dateRange ?? dateRange },
            counts: countsFromInventory(inv, queries.length),
            bulkInventoryRows,
          });
          void seedWarmBulkInventoryMetadata(site).catch(() => {});
          resolveInventoryLeg(site.id);
          return inv;
        })
        .catch(() => {
          resolveInventoryLeg(site.id);
          return inventory;
        })
    : Promise.resolve(emptyInventoryResult());

  await Promise.all([inventoryPromise, gscPromise, ensureMasterInstructionsInMemory(site.id)]);
  resolveInventoryLeg(site.id);

  const bulkInventoryRows = hasWpCreds ? (getBulkGenerationWpInventoryIfReady(site.id) ?? []) : [];
  return buildBundleFromLegs(site, credKey, inventory, gscRes, bulkInventoryRows);
}

function startBackgroundRefresh(site: WordPressSite): void {
  if (backgroundInflightBySiteId.has(site.id) || coldInflightBySiteId.has(site.id)) return;
  const refresh = (async () => {
    try {
      const bundle = await runWarmFetch(site);
      await commitBundle(site, bundle);
    } finally {
      backgroundInflightBySiteId.delete(site.id);
      resolveInventoryLeg(site.id);
      notifyEntitySiteWarmInflightChanged();
    }
  })();
  backgroundInflightBySiteId.set(site.id, refresh);
  notifyEntitySiteWarmInflightChanged();
}

/** Alias for unified site prefetch API. */
export const getSitePrefetchIfReady = getEntitySiteWarmCacheIfReady;

/** Load warm bundle from local persist into memory (no network). */
export async function hydrateEntitySiteWarmCacheFromPersist(
  site: WordPressSite,
): Promise<EntitySiteWarmBundle | null> {
  return hydrateSitePrefetchFromPersist(site);
}

async function hydrateSitePrefetchFromPersist(site: WordPressSite): Promise<EntitySiteWarmBundle | null> {
  const credKey = siteWarmCredentialsKey(site);
  const persisted = await readSitePrefetchPersist(site.id, credKey);
  if (!isUsableBundle(persisted, credKey, site)) return null;
  const hydrated = hydrateInventoryLinks(site, persisted);
  cacheBySiteId.set(site.id, hydrated);
  credentialsKeyBySiteId.set(site.id, credKey);
  seedBulkGenerationWpInventoryFromBundle(site, hydrated);
  seedOverviewSessionCachesFromWarm(site);
  notifyEntitySiteWarmInflightChanged();
  return hydrated;
}

export async function ensureEntitySiteWarmCache(
  site: WordPressSite,
  options?: EnsureSitePrefetchOptions,
): Promise<EntitySiteWarmBundle> {
  if (!site.siteUrl?.trim()) {
    return emptyWarmBundle(site, "Site URL is required to load GSC keywords.");
  }

  const credKey = siteWarmCredentialsKey(site);
  const force = options?.force === true;
  const requireGsc = options?.requireGsc === true;

  if (force) {
    // Cancel in-flight only. Keep memory + persist until commit overwrites (stale-while-revalidate)
    // so Content Opt can hydrate instantly from the previous warm bundle during Refresh.
    coldInflightBySiteId.delete(site.id);
    backgroundInflightBySiteId.delete(site.id);
  }

  let inflight = coldInflightBySiteId.get(site.id);
  if (!force && inflight) {
    return inflight;
  }

  const cached = cacheBySiteId.get(site.id);
  if (!force && isUsableBundle(cached, credKey, site, requireGsc)) {
    resolveInventoryLeg(site.id);
    if (
      isSitePrefetchStale(cached) ||
      (canWarmEntitySite(site) && cached.counts.gscQueries === 0)
    ) {
      startBackgroundRefresh(site);
    }
    return cached;
  }

  if (!force && !isUsableBundle(cached, credKey, site, requireGsc)) {
    const fromPersist = await hydrateSitePrefetchFromPersist(site);
    if (fromPersist && isUsableBundle(fromPersist, credKey, site, requireGsc)) {
      resolveInventoryLeg(site.id);
      if (
        isSitePrefetchStale(fromPersist) ||
        (canWarmEntitySite(site) && fromPersist.counts.gscQueries === 0)
      ) {
        startBackgroundRefresh(site);
      }
      return fromPersist;
    }
  }

  inflight = coldInflightBySiteId.get(site.id);
  if (!inflight) {
    inflight = (async () => {
      try {
        const bundle = await runWarmFetch(site);
        return await commitBundle(site, bundle);
      } finally {
        coldInflightBySiteId.delete(site.id);
        resolveInventoryLeg(site.id);
        notifyEntitySiteWarmInflightChanged();
      }
    })();
    coldInflightBySiteId.set(site.id, inflight);
    notifyEntitySiteWarmInflightChanged();
  }

  return inflight;
}

/**
 * Resolves when the warm fetch's WordPress inventory leg is committed (does NOT wait for GSC).
 * Starts the warm fetch if it is not already running.
 */
export function ensureEntitySiteWarmInventory(site: WordPressSite): Promise<void> {
  if ((getBulkGenerationWpInventoryIfReady(site.id)?.length ?? 0) > 0) {
    return Promise.resolve();
  }
  const credKey = siteWarmCredentialsKey(site);
  const cached = cacheBySiteId.get(site.id);
  if (isUsableBundle(cached, credKey, site) && (cached.bulkInventoryRows?.length ?? 0) > 0) {
    return Promise.resolve();
  }
  let leg = inventoryLegBySiteId.get(site.id);
  if (!leg || !inventoryLegResolveBySiteId.has(site.id)) {
    leg = new Promise<void>((resolve) => {
      inventoryLegResolveBySiteId.set(site.id, resolve);
    });
    inventoryLegBySiteId.set(site.id, leg);
  }
  void ensureEntitySiteWarmCache(site).catch(() => {
    resolveInventoryLeg(site.id);
  });
  return leg;
}

/** Alias for unified site prefetch API. */
export const ensureSitePrefetch = ensureEntitySiteWarmCache;

/** Force a full recrawl (stale warm stays readable until the new bundle commits). */
export async function refreshSitePrefetch(site: WordPressSite): Promise<EntitySiteWarmBundle> {
  forceRefreshInflightBySiteId.add(site.id);
  notifyEntitySiteWarmInflightChanged();
  try {
    // Warm first so fetchedAt updates even when the content walk is slow or fails.
    const bundle = await ensureEntitySiteWarmCache(site, { force: true });

    let contentRows: SiteInventoryBulkRow[] = [];
    if (canWarmEntitySite(site)) {
      try {
        const { fetchUnifiedOverviewSitemapInventory } = await import(
          "@/lib/overview/overview-unified-sitemap-inventory"
        );
        const unified = await fetchUnifiedOverviewSitemapInventory(site, {
          includeContent: true,
          includePageHeading: true,
        });
        contentRows = [
          ...(unified.bySource.pages ?? []),
          ...(unified.bySource.posts ?? []),
          ...(unified.bySource.sap ?? []),
        ] as SiteInventoryBulkRow[];
        const withContent = contentRows.filter((r) => String(r.fields?.content ?? "").trim()).length;
        if (contentRows.length && withContent > 0) {
          setBulkGenerationWpInventoryEntry({
            siteId: site.id,
            rows: contentRows,
            fetchedAt: Date.now(),
          });
          mergeSitePrefetchBulkInventoryRows(site, contentRows);
        }
      } catch {
        /* warm already committed; content merge is best-effort */
      }
    }

    const ready = getEntitySiteWarmCacheIfReady(site.id) ?? bundle;
    // Stamp after the full refresh path so the menu time always moves.
    if (ready && !ready.error) {
      const stamped: EntitySiteWarmBundle = { ...ready, fetchedAt: Date.now() };
      cacheBySiteId.set(site.id, stamped);
      seedBulkGenerationWpInventoryFromBundle(site, stamped);
      void writeSitePrefetchPersist(stamped);
      notifyEntitySiteWarmInflightChanged();
    }
    const finalReady = getEntitySiteWarmCacheIfReady(site.id) ?? ready;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(NEO_PULSE_SITE_DATA_REFRESHED_EVENT, {
          detail: {
            siteId: site.id,
            inventoryTotal: finalReady.counts.inventoryTotal,
            sapRows: finalReady.counts.sap,
          },
        }),
      );
    }
    return finalReady;
  } finally {
    forceRefreshInflightBySiteId.delete(site.id);
    notifyEntitySiteWarmInflightChanged();
  }
}

/** Silent background warm with stale-while-revalidate. Empty inventory is never treated as ready. */
export function warmEntitySiteCache(site: WordPressSite): void {
  if (!site.siteUrl?.trim()) return;
  void ensureEntitySiteWarmCache(site).catch(() => {
    resolveInventoryLeg(site.id);
  });
}
export const warmSitePrefetch = warmEntitySiteCache;

/** Hydrate from disk and warm in parallel (no await gate). */
export function bootstrapSitePrefetchForSite(site: WordPressSite): void {
  resolveEntitySiteWarmBundleSync(site);
  void hydrateSitePrefetchFromPersist(site);
  warmEntitySiteCache(site);
  void seedWarmBulkInventoryMetadata(site).catch(() => {});
}

/** First app load: hydrate active site from disk, then warm. */
export function bootstrapEntitySiteWarmOnAppLoad(sites: WordPressSite[]): void {
  const enabled = sites.filter((s) => s.enabled !== false);
  if (enabled.length === 0) return;

  let storedActiveId: string | null = null;
  try {
    storedActiveId = localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  const activeSite =
    (storedActiveId ? enabled.find((s) => s.id === storedActiveId) : undefined) ?? enabled[0];
  if (!activeSite) return;

  void bootstrapSitePrefetchForSite(activeSite);
}

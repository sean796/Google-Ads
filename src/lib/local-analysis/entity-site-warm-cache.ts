import type { WordPressSite } from "@/components/integrations/types";
import {
  getBulkGenerationWpInventoryIfReady,
  seedBulkGenerationWpInventoryFromBundle,
  clearBulkGenerationWpInventoryCache,
  setBulkGenerationWpInventoryEntry,
} from "@/lib/bulk/bulk-generation-inventory-cache-store";
import {
  loadBulkSitemapInventoryForSite,
  type LoadBulkSitemapInventoryResult,
} from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  buildPromptBulkSitemapInventoryFromRows,
  recreatePromptBulkSitemapInventoryLinks,
} from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  entityGscRowLimitForSapBudget,
  ENTITY_SITE_WARM_GSC_ROW_LIMIT,
  sortGscQueriesByStats,
  type EntityGscKeywordBundle,
} from "@/lib/bulk/bulk-gsc-site-queries";
import {
  COMPETITOR_GSC_QUERY_ROW_LIMIT,
  fetchCompetitorGscQueries,
  getDefaultGscCompetitorDateRange,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  overviewEntityRestCollectionForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { splitOverviewInventoryRowsBySource } from "@/lib/overview/overview-unified-sitemap-inventory";
import { parseCompactInventoryUrls } from "@/lib/bulk/inventory-json-slim";
import {
  deleteSitePrefetchPersist,
  readSitePrefetchPersist,
  readSitePrefetchPersistSync,
  readWarmUrlMirrorSync,
  writeSitePrefetchPersist,
} from "@/lib/local-analysis/site-prefetch-persist";
import { getDefaultSitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  getOverviewRowsSessionCache,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";
import { buildOverviewSessionRowsFromWarmBulk } from "@/lib/overview/overview-inventory-progressive-hydrate";
import { applyCachedElementorFieldsToOverviewRows } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export const SITE_PREFETCH_TTL_MS = 24 * 60 * 60 * 1000;

export type EntitySiteWarmCounts = {
  inventoryTotal: number;
  pages: number;
  posts: number;
  sap: number;
  gscQueries: number;
};

export type EntitySiteWarmBundle = {
  siteId: string;
  credentialsKey: string;
  fetchedAt: number;
  inventory: LoadBulkSitemapInventoryResult;
  gsc: EntityGscKeywordBundle;
  counts: EntitySiteWarmCounts;
  bulkInventoryRows?: SiteInventoryBulkRow[];
  error?: string;
};

export type EnsureSitePrefetchOptions = {
  force?: boolean;
  /** Keyword fill: wait for GSC leg; never return sitemap-only partial bundle. */
  requireGsc?: boolean;
};

const cacheBySiteId = new Map<string, EntitySiteWarmBundle>();
const coldInflightBySiteId = new Map<string, Promise<EntitySiteWarmBundle>>();
const backgroundInflightBySiteId = new Map<string, Promise<void>>();
/** Top-bar Refresh site data (content walk + force warm). */
const forceRefreshInflightBySiteId = new Set<string>();
const credentialsKeyBySiteId = new Map<string, string>();
const warmingListeners = new Set<() => void>();
/** Bumped on every cache/inflight notify so useSyncExternalStore re-renders on persist hydrate (inflight size alone stays 0). */
let warmCacheEpoch = 0;
/** WP inventory leg of the warm fetch; resolves before GSC so hydration never waits on GSC. */
const inventoryLegBySiteId = new Map<string, Promise<void>>();
const inventoryLegResolveBySiteId = new Map<string, () => void>();
const metadataSeedInflightBySiteId = new Set<string>();

function resolveInventoryLeg(siteId: string): void {
  inventoryLegResolveBySiteId.get(siteId)?.();
  inventoryLegResolveBySiteId.delete(siteId);
}

/** Matches `ACTIVE_WP_SITE_STORAGE_KEY` in active-wordpress-site-context. */
const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

/** Fired after top-bar "Refresh site data" finishes a forced warm recrawl. Content Opt listens and force-reloads. */
export const NEO_PULSE_SITE_DATA_REFRESHED_EVENT = "neo-pulse-site-data-refreshed";

function notifyEntitySiteWarmInflightChanged(): void {
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

function emptyInventoryBuckets(): PromptBulkSitemapInventoryBuckets {
  return {
    pages: { json: "", rowCount: 0 },
    posts: { json: "", rowCount: 0 },
    sap: { json: "", rowCount: 0 },
  };
}

function emptyWarmBundle(site: WordPressSite, error: string): EntitySiteWarmBundle {
  const dateRange = getDefaultGscCompetitorDateRange();
  return {
    siteId: site.id,
    credentialsKey: siteWarmCredentialsKey(site),
    fetchedAt: Date.now(),
    inventory: {
      links: [],
      buckets: emptyInventoryBuckets(),
      totalRows: 0,
      sources: [],
      errors: {},
      postsMetadata: [],
    },
    gsc: { queries: [], dateRange },
    counts: { inventoryTotal: 0, pages: 0, posts: 0, sap: 0, gscQueries: 0 },
    error,
  };
}

export function siteWarmCredentialsKey(
  site: Pick<WordPressSite, "siteUrl" | "username" | "appPassword">,
): string {
  return `${site.siteUrl?.trim() ?? ""}|${site.username?.trim() ?? ""}|${site.appPassword?.trim() ?? ""}`;
}

export function canWarmEntitySite(site: WordPressSite): boolean {
  return Boolean(site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim());
}

function countsFromInventory(
  inventory: LoadBulkSitemapInventoryResult,
  gscQueryCount: number,
): EntitySiteWarmCounts {
  return {
    inventoryTotal: inventory.totalRows,
    pages: inventory.buckets.pages.rowCount,
    posts: inventory.buckets.posts.rowCount,
    sap: inventory.buckets.sap.rowCount,
    gscQueries: gscQueryCount,
  };
}

function emptyInventoryResult(): LoadBulkSitemapInventoryResult {
  return {
    links: [],
    buckets: emptyInventoryBuckets(),
    totalRows: 0,
    sources: [],
    errors: {},
    postsMetadata: [],
  };
}

function isUsableBundle(
  bundle: EntitySiteWarmBundle | undefined | null,
  credKey: string,
  site: WordPressSite,
  requireGsc = false,
): bundle is EntitySiteWarmBundle {
  if (!bundle || bundle.credentialsKey !== credKey) return false;
  if (requireGsc && (bundle.error || (canWarmEntitySite(site) && bundle.counts.gscQueries === 0))) {
    return false;
  }
  // Partial GSC-first commits can land with 0 URLs and no error; never treat that as ready for WP sites.
  if (bundle.counts.inventoryTotal > 0) return true;
  if (bundle.error) return false;
  return !canWarmEntitySite(site) && bundle.counts.gscQueries > 0;
}

function hydrateInventoryLinks(site: WordPressSite, bundle: EntitySiteWarmBundle): EntitySiteWarmBundle {
  if (bundle.inventory.links.length > 0) return bundle;
  const siteUrl = site.siteUrl?.trim() ?? "";
  if (!siteUrl || bundle.inventory.totalRows === 0) return bundle;
  return {
    ...bundle,
    inventory: {
      ...bundle.inventory,
      links: recreatePromptBulkSitemapInventoryLinks(siteUrl, bundle.inventory.buckets, bundle.inventory.sources),
    },
  };
}

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

function buildBundleFromLegs(
  site: WordPressSite,
  credKey: string,
  inventory: LoadBulkSitemapInventoryResult,
  gscRes: FetchCompetitorGscQueriesResult,
  bulkInventoryRows: SiteInventoryBulkRow[],
): EntitySiteWarmBundle {
  const dateRange = gscRes.dateRange ?? getDefaultGscCompetitorDateRange();

  if (inventory.totalRows === 0 && canWarmEntitySite(site)) {
    return {
      ...emptyWarmBundle(
        site,
        "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
      ),
      inventory,
      credentialsKey: credKey,
      bulkInventoryRows,
    };
  }

  if (gscRes.ok === false) {
    return {
      siteId: site.id,
      credentialsKey: credKey,
      fetchedAt: Date.now(),
      inventory,
      gsc: { queries: [], dateRange },
      counts: countsFromInventory(inventory, 0),
      bulkInventoryRows,
      error: gscRes.error || "Google Search Console returned no keywords for this site.",
    };
  }

  const queries = sortGscQueriesByStats(gscRes.queries.filter((q) => q.query?.trim()));
  if (queries.length === 0) {
    return {
      siteId: site.id,
      credentialsKey: credKey,
      fetchedAt: Date.now(),
      inventory,
      gsc: { queries: [], dateRange },
      counts: countsFromInventory(inventory, 0),
      bulkInventoryRows,
      error:
        "Google Search Console returned no keywords for this site. Connect GSC and ensure query data exists.",
    };
  }

  return {
    siteId: site.id,
    credentialsKey: credKey,
    fetchedAt: Date.now(),
    inventory,
    gsc: { queries, dateRange },
    counts: countsFromInventory(inventory, queries.length),
    bulkInventoryRows,
  };
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

/** Alias for unified site prefetch API. */
export const getSitePrefetchIfReady = getEntitySiteWarmCacheIfReady;

/** Warm bucket URLs for UI (memory or localStorage persist; no stale gate). */
export function getSitePrefetchUrlsForSourceSync(
  site: WordPressSite,
  source: OverviewSitemapSource,
): string[] {
  const bundle = resolveEntitySiteWarmBundleSync(site);
  if (bundle) {
    const json = bundle.inventory.buckets[source]?.json?.trim();
    if (json) {
      try {
        const urls = parseCompactInventoryUrls(json);
        if (urls.length) return urls;
      } catch {
        /* mirror below */
      }
    }
  }
  return readWarmUrlMirrorSync(site.id, source);
}

export function getSitePrefetchUrlsForSource(
  siteId: string,
  source: OverviewSitemapSource,
): string[] | null {
  const bundle = getEntitySiteWarmCacheIfReady(siteId);
  if (!bundle || isSitePrefetchStale(bundle)) return null;
  const json = bundle.inventory.buckets[source]?.json?.trim();
  if (!json) return null;
  try {
    const urls = parseCompactInventoryUrls(json);
    return urls.length ? urls : null;
  } catch {
    return null;
  }
}


function bulkRowsHaveMetadata(rows: OverviewInventoryRow[]): boolean {
  return rows.some(
    (r) =>
      Number(r.id) > 0 &&
      ((r.fields?.title ?? "").trim() || (r.fields?.pageHeading ?? "").trim()),
  );
}

/** Overview inventory rows from warm bundle (memory/localStorage; no stale gate). */
export function getSitePrefetchOverviewRowsForSourceSync(
  site: WordPressSite,
  source: OverviewSitemapSource,
): OverviewInventoryRow[] {
  const bundle = resolveEntitySiteWarmBundleSync(site);
  if (!bundle) return [];

  const urls = getSitePrefetchUrlsForSourceSync(site, source);
  const bulkRows = bundle.bulkInventoryRows ?? getBulkGenerationWpInventoryIfReady(site.id);
  if (bulkRows?.length) {
    const tagged = bulkRows.map((row) => ({ ...row, collection: row.collection })) as OverviewInventoryRow[];
    const bySource = splitOverviewInventoryRowsBySource(site, tagged);
    const rows = bySource[source];
    if (rows?.length) {
      return rows;
    }
  }

  return [];
}

/** Overview rows from site prefetch bulk inventory (ids + titles). */
export function getSitePrefetchOverviewRowsForSource(
  site: WordPressSite,
  source: OverviewSitemapSource,
): OverviewInventoryRow[] | null {
  const bundle = getEntitySiteWarmCacheIfReady(site.id);
  if (!bundle || isSitePrefetchStale(bundle)) return null;

  const urls = getSitePrefetchUrlsForSource(site.id, source);
  const bulkRows = bundle.bulkInventoryRows ?? getBulkGenerationWpInventoryIfReady(site.id);
  if (bulkRows?.length) {
    const tagged = bulkRows.map((row) => ({ ...row, collection: row.collection })) as OverviewInventoryRow[];
    const bySource = splitOverviewInventoryRowsBySource(site, tagged);
    const rows = bySource[source];
    if (
      rows?.length &&
      bulkRowsHaveMetadata(rows) &&
      !(urls && urls.length > rows.length)
    ) {
      return rows;
    }
  }

  return null;
}

/** Write OverviewRow[] session cache from warm persist (URLs + bulk; preserves existing row bodies). */
export function seedOverviewSessionCachesFromWarm(site: WordPressSite): void {
  if (!site.id || !site.siteUrl?.trim()) return;
  resolveEntitySiteWarmBundleSync(site);

  for (const source of ["pages", "posts", "sap"] as const) {
    const prefetchRows = getSitePrefetchOverviewRowsForSourceSync(site, source);
    if (!prefetchRows.length) continue;
    const existing = getOverviewRowsSessionCache(site.id, source) ?? [];
    const existingByKey = new Map(
      existing.map((r) => [normalizePageUrlKey(r.url), r] as const),
    );
    const built = applyCachedElementorFieldsToOverviewRows(
      buildOverviewSessionRowsFromWarmBulk(site, source, prefetchRows),
      source,
    );
    const rows = built.map((row) => {
      const prev = existingByKey.get(normalizePageUrlKey(row.url));
      if (!prev) return row;
      return {
        ...prev,
        ...row,
        title: row.title || prev.title,
        pageHeading: row.pageHeading || prev.pageHeading,
        metaDescription: row.metaDescription || prev.metaDescription,
        focusKeyword: row.focusKeyword || prev.focusKeyword,
        postContent:
          (prev.postContent?.trim().length ?? 0) > (row.postContent?.trim().length ?? 0)
            ? prev.postContent
            : row.postContent?.trim()
              ? row.postContent
              : prev.postContent,
        postContentOptimized:
          (prev.postContentOptimized?.trim().length ?? 0) >
          (row.postContentOptimized?.trim().length ?? 0)
            ? prev.postContentOptimized
            : row.postContentOptimized?.trim()
              ? row.postContentOptimized
              : prev.postContentOptimized,
        elementorDataJson: prev.elementorDataJson?.trim()
          ? prev.elementorDataJson
          : row.elementorDataJson,
        elementorSectionHeaders: prev.elementorSectionHeaders?.length
          ? prev.elementorSectionHeaders
          : row.elementorSectionHeaders,
        blogH2List: prev.blogH2List?.length ? prev.blogH2List : row.blogH2List,
        faq: prev.faq?.trim() ? prev.faq : row.faq,
        seoResearch: prev.seoResearch?.trim() ? prev.seoResearch : row.seoResearch,
      };
    });
    if (rows.length) {
      setOverviewRowsSessionCache(site.id, source, rows, { skipServerSync: true });
    }
  }
}

export function gscQueriesFromWarmBundleForSapBudget(
  warm: EntitySiteWarmBundle,
  sapRowBudget: number,
): GscSiteQueryRow[] {
  return sortGscQueriesByStats(warm.gsc.queries).slice(0, entityGscRowLimitForSapBudget(sapRowBudget));
}

/** GSC query export for Details prep hosted link (top rows by stats, max 500). */
export function gscAllQueriesFromWarmBundle(warm: EntitySiteWarmBundle): GscSiteQueryRow[] {
  return sortGscQueriesByStats(warm.gsc.queries.filter((q) => q.query?.trim())).slice(
    0,
    COMPETITOR_GSC_QUERY_ROW_LIMIT,
  );
}

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

/**
 * After URL inventory commits, seed title/keyword/date via metadata-only REST (no bodies).
 */
export async function seedWarmBulkInventoryMetadata(site: WordPressSite): Promise<void> {
  if (!canWarmEntitySite(site)) return;
  if (metadataSeedInflightBySiteId.has(site.id)) return;

  const existing = getBulkGenerationWpInventoryIfReady(site.id) ?? [];
  const hasMetadata = existing.some(
    (r) => r.id && ((r.fields?.title ?? "").trim() || (r.fields?.keyword ?? "").trim()),
  );
  if (hasMetadata && existing.length > 0) return;

  metadataSeedInflightBySiteId.add(site.id);
  try {
    const { fetchUnifiedOverviewSitemapInventory } = await import(
      "@/lib/overview/overview-unified-sitemap-inventory"
    );
    const unified = await fetchUnifiedOverviewSitemapInventory(site, {
      includeContent: false,
      includePageHeading: true,
    });
    const rows = [
      ...(unified.bySource.pages ?? []),
      ...(unified.bySource.posts ?? []),
      ...(unified.bySource.sap ?? []),
    ] as SiteInventoryBulkRow[];
    if (!rows.length) return;
    mergeSitePrefetchBulkMetadataRows(site, rows);
    setBulkGenerationWpInventoryEntry({ siteId: site.id, rows, fetchedAt: Date.now() });
    seedOverviewSessionCachesFromWarm(site);
  } finally {
    metadataSeedInflightBySiteId.delete(site.id);
  }
}

function mergeRowsIntoWarmBundle(
  site: WordPressSite,
  rows: SiteInventoryBulkRow[],
  existing: EntitySiteWarmBundle | undefined,
): EntitySiteWarmBundle {
  const credKey = siteWarmCredentialsKey(site);
  const tagged = rows.map((row) => ({ ...row, collection: row.collection })) as OverviewInventoryRow[];
  const builtInv = buildPromptBulkSitemapInventoryFromRows(site, tagged);
  const baseInv =
    existing && existing.inventory.totalRows >= builtInv.totalRows
      ? existing.inventory
      : {
          ...builtInv,
          postsMetadata: existing?.inventory.postsMetadata ?? [],
        };
  const gsc = existing?.gsc ?? {
    queries: [],
    dateRange: getDefaultSitemapOptimizerGscDateRange(),
  };
  return {
    siteId: site.id,
    credentialsKey: credKey,
    fetchedAt: Date.now(),
    inventory: baseInv,
    gsc,
    counts: countsFromInventory(baseInv, gsc.queries.length),
    bulkInventoryRows: rows,
  };
}

/**
 * Merge metadata-only bulk rows into warm bundle (title/keyword/date; no post bodies required).
 */
export function mergeSitePrefetchBulkMetadataRows(
  site: WordPressSite,
  rows: SiteInventoryBulkRow[],
): void {
  if (!rows.length) return;
  const existing = cacheBySiteId.get(site.id);
  const withMetadata = rows.filter(
    (r) => r.id && ((r.fields?.title ?? "").trim() || (r.fields?.keyword ?? "").trim()),
  );
  if (!withMetadata.length) return;
  const next = mergeRowsIntoWarmBundle(site, rows, existing);
  cacheBySiteId.set(site.id, next);
  credentialsKeyBySiteId.set(site.id, next.credentialsKey);
  seedBulkGenerationWpInventoryFromBundle(site, next);
  void writeSitePrefetchPersist(next);
  notifyEntitySiteWarmInflightChanged();
  seedOverviewSessionCachesFromWarm(site);
}

/**
 * After Content Opt fetches inventory with bodies, merge them into the warm bundle + persist
 * so the next site switch hydrates with HTML instead of URL/meta-only rows.
 */
export function mergeSitePrefetchBulkInventoryRows(
  site: WordPressSite,
  rows: SiteInventoryBulkRow[],
): void {
  if (!rows.length) return;
  const existing = cacheBySiteId.get(site.id);
  let withContent = 0;
  for (const r of rows) {
    if (String(r.fields?.content ?? "").trim()) withContent += 1;
  }
  if (withContent === 0) return;
  const next = mergeRowsIntoWarmBundle(site, rows, existing);
  cacheBySiteId.set(site.id, next);
  credentialsKeyBySiteId.set(site.id, next.credentialsKey);
  seedBulkGenerationWpInventoryFromBundle(site, next);
  void writeSitePrefetchPersist(next);
  notifyEntitySiteWarmInflightChanged();
  seedOverviewSessionCachesFromWarm(site);
}

/** Alias for unified site prefetch API. */
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

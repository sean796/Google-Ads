import type { WordPressSite } from "@/components/integrations/types";
import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import { fetchOverviewSapInventoryFromEntitySitemap } from "@/lib/overview/overview-sap-entity-inventory";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { clearSapPeerMarketSelectCache } from "@/lib/overview/sap-peer-market-select";
import { entityEndpointFromSite, isEntityInventoryRow } from "@/lib/sitemap-optimizer/entity-compression-profile";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SapCrossSiteImageHit, SapPeerEntityEntry, SapPeerEntityIndex } from "@/lib/overview/sap-cross-site-image-search-types";
import { extractPreferredBodyImageFromHtml } from "@/lib/overview/sap-cross-site-body-image";
import { sapPageMatchesPlaceEntity } from "@/lib/overview/sap-cross-site-place-match";
import { siteEnabledForSapSearch, trimTrailingSlashes, urlsEqual } from "@/lib/overview/sap-cross-site-site-match";

const MAX_CONTENT_FETCHES_PER_SITE = 12;

function peerIndexCacheKey(sites: WordPressSite[]): string {
  return sites
    .map((s) => `${s.id}|${trimTrailingSlashes(s.siteUrl)}|${(s.entitySitemapUrl || "").trim()}`)
    .sort()
    .join("||");
}

function entryFromInventoryRow(
  site: WordPressSite,
  collection: string,
  row: {
    id?: number | string;
    url?: string;
    slug?: string;
    fields?: { title?: string; keyword?: string; content?: string };
  },
): SapPeerEntityEntry | null {
  const pageUrl = (row.url ?? "").trim();
  if (!pageUrl) return null;
  const id = Number(row.id);
  const contentHtml = (row.fields?.content ?? "").trim() || undefined;
  let imageUrl: string | undefined;
  let imageAlt: string | undefined;
  if (contentHtml) {
    const img = extractPreferredBodyImageFromHtml(contentHtml);
    if (img) {
      imageUrl = img.url;
      imageAlt = img.alt;
    }
  }
  return {
    siteId: site.id,
    siteName: (site.name || "").trim() || site.siteUrl,
    siteUrl: site.siteUrl,
    collection,
    pageUrl,
    id: Number.isFinite(id) && id > 0 ? id : 0,
    title: (row.fields?.title ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    keyword: (row.fields?.keyword ?? "").trim(),
    contentHtml,
    imageUrl,
    imageAlt,
  };
}

async function loadPeerSiteEntries(site: WordPressSite): Promise<SapPeerEntityEntry[]> {
  const collection = entityEndpointFromSite(site);
  if (!collection) return [];

  const warm = getEntitySiteWarmCacheIfReady(site.id);
  const warmRows = warm?.bulkInventoryRows ?? [];
  if (warmRows.length) {
    const fromWarm: SapPeerEntityEntry[] = [];
    for (const row of warmRows) {
      if (!isEntityInventoryRow(row, collection)) continue;
      const entry = entryFromInventoryRow(site, collection, row);
      if (entry) fromWarm.push(entry);
    }
    if (fromWarm.length) {
      const withKw = fromWarm.filter((e) => Boolean(e.keyword?.trim())).length;
      // #region agent log
      // #endregion
      return fromWarm;
    }
  }

  const meta = await fetchOverviewSapInventoryFromEntitySitemap(site, collection, {
    includeContent: false,
  });
  const out: SapPeerEntityEntry[] = [];
  for (const row of meta.rows ?? []) {
    const entry = entryFromInventoryRow(site, collection, row as OverviewInventoryRow);
    if (entry) out.push(entry);
  }
  const withKw = out.filter((e) => Boolean(e.keyword?.trim())).length;
  // #region agent log
  // #endregion
  return out;
}

const peerIndexByKey = new Map<string, SapPeerEntityIndex>();
const peerIndexInflight = new Map<string, Promise<SapPeerEntityIndex>>();
/** Per-site entity URL rows — shared across keywords for the app session. */
const peerSiteEntriesCache = new Map<string, SapPeerEntityEntry[]>();
const peerSiteEntriesInflight = new Map<string, Promise<SapPeerEntityEntry[]>>();

function peerSiteEntriesCacheKey(site: WordPressSite): string {
  return `${site.id}|${(site.entitySitemapUrl || "").trim()}`;
}

export async function loadPeerSiteEntriesCached(site: WordPressSite): Promise<SapPeerEntityEntry[]> {
  const key = peerSiteEntriesCacheKey(site);
  const cached = peerSiteEntriesCache.get(key);
  if (cached) {
    // #region agent log
    // #endregion
    return cached;
  }
  const inflight = peerSiteEntriesInflight.get(key);
  if (inflight) return inflight;
  // #region agent log
  // #endregion
  const p = (async () => {
    const entries = await loadPeerSiteEntries(site);
    peerSiteEntriesCache.set(key, entries);
    // #region agent log
    // #endregion
    return entries;
  })();
  peerSiteEntriesInflight.set(key, p);
  try {
    return await p;
  } finally {
    peerSiteEntriesInflight.delete(key);
  }
}

/**
 * Load every eligible peer inventory once (parallel). Later Local Image keywords reuse the session cache.
 */
export async function prewarmSapPeerSiteInventories(
  sites: WordPressSite[],
): Promise<void> {
  const eligible = (sites ?? []).filter(siteEnabledForSapSearch);
  if (!eligible.length) return;
  await Promise.all(eligible.map((site) => loadPeerSiteEntriesCached(site)));
}

/**
 * Build (or reuse) a local entity URL index for connected SAP sites.
 * Loads each site once (per-site cache), sequentially.
 */
export async function ensureSapPeerEntityIndex(
  sites: WordPressSite[],
): Promise<SapPeerEntityIndex> {
  const eligible = (sites ?? []).filter(siteEnabledForSapSearch);
  const cacheKey = peerIndexCacheKey(eligible);
  const existing = peerIndexByKey.get(cacheKey);
  if (existing) return existing;

  const inflight = peerIndexInflight.get(cacheKey);
  if (inflight) return inflight;

  const build = (async () => {
    const entriesBySiteId = new Map<string, SapPeerEntityEntry[]>();
    let entryCount = 0;

    for (const site of eligible) {
      const entries = await loadPeerSiteEntriesCached(site);
      entriesBySiteId.set(site.id, entries);
      entryCount += entries.length;
    }

    const index: SapPeerEntityIndex = {
      cacheKey,
      builtAt: Date.now(),
      sitesInOrder: eligible,
      entriesBySiteId,
      entryCount,
    };
    peerIndexByKey.set(cacheKey, index);
    return index;
  })();

  peerIndexInflight.set(cacheKey, build);
  try {
    return await build;
  } finally {
    peerIndexInflight.delete(cacheKey);
  }
}

/** Test helper: drop in-memory peer indexes. */
export function clearSapPeerEntityIndexCache(): void {
  peerIndexByKey.clear();
  peerIndexInflight.clear();
  peerSiteEntriesCache.clear();
  peerSiteEntriesInflight.clear();
  clearSapPeerMarketSelectCache();
}

async function hydrateEntryContent(
  site: WordPressSite,
  entry: SapPeerEntityEntry,
): Promise<void> {
  if (entry.imageUrl) return;
  if (entry.contentHtml) {
    const img = extractPreferredBodyImageFromHtml(entry.contentHtml);
    if (img) {
      entry.imageUrl = img.url;
      entry.imageAlt = img.alt;
    }
    return;
  }
  if (!entry.id || !site.username?.trim() || !site.appPassword?.trim()) return;
  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
    includeContent: true,
    collections: [entry.collection],
    includeIds: [entry.id],
  });
  const row = (bulk.rows ?? []).find((r) => Number(r.id) === entry.id) as OverviewInventoryRow | undefined;
  const html = (row?.fields?.content ?? "").trim();
  if (!html) return;
  entry.contentHtml = html;
  const img = extractPreferredBodyImageFromHtml(html);
  if (img) {
    entry.imageUrl = img.url;
    entry.imageAlt = img.alt;
  }
}

export async function searchCachedSite(params: {
  site: WordPressSite;
  entries: SapPeerEntityEntry[];
  placeEntity: string;
  excludePageUrl?: string;
}): Promise<SapCrossSiteImageHit | null> {
  const { site, entries, placeEntity } = params;
  const exclude = (params.excludePageUrl ?? "").trim();
  const ranked: Array<{ entry: SapPeerEntityEntry; score: number }> = [];
  for (const entry of entries) {
    if (exclude && urlsEqual(entry.pageUrl, exclude)) continue;
    const m = sapPageMatchesPlaceEntity({
      placeEntity,
      title: entry.title,
      slug: entry.slug,
      keyword: entry.keyword,
      pageUrl: entry.pageUrl,
    });
    if (!m.match) continue;
    ranked.push({ entry, score: m.score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aImg = a.entry.imageUrl ? 1 : 0;
    const bImg = b.entry.imageUrl ? 1 : 0;
    return bImg - aImg;
  });
  if (!ranked.length) {
    // #region agent log
    // #endregion
    return null;
  }

  let hydrateTried = 0;
  let hydrateWithImage = 0;
  let remoteFetches = 0;
  for (const { entry, score } of ranked) {
    const needsRemote =
      !entry.imageUrl &&
      !entry.contentHtml &&
      Boolean(entry.id) &&
      Boolean(site.username?.trim()) &&
      Boolean(site.appPassword?.trim());
    if (needsRemote && remoteFetches >= MAX_CONTENT_FETCHES_PER_SITE) continue;
    if (needsRemote) remoteFetches += 1;
    await hydrateEntryContent(site, entry);
    hydrateTried += 1;
    if (!entry.imageUrl) continue;
    hydrateWithImage += 1;
    // #region agent log
    // #endregion
    return {
      imageUrl: entry.imageUrl,
      alt: entry.imageAlt,
      sourceSiteName: entry.siteName,
      sourceSiteUrl: entry.siteUrl,
      sourcePageUrl: entry.pageUrl,
      score,
    };
  }
  // #region agent log
  // #endregion
  return null;
}

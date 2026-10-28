import { useCallback, useEffect, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow, SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  lookupInventoryRowWithSource,
  normalizeMatch,
  snapshotHasInventoryEntries,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  buildOverviewInventoryCsv,
  buildOverviewSitemapUrlsInventoryCsv,
  buildWordPressSitemapExportCsv,
  inventoryRowsSupportSeoExtraText,
  type OverviewInventoryRow,
} from "@/lib/overview/overview-inventory-csv";
import { triggerOverviewCsvDownload } from "@/lib/overview/overview-wordpress-export-csv";
import {
  clearBulkInventorySessionSnapshot,
  getBulkInventorySessionSnapshot,
  setBulkInventorySessionSnapshot,
} from "@/lib/wordpress-bulk-inventory-session-cache";
import { clearOverviewRowsSessionCache } from "@/lib/overview/overview-rows-session-cache";
import {
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import {
  buildOverviewInventorySnapshotFromRows,
} from "@/lib/overview/overview-parallel-inventory-fetch";
import {
  fetchUnifiedOverviewSitemapInventory,
  overviewUrlsFromBucketRows,
  splitOverviewInventoryRowsBySource,
} from "@/lib/overview/overview-unified-sitemap-inventory";
import {
  ensureEntitySiteWarmInventory,
  getEntitySiteWarmCacheIfReady,
  getSitePrefetchOverviewRowsForSource,
  getSitePrefetchOverviewRowsForSourceSync,
  getSitePrefetchUrlsForSource,
  mergeSitePrefetchBulkInventoryRows,
  resolveEntitySiteWarmBundleSync,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { getBulkGenerationWpInventoryIfReady } from "@/lib/bulk/bulk-generation-inventory-cache-store";
import { bindingsFromInventorySnapshot } from "@/lib/overview/overview-inventory-bindings";
import { mergeInventoryContentRows } from "@/lib/overview/overview-page-content-batch";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { focusKeywordFromWordPressSources } from "@/lib/overview/focus-keyword-from-wp-sources";

export interface OverviewBinding {
  postId: number;
  subtype: string;
  status?: string;
  date_gmt?: string;
}

export interface UseOverviewWordPressBindingResult {
  loading: boolean;
  error: string | null;
  bindings: Record<string, OverviewBinding>;
  /** Post titles from WordPress REST (same keys as `bindings`), for tiles when `row.title` is still empty. */
  wpTitlesByUrl: Record<string, string>;
  /** True while fetching posts + pages inventory (paginated REST lists). */
  inventoryLoading: boolean;
  inventoryError: string | null;
  /**
   * Fetches merged published posts/pages inventory and caches for resolveBindings.
   * With `downloadCsv: true`, triggers a browser CSV download immediately.
   * Loads full `fields.content` / `excerpt` per row (`includeContent`) so AI meta/title can skip per-post get-post-content;
   * tradeoff: larger payloads and memory on very large sites.
   */
  prefetchOverviewInventory: (
    site: WordPressSite | null,
    options?: {
      downloadCsv?: boolean;
      /** Default both. Pass `["posts"]`, `["pages"]`, or a CPT segment (e.g. `service-area`). */
      collections?: string[];
      /** Full post bodies; default false (faster REST walk for bind/CSV). */
      includeContent?: boolean;
      /** First H1 per post for list display (no full body stored). */
      includePageHeading?: boolean;
      /** With downloadCsv, one CSV row per sitemap URL (matched from bulk inventory). */
      sitemapUrls?: string[];
      /** Bucket this prefetch belongs to (per-source cache). */
      source?: OverviewSitemapSource;
      /** Background warm: skip global inventoryLoading spinner. */
      silent?: boolean;
      /** When false (default), reuse per-source cache when snapshot is populated. */
      forceRefresh?: boolean;
    },
  ) => Promise<{
    ok: boolean;
    count: number;
    error?: string;
    csvReady?: boolean;
    /** URLs from prefetched rows when `collections` is set. */
    urls?: string[];
  }>;
  /** Set from bulk inventory rows after prefetch; null while loading or before first prefetch. No ACF discover. */
  acfExtraTextSupported: boolean | null;
  resolveBindings: (
    urls: string[],
    site: WordPressSite | null,
    onProgress?: (delta: number, total: number) => void,
    options?: { inventoryOnly?: boolean; persistBindings?: boolean; source?: OverviewSitemapSource },
  ) => Promise<Record<string, OverviewBinding>>;
  /** Resolved inventory row for URL when prefetch cache matches current site (for scrape without get-post-meta). */
  getInventoryRowForUrl: (site: WordPressSite | null, url: string) => SitePostInventoryRow | undefined;
  /** Same lookup as getInventoryRowForUrl plus posts vs pages for row hydration. */
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
    source?: OverviewSitemapSource,
  ) => OverviewInventoryUrlMatch | undefined;
  activateInventoryCacheForSource: (siteId: string, source: OverviewSitemapSource) => void;
  /** Cached merged inventory rows from the last unified prefetch (per bucket). */
  getCachedInventoryRowsForSource: (
    siteId: string,
    source: OverviewSitemapSource,
  ) => OverviewInventoryRow[];
  /** Move a resolved post binding when Overview updates the canonical row URL after a slug change. */
  remapBindingUrl: (oldUrl: string, newUrl: string) => void;
  /** Merge content-bearing inventory rows into the per-source cache + session snapshot. */
  mergeInventoryContentForSource: (
    site: WordPressSite,
    source: OverviewSitemapSource,
    contentRows: OverviewInventoryRow[],
  ) => void;
}

/**
 * Resolves sitemap URLs to WordPress posts for the Overview tab.
 * Uses bulk inventory cache only (one getSiteInventoryBulk per prefetch). No per-URL resolve-urls fallback.
 */
type CachedInventory = {
  siteId: string;
  source: OverviewSitemapSource;
  snapshot: BulkOptimizerInventorySnapshot;
  mergedRows: OverviewInventoryRow[];
};

function inventoryCacheMapKey(siteId: string, source: OverviewSitemapSource): string {
  return `${siteId}:${source}`;
}

function inventoryCacheHasContent(rows: OverviewInventoryRow[]): boolean {
  return rows.some((r) => (r.fields?.content ?? "").trim().length > 0);
}

function inventoryRowsHaveRealIds(rows: OverviewInventoryRow[]): boolean {
  return rows.some((r) => Number(r.id) > 0);
}

function inventoryRowDisplayKeyword(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  return focusKeywordFromWordPressSources({
    acf,
    fieldsKeyword: row.fields?.keyword,
    title: (row.fields?.title || row.fields?.pageHeading || "").trim(),
    collection: row.collection,
  });
}

function inventoryRowDisplayDate(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const fromAcf =
    (typeof acf.date_modifier === "string" ? acf.date_modifier.trim() : "") ||
    (typeof acf.seo_date_modifier === "string" ? acf.seo_date_modifier.trim() : "");
  return fromAcf || (row.date_gmt ?? "").trim();
}

function inventoryRowsHaveMetadata(rows: OverviewInventoryRow[]): boolean {
  return rows.some(
    (r) =>
      Number(r.id) > 0 &&
      ((r.fields?.title ?? "").trim() || (r.fields?.pageHeading ?? "").trim()),
  );
}

function inventoryRowsHaveDisplayMetadata(rows: OverviewInventoryRow[]): boolean {
  if (!rows.length) return false;
  const withUrl = rows.filter((r) => r.url?.trim() && Number(r.id) > 0);
  if (!withUrl.length) return false;
  return withUrl.every((row) => {
    const title = ((row.fields?.title ?? "").trim() || (row.fields?.pageHeading ?? "").trim());
    const keyword = inventoryRowDisplayKeyword(row);
    const date = inventoryRowDisplayDate(row);
    return title.length > 0 && keyword.length > 0 && date.length > 0;
  });
}

function inventoryRowSeedQuality(rows: OverviewInventoryRow[]): number {
  let withIds = 0;
  let withAcf = 0;
  for (const r of rows) {
    if (Number(r.id) > 0) withIds += 1;
    if (r.acf && typeof r.acf === "object" && Object.keys(r.acf).length > 0) withAcf += 1;
  }
  return withIds * 1000 + withAcf * 10 + (inventoryCacheHasContent(rows) ? 1 : 0);
}

function seedOverviewInventoryCacheFromPrefetch(
  site: WordPressSite,
  cacheByKey: Map<string, CachedInventory>,
): boolean {
  const bundle = resolveEntitySiteWarmBundleSync(site) ?? getEntitySiteWarmCacheIfReady(site.id);
  const bulkRows = bundle?.bulkInventoryRows ?? getBulkGenerationWpInventoryIfReady(site.id);
  const bucketSources: OverviewSitemapSource[] = ["pages", "posts", "sap"];
  let seeded = false;

  if (bulkRows?.length) {
    const tagged = bulkRows.map((row) => ({ ...row, collection: row.collection })) as OverviewInventoryRow[];
    const bySource = splitOverviewInventoryRowsBySource(site, tagged);
    for (const bucket of bucketSources) {
      const mergedRows = bySource[bucket] ?? [];
      if (!mergedRows.length) continue;
      if (!inventoryRowsHaveMetadata(mergedRows) && !inventoryCacheHasContent(mergedRows)) {
        continue;
      }
      const key = inventoryCacheMapKey(site.id, bucket);
      const existing = cacheByKey.get(key);
      if (
        existing?.mergedRows.length &&
        inventoryRowSeedQuality(existing.mergedRows) >= inventoryRowSeedQuality(mergedRows)
      ) {
        seeded = true;
        continue;
      }
      const snapshot = buildOverviewInventorySnapshotFromRows(mergedRows, site.siteUrl);
      cacheByKey.set(key, {
        siteId: site.id,
        source: bucket,
        snapshot,
        mergedRows,
      });
      // Never wipe Optimize Content session with URL-only (id:0) shells.
      if (inventoryRowsHaveRealIds(mergedRows)) {
        setBulkInventorySessionSnapshot(site.id, bucket, snapshot);
      }
      seeded = true;
    }
    return seeded;
  }

  for (const bucket of bucketSources) {
    const rows =
      getSitePrefetchOverviewRowsForSourceSync(site, bucket) ??
      getSitePrefetchOverviewRowsForSource(site, bucket);
    if (!rows?.length || !inventoryRowsHaveMetadata(rows)) continue;
    const key = inventoryCacheMapKey(site.id, bucket);
    const existing = cacheByKey.get(key);
    if (
      existing?.mergedRows.length &&
      inventoryRowSeedQuality(existing.mergedRows) >= inventoryRowSeedQuality(rows)
    ) {
      seeded = true;
      continue;
    }
    const snapshot = buildOverviewInventorySnapshotFromRows(rows, site.siteUrl);
    cacheByKey.set(key, {
      siteId: site.id,
      source: bucket,
      snapshot,
      mergedRows: rows,
    });
    if (inventoryRowsHaveRealIds(rows)) {
      setBulkInventorySessionSnapshot(site.id, bucket, snapshot);
    }
    seeded = true;
  }
  return seeded;
}

function getCachedInventoryForSource(
  siteId: string,
  source: OverviewSitemapSource,
  cacheByKey: Map<string, CachedInventory>,
  activeRef: CachedInventory | null,
): CachedInventory | null {
  const key = inventoryCacheMapKey(siteId, source);
  const fromKey = cacheByKey.get(key);
  if (
    fromKey?.siteId === siteId &&
    fromKey.source === source &&
    (fromKey.mergedRows.length > 0 || snapshotHasInventoryEntries(fromKey.snapshot))
  ) {
    return fromKey;
  }
  if (
    activeRef?.siteId === siteId &&
    activeRef.source === source &&
    (activeRef.mergedRows.length > 0 || snapshotHasInventoryEntries(activeRef.snapshot))
  ) {
    return activeRef;
  }
  return null;
}

function inventoryMatchFromMergedRows(
  mergedRows: OverviewInventoryRow[],
  siteUrl: string,
  url: string,
): OverviewInventoryUrlMatch | undefined {
  const target = normalizeMatch(siteUrl, url);
  for (const row of mergedRows) {
    if (normalizeMatch(siteUrl, row.url ?? "") !== target) continue;
    if (!row.id && !(row.fields?.title ?? "").trim()) continue;
    const coll = (row.collection ?? "").toLowerCase();
    const subtype =
      coll === "pages" || coll === "page"
        ? "page"
        : coll === "posts" || coll === "post"
          ? "post"
          : row.collection ?? coll;
    return {
      row: row as SitePostInventoryRow,
      subtype,
    };
  }
  return undefined;
}

function prefetchResultForSource(
  site: WordPressSite,
  source: OverviewSitemapSource,
  cacheByKey: Map<string, CachedInventory>,
  options?: { downloadCsv?: boolean; sitemapUrls?: string[] },
): { ok: boolean; count: number; csvReady?: boolean; urls?: string[] } {
  const cachedEntry = cacheByKey.get(inventoryCacheMapKey(site.id, source));
  const mergedRows = cachedEntry?.mergedRows ?? [];

  let csvReady = false;
  if (options?.downloadCsv === true && mergedRows.length > 0) {
    const hostKey = (() => {
      try {
        return new URL(site.siteUrl).hostname.replace(/[^a-zA-Z0-9._-]+/g, "_");
      } catch {
        return "site";
      }
    })();
    const dateKey = new Date().toISOString().slice(0, 10);
    const sitemapUrls = options.sitemapUrls?.filter(Boolean) ?? [];
    const snapshot = buildOverviewInventorySnapshotFromRows(mergedRows, site.siteUrl);
    const csv =
      sitemapUrls.length > 0
        ? buildOverviewSitemapUrlsInventoryCsv(sitemapUrls, site.siteUrl, snapshot)
        : source === "pages" || source === "posts"
          ? buildWordPressSitemapExportCsv(mergedRows, site.siteUrl)
          : buildOverviewInventoryCsv(mergedRows, site.siteUrl);
    if (csv) {
      const filename =
        sitemapUrls.length > 0
          ? `neo-pulse-sitemap-inventory-${hostKey}-${dateKey}.csv`
          : `neo-pulse-wp-inventory-${hostKey}-${dateKey}-${source}.csv`;
      triggerOverviewCsvDownload(csv, filename);
      csvReady = true;
    }
  }

  return {
    ok: true,
    count: mergedRows.length,
    csvReady,
    urls: overviewUrlsFromBucketRows(mergedRows),
  };
}

export function useOverviewWordPressBinding(
  activeSiteId: string | null | undefined,
  activeSitemapSource: OverviewSitemapSource = "pages",
): UseOverviewWordPressBindingResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [bindings, setBindings] = useState<Record<string, OverviewBinding>>({});
  const [wpTitlesByUrl, setWpTitlesByUrl] = useState<Record<string, string>>({});
  const inventoryCacheByKeyRef = useRef<Map<string, CachedInventory>>(new Map());
  const prefetchInflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeInventoryRef = useRef<CachedInventory | null>(null);
  const activeSitemapSourceRef = useRef(activeSitemapSource);
  activeSitemapSourceRef.current = activeSitemapSource;
  const [acfExtraTextSupported, setAcfExtraTextSupported] = useState<boolean | null>(null);
  const prevSiteIdRef = useRef<string | null | undefined>(undefined);

  const activateInventoryCacheForSource = useCallback(
    (siteId: string, source: OverviewSitemapSource) => {
      const key = inventoryCacheMapKey(siteId, source);
      let entry = inventoryCacheByKeyRef.current.get(key);
      if (!entry) {
        const snap = getBulkInventorySessionSnapshot(siteId, source);
        if (snap) {
          entry = { siteId, source, snapshot: snap, mergedRows: [] };
          // Snapshot-only: active for scrape lookup, not a prefetch cache hit (no mergedRows).
        }
      }
      activeInventoryRef.current = entry ?? null;
      if (entry?.mergedRows.length) {
        setAcfExtraTextSupported(
          inventoryRowsSupportSeoExtraText(entry.mergedRows) || entry.mergedRows.length > 0,
        );
      } else if (entry && snapshotHasInventoryEntries(entry.snapshot)) {
        setAcfExtraTextSupported(true);
      } else {
        setAcfExtraTextSupported(null);
      }
    },
    [],
  );

  useEffect(() => {
    const prev = prevSiteIdRef.current;
    if (prev !== undefined && prev !== activeSiteId) {
      activeInventoryRef.current = null;
      setBindings({});
      setWpTitlesByUrl({});
      setAcfExtraTextSupported(null);
      setInventoryError(null);
    }
    prevSiteIdRef.current = activeSiteId ?? undefined;
  }, [activeSiteId]);

  useEffect(() => {
    if (!activeSiteId) return;
    activateInventoryCacheForSource(activeSiteId, activeSitemapSource);
  }, [activeSiteId, activeSitemapSource, activateInventoryCacheForSource]);

  const prefetchOverviewInventory = useCallback(
    async (
      site: WordPressSite | null,
      options?: {
        downloadCsv?: boolean;
        collections?: string[];
        /** Full post bodies; default false (faster REST walk for bind/CSV). */
        includeContent?: boolean;
        /** First H1 per post for list display (no full body stored). */
        includePageHeading?: boolean;
        /** With downloadCsv, one CSV row per sitemap URL (matched from bulk inventory). */
        sitemapUrls?: string[];
        source?: OverviewSitemapSource;
        silent?: boolean;
        forceRefresh?: boolean;
      },
    ): Promise<{ ok: boolean; count: number; error?: string; csvReady?: boolean; urls?: string[] }> => {
      if (!site?.username || !site.appPassword) {
        const err = "Connect a WordPress site with credentials first.";
        setInventoryError(err);
        return { ok: false, count: 0, error: err };
      }

      const source = options?.source ?? activeSitemapSourceRef.current;
      const silent = options?.silent === true;
      const includeContent = options?.includeContent === true;
      const cachedEntry = inventoryCacheByKeyRef.current.get(inventoryCacheMapKey(site.id, source));
      const forceRefresh =
        options?.forceRefresh === true ||
        (includeContent &&
          Boolean(cachedEntry?.mergedRows.length) &&
          !inventoryCacheHasContent(cachedEntry!.mergedRows));

      if (options?.forceRefresh === true) {
        for (const bucket of ["pages", "posts", "sap"] as const) {
          inventoryCacheByKeyRef.current.delete(inventoryCacheMapKey(site.id, bucket));
        }
      }

      // Always try warm seed first. Force refresh used to skip this and re-walk WP, which
      // raced the warm recrawl and returned empty SAP buckets (empty Content Opt grid).
      {
        let seeded = seedOverviewInventoryCacheFromPrefetch(site, inventoryCacheByKeyRef.current);
        if (!seeded) {
          await ensureEntitySiteWarmInventory(site);
          seeded = seedOverviewInventoryCacheFromPrefetch(site, inventoryCacheByKeyRef.current);
        }
        if (seeded) {
          const warmEntry = inventoryCacheByKeyRef.current.get(inventoryCacheMapKey(site.id, source));
          if (warmEntry?.mergedRows.length) {
            const hasRealIds = inventoryRowsHaveRealIds(warmEntry.mergedRows);
            const hasContent = inventoryCacheHasContent(warmEntry.mergedRows);
            const hasMetadata = inventoryRowsHaveMetadata(warmEntry.mergedRows);
            const bucketUrlCount = getSitePrefetchUrlsForSource(site.id, source)?.length ?? 0;
            const warmShorterThanBuckets =
              bucketUrlCount > 0 && warmEntry.mergedRows.length < bucketUrlCount;
            if (hasRealIds && hasMetadata) {
              activeInventoryRef.current = warmEntry;
              if (!silent) {
                setInventoryLoading(false);
                setAcfExtraTextSupported(
                  inventoryRowsSupportSeoExtraText(warmEntry.mergedRows) ||
                    warmEntry.mergedRows.length > 0,
                );
              }
              if ((!includeContent || hasContent) && !warmShorterThanBuckets) {
                return {
                  ok: true,
                  count: warmEntry.mergedRows.length,
                  urls: overviewUrlsFromBucketRows(warmEntry.mergedRows),
                };
              }
            }
          }
        }
      }

      if (!forceRefresh) {
        if (cachedEntry?.siteId === site.id && cachedEntry.mergedRows.length > 0) {
          const hasContent = inventoryCacheHasContent(cachedEntry.mergedRows);
          const hasMetadata = inventoryRowsHaveMetadata(cachedEntry.mergedRows);
          if (hasMetadata && (!includeContent || hasContent)) {
            activeInventoryRef.current = cachedEntry;
            if (!silent) {
              setInventoryLoading(false);
              setAcfExtraTextSupported(
                inventoryRowsSupportSeoExtraText(cachedEntry.mergedRows) ||
                  cachedEntry.mergedRows.length > 0,
              );
            }
            return {
              ok: true,
              count: cachedEntry.mergedRows.length,
              urls: overviewUrlsFromBucketRows(cachedEntry.mergedRows),
            };
          }
        }
      }

      const inflightKey = `${site.id}:unified`;
      let inflight = prefetchInflightRef.current.get(inflightKey);
      if (!inflight) {
        inflight = (async () => {
      if (!silent) {
        setInventoryLoading(true);
        setInventoryError(null);
        setAcfExtraTextSupported(null);
      }

      try {
        const includePageHeading = options?.includePageHeading === true;

        const unified = await fetchUnifiedOverviewSitemapInventory(site, {
          includeContent,
          includePageHeading,
        });

        const bucketSources: OverviewSitemapSource[] = ["pages", "posts", "sap"];
        const allMerged: OverviewInventoryRow[] = [];
        for (const bucket of bucketSources) {
          const mergedRows = unified.bySource[bucket] ?? [];
          allMerged.push(...mergedRows);
          const snapshot = buildOverviewInventorySnapshotFromRows(mergedRows, site.siteUrl);
          const entry: CachedInventory = {
            siteId: site.id,
            source: bucket,
            snapshot,
            mergedRows,
          };
          inventoryCacheByKeyRef.current.set(inventoryCacheMapKey(site.id, bucket), entry);
          setBulkInventorySessionSnapshot(site.id, bucket, snapshot);
        }

        if (includeContent && allMerged.length) {
          mergeSitePrefetchBulkInventoryRows(site, allMerged as SiteInventoryBulkRow[]);
        }

        const activeEntry = inventoryCacheByKeyRef.current.get(
          inventoryCacheMapKey(site.id, activeSitemapSourceRef.current),
        );
        if (activeEntry) {
          activeInventoryRef.current = activeEntry;
          setAcfExtraTextSupported(
            inventoryRowsSupportSeoExtraText(activeEntry.mergedRows) ||
              activeEntry.mergedRows.length > 0,
          );
        }
      } finally {
        if (!silent) {
          setInventoryLoading(false);
        }
      }
        })();
        prefetchInflightRef.current.set(inflightKey, inflight);
        void inflight.finally(() => {
          prefetchInflightRef.current.delete(inflightKey);
        });
      }

      try {
        await inflight;
        const result = prefetchResultForSource(site, source, inventoryCacheByKeyRef.current, options);
        const cachedEntry = inventoryCacheByKeyRef.current.get(inventoryCacheMapKey(site.id, source));
        if (cachedEntry && source === activeSitemapSourceRef.current) {
          activeInventoryRef.current = cachedEntry;
          if (!silent) {
            setAcfExtraTextSupported(
              inventoryRowsSupportSeoExtraText(cachedEntry.mergedRows) ||
                cachedEntry.mergedRows.length > 0,
            );
          }
        }
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to fetch WordPress post/page inventory.";
        setInventoryError(msg);
        if (source === activeSitemapSourceRef.current) {
          activeInventoryRef.current = null;
          setAcfExtraTextSupported(false);
        }
        return { ok: false, count: 0, error: msg };
      }
    },
    [],
  );

  const getInventoryMatchForUrl = useCallback(
    (
      siteArg: WordPressSite | null,
      url: string,
      sourceOverride?: OverviewSitemapSource,
    ): OverviewInventoryUrlMatch | undefined => {
      if (!siteArg) return undefined;
      const cacheSource = sourceOverride ?? activeSitemapSourceRef.current;
      let cached = getCachedInventoryForSource(
        siteArg.id,
        cacheSource,
        inventoryCacheByKeyRef.current,
        activeInventoryRef.current,
      );
      if (!cached) {
        seedOverviewInventoryCacheFromPrefetch(siteArg, inventoryCacheByKeyRef.current);
        cached = getCachedInventoryForSource(
          siteArg.id,
          cacheSource,
          inventoryCacheByKeyRef.current,
          activeInventoryRef.current,
        );
      }
      if (!cached) return undefined;
      const hit = lookupInventoryRowWithSource(cached.snapshot, siteArg.siteUrl, url, "other");
      if (hit?.row) {
        if (!hit.row.id && !(hit.row.fields?.title ?? "").trim()) {
          return inventoryMatchFromMergedRows(cached.mergedRows, siteArg.siteUrl, url);
        }
        return {
          row: hit.row,
          subtype:
            hit.source === "pages" ? "page" : hit.source === "posts" ? "post" : hit.source,
        };
      }
      return inventoryMatchFromMergedRows(cached.mergedRows, siteArg.siteUrl, url);
    },
    [],
  );

  const getInventoryRowForUrl = useCallback(
    (siteArg: WordPressSite | null, url: string): SitePostInventoryRow | undefined => {
      if (!siteArg) return undefined;
      const cacheSource = activeSitemapSourceRef.current;
      const cached = getCachedInventoryForSource(
        siteArg.id,
        cacheSource,
        inventoryCacheByKeyRef.current,
        activeInventoryRef.current,
      );
      if (!cached) return undefined;
      return lookupInventoryRowWithSource(cached.snapshot, siteArg.siteUrl, url, "other")?.row;
    },
    [],
  );

  const resolveBindings = useCallback(
    async (
      urls: string[],
      site: WordPressSite | null,
      onProgress?: (delta: number, total: number) => void,
      options?: { inventoryOnly?: boolean; persistBindings?: boolean; source?: OverviewSitemapSource },
    ) => {
      const persistBindings = options?.persistBindings !== false;
      if (!site || !urls.length) {
        if (persistBindings) {
          setBindings({});
          setWpTitlesByUrl({});
        }
        return {};
      }

      if (persistBindings && !options?.inventoryOnly) {
        setLoading(true);
        setError(null);
      }

      try {
        const cacheSource = options?.source ?? activeSitemapSourceRef.current;
        const cached = getCachedInventoryForSource(
          site.id,
          cacheSource,
          inventoryCacheByKeyRef.current,
          activeInventoryRef.current,
        );
        if (cached && cached.source === cacheSource) {
          activeInventoryRef.current = cached;
        }
        const inventoryReady = Boolean(
          cached && (cached.mergedRows.length > 0 || snapshotHasInventoryEntries(cached.snapshot)),
        );

        const map: Record<string, OverviewBinding> = {};
        const titlesMap: Record<string, string> = {};
        let processed = 0;
        const reportProgress = (delta: number) => {
          processed += delta;
          onProgress?.(Math.min(processed, urls.length), urls.length);
        };

        if (inventoryReady && cached) {
          const built = bindingsFromInventorySnapshot(cached.snapshot, site.siteUrl, urls);
          Object.assign(map, built.bindings);
          Object.assign(titlesMap, built.titlesByUrl);
          reportProgress(urls.length);
        } else {
          reportProgress(urls.length);
        }

        if (!Object.keys(map).length) {
          if (persistBindings) {
            setBindings({});
            setWpTitlesByUrl({});
          }
          return {};
        }

        if (persistBindings) {
          setBindings((prev) => ({ ...prev, ...map }));
          setWpTitlesByUrl((prev) => ({ ...prev, ...titlesMap }));
        }
        return map;
      } catch (err: any) {
        const msg =
          err?.message ||
          "Failed to resolve WordPress URLs for Overview. Ensure the connected site has valid credentials.";
        if (persistBindings) {
          setError(msg);
          setBindings({});
          setWpTitlesByUrl({});
        }
        return {};
      } finally {
        if (persistBindings && !options?.inventoryOnly) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const getCachedInventoryRowsForSource = useCallback(
    (siteId: string, source: OverviewSitemapSource): OverviewInventoryRow[] => {
      const cached = getCachedInventoryForSource(
        siteId,
        source,
        inventoryCacheByKeyRef.current,
        activeInventoryRef.current,
      );
      return cached?.mergedRows ?? [];
    },
    [],
  );

  const remapBindingUrl = useCallback((oldUrl: string, newUrl: string) => {
    const from = oldUrl.trim();
    const to = newUrl.trim();
    if (!from || !to || from === to) return;
    setBindings((prev) => {
      const fromKey = normalizePageUrlKey(from);
      let hit = prev[from];
      let hitKey = from;
      if (!hit && fromKey) {
        for (const [key, binding] of Object.entries(prev)) {
          if (binding?.postId && normalizePageUrlKey(key) === fromKey) {
            hit = binding;
            hitKey = key;
            break;
          }
        }
      }
      if (!hit) return prev;
      const next = { ...prev };
      delete next[hitKey];
      next[to] = hit;
      return next;
    });
    setWpTitlesByUrl((prev) => {
      const fromKey = normalizePageUrlKey(from);
      let title = prev[from];
      let titleKey = from;
      if (!title && fromKey) {
        for (const [key, value] of Object.entries(prev)) {
          if (value && normalizePageUrlKey(key) === fromKey) {
            title = value;
            titleKey = key;
            break;
          }
        }
      }
      if (!title) return prev;
      const next = { ...prev };
      delete next[titleKey];
      next[to] = title;
      return next;
    });
  }, []);

  const mergeInventoryContentForSource = useCallback(
    (site: WordPressSite, source: OverviewSitemapSource, contentRows: OverviewInventoryRow[]) => {
      if (!contentRows.length) return;
      const key = inventoryCacheMapKey(site.id, source);
      const existing =
        inventoryCacheByKeyRef.current.get(key) ??
        (activeInventoryRef.current?.siteId === site.id &&
        activeInventoryRef.current.source === source
          ? activeInventoryRef.current
          : null);
      const mergedRows = mergeInventoryContentRows(existing?.mergedRows ?? [], contentRows);
      const snapshot = buildOverviewInventorySnapshotFromRows(mergedRows, site.siteUrl);
      const entry: CachedInventory = {
        siteId: site.id,
        source,
        snapshot,
        mergedRows,
      };
      inventoryCacheByKeyRef.current.set(key, entry);
      if (source === activeSitemapSourceRef.current) {
        activeInventoryRef.current = entry;
      }
      setBulkInventorySessionSnapshot(site.id, source, snapshot);
      setAcfExtraTextSupported(
        inventoryRowsSupportSeoExtraText(mergedRows) || mergedRows.length > 0,
      );
    },
    [],
  );

  return {
    loading,
    error,
    bindings,
    wpTitlesByUrl,
    inventoryLoading,
    inventoryError,
    prefetchOverviewInventory,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    resolveBindings,
    acfExtraTextSupported,
    activateInventoryCacheForSource,
    getCachedInventoryRowsForSource,
    remapBindingUrl,
    mergeInventoryContentForSource,
  };
}


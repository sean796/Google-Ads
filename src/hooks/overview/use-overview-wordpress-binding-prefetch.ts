import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  inventoryRowsSupportSeoExtraText,
  type OverviewInventoryRow,
} from "@/lib/overview/overview-inventory-csv";
import { setBulkInventorySessionSnapshot } from "@/lib/wordpress-bulk-inventory-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { buildOverviewInventorySnapshotFromRows } from "@/lib/overview/overview-parallel-inventory-fetch";
import {
  fetchUnifiedOverviewSitemapInventory,
  overviewUrlsFromBucketRows,
} from "@/lib/overview/overview-unified-sitemap-inventory";
import {
  ensureEntitySiteWarmInventory,
  getSitePrefetchUrlsForSource,
  mergeSitePrefetchBulkInventoryRows,
} from "@/lib/local-analysis/entity-site-warm-cache";
import {
  inventoryCacheHasContent,
  inventoryCacheMapKey,
  inventoryRowsHaveMetadata,
  inventoryRowsHaveRealIds,
  prefetchResultForSource,
  seedOverviewInventoryCacheFromPrefetch,
  type CachedInventory,
} from "./use-overview-wordpress-binding-cache";

export type PrefetchOverviewInventoryDeps = {
  inventoryCacheByKeyRef: { current: Map<string, CachedInventory> };
  prefetchInflightRef: { current: Map<string, Promise<void>> };
  activeInventoryRef: { current: CachedInventory | null };
  activeSitemapSourceRef: { current: OverviewSitemapSource };
  setInventoryError: Dispatch<SetStateAction<string | null>>;
  setInventoryLoading: Dispatch<SetStateAction<boolean>>;
  setAcfExtraTextSupported: Dispatch<SetStateAction<boolean | null>>;
};

export async function runPrefetchOverviewInventory(
  deps: PrefetchOverviewInventoryDeps,
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
): Promise<{ ok: boolean; count: number; error?: string; csvReady?: boolean; urls?: string[] }> {
  const {
    inventoryCacheByKeyRef,
    prefetchInflightRef,
    activeInventoryRef,
    activeSitemapSourceRef,
    setInventoryError,
    setInventoryLoading,
    setAcfExtraTextSupported,
  } = deps;
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
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { snapshotHasInventoryEntries } from "@/lib/wordpress-api/inventory-match";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  inventoryRowsSupportSeoExtraText,
  type OverviewInventoryRow,
} from "@/lib/overview/overview-inventory-csv";
import { getBulkInventorySessionSnapshot } from "@/lib/wordpress-bulk-inventory-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type {
  OverviewBinding,
  UseOverviewWordPressBindingResult,
} from "./use-overview-wordpress-binding-types";
import { inventoryCacheMapKey, type CachedInventory } from "./use-overview-wordpress-binding-cache";
import { runPrefetchOverviewInventory } from "./use-overview-wordpress-binding-prefetch";
import {
  runGetCachedInventoryRowsForSource,
  runGetInventoryMatchForUrl,
  runGetInventoryRowForUrl,
  runMergeInventoryContentForSource,
  runRemapBindingUrl,
  runResolveBindings,
  type OverviewWordPressBindingLookupsDeps,
} from "./use-overview-wordpress-binding-lookups";

export type {
  OverviewBinding,
  UseOverviewWordPressBindingResult,
} from "./use-overview-wordpress-binding-types";

/**
 * Resolves sitemap URLs to WordPress posts for the Overview tab.
 * Uses bulk inventory cache only (one getSiteInventoryBulk per prefetch). No per-URL resolve-urls fallback.
 */
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
      return runPrefetchOverviewInventory(
        {
          inventoryCacheByKeyRef,
          prefetchInflightRef,
          activeInventoryRef,
          activeSitemapSourceRef,
          setInventoryError,
          setInventoryLoading,
          setAcfExtraTextSupported,
        },
        site,
        options,
      );
    },
    [],
  );

  const lookupsDeps = useMemo<OverviewWordPressBindingLookupsDeps>(
    () => ({
      inventoryCacheByKeyRef,
      activeInventoryRef,
      activeSitemapSourceRef,
      setBindings,
      setWpTitlesByUrl,
      setLoading: setInventoryLoading,
      setError: setInventoryError,
      setAcfExtraTextSupported,
    }),
    [
      inventoryCacheByKeyRef,
      activeInventoryRef,
      activeSitemapSourceRef,
      setBindings,
      setWpTitlesByUrl,
      setInventoryLoading,
      setInventoryError,
      setAcfExtraTextSupported,
    ],
  );

  const getInventoryMatchForUrl = useCallback(
    (
      siteArg: WordPressSite | null,
      url: string,
      sourceOverride?: OverviewSitemapSource,
    ): OverviewInventoryUrlMatch | undefined => {
      return runGetInventoryMatchForUrl(
        lookupsDeps,
        siteArg,
        url,
        sourceOverride,
      );
    },
    [lookupsDeps],
  );

  const getInventoryRowForUrl = useCallback(
    (siteArg: WordPressSite | null, url: string): SitePostInventoryRow | undefined => {
      return runGetInventoryRowForUrl(
        lookupsDeps,
        siteArg,
        url,
      );
    },
    [lookupsDeps],
  );

  const resolveBindings = useCallback(
    async (
      urls: string[],
      site: WordPressSite | null,
      onProgress?: (delta: number, total: number) => void,
      options?: { inventoryOnly?: boolean; persistBindings?: boolean; source?: OverviewSitemapSource },
    ) => {
      return runResolveBindings(
        lookupsDeps,
        urls,
        site,
        onProgress,
        options,
      );
    },
    [lookupsDeps],
  );

  const getCachedInventoryRowsForSource = useCallback(
    (siteId: string, source: OverviewSitemapSource): OverviewInventoryRow[] => {
      return runGetCachedInventoryRowsForSource(
        lookupsDeps,
        siteId,
        source,
      );
    },
    [lookupsDeps],
  );

  const remapBindingUrl = useCallback((oldUrl: string, newUrl: string) => {
    runRemapBindingUrl(lookupsDeps, oldUrl, newUrl);
  }, [lookupsDeps]);

  const mergeInventoryContentForSource = useCallback(
    (site: WordPressSite, source: OverviewSitemapSource, contentRows: OverviewInventoryRow[]) => {
      runMergeInventoryContentForSource(
        lookupsDeps,
        site,
        source,
        contentRows,
      );
    },
    [lookupsDeps],
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

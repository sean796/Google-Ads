import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  lookupInventoryRowWithSource,
  snapshotHasInventoryEntries,
} from "@/lib/wordpress-api/inventory-match";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  inventoryRowsSupportSeoExtraText,
  type OverviewInventoryRow,
} from "@/lib/overview/overview-inventory-csv";
import { setBulkInventorySessionSnapshot } from "@/lib/wordpress-bulk-inventory-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { buildOverviewInventorySnapshotFromRows } from "@/lib/overview/overview-parallel-inventory-fetch";
import { bindingsFromInventorySnapshot } from "@/lib/overview/overview-inventory-bindings";
import { mergeInventoryContentRows } from "@/lib/overview/overview-page-content-batch";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type {
  OverviewBinding,
} from "./use-overview-wordpress-binding-types";
import {
  getCachedInventoryForSource,
  inventoryCacheMapKey,
  inventoryMatchFromMergedRows,
  seedOverviewInventoryCacheFromPrefetch,
  type CachedInventory,
} from "./use-overview-wordpress-binding-cache";

export type OverviewWordPressBindingLookupsDeps = {
  inventoryCacheByKeyRef: { current: Map<string, CachedInventory> };
  activeInventoryRef: { current: CachedInventory | null };
  activeSitemapSourceRef: { current: OverviewSitemapSource };
  setBindings: Dispatch<SetStateAction<Record<string, OverviewBinding>>>;
  setWpTitlesByUrl: Dispatch<SetStateAction<Record<string, string>>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setAcfExtraTextSupported: Dispatch<SetStateAction<boolean | null>>;
};

export function runGetInventoryMatchForUrl(
  deps: OverviewWordPressBindingLookupsDeps,
  siteArg: WordPressSite | null,
  url: string,
  sourceOverride?: OverviewSitemapSource,
): OverviewInventoryUrlMatch | undefined {
  const { inventoryCacheByKeyRef, activeInventoryRef, activeSitemapSourceRef } = deps;
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
}

export function runGetInventoryRowForUrl(
  deps: OverviewWordPressBindingLookupsDeps,
  siteArg: WordPressSite | null,
  url: string,
): SitePostInventoryRow | undefined {
  const { inventoryCacheByKeyRef, activeInventoryRef, activeSitemapSourceRef } = deps;
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
}

export async function runResolveBindings(
  deps: OverviewWordPressBindingLookupsDeps,
  urls: string[],
  site: WordPressSite | null,
  onProgress?: (delta: number, total: number) => void,
  options?: { inventoryOnly?: boolean; persistBindings?: boolean; source?: OverviewSitemapSource },
): Promise<Record<string, OverviewBinding>> {
  const {
    inventoryCacheByKeyRef,
    activeInventoryRef,
    activeSitemapSourceRef,
    setBindings,
    setWpTitlesByUrl,
    setLoading,
    setError,
  } = deps;
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
  } catch (err) {
    const msg =
      (err instanceof Error ? err.message : "") ||
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
}

export function runGetCachedInventoryRowsForSource(
  deps: OverviewWordPressBindingLookupsDeps,
  siteId: string,
  source: OverviewSitemapSource,
): OverviewInventoryRow[] {
  const { inventoryCacheByKeyRef, activeInventoryRef } = deps;
  const cached = getCachedInventoryForSource(
    siteId,
    source,
    inventoryCacheByKeyRef.current,
    activeInventoryRef.current,
  );
  return cached?.mergedRows ?? [];
}

export function runRemapBindingUrl(
  deps: OverviewWordPressBindingLookupsDeps,
  oldUrl: string,
  newUrl: string,
): void {
  const { setBindings, setWpTitlesByUrl } = deps;
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
}

export function runMergeInventoryContentForSource(
  deps: OverviewWordPressBindingLookupsDeps,
  site: WordPressSite,
  source: OverviewSitemapSource,
  contentRows: OverviewInventoryRow[],
): void {
  const { inventoryCacheByKeyRef, activeInventoryRef, activeSitemapSourceRef, setAcfExtraTextSupported } = deps;
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
}

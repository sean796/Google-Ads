import type { WordPressSite } from "@/components/integrations/types";
import { getBulkGenerationWpInventoryIfReady } from "@/lib/bulk/bulk-generation-inventory-cache-store";
import { parseCompactInventoryUrls } from "@/lib/bulk/inventory-json-slim";
import { readWarmUrlMirrorSync } from "@/lib/local-analysis/site-prefetch-persist";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { buildOverviewSessionRowsFromWarmBulk } from "@/lib/overview/overview-inventory-progressive-hydrate";
import {
  getOverviewRowsSessionCache,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { splitOverviewInventoryRowsBySource } from "@/lib/overview/overview-unified-sitemap-inventory";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  getEntitySiteWarmCacheIfReady,
  isSitePrefetchStale,
  resolveEntitySiteWarmBundleSync,
} from "@/lib/local-analysis/entity-site-warm-state";

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
    const built = buildOverviewSessionRowsFromWarmBulk(site, source, prefetchRows);
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

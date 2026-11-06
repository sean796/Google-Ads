import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  normalizeMatch,
  snapshotHasInventoryEntries,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  buildOverviewInventoryCsv,
  buildOverviewSitemapUrlsInventoryCsv,
  buildWordPressSitemapExportCsv,
  type OverviewInventoryRow,
} from "@/lib/overview/overview-inventory-csv";
import { triggerOverviewCsvDownload } from "@/lib/overview/overview-wordpress-export-csv";
import { setBulkInventorySessionSnapshot } from "@/lib/wordpress-bulk-inventory-session-cache";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { buildOverviewInventorySnapshotFromRows } from "@/lib/overview/overview-parallel-inventory-fetch";
import {
  overviewUrlsFromBucketRows,
  splitOverviewInventoryRowsBySource,
} from "@/lib/overview/overview-unified-sitemap-inventory";
import {
  getEntitySiteWarmCacheIfReady,
  getSitePrefetchOverviewRowsForSource,
  getSitePrefetchOverviewRowsForSourceSync,
  resolveEntitySiteWarmBundleSync,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { getBulkGenerationWpInventoryIfReady } from "@/lib/bulk/bulk-generation-inventory-cache-store";
import { focusKeywordFromWordPressSources } from "@/lib/overview/focus-keyword-from-wp-sources";

export type CachedInventory = {
  siteId: string;
  source: OverviewSitemapSource;
  snapshot: BulkOptimizerInventorySnapshot;
  mergedRows: OverviewInventoryRow[];
};

export function inventoryCacheMapKey(siteId: string, source: OverviewSitemapSource): string {
  return `${siteId}:${source}`;
}

export function inventoryCacheHasContent(rows: OverviewInventoryRow[]): boolean {
  return rows.some((r) => (r.fields?.content ?? "").trim().length > 0);
}

export function inventoryRowsHaveRealIds(rows: OverviewInventoryRow[]): boolean {
  return rows.some((r) => Number(r.id) > 0);
}

export function inventoryRowDisplayKeyword(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  return focusKeywordFromWordPressSources({
    acf,
    fieldsKeyword: row.fields?.keyword,
    title: (row.fields?.title || row.fields?.pageHeading || "").trim(),
    collection: row.collection,
  });
}

export function inventoryRowDisplayDate(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const fromAcf =
    (typeof acf.date_modifier === "string" ? acf.date_modifier.trim() : "") ||
    (typeof acf.seo_date_modifier === "string" ? acf.seo_date_modifier.trim() : "");
  return fromAcf || (row.date_gmt ?? "").trim();
}

export function inventoryRowsHaveMetadata(rows: OverviewInventoryRow[]): boolean {
  return rows.some(
    (r) =>
      Number(r.id) > 0 &&
      ((r.fields?.title ?? "").trim() || (r.fields?.pageHeading ?? "").trim()),
  );
}

export function inventoryRowsHaveDisplayMetadata(rows: OverviewInventoryRow[]): boolean {
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

export function inventoryRowSeedQuality(rows: OverviewInventoryRow[]): number {
  let withIds = 0;
  let withAcf = 0;
  for (const r of rows) {
    if (Number(r.id) > 0) withIds += 1;
    if (r.acf && typeof r.acf === "object" && Object.keys(r.acf).length > 0) withAcf += 1;
  }
  return withIds * 1000 + withAcf * 10 + (inventoryCacheHasContent(rows) ? 1 : 0);
}

export function seedOverviewInventoryCacheFromPrefetch(
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

export function getCachedInventoryForSource(
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

export function inventoryMatchFromMergedRows(
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

export function prefetchResultForSource(
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

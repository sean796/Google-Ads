import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  buildInventoryLookupMaps,
  snapshotHasInventoryEntries,
  type BulkOptimizerInventorySnapshot,
  type InventoryLookupMaps,
} from "@/lib/wordpress-api/inventory-match";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  fetchUnifiedOverviewSitemapInventory,
  overviewUrlsFromBucketRows,
} from "@/lib/overview/overview-unified-sitemap-inventory";
import {
  overviewSitemapSourcesForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";

export type OverviewInventoryFetchOptions = {
  includeContent?: boolean;
  includePageHeading?: boolean;
  includeScheduled?: boolean;
};

export type OverviewInventoryFetchResult = {
  rows: OverviewInventoryRow[];
  errors: Record<string, string>;
  error?: string;
};

/** Build lookup snapshot from merged inventory rows (posts/pages buckets + CPT maps). */
export function buildOverviewInventorySnapshotFromRows(
  mergedRows: OverviewInventoryRow[],
  siteUrl: string,
): BulkOptimizerInventorySnapshot {
  const postOnly = mergedRows
    .filter((r) => r.collection === "posts")
    .map(({ collection: _c, ...r }) => r as SitePostInventoryRow);
  const pageOnly = mergedRows
    .filter((r) => r.collection === "pages")
    .map(({ collection: _c, ...r }) => r as SitePostInventoryRow);

  const customMapsByCollection: Record<string, InventoryLookupMaps> = {};
  const customCollections = new Set(
    mergedRows
      .map((r) => r.collection?.trim())
      .filter((c): c is string => Boolean(c && c !== "posts" && c !== "pages")),
  );

  for (const coll of customCollections) {
    const customRows = mergedRows
      .filter((r) => r.collection === coll)
      .map(({ collection: _c, ...r }) => r as SitePostInventoryRow);
    if (customRows.length > 0) {
      customMapsByCollection[coll] = buildInventoryLookupMaps(customRows, siteUrl);
    }
  }

  return {
    postsMaps: buildInventoryLookupMaps(postOnly, siteUrl),
    pagesMaps: buildInventoryLookupMaps(pageOnly, siteUrl),
    ...(Object.keys(customMapsByCollection).length > 0 ? { customMapsByCollection } : {}),
  };
}

/** One unified site inventory fetch; returns rows for the requested Overview bucket. */
export async function fetchOverviewInventoryForSource(
  site: WordPressSite,
  source: OverviewSitemapSource,
  options?: OverviewInventoryFetchOptions,
): Promise<OverviewInventoryFetchResult> {
  const unified = await fetchUnifiedOverviewSitemapInventory(site, {
    includeContent: options?.includeContent === true,
    includePageHeading: options?.includePageHeading === true,
    includeScheduled: options?.includeScheduled === true,
  });
  const rows = unified.bySource[source] ?? [];
  return { rows, errors: unified.errors };
}

export type OverviewParallelInventoryResult = {
  mergedRows: OverviewInventoryRow[];
  snapshot: BulkOptimizerInventorySnapshot;
  errors: Record<string, string>;
  bySource: Partial<Record<OverviewSitemapSource, OverviewInventoryRow[]>>;
};

/** One unified fetch; buckets split locally after the single bulk call. */
export async function fetchAllOverviewInventoriesParallel(
  site: WordPressSite,
  options?: OverviewInventoryFetchOptions,
): Promise<OverviewParallelInventoryResult> {
  const unified = await fetchUnifiedOverviewSitemapInventory(site, {
    includeContent: options?.includeContent === true,
    includePageHeading: options?.includePageHeading === true,
    includeScheduled: options?.includeScheduled === true,
  });

  const mergedRows: OverviewInventoryRow[] = [];
  const bySource: Partial<Record<OverviewSitemapSource, OverviewInventoryRow[]>> = {};

  for (const source of overviewSitemapSourcesForSite(site)) {
    const rows = unified.bySource[source] ?? [];
    if (rows.length) {
      mergedRows.push(...rows);
      bySource[source] = rows;
    }
  }

  const snapshot = buildOverviewInventorySnapshotFromRows(mergedRows, site.siteUrl);
  return { mergedRows, snapshot, errors: unified.errors, bySource };
}

export function overviewParallelInventoryHasEntries(result: OverviewParallelInventoryResult): boolean {
  return snapshotHasInventoryEntries(result.snapshot);
}

export { overviewUrlsFromBucketRows };

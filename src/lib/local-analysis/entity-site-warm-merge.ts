import type { WordPressSite } from "@/components/integrations/types";
import {
  getBulkGenerationWpInventoryIfReady,
  seedBulkGenerationWpInventoryFromBundle,
  setBulkGenerationWpInventoryEntry,
} from "@/lib/bulk/bulk-generation-inventory-cache-store";
import { buildPromptBulkSitemapInventoryFromRows } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { writeSitePrefetchPersist } from "@/lib/local-analysis/site-prefetch-persist";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { getDefaultSitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  canWarmEntitySite,
  countsFromInventory,
  siteWarmCredentialsKey,
} from "@/lib/local-analysis/entity-site-warm-helpers";
import { seedOverviewSessionCachesFromWarm } from "@/lib/local-analysis/entity-site-warm-rows";
import {
  cacheBySiteId,
  credentialsKeyBySiteId,
  metadataSeedInflightBySiteId,
  notifyEntitySiteWarmInflightChanged,
} from "@/lib/local-analysis/entity-site-warm-state";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-types";

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

import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import { attachRestFieldsToEntitySitemapRows } from "@/lib/sitemap-optimizer/enrich-entity-catalog-with-rest";
import { fetchEntityCatalogFromSitemap } from "@/lib/sitemap-optimizer/entity-catalog-from-sitemap";
import type {
  OverviewInventoryFetchOptions,
  OverviewInventoryFetchResult,
} from "@/lib/overview/overview-parallel-inventory-fetch";

export { attachRestFieldsToEntitySitemapRows };

/**
 * SAP: entity sitemap XML defines the URL list (same as Posts uses its sitemap bucket).
 * One REST bulk call hydrates excerpt / ACF / post id for scrape — no per-URL resolve.
 */
export async function fetchOverviewSapInventoryFromEntitySitemap(
  site: WordPressSite,
  collection: string,
  options?: OverviewInventoryFetchOptions,
): Promise<OverviewInventoryFetchResult> {
  const coll = collection.trim();
  if (!coll) {
    return { rows: [], errors: {}, error: "No REST collection for entity sitemap." };
  }

  const entityUrl = site.entitySitemapUrl?.trim();
  if (!entityUrl) {
    return { rows: [], errors: {}, error: "Entity sitemap URL is required in Integrations." };
  }

  const catalog = await fetchEntityCatalogFromSitemap(site, coll);
  if (catalog.ok === false) {
    return { rows: [], errors: {}, error: catalog.error };
  }

  const sitemapUrls = catalog.rows.map((r) => r.url).filter(Boolean);
  if (!sitemapUrls.length) {
    return { rows: [], errors: {}, error: "No URLs found in entity sitemap." };
  }

  const bulk = await getSiteInventoryBulk(site.siteUrl, site.username!, site.appPassword!, {
    includeContent: options?.includeContent === true,
    includePageHeading: options?.includePageHeading === true,
    collections: [coll],
  });

  const restRows = (bulk.rows ?? []) as OverviewInventoryRow[];
  const mergedRows = attachRestFieldsToEntitySitemapRows(
    site.siteUrl,
    coll,
    sitemapUrls,
    restRows,
  );

  if (bulk.error?.trim() && !mergedRows.some((r) => r.id)) {
    return { rows: mergedRows, errors: bulk.errors ?? {}, error: bulk.error.trim() };
  }

  return { rows: mergedRows, errors: bulk.errors ?? {} };
}

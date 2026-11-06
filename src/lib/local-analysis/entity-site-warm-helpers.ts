import type { WordPressSite } from "@/components/integrations/types";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { recreatePromptBulkSitemapInventoryLinks } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  entityGscRowLimitForSapBudget,
  sortGscQueriesByStats,
} from "@/lib/bulk/bulk-gsc-site-queries";
import {
  COMPETITOR_GSC_QUERY_ROW_LIMIT,
  getDefaultGscCompetitorDateRange,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import type { EntitySiteWarmBundle, EntitySiteWarmCounts } from "@/lib/local-analysis/entity-site-warm-types";

function emptyInventoryBuckets(): PromptBulkSitemapInventoryBuckets {
  return {
    pages: { json: "", rowCount: 0 },
    posts: { json: "", rowCount: 0 },
    sap: { json: "", rowCount: 0 },
  };
}

export function emptyWarmBundle(site: WordPressSite, error: string): EntitySiteWarmBundle {
  const dateRange = getDefaultGscCompetitorDateRange();
  return {
    siteId: site.id,
    credentialsKey: siteWarmCredentialsKey(site),
    fetchedAt: Date.now(),
    inventory: {
      links: [],
      buckets: emptyInventoryBuckets(),
      totalRows: 0,
      sources: [],
      errors: {},
      postsMetadata: [],
    },
    gsc: { queries: [], dateRange },
    counts: { inventoryTotal: 0, pages: 0, posts: 0, sap: 0, gscQueries: 0 },
    error,
  };
}

export function siteWarmCredentialsKey(
  site: Pick<WordPressSite, "siteUrl" | "username" | "appPassword">,
): string {
  return `${site.siteUrl?.trim() ?? ""}|${site.username?.trim() ?? ""}|${site.appPassword?.trim() ?? ""}`;
}

export function canWarmEntitySite(site: WordPressSite): boolean {
  return Boolean(site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim());
}

export function countsFromInventory(
  inventory: LoadBulkSitemapInventoryResult,
  gscQueryCount: number,
): EntitySiteWarmCounts {
  return {
    inventoryTotal: inventory.totalRows,
    pages: inventory.buckets.pages.rowCount,
    posts: inventory.buckets.posts.rowCount,
    sap: inventory.buckets.sap.rowCount,
    gscQueries: gscQueryCount,
  };
}

export function emptyInventoryResult(): LoadBulkSitemapInventoryResult {
  return {
    links: [],
    buckets: emptyInventoryBuckets(),
    totalRows: 0,
    sources: [],
    errors: {},
    postsMetadata: [],
  };
}

export function isUsableBundle(
  bundle: EntitySiteWarmBundle | undefined | null,
  credKey: string,
  site: WordPressSite,
  requireGsc = false,
): bundle is EntitySiteWarmBundle {
  if (!bundle || bundle.credentialsKey !== credKey) return false;
  if (requireGsc && (bundle.error || (canWarmEntitySite(site) && bundle.counts.gscQueries === 0))) {
    return false;
  }
  // Partial GSC-first commits can land with 0 URLs and no error; never treat that as ready for WP sites.
  if (bundle.counts.inventoryTotal > 0) return true;
  if (bundle.error) return false;
  return !canWarmEntitySite(site) && bundle.counts.gscQueries > 0;
}

export function hydrateInventoryLinks(site: WordPressSite, bundle: EntitySiteWarmBundle): EntitySiteWarmBundle {
  if (bundle.inventory.links.length > 0) return bundle;
  const siteUrl = site.siteUrl?.trim() ?? "";
  if (!siteUrl || bundle.inventory.totalRows === 0) return bundle;
  return {
    ...bundle,
    inventory: {
      ...bundle.inventory,
      links: recreatePromptBulkSitemapInventoryLinks(siteUrl, bundle.inventory.buckets, bundle.inventory.sources),
    },
  };
}

export function buildBundleFromLegs(
  site: WordPressSite,
  credKey: string,
  inventory: LoadBulkSitemapInventoryResult,
  gscRes: FetchCompetitorGscQueriesResult,
  bulkInventoryRows: SiteInventoryBulkRow[],
): EntitySiteWarmBundle {
  const dateRange = gscRes.dateRange ?? getDefaultGscCompetitorDateRange();

  if (inventory.totalRows === 0 && canWarmEntitySite(site)) {
    return {
      ...emptyWarmBundle(
        site,
        "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
      ),
      inventory,
      credentialsKey: credKey,
      bulkInventoryRows,
    };
  }

  if (gscRes.ok === false) {
    return {
      siteId: site.id,
      credentialsKey: credKey,
      fetchedAt: Date.now(),
      inventory,
      gsc: { queries: [], dateRange },
      counts: countsFromInventory(inventory, 0),
      bulkInventoryRows,
      error: gscRes.error || "Google Search Console returned no keywords for this site.",
    };
  }

  const queries = sortGscQueriesByStats(gscRes.queries.filter((q) => q.query?.trim()));
  if (queries.length === 0) {
    return {
      siteId: site.id,
      credentialsKey: credKey,
      fetchedAt: Date.now(),
      inventory,
      gsc: { queries: [], dateRange },
      counts: countsFromInventory(inventory, 0),
      bulkInventoryRows,
      error:
        "Google Search Console returned no keywords for this site. Connect GSC and ensure query data exists.",
    };
  }

  return {
    siteId: site.id,
    credentialsKey: credKey,
    fetchedAt: Date.now(),
    inventory,
    gsc: { queries, dateRange },
    counts: countsFromInventory(inventory, queries.length),
    bulkInventoryRows,
  };
}

export function gscQueriesFromWarmBundleForSapBudget(
  warm: EntitySiteWarmBundle,
  sapRowBudget: number,
): GscSiteQueryRow[] {
  return sortGscQueriesByStats(warm.gsc.queries).slice(0, entityGscRowLimitForSapBudget(sapRowBudget));
}

/** GSC query export for Details prep hosted link (top rows by stats, max 500). */
export function gscAllQueriesFromWarmBundle(warm: EntitySiteWarmBundle): GscSiteQueryRow[] {
  return sortGscQueriesByStats(warm.gsc.queries.filter((q) => q.query?.trim())).slice(
    0,
    COMPETITOR_GSC_QUERY_ROW_LIMIT,
  );
}

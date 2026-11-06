import type { WordPressSite } from "@/components/integrations/types";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { EntityGscKeywordBundle } from "@/lib/bulk/bulk-gsc-site-queries";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";

export const SITE_PREFETCH_TTL_MS = 24 * 60 * 60 * 1000;

export type EntitySiteWarmCounts = {
  inventoryTotal: number;
  pages: number;
  posts: number;
  sap: number;
  gscQueries: number;
};

export type EntitySiteWarmBundle = {
  siteId: string;
  credentialsKey: string;
  fetchedAt: number;
  inventory: LoadBulkSitemapInventoryResult;
  gsc: EntityGscKeywordBundle;
  counts: EntitySiteWarmCounts;
  bulkInventoryRows?: SiteInventoryBulkRow[];
  error?: string;
};

export type EnsureSitePrefetchOptions = {
  force?: boolean;
  /** Keyword fill: wait for GSC leg; never return sitemap-only partial bundle. */
  requireGsc?: boolean;
};

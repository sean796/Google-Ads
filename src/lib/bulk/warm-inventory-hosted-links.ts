import type { WordPressSite } from "@/components/integrations/types";
import { recreatePromptBulkSitemapInventoryLinks } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";

/** Pages + Posts + SAP hosted JSON links from a warm bundle (no network). */
export function warmInventoryHostedLinksForSite(
  site: WordPressSite,
  warm: EntitySiteWarmBundle,
): PromptBulkSitemapInventoryLink[] {
  if (warm.inventory.links.length > 0) {
    return warm.inventory.links;
  }
  const rowTotal = warm.inventory.totalRows || warm.counts.inventoryTotal;
  if (rowTotal <= 0) {
    return [];
  }
  const siteUrl = site.siteUrl?.trim() ?? "";
  if (!siteUrl) {
    return [];
  }
  return recreatePromptBulkSitemapInventoryLinks(
    siteUrl,
    warm.inventory.buckets,
    warm.inventory.sources,
  );
}

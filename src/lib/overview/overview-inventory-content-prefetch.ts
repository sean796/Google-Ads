import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  fetchOverviewPageContentBatch,
  sliceOverviewRowsByPage,
} from "@/lib/overview/overview-page-content-batch";
import { OVERVIEW_BULK_PAGE_SIZE } from "@/lib/overview/overview-bulk-page-size";

type MergeInventoryContent = (
  site: WordPressSite,
  source: OverviewSitemapSource,
  contentRows: OverviewInventoryRow[],
) => void;

/**
 * Full post bodies for scrape: one bulk call per pagination page (by post ID).
 * Merges each page into the inventory cache. No full-site refetch.
 */
export async function ensureOverviewInventoryIncludesContent(
  site: WordPressSite,
  rows: OverviewRow[],
  sitemapSource: OverviewSitemapSource,
  getInventoryMatchForUrl: (site: WordPressSite, url: string) => OverviewInventoryUrlMatch | undefined,
  mergeInventoryContentForSource: MergeInventoryContent,
  bindings: Record<string, OverviewBinding | undefined> = {},
  onPage?: (page: number, pageCount: number) => void,
): Promise<void> {
  if (!rows.length) return;

  const pages = sliceOverviewRowsByPage(rows, OVERVIEW_BULK_PAGE_SIZE);
  const pageCount = pages.length;

  for (let i = 0; i < pages.length; i += 1) {
    const page = i + 1;
    onPage?.(page, pageCount);
     
    const batch = await fetchOverviewPageContentBatch({
      site,
      sitemapSource,
      pageRows: pages[i],
      bindings,
      getInventoryMatchForUrl: (s, url) => getInventoryMatchForUrl(s!, url),
    });
    if (!batch.ok) {
      throw new Error(batch.error || "Page content inventory fetch failed.");
    }
    if (batch.contentRows.length) {
      mergeInventoryContentForSource(site, sitemapSource, batch.contentRows);
    }
  }
}

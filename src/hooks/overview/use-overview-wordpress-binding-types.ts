import type { WordPressSite } from "@/components/integrations/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

export interface OverviewBinding {
  postId: number;
  subtype: string;
  status?: string;
  date_gmt?: string;
}

export interface UseOverviewWordPressBindingResult {
  loading: boolean;
  error: string | null;
  bindings: Record<string, OverviewBinding>;
  /** Post titles from WordPress REST (same keys as `bindings`), for tiles when `row.title` is still empty. */
  wpTitlesByUrl: Record<string, string>;
  /** True while fetching posts + pages inventory (paginated REST lists). */
  inventoryLoading: boolean;
  inventoryError: string | null;
  /**
   * Fetches merged published posts/pages inventory and caches for resolveBindings.
   * With `downloadCsv: true`, triggers a browser CSV download immediately.
   * Loads full `fields.content` / `excerpt` per row (`includeContent`) so AI meta/title can skip per-post get-post-content;
   * tradeoff: larger payloads and memory on very large sites.
   */
  prefetchOverviewInventory: (
    site: WordPressSite | null,
    options?: {
      downloadCsv?: boolean;
      /** Default both. Pass `["posts"]`, `["pages"]`, or a CPT segment (e.g. `service-area`). */
      collections?: string[];
      /** Full post bodies; default false (faster REST walk for bind/CSV). */
      includeContent?: boolean;
      /** First H1 per post for list display (no full body stored). */
      includePageHeading?: boolean;
      /** With downloadCsv, one CSV row per sitemap URL (matched from bulk inventory). */
      sitemapUrls?: string[];
      /** Bucket this prefetch belongs to (per-source cache). */
      source?: OverviewSitemapSource;
      /** Background warm: skip global inventoryLoading spinner. */
      silent?: boolean;
      /** When false (default), reuse per-source cache when snapshot is populated. */
      forceRefresh?: boolean;
    },
  ) => Promise<{
    ok: boolean;
    count: number;
    error?: string;
    csvReady?: boolean;
    /** URLs from prefetched rows when `collections` is set. */
    urls?: string[];
  }>;
  /** Set from bulk inventory rows after prefetch; null while loading or before first prefetch. No ACF discover. */
  acfExtraTextSupported: boolean | null;
  resolveBindings: (
    urls: string[],
    site: WordPressSite | null,
    onProgress?: (delta: number, total: number) => void,
    options?: { inventoryOnly?: boolean; persistBindings?: boolean; source?: OverviewSitemapSource },
  ) => Promise<Record<string, OverviewBinding>>;
  /** Resolved inventory row for URL when prefetch cache matches current site (for scrape without get-post-meta). */
  getInventoryRowForUrl: (site: WordPressSite | null, url: string) => SitePostInventoryRow | undefined;
  /** Same lookup as getInventoryRowForUrl plus posts vs pages for row hydration. */
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
    source?: OverviewSitemapSource,
  ) => OverviewInventoryUrlMatch | undefined;
  activateInventoryCacheForSource: (siteId: string, source: OverviewSitemapSource) => void;
  /** Cached merged inventory rows from the last unified prefetch (per bucket). */
  getCachedInventoryRowsForSource: (
    siteId: string,
    source: OverviewSitemapSource,
  ) => OverviewInventoryRow[];
  /** Move a resolved post binding when Overview updates the canonical row URL after a slug change. */
  remapBindingUrl: (oldUrl: string, newUrl: string) => void;
  /** Merge content-bearing inventory rows into the per-source cache + session snapshot. */
  mergeInventoryContentForSource: (
    site: WordPressSite,
    source: OverviewSitemapSource,
    contentRows: OverviewInventoryRow[],
  ) => void;
}

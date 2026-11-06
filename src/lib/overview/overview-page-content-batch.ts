import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  overviewInventoryCollectionsFromSource,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  buildOverviewRowPatchFromInventory,
  type OverviewInventoryUrlMatch,
} from "@/lib/overview/overview-row-scrape";
import { overviewBindingForRow } from "@/lib/overview/overview-bulk-seo-payload";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OVERVIEW_BULK_PAGE_SIZE } from "@/lib/overview/overview-bulk-page-size";
import { getSiteInventoryBulk } from "@/lib/wordpress-api/posts";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { inventoryRowHasFullPostContent } from "@/lib/wordpress-api/inventory-match";

export type OverviewPageContentBatchResult = {
  ok: boolean;
  error?: string;
  /** Merged inventory rows returned from the content fetch (with bodies). */
  contentRows: OverviewInventoryRow[];
  /** Tile patches keyed by normalized URL. */
  patches: Map<string, Partial<OverviewRow>>;
  /** Post IDs included in the request. */
  includeIds: number[];
};

/** Merge content-bearing inventory rows into an existing cache by post id / URL. */
export function mergeInventoryContentRows(
  existing: OverviewInventoryRow[],
  contentRows: OverviewInventoryRow[],
): OverviewInventoryRow[] {
  if (!contentRows.length) return existing;
  const byId = new Map<number, OverviewInventoryRow>();
  const byUrl = new Map<string, OverviewInventoryRow>();
  for (const row of contentRows) {
    if (row.id) byId.set(row.id, row);
    const url = row.url?.trim();
    if (url) byUrl.set(normalizePageUrlKey(url), row);
  }

  const seenIds = new Set<number>();
  const seenUrls = new Set<string>();
  const merged = existing.map((row) => {
    const fromId = row.id ? byId.get(row.id) : undefined;
    const fromUrl = row.url?.trim() ? byUrl.get(normalizePageUrlKey(row.url)) : undefined;
    const hit = fromId ?? fromUrl;
    if (!hit) return row;
    if (hit.id) seenIds.add(hit.id);
    if (hit.url?.trim()) seenUrls.add(normalizePageUrlKey(hit.url));
    return {
      ...row,
      ...hit,
      fields: {
        ...(row.fields ?? {}),
        ...(hit.fields ?? {}),
      } as OverviewInventoryRow["fields"],
      collection: hit.collection || row.collection,
    };
  });

  for (const hit of contentRows) {
    if (hit.id && seenIds.has(hit.id)) continue;
    if (hit.url?.trim() && seenUrls.has(normalizePageUrlKey(hit.url))) continue;
    merged.push(hit);
  }
  return merged;
}

/** Post IDs for one pagination page of overview rows (from bindings + inventory). */
export function collectPageContentIncludeIds(
  pageRows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
  site: WordPressSite,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of pageRows) {
    const inv = getInventoryMatchForUrl(site, row.url);
    const binding = overviewBindingForRow(row, bindings) ??
      (inv?.row?.id ? { postId: inv.row.id, subtype: inv.subtype } : undefined);
    const id = binding?.postId ?? inv?.row?.id;
    if (!id || id <= 0 || seen.has(id)) continue;
    if (inventoryRowHasFullPostContent(inv?.row)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * One get-site-inventory-bulk call for a pagination page of post IDs (full bodies).
 * Caller merges `contentRows` into the inventory cache, then applies `patches` to tiles.
 */
export async function fetchOverviewPageContentBatch(args: {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  pageRows: OverviewRow[];
  bindings: Record<string, OverviewBinding | undefined>;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
}): Promise<OverviewPageContentBatchResult> {
  const { site, sitemapSource, pageRows, bindings, getInventoryMatchForUrl } = args;
  if (!pageRows.length) {
    return { ok: true, contentRows: [], patches: new Map(), includeIds: [] };
  }
  if (!site.username?.trim() || !site.appPassword?.trim()) {
    return {
      ok: false,
      error: "WordPress credentials required.",
      contentRows: [],
      patches: new Map(),
      includeIds: [],
    };
  }

  const includeIds = collectPageContentIncludeIds(
    pageRows,
    bindings,
    getInventoryMatchForUrl,
    site,
  );

  let contentRows: OverviewInventoryRow[] = [];
  if (includeIds.length) {
    try {
      const collections = overviewInventoryCollectionsFromSource(sitemapSource, site);
      const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
        includeContent: true,
        includePageHeading: true,
        includeScheduled: sitemapSource === "posts",
        collections: collections.length ? collections : [sitemapSource === "pages" ? "pages" : "posts"],
        includeIds,
      });
      contentRows = (bulk.rows ?? []) as OverviewInventoryRow[];
      if (bulk.error?.trim() && !contentRows.length) {
        return {
          ok: false,
          error: bulk.error.trim(),
          contentRows: [],
          patches: new Map(),
          includeIds,
        };
      }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Page content inventory fetch failed.",
        contentRows: [],
        patches: new Map(),
        includeIds,
      };
    }
  }

  const byId = new Map<number, OverviewInventoryRow>();
  const byUrl = new Map<string, OverviewInventoryRow>();
  for (const inv of contentRows) {
    if (inv.id) byId.set(inv.id, inv);
    if (inv.url?.trim()) byUrl.set(normalizePageUrlKey(inv.url), inv);
  }

  const patches = new Map<string, Partial<OverviewRow>>();
  for (const row of pageRows) {
    const url = row.url?.trim();
    if (!url) continue;
    const invMatch = getInventoryMatchForUrl(site, url);
    const fromFetch =
      (invMatch?.row?.id ? byId.get(invMatch.row.id) : undefined) ??
      byUrl.get(normalizePageUrlKey(url));
    const match: OverviewInventoryUrlMatch | undefined = fromFetch
      ? {
          row: fromFetch as SiteInventoryBulkRow,
          subtype:
            (fromFetch.collection ?? "").toLowerCase() === "pages" ||
            (fromFetch.collection ?? "").toLowerCase() === "page"
              ? "page"
              : (fromFetch.collection ?? "").toLowerCase() === "posts" ||
                  (fromFetch.collection ?? "").toLowerCase() === "post"
                ? "post"
                : fromFetch.collection ?? invMatch?.subtype ?? "post",
        }
      : invMatch;
    const binding = overviewBindingForRow(row, bindings);
    const patch = buildOverviewRowPatchFromInventory(row, match, binding, site.siteUrl);
    if (patch) patches.set(normalizePageUrlKey(url), patch);
  }

  return { ok: true, contentRows, patches, includeIds };
}

/** Slice overview rows into pagination-sized chunks (same size as bulk Headers pages). */
export function sliceOverviewRowsByPage<T>(items: T[], pageSize = OVERVIEW_BULK_PAGE_SIZE): T[][] {
  if (!items.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    out.push(items.slice(i, i + pageSize));
  }
  return out;
}

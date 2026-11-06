import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  buildOverviewRowPatchFromInventory,
  mergeOverviewRowScrapeFields,
} from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  applyFaqPlaceholderCountToRows,
  createEmptyOverviewRow,
} from "@/lib/overview/overview-row-helpers";
import { OVERVIEW_BULK_AI_FAQ_SEED_COUNT } from "@/components/overview/overview-tab-constants";
import { mergeOverviewRowsForSitemapLoad } from "@/lib/overview/overview-rows-session-cache";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { focusKeywordFromWordPressSources } from "@/lib/overview/focus-keyword-from-wp-sources";
import {
  fetchOverviewPageContentBatch,
  sliceOverviewRowsByPage,
} from "@/lib/overview/overview-page-content-batch";
import { OVERVIEW_BULK_PAGE_SIZE } from "@/lib/overview/overview-bulk-page-size";

function inventoryRowDisplayKeyword(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  return focusKeywordFromWordPressSources({
    acf,
    fieldsKeyword: row.fields?.keyword,
    title: (row.fields?.title || row.fields?.pageHeading || "").trim(),
    collection: row.collection,
  });
}

function inventoryRowDisplayDate(row: OverviewInventoryRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const fromAcf =
    (typeof acf.date_modifier === "string" ? acf.date_modifier.trim() : "") ||
    (typeof acf.seo_date_modifier === "string" ? acf.seo_date_modifier.trim() : "");
  return fromAcf || (row.date_gmt ?? "").trim();
}

function inventoryRowDisplayTitle(row: OverviewInventoryRow): string {
  return ((row.fields?.title ?? "").trim() || (row.fields?.pageHeading ?? "").trim());
}

/** Warm bulk rows have title, keyword, and date for every URL row. */
export function overviewInventoryRowsHaveDisplayMetadata(
  rows: OverviewInventoryRow[] | null | undefined,
): boolean {
  if (!rows?.length) return false;
  const withUrl = rows.filter((r) => r.url?.trim() && Number(r.id) > 0);
  if (!withUrl.length) return false;
  return withUrl.every((row) => {
    const title = inventoryRowDisplayTitle(row);
    const keyword = inventoryRowDisplayKeyword(row);
    const date = inventoryRowDisplayDate(row);
    return title.length > 0 && keyword.length > 0 && date.length > 0;
  });
}

/** Collapsed grid row is ready: title, keyword, and date all present. */
export function overviewSessionRowsDisplayReady(rows: OverviewRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  const withUrl = rows.filter((r) => r.url?.trim());
  if (!withUrl.length) return false;
  return withUrl.every((row) => {
    const title = (row.title || row.pageHeading || "").trim();
    const keyword = (row.focusKeyword || "").trim();
    const date = (row.dateModifier || row.wpDateGmt || "").trim();
    return title.length > 0 && keyword.length > 0 && date.length > 0;
  });
}

export function overviewSessionRowsMetadataReady(rows: OverviewRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  const withUrl = rows.filter((r) => r.url?.trim());
  if (!withUrl.length) return false;
  return withUrl.every((row) => {
    const title = (row.title || row.pageHeading || "").trim();
    return title.length > 0;
  });
}

export function overviewSessionRowsHaveContent(rows: OverviewRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => (r.postContent ?? "").trim().length > 0);
}

/** True when at least one URL row still lacks post body content. */
export function overviewSessionRowsNeedContent(rows: OverviewRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => r.url?.trim() && !(r.postContent ?? "").trim().length);
}

function inventorySubtypeFromCollection(collection: string | undefined): string {
  const coll = (collection ?? "").toLowerCase().trim();
  if (coll === "pages" || coll === "page") return "page";
  if (coll === "posts" || coll === "post") return "post";
  return collection ?? coll;
}

/** Bindings from warm bulk inventory (no network). */
export function buildBindingMapFromPrefetchInventory(
  prefetchRows: OverviewInventoryRow[],
): Record<string, OverviewBinding> {
  const bindingMap: Record<string, OverviewBinding> = {};
  for (const inv of prefetchRows) {
    const url = inv.url?.trim();
    if (!url || !inv.id) continue;
    bindingMap[url] = {
      postId: inv.id,
      subtype: inventorySubtypeFromCollection(inv.collection),
    };
  }
  return bindingMap;
}

/** Lookup inventory matches from prefetch rows only (no network, no hook). */
export function buildInventoryMatchLookupFromPrefetchRows(
  prefetchRows: OverviewInventoryRow[],
): (
  site: WordPressSite,
  url: string,
  source?: OverviewSitemapSource,
) => OverviewInventoryUrlMatch | undefined {
  const byUrl = new Map<string, OverviewInventoryRow>();
  for (const inv of prefetchRows) {
    const url = inv.url?.trim();
    if (!url) continue;
    byUrl.set(normalizePageUrlKey(url), inv);
  }
  return (_site, url) => {
    const inv = byUrl.get(normalizePageUrlKey(url));
    if (!inv) return undefined;
    return {
      row: inv as SitePostInventoryRow,
      subtype: inventorySubtypeFromCollection(inv.collection),
    };
  };
}

/** Build final overview rows from warm bulk (site warm / session pre-seed only). */
export function buildOverviewSessionRowsFromWarmBulk(
  site: WordPressSite,
  source: OverviewSitemapSource,
  prefetchRows: OverviewInventoryRow[],
): OverviewRow[] {
  if (!prefetchRows.length) return [];
  const bindingMap = buildBindingMapFromPrefetchInventory(prefetchRows);
  const getInventoryMatchForUrl = buildInventoryMatchLookupFromPrefetchRows(prefetchRows);
  return buildOverviewRowsFromWarmPrefetchInventory(
    site,
    source,
    prefetchRows,
    new Map<string, OverviewRow>(),
    bindingMap,
    getInventoryMatchForUrl,
  );
}

/** Patch warm bulk inventory into display-ready overview rows (cache-only, no network). */
export function buildOverviewRowsFromWarmPrefetchInventory(
  site: WordPressSite,
  source: OverviewSitemapSource,
  prefetchRows: OverviewInventoryRow[],
  sessionByUrl: Map<string, OverviewRow>,
  bindingMap: Record<string, OverviewBinding>,
  getInventoryMatchForUrl: (
    site: WordPressSite,
    url: string,
    source?: OverviewSitemapSource,
  ) => OverviewInventoryUrlMatch | undefined,
): OverviewRow[] {
  const urls = prefetchRows
    .map((row) => row.url?.trim())
    .filter((url): url is string => Boolean(url));
  const merged = mergeOverviewRowsForSitemapLoad(
    urls,
    new Map<string, OverviewRow>(),
    sessionByUrl,
    createEmptyOverviewRow,
  );
  const rowsFinal = applyFaqPlaceholderCountToRows(merged, OVERVIEW_BULK_AI_FAQ_SEED_COUNT);
  return applyInventoryPatchesToOverviewRows(
    rowsFinal,
    site,
    source,
    bindingMap,
    getInventoryMatchForUrl,
  );
}

export function applyInventoryPatchesToOverviewRows(
  rows: OverviewRow[],
  site: WordPressSite,
  source: OverviewSitemapSource,
  bindingMap: Record<string, OverviewBinding>,
  getInventoryMatchForUrl: (
    site: WordPressSite,
    url: string,
    source?: OverviewSitemapSource,
  ) => OverviewInventoryUrlMatch | undefined,
): OverviewRow[] {
  return rows.map((row) => {
    const invMatch = getInventoryMatchForUrl(site, row.url, source);
    const invPatch = buildOverviewRowPatchFromInventory(row, invMatch, bindingMap[row.url], site.siteUrl);
    const patch =
      invPatch ??
      mergeOverviewRowScrapeFields(
        row,
        { title: row.title || "", metaDescription: row.metaDescription || "" },
        null,
      );
    return { ...row, ...patch, status: "idle" as const };
  });
}

function applyPatchMapToRows(
  rows: OverviewRow[],
  patches: Map<string, Partial<OverviewRow>>,
): OverviewRow[] {
  if (!patches.size) return rows;
  return rows.map((row) => {
    const url = row.url?.trim();
    if (!url) return row;
    const patch = patches.get(normalizePageUrlKey(url));
    if (!patch) return row;
    return { ...row, ...patch, status: "idle" as const };
  });
}

export type HydrateOverviewContentInBackgroundArgs = {
  site: WordPressSite;
  source: OverviewSitemapSource;
  rows: OverviewRow[];
  generation: number;
  isStaleLoad: (generation: number) => boolean;
  bindingMap: Record<string, OverviewBinding>;
  getInventoryMatchForUrl: (
    site: WordPressSite,
    url: string,
    source?: OverviewSitemapSource,
  ) => OverviewInventoryUrlMatch | undefined;
  mergeInventoryContentForSource: (
    site: WordPressSite,
    source: OverviewSitemapSource,
    contentRows: OverviewInventoryRow[],
  ) => void;
  onRowsUpdated: (rows: OverviewRow[]) => void;
};

/** Silent batched post-body fetch; merges inventory cache and UI rows after each batch. */
export async function hydrateOverviewContentInBackground(
  args: HydrateOverviewContentInBackgroundArgs,
): Promise<void> {
  const {
    site,
    source,
    rows,
    generation,
    isStaleLoad,
    bindingMap,
    getInventoryMatchForUrl,
    mergeInventoryContentForSource,
    onRowsUpdated,
  } = args;

  if (!rows.length || isStaleLoad(generation)) return;

  const pages = sliceOverviewRowsByPage(rows, OVERVIEW_BULK_PAGE_SIZE);
  let currentRows = rows;

  for (let i = 0; i < pages.length; i += 1) {
    if (isStaleLoad(generation)) return;

    const pageRows = pages[i]!;
     
    const batch = await fetchOverviewPageContentBatch({
      site,
      sitemapSource: source,
      pageRows,
      bindings: bindingMap,
      getInventoryMatchForUrl: (s, url) => getInventoryMatchForUrl(s!, url, source),
    });

    if (isStaleLoad(generation)) return;
    if (!batch.ok) return;

    if (batch.contentRows.length) {
      mergeInventoryContentForSource(site, source, batch.contentRows);
    }

    if (batch.patches.size) {
      currentRows = applyPatchMapToRows(currentRows, batch.patches);
      currentRows = applyInventoryPatchesToOverviewRows(
        currentRows,
        site,
        source,
        bindingMap,
        getInventoryMatchForUrl,
      );
      if (!isStaleLoad(generation)) {
        onRowsUpdated(currentRows);
      }
    }
  }
}

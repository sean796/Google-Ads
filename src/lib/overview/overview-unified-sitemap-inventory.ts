import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { parseSitemap, getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { attachRestFieldsToEntitySitemapRows } from "@/lib/sitemap-optimizer/enrich-entity-catalog-with-rest";
import {
  filterOverviewUtilityInventoryRows,
  filterOverviewUtilityUrls,
} from "@/lib/overview/overview-utility-page-filter";
import { filterInventorySitemapRows, filterInventorySitemapUrls } from "@/lib/bulk/inventory-url-filter";
import {
  overviewEntityRestCollectionForSite,
  overviewInventoryCollectionsFromSource,
  resolveOverviewSitemapUrls,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";

const OVERVIEW_SOURCES: OverviewSitemapSource[] = ["pages", "posts", "sap"];

type UrlWithCollection = { url: string; collection: string };

function restCollectionForSitemapXml(sitemapXmlUrl: string, fallback: string): string {
  const ep = extractEndpointFromEntitySitemapUrl(sitemapXmlUrl.trim());
  if (!ep) return fallback;
  const lower = ep.toLowerCase();
  if (lower === "post") return "posts";
  if (lower === "page") return "pages";
  return ep;
}

async function parseSitemapUrlEntries(
  site: WordPressSite,
  sitemapXmlUrl: string,
  collection: string,
): Promise<UrlWithCollection[]> {
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  try {
    const result = await parseSitemap(
      site.siteUrl,
      sitemapXmlUrl,
      user || undefined,
      pass || undefined,
    );
    const urls = Array.isArray(result?.urls) ? result.urls : [];
    return urls
      .map((u) => String(u || "").trim())
      .filter(Boolean)
      .map((url) => ({ url, collection }));
  } catch (err: unknown) {
    throw err;
  }
}

function dedupeUrlEntries(entries: UrlWithCollection[]): UrlWithCollection[] {
  const seen = new Set<string>();
  const out: UrlWithCollection[] = [];
  for (const entry of entries) {
    const key = entry.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** Parse every Overview bucket sitemap XML the same way (pages, posts, entity). */
export async function parseOverviewBucketSitemapUrls(
  site: WordPressSite,
): Promise<Record<OverviewSitemapSource, UrlWithCollection[]>> {
  const pagesXml = resolveOverviewSitemapUrls(site, "pages");
  const postsXml = resolveOverviewSitemapUrls(site, "posts");
  const entityCollection = overviewEntityRestCollectionForSite(site) ?? "service-area";
  const sapXml = resolveOverviewSitemapUrls(site, "sap");

  const [pagesEntries, postsEntries, sapEntries] = await Promise.all([
    Promise.all(
      pagesXml.map((sitemapXml) => {
        const collection = restCollectionForSitemapXml(sitemapXml, "pages");
        return parseSitemapUrlEntries(site, sitemapXml, collection);
      }),
    ),
    Promise.all(
      postsXml.map((sitemapXml) =>
        parseSitemapUrlEntries(site, sitemapXml, "posts"),
      ),
    ),
    Promise.all(
      sapXml.map((sitemapXml) =>
        parseSitemapUrlEntries(site, sitemapXml, entityCollection),
      ),
    ),
  ]);

  return {
    pages: dedupeUrlEntries(pagesEntries.flat()),
    posts: dedupeUrlEntries(postsEntries.flat()),
    sap: dedupeUrlEntries(sapEntries.flat()),
  };
}

/** Parse sitemap XML per file in parallel; emit cumulative URLs as each child sitemap finishes. */
export async function crawlOverviewSourceSitemapUrls(
  site: WordPressSite,
  source: OverviewSitemapSource,
  onBatch?: (urls: string[]) => void,
): Promise<string[]> {
  const sitemapXmlUrls = resolveOverviewSitemapUrls(site, source);
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  const hasCreds = Boolean(user && pass);
  const origin = site.siteUrl.replace(/\/+$/, "");

  const all: string[] = [];
  const seen = new Set<string>();

  const emit = () => {
    let urls = filterInventorySitemapUrls([...all]);
    if (source === "pages") urls = filterOverviewUtilityUrls(urls);
    onBatch?.(urls);
    return urls;
  };

  const mergeBatch = (batch: string[]) => {
    for (const raw of batch) {
      const trimmed = String(raw || "").trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(trimmed);
    }
    return emit();
  };

  if (sitemapXmlUrls.length === 0) {
    return emit();
  }

  let mergeChain = Promise.resolve();
  const safeMergeBatch = (batch: string[]) => {
    mergeChain = mergeChain.then(() => mergeBatch(batch));
    return mergeChain;
  };

  await Promise.all(
    sitemapXmlUrls.map(async (sitemapXml) => {
      const result = await parseSitemap(
        origin,
        sitemapXml,
        hasCreds ? user : undefined,
        hasCreds ? pass : undefined,
      );
      const batch = Array.isArray(result?.urls) ? result.urls : [];
      await safeMergeBatch(batch);
    }),
  );

  await mergeChain;
  return emit();
}

export function mergeOverviewInventoryCollections(site: WordPressSite): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of OVERVIEW_SOURCES) {
    for (const col of overviewInventoryCollectionsFromSource(source, site)) {
      const key = col.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(col);
    }
  }
  return out;
}

function hydrateUrlEntries(
  siteUrl: string,
  entries: UrlWithCollection[],
  restRows: OverviewInventoryRow[],
): OverviewInventoryRow[] {
  const byCollection = new Map<string, string[]>();
  for (const { url, collection } of entries) {
    const list = byCollection.get(collection) ?? [];
    list.push(url);
    byCollection.set(collection, list);
  }

  const out: OverviewInventoryRow[] = [];
  for (const [collection, urls] of byCollection) {
    const collRest = restRows.filter(
      (r) => (r.collection ?? collection).toLowerCase() === collection.toLowerCase(),
    );
    out.push(...attachRestFieldsToEntitySitemapRows(siteUrl, collection, urls, collRest));
  }
  return out;
}

export type UnifiedOverviewInventoryResult = {
  bySource: Record<OverviewSitemapSource, OverviewInventoryRow[]>;
  errors: Record<string, string>;
};

export function splitOverviewInventoryRowsBySource(
  site: WordPressSite,
  restRows: OverviewInventoryRow[],
): Record<OverviewSitemapSource, OverviewInventoryRow[]> {
  const entityCol = overviewEntityRestCollectionForSite(site)?.toLowerCase() ?? "";
  const pagesCols = new Set(
    overviewInventoryCollectionsFromSource("pages", site).map((c) => c.toLowerCase().trim()),
  );
  const pages: OverviewInventoryRow[] = [];
  const posts: OverviewInventoryRow[] = [];
  const sap: OverviewInventoryRow[] = [];

  for (const row of restRows) {
    const coll = (row.collection ?? "").toLowerCase().trim();
    if (!coll) continue;
    if (coll === "posts" || coll === "post") {
      posts.push(row);
    } else if (entityCol && coll === entityCol) {
      sap.push(row);
    } else if (pagesCols.has(coll) || coll === "pages" || coll === "page") {
      pages.push(row);
    }
  }

  return {
    pages: filterInventorySitemapRows(filterOverviewUtilityInventoryRows(pages)),
    posts: filterInventorySitemapRows(posts),
    sap: filterInventorySitemapRows(sap),
  };
}

/**
 * One get-site-inventory-bulk call; bucket rows locally by collection (no sitemap XML fan-out).
 */
export async function fetchUnifiedOverviewSitemapInventory(
  site: WordPressSite,
  options?: {
    includeContent?: boolean;
    includePageHeading?: boolean;
    includeScheduled?: boolean;
  },
): Promise<UnifiedOverviewInventoryResult> {
  const collections = mergeOverviewInventoryCollections(site);

  let restRows: OverviewInventoryRow[] = [];
  const bulkErrors: Record<string, string> = {};

  if (collections.length > 0) {
    try {
      const bulk = await getSiteInventoryBulk(site.siteUrl, site.username!, site.appPassword!, {
        includeContent: options?.includeContent === true,
        includePageHeading: options?.includePageHeading === true,
        includeScheduled: options?.includeScheduled === true,
        collections,
      });
      restRows = (bulk.rows ?? []) as OverviewInventoryRow[];
      if (bulk.errors) Object.assign(bulkErrors, bulk.errors);
      if (bulk.error?.trim()) bulkErrors._bulk = bulk.error.trim();
    } catch (err: unknown) {
      bulkErrors._bulk =
        err instanceof Error ? err.message : "WordPress bulk inventory request failed";
    }
  }

  const bySource = splitOverviewInventoryRowsBySource(site, restRows);

  return {
    bySource,
    errors: bulkErrors,
  };
}

export function overviewUrlsFromBucketRows(rows: OverviewInventoryRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return filterInventorySitemapUrls(out);
}

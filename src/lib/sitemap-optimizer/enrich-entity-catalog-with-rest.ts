import type { WordPressSite } from "@/components/integrations/types";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SiteInventoryBulkRow, SitePostInventoryRow } from "@/lib/wordpress-api/types";
import {
  contentSnippetFromFields,
  postIdFromInventoryRow,
  seoResearchFromAcf,
  urlPathTail,
} from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { fetchEntityCatalogFromSitemap } from "@/lib/sitemap-optimizer/entity-catalog-from-sitemap";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";
import { normalizeMatch } from "@/lib/wordpress-api/inventory-match";

function titleFromSlug(url: string): string {
  const slug = urlPathTail(url);
  if (!slug) return url.trim();
  try {
    const decoded = decodeURIComponent(slug).trim();
    return decoded.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  } catch {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
}

/** Entity sitemap URL order + REST bulk fields (id, date_gmt, ACF) keyed by URL. */
export function attachRestFieldsToEntitySitemapRows<T extends SitePostInventoryRow>(
  siteUrl: string,
  collection: string,
  sitemapUrls: string[],
  restRows: T[],
): T[] {
  const byUrl = new Map<string, T>();
  for (const row of restRows) {
    const key = normalizeMatch(siteUrl, row.url ?? "");
    if (key) byUrl.set(key, row);
  }

  return sitemapUrls.map((url) => {
    const stubRow: SiteInventoryBulkRow = {
      url,
      slug: urlPathTail(url),
      collection,
      fields: {
        title: titleFromSlug(url),
        keyword: "",
        meta: "",
        content: "",
        excerpt: "",
      },
      date_gmt: "",
    };
    const stub = stubRow as SitePostInventoryRow as T;
    const hit = byUrl.get(normalizeMatch(siteUrl, url));
    if (!hit) return stub;
    return {
      ...hit,
      collection,
      url,
      fields: {
        ...hit.fields,
        title: (hit.fields?.title ?? "").trim() || stub.fields.title,
        pageHeading: (hit.fields?.pageHeading ?? "").trim() || undefined,
      },
    } as T;
  });
}

function mapRestRowToOptimizerRow(row: SiteInventoryBulkRow, collection: string): SitemapOptimizerPostRow {
  const title = (row.fields?.title ?? "").trim() || titleFromSlug(row.url);
  return {
    postId: postIdFromInventoryRow(row),
    url: row.url.trim(),
    id: row.id,
    slug: row.slug,
    collection,
    title,
    keyword: (row.fields?.keyword ?? "").trim(),
    meta: (row.fields?.meta ?? "").trim(),
    contentSnippet: contentSnippetFromFields(row.fields?.content, row.fields?.excerpt),
    seoResearch: seoResearchFromAcf(row.acf),
    publishedAtGmt: (row.date_gmt ?? "").trim() || undefined,
    gscQueries: [],
    gscFetched: false,
  };
}

/** Sitemap URL list + one REST bulk call for publish dates and post ids. */
export async function enrichEntityOptimizerCatalogWithRest(
  site: WordPressSite,
  collection: string,
  sitemapRows: SitemapOptimizerPostRow[],
): Promise<SitemapOptimizerPostRow[]> {
  const coll = collection.trim();
  if (!coll || !site.username?.trim() || !site.appPassword?.trim()) {
    return sitemapRows;
  }

  const sitemapUrls = sitemapRows.map((r) => r.url).filter(Boolean);
  if (!sitemapUrls.length) return sitemapRows;

  try {
    const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
      includeContent: false,
      includeRawAcf: true,
      collections: [coll],
    });
    const restRows = (bulk.rows ?? []) as SiteInventoryBulkRow[];
    const merged = attachRestFieldsToEntitySitemapRows(
      site.siteUrl,
      coll,
      sitemapUrls,
      restRows,
    );
    return merged.map((row) => mapRestRowToOptimizerRow({ ...row, collection: coll }, coll));
  } catch {
    return sitemapRows;
  }
}

export async function fetchEnrichedEntityOptimizerCatalog(
  site: WordPressSite,
  collection: string,
): Promise<
  | { ok: true; rows: SitemapOptimizerPostRow[]; source: "sitemap" }
  | { ok: false; error: string }
> {
  const catalog = await fetchEntityCatalogFromSitemap(site, collection);
  if (catalog.ok === false) return catalog;
  const rows = await enrichEntityOptimizerCatalogWithRest(site, collection, catalog.rows);
  return { ok: true, rows, source: "sitemap" };
}

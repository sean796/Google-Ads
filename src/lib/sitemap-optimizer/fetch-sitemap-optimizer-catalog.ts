import type { WordPressSite } from "@/components/integrations/types";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  contentSnippetFromFields,
  postIdFromInventoryRow,
  seoResearchFromAcf,
} from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { fetchEnrichedEntityOptimizerCatalog } from "@/lib/sitemap-optimizer/enrich-entity-catalog-with-rest";
import {
  kbInventoryRowCollection,
  loadLatestWpSiteInventoryFromKb,
} from "@/lib/sitemap-optimizer/load-catalog-from-kb";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

export type FetchSitemapOptimizerCatalogResult =
  | { ok: true; rows: SitemapOptimizerPostRow[]; source: "kb" | "wordpress" | "sitemap" }
  | { ok: false; error: string };

function mapBulkRow(row: SiteInventoryBulkRow): SitemapOptimizerPostRow | null {
  const title = (row.fields?.title ?? "").trim();
  if (!title) return null;
  const url = (row.url ?? "").trim();
  if (!url) return null;

  return {
    postId: postIdFromInventoryRow(row),
    url,
    id: row.id,
    slug: row.slug,
    collection: row.collection ?? "posts",
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

function mapKbRowsToCatalog(
  site: WordPressSite,
  collections: string[],
): SitemapOptimizerPostRow[] {
  const kb = loadLatestWpSiteInventoryFromKb(site);
  if (!kb?.posts?.length) return [];

  const colSet = new Set(collections);
  const mapped: SitemapOptimizerPostRow[] = [];

  for (const row of kb.posts) {
    const collection = kbInventoryRowCollection(row, site);
    if (!colSet.has(collection)) continue;
    const m = mapBulkRow({ ...row, collection });
    if (m) mapped.push(m);
  }
  return mapped;
}

export async function fetchSitemapOptimizerCatalog(
  site: WordPressSite,
  collections: string[],
  options?: { forceLiveInventory?: boolean; entityOnly?: boolean },
): Promise<FetchSitemapOptimizerCatalogResult> {
  if (!collections.length) {
    return { ok: false, error: "Select at least one collection (Posts, Pages, or Entity)." };
  }
  if (!site.siteUrl?.trim()) {
    return { ok: false, error: "Site URL is required." };
  }

  if (options?.entityOnly) {
    return fetchEnrichedEntityOptimizerCatalog(site, collections[0] ?? "");
  }

  const kbRows = options?.forceLiveInventory ? [] : mapKbRowsToCatalog(site, collections);
  if (kbRows.length > 0) {
    return { ok: true, rows: kbRows, source: "kb" };
  }

  if (!site.username?.trim() || !site.appPassword?.trim()) {
    return {
      ok: false,
      error:
        "WordPress credentials required, or save a site inventory JSON in Knowledge Base (Bulk ideas run).",
    };
  }

  try {
    const bulk = await getSiteInventoryBulk(site.siteUrl, site.username, site.appPassword, {
      includeContent: false,
      includeRawPostFields: true,
      collections,
    });

    if (bulk.error?.trim() && !(bulk.rows?.length ?? 0)) {
      return { ok: false, error: bulk.error.trim() };
    }

    const mapped: SitemapOptimizerPostRow[] = [];
    for (const row of bulk.rows ?? []) {
      const m = mapBulkRow(row);
      if (m) mapped.push(m);
    }

    if (mapped.length === 0) {
      return { ok: false, error: "No published rows with titles found in the selected collections." };
    }

    return { ok: true, rows: mapped, source: "wordpress" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Failed to load WordPress inventory." };
  }
}

import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { buildCatalogEntries } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { normalizeGridGeoTag, normalizeGridTopicTag } from "@/lib/sitemap-optimizer/grid-tag-key";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type {
  SitemapOptimizerCatalogEntry,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export function titleFromUrlPath(url: string): string {
  const tail = urlPathTail(url);
  if (!tail) return "Untitled URL";
  return tail.replace(/-/g, " ").replace(/_/g, " ").trim() || "Untitled URL";
}

/** One synthetic post row per GSC grid CSV line (no WordPress inventory). */
export function buildPostRowsFromGscGrid(upload: readonly GscParsedPageRow[]): SitemapOptimizerPostRow[] {
  return upload.map((row, index) => {
    const url = row.page.trim();
    const tagLabel = row.gridTagLabel?.trim();
    const topicTag = row.gridTopicTag?.trim();
    return {
      postId: `csv:${index}`,
      url,
      collection: "grid_csv",
      title: tagLabel || titleFromUrlPath(url),
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
      gscPageClicks: row.clicks,
      gscPageImpressions: row.impressions,
      gscPageCtr: row.ctr,
      gscPagePosition: row.position,
      uploadRowIndex: row.csvUploadRow ?? index + 1,
      gridRedirectFromUrl: row.redirectFromUrl?.trim() || undefined,
      gridRedirectGroup: row.gridGroup,
      gridTopicTag: topicTag ? normalizeGridTopicTag(topicTag) : undefined,
      gridGeoTag: row.gridGeoTag?.trim() ? normalizeGridGeoTag(row.gridGeoTag) : undefined,
      gridTagLabel: tagLabel || undefined,
    };
  });
}

export function buildCatalogEntriesFromGridRows(
  rows: SitemapOptimizerPostRow[],
): SitemapOptimizerCatalogEntry[] {
  return buildCatalogEntries(rows);
}

export function siteOriginFromGridRows(rows: SitemapOptimizerPostRow[]): string | null {
  const first = rows[0]?.url?.trim();
  if (!first) return null;
  try {
    return new URL(first).origin;
  } catch {
    return null;
  }
}

import { decodeInventoryTitleText } from "@/lib/bulk/inventory-json-slim";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { GridLocationBucket } from "@/lib/local-analysis/grid-location-buckets";
import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { entityLocationSlugFromRow } from "@/lib/sitemap-optimizer/entity-compression-buckets";
import { leadingPlaceKeyFromPathTail } from "@/lib/sitemap-optimizer/enforce-separate-geo-clusters";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";

function placeTokenFromUrl(url: string): string {
  const tail = urlPathTail(url);
  const leading = leadingPlaceKeyFromPathTail(tail);
  if (leading) return humanizeSlugFromUrl(leading);
  const slugTail = entityLocationSlugFromRow({
    postId: "",
    url,
    title: "",
    slug: tail,
    keyword: "",
    collection: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: false,
  });
  if (slugTail) return humanizeSlugFromUrl(slugTail);
  return humanizeSlugFromUrl(url);
}

function placeLabelFromInventoryRow(row: SiteInventoryBulkRow): string {
  const url = row.url?.trim() ?? "";
  const fromUrl = url ? placeTokenFromUrl(url) : "";
  if (fromUrl) return fromUrl;

  const keyword = decodeInventoryTitleText(row.fields?.keyword ?? "").trim();
  if (keyword) return keyword;

  const title = decodeInventoryTitleText(row.fields?.title ?? "").trim();
  if (title) return title;

  return "";
}

/** Append metro hint when the place label does not already include it. */
export function withMetroHintForSitemapPlace(place: string, metroHint?: string): string {
  const p = place.trim();
  if (!p) return metroHint?.trim() ?? "";
  const metro = metroHint?.trim();
  if (!metro) return p;
  const metroHead = metro.split(",")[0]?.trim().toLowerCase() ?? "";
  if (metroHead && p.toLowerCase().includes(metroHead)) return p;
  return `${p}, ${metro}`;
}

/** Service-area sitemap rows → cluster buckets (equal weight; no grid CSV). */
export function buildSitemapLocationBucketsFromInventory(
  rows: SiteInventoryBulkRow[],
  metroHint?: string,
): GridLocationBucket[] {
  const byPlace = new Map<string, { urls: string[]; rows: SiteInventoryBulkRow[] }>();

  for (const row of rows) {
    const rawPlace = placeLabelFromInventoryRow(row);
    if (!rawPlace) continue;
    const placeLabel = withMetroHintForSitemapPlace(rawPlace, metroHint);
    const key = placeLabel.toLowerCase();
    if (!byPlace.has(key)) byPlace.set(key, { urls: [], rows: [] });
    const bucket = byPlace.get(key)!;
    bucket.rows.push(row);
    const url = row.url?.trim();
    if (url && !bucket.urls.includes(url)) bucket.urls.push(url);
  }

  const buckets: GridLocationBucket[] = [];
  let idx = 0;
  for (const [key, group] of byPlace) {
    const placeLabel = withMetroHintForSitemapPlace(placeLabelFromInventoryRow(group.rows[0]!), metroHint) || key;
    buckets.push({
      bucketId: `sap-${idx++}`,
      placeLabel,
      weight: 1,
      avgRank: 10,
      rowCount: group.rows.length,
      sampleAddresses: group.urls.slice(0, 8),
    });
  }

  return buckets.sort((a, b) => b.rowCount - a.rowCount || a.placeLabel.localeCompare(b.placeLabel));
}

export function sitemapLocationLabelsFromBuckets(buckets: GridLocationBucket[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    const label = bucket.placeLabel.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

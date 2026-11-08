import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { shortAiseoSlugFromKeyword } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  fullDestinationUrl,
  normalizeFocusKeywordPhrase,
} from "@/lib/pulse-redirect-redirect-csv";
import { URL_OPTIMIZER_BLOG_PATH } from "@/lib/url-optimizer/constants";

export function buildOptimizedUrl(oldUrl: string, keyword: string, title: string): string | null {
  const slugSegment = shortAiseoSlugFromKeyword(keyword, title);
  if (!slugSegment) return null;
  const relativePath = `${URL_OPTIMIZER_BLOG_PATH}/${slugSegment}/`;
  return fullDestinationUrl(oldUrl, relativePath);
}

export function urlsDiffer(oldUrl: string, newUrl: string): boolean {
  return normalizePageUrlKey(oldUrl) !== normalizePageUrlKey(newUrl);
}

export function deterministicKeywordFromRow(row: {
  page: string;
  title: string;
  meta: string;
  focusKeyword?: string;
}): string {
  const fromFocus = normalizeFocusKeywordPhrase(row.focusKeyword ?? "");
  if (fromFocus) return fromFocus;
  const fromTitle = row.title.trim();
  if (fromTitle) return fromTitle.split(/\s+/).slice(0, 4).join(" ");
  const fromSlug = urlPathTail(row.page).replace(/-/g, " ").trim();
  return fromSlug || "seo";
}

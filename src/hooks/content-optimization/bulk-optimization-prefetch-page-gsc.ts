import { logger } from "@/lib/logger";
import { fetchGSCPagesPerformanceBatch } from "@/lib/wordpress-api/gsc";
import type { GSCPagePerformanceResult } from "@/lib/wordpress-api/types";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { DEATH_STAR_NO_GSC } from "./bulk-optimization-constants";

export type PageGscPrefetchCache = Map<string, GSCPagePerformanceResult>;

export function gscResultFromPagePerformance(
  page: GSCPagePerformanceResult | undefined,
): typeof DEATH_STAR_NO_GSC | {
  success: true;
  queries: GSCPagePerformanceResult["queries"];
  topKeyword: GSCPagePerformanceResult["topKeyword"];
  pageUrl: string;
} {
  if (!page?.success || !Array.isArray(page.queries) || page.queries.length === 0) {
    return DEATH_STAR_NO_GSC;
  }
  return {
    success: true,
    queries: page.queries,
    topKeyword: page.topKeyword ?? null,
    pageUrl: page.pageUrl,
  };
}

function indexPageResults(pages: GSCPagePerformanceResult[]): PageGscPrefetchCache {
  const cache: PageGscPrefetchCache = new Map();
  for (const page of pages) {
    for (const raw of [page.pageUrl, page.matchedUrl]) {
      const key = raw ? normalizePageUrlKey(raw) : "";
      if (key && !cache.has(key)) cache.set(key, page);
    }
  }
  return cache;
}

/**
 * One batch GSC API call for all batch URLs. No per-post re-fetch during optimize.
 */
export async function prefetchBulkPageGscForUrls(
  siteUrl: string,
  urls: string[],
): Promise<PageGscPrefetchCache> {
  const trimmedSite = siteUrl?.trim();
  const uniqueUrls = [...new Set(urls.map((u) => u?.trim()).filter(Boolean))];
  if (!trimmedSite || uniqueUrls.length === 0) return new Map();

  try {
    const res = await fetchGSCPagesPerformanceBatch(trimmedSite, uniqueUrls);
    if (!res.success || !res.pages?.length) return new Map();
    return indexPageResults(res.pages);
  } catch (error) {
    logger.warn("[Bulk Optimization] Page GSC batch prefetch failed:", error);
    return new Map();
  }
}

export function lookupPageGsc(
  cache: PageGscPrefetchCache,
  pageUrl: string,
): GSCPagePerformanceResult | undefined {
  const key = normalizePageUrlKey(pageUrl);
  if (!key) return undefined;
  return cache.get(key);
}

export function applyPageGscToPendingCache(
  urls: string[],
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>,
  pageGscCache: PageGscPrefetchCache,
): void {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]?.trim();
    if (!url) continue;
    const page = lookupPageGsc(pageGscCache, url);
    const entry = prefetchedPendingCache.get(i);
    if (!entry?.pending) continue;
    entry.pending.gscResult = gscResultFromPagePerformance(page);
  }
}

export function pageGscQueryStringsFromPending(pending: Record<string, unknown> | undefined): string[] {
  const gscResult = pending?.gscResult as { queries?: Array<{ query?: string }> } | undefined;
  if (!Array.isArray(gscResult?.queries)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of gscResult.queries) {
    const q = row?.query?.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push(q);
  }
  return out;
}

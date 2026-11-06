import type { WordPressSite } from "@/components/integrations/types";
import { fetchGSCPagesPerformanceBatch } from "@/lib/wordpress-api/gsc";
import { parseSitemap } from "@/lib/wordpress-api/connection";
import { logger } from "@/lib/logger";

const DEFAULT_GSC_URL_SAMPLE = 40;
const DEFAULT_KEYWORD_LIMIT = 24;

/**
 * Top GSC queries for entity sitemap URLs (non-blocking; returns [] on failure).
 */
export async function fetchGscKeywordPoolForEntitySitemap(
  site: WordPressSite,
  sitemapUrl: string,
  limits?: { urlSample?: number; keywordLimit?: number },
): Promise<string[]> {
  const siteUrl = site.siteUrl?.trim();
  const mapUrl = sitemapUrl?.trim();
  if (!siteUrl || !mapUrl) return [];

  try {
    const parsed = await parseSitemap(siteUrl, mapUrl, site.username, site.appPassword);
    const sample = parsed.urls.slice(0, limits?.urlSample ?? DEFAULT_GSC_URL_SAMPLE);
    if (sample.length === 0) return [];

    const batch = await fetchGSCPagesPerformanceBatch(siteUrl, sample);
    if (!batch.success || !batch.pages?.length) return [];

    const limit = limits?.keywordLimit ?? DEFAULT_KEYWORD_LIMIT;
    const ranked: Array<{ query: string; clicks: number }> = [];
    const seen = new Set<string>();

    for (const page of batch.pages) {
      for (const q of page.queries ?? []) {
        const query = q.query?.trim();
        if (!query) continue;
        const key = query.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ranked.push({ query, clicks: q.clicks ?? 0 });
      }
    }

    ranked.sort((a, b) => b.clicks - a.clicks);
    return ranked.slice(0, limit).map((r) => r.query);
  } catch (error) {
    logger.warn("[Entity Generation] GSC keyword fetch failed:", error);
    return [];
  }
}

/** Append GSC queries to a base keyword (deduped, comma-separated). */
export function mergeEntityKeywordWithGsc(baseKeyword: string | undefined, gscKeywords: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of [baseKeyword?.trim(), ...gscKeywords.map((k) => k.trim())]) {
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(raw);
  }
  return parts.join(", ");
}

/** Pick GSC queries that mention the entity name, then fill from the pool. */
export function gscKeywordsForEntity(entity: string, pool: string[], max = 3): string[] {
  const name = entity.trim().toLowerCase();
  if (!name || pool.length === 0) return [];
  const matched = pool.filter((q) => q.toLowerCase().includes(name));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of [...matched, ...pool]) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

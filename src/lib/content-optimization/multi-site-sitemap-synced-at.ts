import type { WordPressSite } from "@/components/integrations/types";
import type { MultiSiteUrlSource } from "@/lib/content-optimization/multi-site-source-urls";

function msToIso(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms).toISOString();
}

function maxIso(...candidates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const iso of candidates) {
    if (!iso?.trim()) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = iso.trim();
    }
  }
  return best;
}

/** Post sitemap detect/scrape timestamps from Integrations site data. */
export function resolvePostSitemapSyncedAtIso(
  site: WordPressSite,
  postSitemapUrl: string | null,
): string | undefined {
  const detected = msToIso(site.sitemaps?.detectedAt);
  const childUrl = postSitemapUrl?.trim();
  const scraped = childUrl
    ? msToIso(site.sitemaps?.postMetadata?.[childUrl]?.lastChecked)
    : undefined;
  return maxIso(detected, scraped);
}

/** Entity sitemap uses property detect time once an entity URL is saved. */
export function resolveEntitySitemapSyncedAtIso(site: WordPressSite): string | undefined {
  if (!site.entitySitemapUrl?.trim()) return undefined;
  return msToIso(site.sitemaps?.detectedAt);
}

export function resolveSitemapSyncedAtIsoForMode(
  site: WordPressSite,
  source: MultiSiteUrlSource,
  postSitemapUrl: string | null,
): string | undefined {
  const post = resolvePostSitemapSyncedAtIso(site, postSitemapUrl);
  const entity = resolveEntitySitemapSyncedAtIso(site);
  if (source === "post") return post;
  if (source === "entity") return entity;
  return maxIso(post, entity);
}

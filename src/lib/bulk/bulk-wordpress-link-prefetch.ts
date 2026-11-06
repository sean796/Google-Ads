import type { WordPressSite } from '@/components/integrations/types';
import type { WordPressPostingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import {
  ensureBulkGenerationWpInventory,
  keepBlogPlayLinkTargets,
} from '@/lib/bulk/bulk-generation-wp-inventory';
import { getValidatedPosts } from '@/lib/cached-link-validation';
import { clearValidationCache } from '@/lib/cached-link-validation';
import { createSiteCache, seedSiteCacheFromBulkInventory } from '@/lib/wordpress-site-cache';
import { normalizeInternalUrl } from '@/lib/wordpress-api/validate-internal-links';
import { resolveUploadSitemapType } from '@/lib/bulk/bulk-sitemap-mode';
import { logger } from "@/lib/logger";

/** Validated link URLs per site (run-scoped). Filled on first upload to each site; cleared when run ends. */
const preValidatedUrlsBySite = new Map<string, Set<string>>();

export function getBulkPreValidatedUrlsForSite(siteId: string): Set<string> | undefined {
  return preValidatedUrlsBySite.get(siteId);
}

/**
 * Resolves posting config to the same site list used for WordPress upload.
 */
export function buildSitesToPostFromPosting(
  posting: WordPressPostingOptions | undefined,
  rowEntity?: string | null,
): Array<{ site: WordPressSite; sitemapType: 'post' | 'entity' }> {
  if (!posting?.enabled) return [];
  const mapType = (sitemapType: 'post' | 'entity') => resolveUploadSitemapType(sitemapType, rowEntity);
  if (posting.sites && posting.sites.length > 0) {
    return posting.sites.map((s) => ({
      site: s.site,
      sitemapType: mapType(s.sitemapType),
    }));
  }
  if (posting.site) {
    return [{ site: posting.site, sitemapType: mapType(posting.sitemapType) }];
  }
  return [];
}

/**
 * Prefetch HTTP-200 link validation for all distinct posting sites in parallel (Promise.all).
 * Run without awaiting at bulk start so it overlaps keyword research / checklist / content.
 */
export function prefetchBulkWordPressLinkValidationForRun(
  sitesToPost: Array<{ site: WordPressSite; sitemapType: 'post' | 'entity' }>,
  onProgress?: (message: string) => void,
): Promise<void> {
  const seen = new Set<string>();
  const uniqueSites = sitesToPost
    .map((x) => x.site)
    .filter((site) => {
      if (!site.id || seen.has(site.id)) return false;
      seen.add(site.id);
      return true;
    });
  if (uniqueSites.length === 0) return Promise.resolve();

  clearBulkUploadValidationCache(uniqueSites.map((s) => s.id));

  return Promise.all(
    uniqueSites.map(async (site) => {
      if (!site.username || !site.appPassword) return;
      try {
        onProgress?.(`Validating internal links for ${site.name} (background)...`);
        const inv = await ensureBulkGenerationWpInventory(site, onProgress);
        const cache =
          (inv.rows?.length ?? 0) > 0
            ? seedSiteCacheFromBulkInventory(site, inv.rows ?? [])
            : await createSiteCache(site, undefined, (msg) => onProgress?.(msg));
        const validatedPosts = await getValidatedPosts(
          site.id,
          site.siteUrl,
          keepBlogPlayLinkTargets(cache.posts),
          (msg) => onProgress?.(msg),
        );
        const set = new Set(
          validatedPosts.map((p) => normalizeInternalUrl(site.siteUrl, p.link)).filter(Boolean),
        );
        preValidatedUrlsBySite.set(site.id, set);
      } catch (err) {
        logger.warn('[Bulk Upload] Link validation prefetch failed for site:', site.name, err);
      }
    }),
  ).then(() => undefined);
}

/** Clears run-scoped link validation cache for the given sites. Call after bulk upload phase ends. */
export function clearBulkUploadValidationCache(siteIds: string[]): void {
  for (const id of siteIds) {
    preValidatedUrlsBySite.delete(id);
    clearValidationCache(id);
  }
}

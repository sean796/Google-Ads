/**
 * WordPress Site Content Cache
 * In-memory cache for site content (URLs, titles, metas) to avoid repeated API calls
 * Cache is created per-site at optimization start and cleared when done
 */


export type { CachedPost, SiteContentCache, SiteDigest } from './wordpress-site-cache-types';
export type { LinkableSiteCachePost } from './wordpress-site-cache-store';
export {
  clearAllCaches,
  clearSiteCache,
  filterSiteCache,
  getCacheStats,
  getSiteCache,
  searchSiteCache,
  seedSiteCacheFromBulkInventory,
  seedSiteCacheFromLinkablePosts,
  setSiteCacheForTest,
} from './wordpress-site-cache-store';
export { createSiteCache } from './wordpress-site-cache-create';

/**
 * WordPress API Wrapper
 * Frontend helpers for WordPress integration. All routes use this app's /api.
 */

import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

// Re-export all types
export * from './wordpress-api/types';

// Re-export connection and sitemap functions
export {
  BACKEND_API_BASE,
  testWordPressConnection,
  detectSitemaps,
  parseSitemap
} from './wordpress-api/connection';

// Re-export post retrieval functions
export {
  getScheduledPosts,
  getPublishedPosts,
  getSitePostInventory,
  getSitePageInventory,
  getSiteInventoryBulk,
  getPublishedServiceAreas,
  getPublishedPages,
  resolveWordPressUrls,
  getWordPressPostContent,
} from './wordpress-api/posts';
export type { SiteInventoryCollection } from './wordpress-api/posts';

// Re-export CRUD functions
export {
  createWordPressPost,
  updateWordPressPost,
  deleteWordPressPost,
  trashWordPressPost,
} from './wordpress-api/crud';

// Re-export media functions
export {
  uploadWordPressMedia
} from './wordpress-api/media';

// Re-export meta functions
export {
  getWordPressPostMeta,
  updateWordPressPostMeta,
  bulkUpdateOverviewSeo,
  updateOverviewSeoItem,
  type OverviewBulkSeoApiItem,
  type BulkOverviewSeoResponse,
  type BulkOverviewSeoResultRow,
} from './wordpress-api/meta';

export {
  changeWordPressPostUrl,
  type ChangeWordPressPostUrlResult,
} from './wordpress-api/change-post-url';

// Simple helper to call the backend ACF multi-field updater from the frontend.
export async function updateWordPressAcfFields(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string,
  postTypeEndpoint: string | undefined,
  fields: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const { BACKEND_API_BASE } = await import('./wordpress-api/connection');
  const url = `${BACKEND_API_BASE}/api/wordpress/update-acf-fields`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        postType,
        postTypeEndpoint,
        fields,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || response.statusText || 'ACF update failed' };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error && e.message ? e.message : String(e) };
  }
}

// Re-export GSC functions
export {
  fetchGSCPagePerformance,
  fetchGSCPagesPerformanceBatch,
  fetchGSCSitePagesPerformance,
  indexSitemapUrls,
} from './wordpress-api/gsc';

// Re-export utility functions
export {
  generateEntities,
  checkFuturePosts
} from './wordpress-api/utils';

// Re-export link validation (200 only; only use links from WordPress API)
export {
  filterPostsToValidatedLinksOnly,
  validateContentLinksBeforeUpload,
  validateAndStripInvalidLinksFromContent,
} from './wordpress-api/validate-internal-links';

// Re-export author resolver (agentic author selection for new posts)
export {
  resolveRecommendedAuthor,
  resolveRecommendedAuthorWithDetails,
  getAuthorUsage,
  type AuthorWithUsage,
  type GetAuthorUsageResult,
  type ResolveRecommendedAuthorOptions,
  type ResolvedAuthorForDisplay
} from './wordpress-api/author-resolver';

// NEO Pulse WP tools + unified fields client (ACF / NEO Pulse Fields)
export {
  executeNeoPulseWpTool,
  listNeoPulseWpTools,
  getNeoPulseSiteIndex,
  searchNeoPulseSiteIndex,
  getNeoPulseFields,
  resolveNeoPulseUrl,
  getNeoPulsePostContent,
  siteHasNeoPulseWp,
  NEO_PULSE_WP_TOOL_CATALOG,
} from './wordpress-api/neo-pulse-wp-tools';

export {
  discoverFieldGroups,
  getFieldsForPost,
  getFieldsForPostsBatch,
  getFieldsForUrlsBatch,
  getSiteMirrorIndex,
  clearSiteMirrorIndexCache,
  resolvePostUrlViaMirror,
  mergeMirrorIndexIntoInventoryKeyword,
  restAcfFromFullPost,
  siteUsesNeoPulseFieldsBackend,
  siteSupportsSeoExtraTextAcf,
} from './wordpress-api/fields-client';

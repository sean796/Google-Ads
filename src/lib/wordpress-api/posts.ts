/**
 * WordPress API Posts Module
 * Functions for retrieving WordPress posts
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type {
  ScheduledPostsResult,
  PublishedPostsResult,
  ResolveUrlsResult,
  PostContentResult,
  SitePostInventoryResponse,
  SiteInventoryBulkResponse,
} from './types';

/**
 * Get scheduled posts from WordPress REST API
 * 
 * This function retrieves scheduled posts by making an authenticated request to the
 * WordPress REST API. The API endpoint explicitly requests posts with status='future'
 * since the default WordPress REST API only returns published posts.
 * 
 * Authentication:
 * - Requires WordPress Application Password (not regular password)
 * - Generate Application Passwords in WordPress: Users → Profile → Application Passwords
 * 
 * @param siteUrl - WordPress site URL (e.g., 'example.com' or 'https://example.com')
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password (not regular password)
 * @param month - Optional: Target month (0-11). If omitted, defaults to current month unless allScheduled is true
 * @param year - Optional: Target year. If omitted, defaults to current year unless allScheduled is true
 * @param allScheduled - Optional: If true, returns all scheduled posts without month/year filtering
 * 
 * @returns Promise resolving to ScheduledPostsResult with count, posts array, and metadata
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 * 
 * @example
 * // Get scheduled posts for current month
 * const result = await getScheduledPosts('example.com', 'admin', 'xxxx xxxx xxxx xxxx');
 * 
 * @example
 * // Get scheduled posts for specific month
 * const result = await getScheduledPosts('example.com', 'admin', 'xxxx xxxx xxxx xxxx', 11, 2024);
 * 
 * @example
 * // Get all scheduled posts (no date filtering)
 * const result = await getScheduledPosts('example.com', 'admin', 'xxxx xxxx xxxx xxxx', undefined, undefined, true);
 */
export async function getScheduledPosts(
  siteUrl: string,
  username: string,
  appPassword: string,
  month?: number,
  year?: number,
  allScheduled?: boolean
): Promise<ScheduledPostsResult> {
  const url = backendApiUrl('/wordpress/get-scheduled-posts');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        month,
        year,
        allScheduled,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Get published posts from WordPress REST API
 * Returns lightweight metadata (titles + meta only) for token optimization
 * 
 * @param siteUrl - WordPress site URL (e.g., 'example.com' or 'https://example.com')
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password (not regular password)
 * @param limit - Optional: Maximum number of posts to return (default: 100)
 * @param offset - Optional: Offset for pagination (default: 0)
 * 
 * @returns Promise resolving to PublishedPostsResult with count and posts array
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
async function getPublishedPostsFromBackend(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit: number = 100,
  offset: number = 0,
): Promise<PublishedPostsResult> {
  const url = backendApiUrl('/wordpress/get-published-posts');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        limit,
        offset,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    return (await response.json()) as PublishedPostsResult;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }

    throw error;
  }
}

export async function getPublishedPosts(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit: number = 100,
  offset: number = 0,
): Promise<PublishedPostsResult> {
  return getPublishedPostsFromBackend(
    siteUrl,
    username,
    appPassword,
    limit,
    offset,
  );
}

/**
 * Full published-post inventory for bulk prompt generator (url + ACF fields per post).
 * Server paginates until all posts are collected.
 */
/** `posts` / `pages` or any custom wp/v2 REST collection segment (e.g. `service-area`). */
export type SiteInventoryCollection = 'posts' | 'pages' | (string & {});

async function fetchSiteInventory(
  siteUrl: string,
  username: string,
  appPassword: string,
  options?: {
    includeContent?: boolean;
    /** When true, append scheduled (future) posts in the same request (posts collection only). */
    includeScheduled?: boolean;
    collection?: SiteInventoryCollection;
  },
): Promise<SitePostInventoryResponse> {
  const url = backendApiUrl('/wordpress/get-site-post-inventory');
  const collection = options?.collection === 'pages' ? 'pages' : 'posts';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        includeContent: Boolean(options?.includeContent),
        includeScheduled: Boolean(options?.includeScheduled),
        collection,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    return (await response.json()) as SitePostInventoryResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

/**
 * Full published-post inventory via paginated wp/v2/posts.
 */
export async function getSitePostInventory(
  siteUrl: string,
  username: string,
  appPassword: string,
  options?: {
    includeContent?: boolean;
    includeScheduled?: boolean;
  },
): Promise<SitePostInventoryResponse> {
  return fetchSiteInventory(siteUrl, username, appPassword, {
    ...options,
    collection: 'posts',
  });
}

/**
 * Published page inventory via paginated wp/v2/pages (same row shape as posts).
 */
export async function getSitePageInventory(
  siteUrl: string,
  username: string,
  appPassword: string,
  options?: { includeContent?: boolean },
): Promise<SitePostInventoryResponse> {
  return fetchSiteInventory(siteUrl, username, appPassword, {
    ...options,
    collection: 'pages',
  });
}

/**
 * Single POST from the app: posts and/or pages inventory (server paginates WordPress per collection).
 */
export async function getSiteInventoryBulk(
  siteUrl: string,
  username: string,
  appPassword: string,
  options?: {
    includeContent?: boolean;
    /** Fetch post body only to extract first H1 (fields.pageHeading); does not store full content. */
    includePageHeading?: boolean;
    /** When true, merge scheduled (future) posts for the posts collection (server-side). */
    includeScheduled?: boolean;
    collections?: SiteInventoryCollection[];
    /** Benchmark curate: probe post total and cap only large sites (`full` vs `large` in response). */
    inventorySizing?: "auto";
    maxRowsPerCollection?: number;
    /** When set, fetch only these WP post IDs (one request per collection; no full walk). */
    includeIds?: number[];
  },
): Promise<SiteInventoryBulkResponse> {
  const url = backendApiUrl("/wordpress/get-site-inventory-bulk");
  const includeIds = (options?.includeIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        includeContent: Boolean(options?.includeContent),
        includePageHeading: Boolean(options?.includePageHeading),
        includeScheduled: Boolean(options?.includeScheduled),
        inventorySizing: options?.inventorySizing,
        maxRowsPerCollection: options?.maxRowsPerCollection,
        ...(includeIds.length ? { includeIds } : {}),
        collections:
          options?.collections?.length && options.collections.length
            ? options.collections
            : ['posts', 'pages'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    return (await response.json()) as SiteInventoryBulkResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

/**
 * Get published service areas from WordPress REST API
 * Returns lightweight metadata (titles + meta only) for token optimization
 * 
 * @param siteUrl - WordPress site URL (e.g., 'example.com' or 'https://example.com')
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password (not regular password)
 * @param limit - Optional: Maximum number of service areas to return (default: 100)
 * @param offset - Optional: Offset for pagination (default: 0)
 * 
 * @returns Promise resolving to PublishedPostsResult with count and posts array
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function getPublishedServiceAreas(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit: number = 100,
  offset: number = 0
): Promise<PublishedPostsResult> {
  const url = backendApiUrl('/wordpress/get-published-service-areas');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        limit,
        offset,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Get published pages from WordPress REST API
 * Returns lightweight metadata (titles + meta only) for token optimization
 * 
 * @param siteUrl - WordPress site URL (e.g., 'example.com' or 'https://example.com')
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password (not regular password)
 * @param limit - Optional: Maximum number of pages to return (default: 100)
 * @param offset - Optional: Offset for pagination (default: 0)
 * 
 * @returns Promise resolving to PublishedPostsResult with count and posts array
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
async function getPublishedPagesFromBackend(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit: number = 100,
  offset: number = 0,
): Promise<PublishedPostsResult> {
  const url = backendApiUrl('/wordpress/get-posts-list');

  try {
    const page = Math.floor(offset / 100) + 1;
    const perPage = Math.min(limit, 100);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postType: 'page',
        postTypeEndpoint: 'pages',
        perPage,
        page,
        status: 'publish',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      count: data.posts?.length || 0,
      posts: data.posts || [],
      total: data.total || 0,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }

    throw error;
  }
}

export async function getPublishedPages(
  siteUrl: string,
  username: string,
  appPassword: string,
  limit: number = 100,
  offset: number = 0,
): Promise<PublishedPostsResult> {
  return getPublishedPagesFromBackend(
    siteUrl,
    username,
    appPassword,
    limit,
    offset,
  );
}

/**
 * Resolve WordPress URLs to REST API objects using WordPress Search API
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param urls - Array of URLs to resolve
 * @param entitySitemapUrl - Optional entity sitemap URL
 * @param knownEndpoint - Known endpoint from URL pattern or post data
 * 
 * @returns Promise resolving to ResolveUrlsResult with resolved and unresolvable URLs
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function resolveWordPressUrls(
  siteUrl: string,
  username: string,
  appPassword: string,
  urls: string[],
  entitySitemapUrl?: string,
  knownEndpoint?: string  // Known endpoint from URL pattern or post data
): Promise<ResolveUrlsResult> {
  const url = backendApiUrl('/wordpress/resolve-urls');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        urls,
        entitySitemapUrl,
        knownEndpoint,  // Pass known endpoint
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Get full post content from WordPress REST API by IDs, slugs, or resolved objects
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postIds - Optional: Array of post IDs (legacy)
 * @param postSlugs - Optional: Array of post slugs (legacy)
 * @param resolvedObjects - Optional: Array of {id, subtype} objects from URL resolution
 * @param opts - Optional: entity sitemap URL and/or REST hints so slug/CPT resolution works when /types times out
 * 
 * @returns Promise resolving to PostContentResult with full post content
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function getWordPressPostContent(
  siteUrl: string,
  username: string,
  appPassword: string,
  postIds?: number[],
  postSlugs?: string[],
  resolvedObjects?: Array<{ id: number; subtype: string }>,
  opts?: { entitySitemapUrl?: string; restEndpointHints?: string[] }
): Promise<PostContentResult> {
  const url = backendApiUrl('/wordpress/get-post-content');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postIds: postIds || [],
        postSlugs: postSlugs || [],
        resolvedObjects: resolvedObjects || [],
        entitySitemapUrl: opts?.entitySitemapUrl,
        restEndpointHints: opts?.restEndpointHints?.length ? opts.restEndpointHints : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}


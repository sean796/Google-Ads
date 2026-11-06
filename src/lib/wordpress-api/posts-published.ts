/**
 * WordPress API Posts Module
 * Functions for retrieving WordPress posts
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { PublishedPostsResult, ScheduledPostsResult } from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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

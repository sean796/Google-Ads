/**
 * WordPress API CRUD Module
 * Functions for creating, updating, and deleting WordPress posts
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type {
  WordPressPostCreateResult,
  WordPressPostUpdateResult,
  WordPressPostDeleteResult
} from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/**
 * Create WordPress post
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param title - Post title
 * @param content - Post content (HTML)
 * @param excerpt - Optional post excerpt
 * @param status - Post status: 'draft', 'publish', or 'future' (default: 'draft')
 * @param date_gmt - Optional scheduled date in ISO 8601 format (UTC)
 * @param featuredImageId - Optional featured image media ID
 * @param categories - Optional array of category IDs
 * @param tags - Optional array of tag IDs
 * @param postType - Optional post type ('post' or 'service-area') - internal type for function signature
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name (e.g., 'posts', 'service-areas') - use exact endpoint from scraped post
 * @param slug - Optional post slug
 * @param author - Optional author ID (number) or author object with id property (preserves original author when updating existing posts)
 * 
 * @returns Promise resolving to WordPressPostCreateResult with post ID and link
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function createWordPressPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  title: string,
  content: string,
  excerpt?: string,
  status: 'draft' | 'publish' | 'future' = 'draft',
  date_gmt?: string,
  featuredImageId?: number,
  categories?: number[],
  tags?: number[],
  postType?: 'post' | 'service-area',
  postTypeEndpoint?: string, // Actual WordPress REST API endpoint name from scraped post
  slug?: string,
  author?: number | { id: number }
): Promise<WordPressPostCreateResult> {
  const url = backendApiUrl('/wordpress/create-post');
try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        title,
        content,
        excerpt,
        status,
        date_gmt,
        featuredImageId,
        categories,
        tags,
        postType,
        postTypeEndpoint,
        slug,
        author,
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
 * Update WordPress post
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to update
 * @param title - Post title
 * @param content - Post content (HTML)
 * @param excerpt - Optional post excerpt
 * @param status - Post status: 'draft' or 'publish'
 * @param postType - Post type (default: 'post') - internal type for function signature
 * @param featuredImageId - Optional featured image media ID
 * @param categories - Optional array of category IDs
 * @param tags - Optional array of tag IDs
 * @param slug - Optional post slug (preserve original slug to prevent URL changes)
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name (e.g., 'posts', 'service-areas') - use exact endpoint from scraped post
 * 
 * @returns Promise resolving to WordPressPostUpdateResult with post ID and link
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function updateWordPressPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  title: string,
  content: string,
  excerpt?: string,
  status?: string,
  postType: string = 'post',
  featuredImageId?: number,
  categories?: number[],
  tags?: number[],
  slug?: string, // Preserve original slug to prevent URL changes
  postTypeEndpoint?: string // Actual WordPress REST API endpoint name from scraped post
): Promise<WordPressPostUpdateResult> {
  const url = backendApiUrl('/wordpress/update-post');
  
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        title,
        content,
        excerpt,
        status,
        postType,
        featuredImageId,
        categories,
        tags,
        slug,
        postTypeEndpoint, // Pass the exact endpoint from scraped post
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
 * Delete WordPress post
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to delete
 * @param postType - Post type (default: 'post') - internal type for function signature
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name (e.g., 'posts', 'service-areas') - use exact endpoint from scraped post
 * 
 * @returns Promise resolving to WordPressPostDeleteResult with deletion status
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export type DeleteWordPressPostOptions = {
  /** When true, permanently delete. Default false moves post to trash. */
  force?: boolean;
};

export async function deleteWordPressPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = "post",
  postTypeEndpoint?: string,
  options?: DeleteWordPressPostOptions,
): Promise<WordPressPostDeleteResult> {
  const url = backendApiUrl('/wordpress/delete-post');
  
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        postType,
        postTypeEndpoint,
        force: options?.force === true,
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

/** Move a post to the WordPress trash (not permanent delete). */
export async function trashWordPressPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = "post",
  postTypeEndpoint?: string,
): Promise<WordPressPostDeleteResult> {
  return deleteWordPressPost(siteUrl, username, appPassword, postId, postType, postTypeEndpoint, {
    force: false,
  });
}


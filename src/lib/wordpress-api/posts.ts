/**
 * WordPress API Posts Module
 * Functions for retrieving WordPress posts
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { PostContentResult, ResolveUrlsResult } from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export { getPublishedPages, getPublishedPosts, getPublishedServiceAreas, getScheduledPosts } from './posts-published';
export { getSiteInventoryBulk, getSitePageInventory, getSitePostInventory, type SiteInventoryCollection } from './posts-inventory';


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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
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


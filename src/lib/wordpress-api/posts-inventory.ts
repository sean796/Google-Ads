/**
 * WordPress API Posts Module
 * Functions for retrieving WordPress posts
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { SiteInventoryBulkResponse, SitePostInventoryResponse } from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

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
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
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
    /** When true, include the raw ACF object on each row (context=edit). */
    includeRawPostFields?: boolean;
  },
): Promise<SiteInventoryBulkResponse> {
  const url = backendApiUrl("/wordpress/get-site-inventory-bulk");
  const includeIds = (options?.includeIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        includeContent: Boolean(options?.includeContent),
        includePageHeading: Boolean(options?.includePageHeading),
        includeScheduled: Boolean(options?.includeScheduled),
        includeRawPostFields: Boolean(options?.includeRawPostFields),
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

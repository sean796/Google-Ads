/**
 * WordPress API Meta Module
 * Functions for getting and updating WordPress post meta fields
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { OverviewBulkSeoApiItem } from '@/lib/overview/overview-bulk-seo-payload';
import type {
  WordPressPostMetaResult,
  WordPressPostMetaUpdateResult
} from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type { OverviewBulkSeoApiItem };

export type BulkOverviewSeoResultRow = {
  postId: number | null;
  index?: number;
  ok: boolean;
  error?: string;
  method?: string;
  mergeError?: string;
  httpStatus?: number | null;
  /** Canonical permalink returned by WordPress after a content PUT. */
  link?: string;
};

export type BulkOverviewSeoResponse = {
  success: boolean;
  results: BulkOverviewSeoResultRow[];
  okCount: number;
  total: number;
  error?: string;
};

/** Max items per client bulk-update-overview-seo request (WordPress batch/v1). */
export const BULK_OVERVIEW_SEO_MAX_ITEMS = 25;

export function parseBulkOverviewSeoResponseText(text: string): BulkOverviewSeoResponse {
  const chunks = text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!chunks.length) {
    throw new Error("WordPress upload returned an empty body.");
  }
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const obj = JSON.parse(chunks[i]!) as BulkOverviewSeoResponse;
    if (Array.isArray(obj.results)) {
      return {
        success: Boolean(obj.success),
        results: obj.results,
        okCount: obj.okCount ?? obj.results.filter((row) => row.ok).length,
        total: obj.total ?? obj.results.length,
        error: obj.error,
      };
    }
  }
  throw new Error("WordPress upload returned JSON without results.");
}

/**
 * Get WordPress post with all meta fields
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to fetch
 * @param postType - Post type (default: 'post') - internal type for function signature
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name (e.g., 'posts', 'service-areas') - use exact endpoint from scraped post
 * 
 * @returns Promise resolving to WordPressPostMetaResult with all meta fields
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function getWordPressPostMeta(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string // Actual WordPress REST API endpoint name from scraped post
): Promise<WordPressPostMetaResult> {
  const url = backendApiUrl('/wordpress/get-post-meta');
  
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
 * Update WordPress post meta fields
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID to update
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional actual WordPress REST API endpoint name from scraped post
 * @param meta - Object containing meta fields to update
 * 
 * @returns Promise resolving to WordPressPostMetaUpdateResult with update status
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function updateWordPressPostMeta(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint: string | undefined, // Actual WordPress REST API endpoint name from scraped post
  meta: Record<string, unknown>
): Promise<WordPressPostMetaUpdateResult> {
  const url = backendApiUrl('/wordpress/update-post-meta');
  
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
        postTypeEndpoint, // Pass the exact endpoint from scraped post
        meta,
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

export async function updateOverviewSeoItem(
  siteUrl: string,
  username: string,
  appPassword: string,
  item: OverviewBulkSeoApiItem,
): Promise<BulkOverviewSeoResultRow> {
  const url = backendApiUrl('/wordpress/update-overview-seo-item');

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        item,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as BulkOverviewSeoResultRow & {
      error?: string;
    };

    if (!response.ok) {
      return {
        postId: item.postId,
        ok: false,
        error: data.error || `HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }

    return {
      postId: data.postId ?? item.postId,
      ok: Boolean(data.ok),
      error: data.error,
      method: data.method,
      mergeError: data.mergeError,
      httpStatus: data.httpStatus ?? null,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

export async function bulkUpdateOverviewSeo(
  siteUrl: string,
  username: string,
  appPassword: string,
  items: OverviewBulkSeoApiItem[],
): Promise<BulkOverviewSeoResponse> {
  if (items.length > BULK_OVERVIEW_SEO_MAX_ITEMS) {
    throw new Error(
      `bulkUpdateOverviewSeo accepts at most ${BULK_OVERVIEW_SEO_MAX_ITEMS} items per call (got ${items.length}). Chunk uploads before calling.`,
    );
  }

  const url = backendApiUrl('/wordpress/bulk-update-overview-seo');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        items,
      }),
    });

    const text = await response.text();
    return parseBulkOverviewSeoResponseText(text);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

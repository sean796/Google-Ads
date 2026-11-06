/**
 * WordPress API Google Search Console Module
 * Functions for Google Search Console operations
 */

import { BACKEND_API_BASE, BACKEND_CONNECTION_ERROR } from './connection';
import type {
  GSCPagePerformanceResult,
  GSCPagesPerformanceBatchResult,
  GSCSitePagesPerformanceResult,
  SitemapIndexingResult,
  IndexingProgress,
} from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type { GSCPagePerformanceResult } from "./types";

/** Append Search Console diagnostic fields from JSON error bodies (matches server gscPropertyErrorPayload). */
export function formatGscResolutionError(
  body: {
    error?: string;
    message?: string;
    detail?: string;
    requestedDomain?: string;
    accessiblePropertyCount?: number;
    accessiblePropertiesPreview?: string[];
    credentialsInUse?: string;
    serviceAccountEmail?: string;
    hint?: string;
  },
  httpStatus: number
): string {
  let message = body.error || body.message || `HTTP ${httpStatus}`;
  if (body.detail) message += `\n\n${body.detail}`;
  if (body.requestedDomain) {
    message += `\n\nRequested hostname from NEO Pulse: ${body.requestedDomain}`;
  }
  if (
    typeof body.accessiblePropertyCount === 'number' &&
    Array.isArray(body.accessiblePropertiesPreview) &&
    body.accessiblePropertiesPreview.length > 0
  ) {
    message += `\n\nGoogle sites.list returned ${body.accessiblePropertyCount} properties for this API identity (your site hostname must appear here once shared correctly):`;
    message += `\n${body.accessiblePropertiesPreview.slice(0, 30).join('\n')}`;
    if ((body.accessiblePropertyCount ?? 0) > 30 || body.accessiblePropertiesPreview.length > 30) {
      message += '\n…';
    }
  }
  const idLine = body.credentialsInUse || body.serviceAccountEmail;
  if (idLine) {
    message += `\n\nAdd this service account in Search Console (must match exactly): ${idLine}`;
  }
  if (body.hint) message += `\n\n${body.hint}`;
  return message;
}

/**
 * Fetch GSC Page Performance for a specific URL
 * 
 * @param siteUrl - Site URL to query GSC for
 * @param pageUrl - Specific page URL to get performance data for
 * @param startDate - Start date in YYYY-MM-DD format (optional; server defaults to last 28 days, GSC-style)
 * @param endDate - End date in YYYY-MM-DD format (optional; server defaults to last 28 days, GSC-style)
 * 
 * @returns Promise resolving to GSCPagePerformanceResult with queries and top keyword
 * 
 * @throws Error if backend server is not running or API call fails
 */
/**
 * Fetch GSC page×query performance for many URLs in one request (parallel on server).
 */
export async function fetchGSCSitePagesPerformance(
  siteUrl: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<GSCSitePagesPerformanceResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/fetch-site-pages-performance`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      signal,
      body: JSON.stringify({ siteUrl, startDate, endDate }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: Parameters<typeof formatGscResolutionError>[0];
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(formatGscResolutionError(errorData, response.status));
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

export async function fetchGSCPagesPerformanceBatch(
  siteUrl: string,
  pageUrls: string[],
  startDate?: string,
  endDate?: string,
  signal?: AbortSignal,
  options?: { strictPageMatch?: boolean },
): Promise<GSCPagesPerformanceBatchResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/fetch-pages-performance`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      signal,
      body: JSON.stringify({
        siteUrl,
        pageUrls,
        startDate,
        endDate,
        strictPageMatch: options?.strictPageMatch === true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: Parameters<typeof formatGscResolutionError>[0];
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(formatGscResolutionError(errorData, response.status));
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}

export async function fetchGSCPagePerformance(
  siteUrl: string,
  pageUrl: string,
  startDate?: string,
  endDate?: string
): Promise<GSCPagePerformanceResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/fetch-page-performance`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        pageUrl,
        startDate,
        endDate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: Parameters<typeof formatGscResolutionError>[0];
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      throw new Error(formatGscResolutionError(errorData, response.status));
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
 * Index all URLs from a sitemap in Google Search Console
 * Checks each URL's indexing status and requests indexing for non-indexed URLs
 * 
 * @param siteUrl - Site URL registered in Google Search Console
 * @param sitemapUrl - Sitemap URL to parse and process
 * @param username - Optional WordPress username if sitemap requires auth
 * @param appPassword - Optional WordPress app password if sitemap requires auth
 * @param onProgress - Optional callback for progress updates
 * 
 * @returns Promise resolving to SitemapIndexingResult with processing statistics
 * 
 * @throws Error if backend server is not running or API call fails
 */
export async function indexSitemapUrls(
  siteUrl: string,
  sitemapUrl: string,
  username?: string,
  appPassword?: string,
  onProgress?: (progress: IndexingProgress) => void
): Promise<SitemapIndexingResult> {
  const url = `${BACKEND_API_BASE}/api/gsc/index-sitemap-urls`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        sitemapUrl,
        username,
        appPassword,
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
    
    // Call progress callback with final results if provided
    if (onProgress && data.success) {
      onProgress({
        processed: data.processed,
        total: data.total,
        indexed: data.indexed,
        requested: data.requested,
        errors: data.errors,
      });
    }
    
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}


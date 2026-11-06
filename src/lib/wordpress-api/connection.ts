/**
 * WordPress API Connection Module
 * Functions for testing connections and managing sitemaps
 */

import { NEO_PULSE_CA_DEPLOY } from '@/lib/neo-pulse-deploy';
import { isViteDev, readViteEnv } from '@/lib/vite-env';
import type {
  WordPressConnectionResult,
  SitemapDetectionResult,
  SitemapParseResult
} from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/** Empty string = same-origin `/api/*` (neodigital.ca WP plugin). */
let postCreatorWorkerApiBase = "";

export function setPostCreatorWorkerApiBase(base: string): void {
  postCreatorWorkerApiBase = base.trim().replace(/\/+$/, "");
}

export function resolveBackendApiBase(): string {
  if (postCreatorWorkerApiBase) return postCreatorWorkerApiBase;
  if (NEO_PULSE_CA_DEPLOY) return '';
  const rawMcp = readViteEnv("VITE_MCP_API_BASE");
  if (rawMcp !== '') {
    return rawMcp.replace(/\/api\/mcp\/?$/, '').replace(/\/+$/, '');
  }
  const fromEnv = readViteEnv("VITE_BACKEND_API_BASE").replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (isViteDev()) return '';
  return '';
}

export const BACKEND_API_BASE = resolveBackendApiBase();

/** Same-origin dev adds trailing slash so requests avoid cached WP 301 keys without `/`. */
export function backendApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const apiPath = p.startsWith("/api/") || p === "/api" ? p : `/api${p}`;
  const base = resolveBackendApiBase().replace(/\/+$/, "");
  const qIndex = apiPath.indexOf("?");
  const pathname = qIndex >= 0 ? apiPath.slice(0, qIndex) : apiPath;
  const search = qIndex >= 0 ? apiPath.slice(qIndex) : "";
  let url = `${base}${pathname}${search}`;
  if (isViteDev() && !search && pathname.startsWith("/api") && !pathname.endsWith("/")) {
    url += "/";
  }
  return url;
}

export const BACKEND_CONNECTION_ERROR = "Can't connect to server";

function logBackendConnectionFailure(location: string, detail: string) {
}

/**
 * Test WordPress connection
 */
export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<WordPressConnectionResult> {
  const url = backendApiUrl("/wordpress/test-connection");
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
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
        errorData = { message: errorText };
      }
      
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      logBackendConnectionFailure("connection.ts:testWordPressConnection", String((error as Error).message));
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Detect WordPress sitemaps
 */
export async function detectSitemaps(
  siteUrl: string,
  username?: string,
  appPassword?: string
): Promise<SitemapDetectionResult> {
  const url = backendApiUrl("/wordpress/detect-sitemaps");
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
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
        errorData = { message: errorText };
      }
      
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      logBackendConnectionFailure("connection.ts:testWordPressConnection", String((error as Error).message));
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Parse sitemap XML content
 */
export async function parseSitemap(
  siteUrl: string,
  sitemapUrl: string,
  username?: string,
  appPassword?: string
): Promise<SitemapParseResult> {
  const url = backendApiUrl("/wordpress/parse-sitemap");
  
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
      
      // Enhanced error message with details if available
      const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
      const enhancedError = new Error(errorMessage) as Error & {
        details?: unknown;
        suggestion?: unknown;
      };

      // Attach additional error details if available
      if (errorData.details) {
        enhancedError.details = errorData.details;
      }
      if (errorData.suggestion) {
        enhancedError.suggestion = errorData.suggestion;
      }
      
      throw enhancedError;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      logBackendConnectionFailure("connection.ts:testWordPressConnection", String((error as Error).message));
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}


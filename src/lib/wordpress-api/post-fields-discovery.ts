/**
 * ACF Field Discovery Utilities
 * Discover ACF field groups and scan fields across WordPress site
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { WordPressSite } from '@/components/integrations/types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type {
  PostFieldsDiscoveryResult,
} from "./post-fields-discovery-types";
export * from "./post-fields-discovery-types";
export * from "./post-fields-discovery-url-batch";
// Lightweight debug logging (to validate ACF keyword_focus presence + timing).
// Keep bounded to avoid log spam.
const __acfDebugLogCount = 0;
const __acfDebugLogMax = 6;
const SEO_EXTRA_TEXT_FIELD_NAMES = new Set(["extra_text", "seo_extra_text"]);

/**
 * Whether discovery reports an ACF field for complementary SEO extra text (`extra_text` / `seo_extra_text`).
 * Returns false on network/discovery failure (safe default for gating UI).
 */
export async function siteSupportsSeoExtraTextField(site: WordPressSite): Promise<boolean> {
  try {
    const result = await discoverPostFieldKeys(site);
    const fromTop = Array.isArray(result.fields) ? result.fields : [];
    const fromGroups =
      Array.isArray(result.fieldGroups) ? result.fieldGroups.flatMap((g) => g.fields || []) : [];
    const seen = new Set<string>();
    for (const f of [...fromTop, ...fromGroups]) {
      const n = typeof f?.name === "string" ? f.name.trim() : "";
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (SEO_EXTRA_TEXT_FIELD_NAMES.has(n)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Field-name map from site field groups (keys only). Used when a new post has empty REST `acf`. */
export function fieldNameMapFromDiscovery(result: PostFieldsDiscoveryResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of result.fields ?? []) {
    const name = typeof field?.name === "string" ? field.name.trim() : "";
    if (name) out[name] = "";
  }
  for (const group of result.fieldGroups ?? []) {
    for (const field of group.fields ?? []) {
      const name = typeof field?.name === "string" ? field.name.trim() : "";
      if (name) out[name] = "";
    }
  }
  return out;
}

/**
 * Prefer values on the post. If the post has no ACF keys yet, use the site's field-group names.
 */
export async function resolvePostFieldsForMapping(
  site: WordPressSite,
  existing: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (existing && Object.keys(existing).length > 0) return existing;
  const discovered = await discoverPostFieldKeys(site);
  return fieldNameMapFromDiscovery(discovered);
}

/**
 * Discover ACF field groups from WordPress site
 */
export async function discoverPostFieldKeys(
  site: WordPressSite,
  postType?: string,
  postTypeEndpoint?: string,
  sampleSize: number = 10
): Promise<PostFieldsDiscoveryResult> {
  const url = backendApiUrl('/wordpress/discover-post-field-keys');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        postType,
        postTypeEndpoint,
        sampleSize,
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
 * Get ACF fields for a specific post.
 * Uses backend POST /api/wordpress/get-post-fields to avoid CORS (no direct browser fetch to WordPress).
 */
export async function getPostFieldsForPost(
  site: WordPressSite,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; fields: Record<string, unknown>; fullPost?: Record<string, unknown>; error?: string }> {
  const url = backendApiUrl('/wordpress/get-post-fields');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        postId,
        postType,
        postTypeEndpoint,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string } = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      return {
        success: false,
        fields: {},
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    
    return {
      success: data.success === true,
      fields: data.fields && typeof data.fields === 'object' ? data.fields : {},
      fullPost: data.fullPost && typeof data.fullPost === 'object' ? data.fullPost : undefined,
      error: data.error || undefined,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        fields: {},
        error: BACKEND_CONNECTION_ERROR,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      fields: {},
      error: message,
    };
  }
}

/** Plain post fields from the same `context=edit` fetch as ACF (see server /get-post-fields-by-url). */

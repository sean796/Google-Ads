/**
 * ACF Field Discovery Utilities
 * Discover ACF field groups and scan fields across WordPress site
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { WordPressSite } from '@/components/integrations/types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

// Lightweight debug logging (to validate ACF keyword_focus presence + timing).
// Keep bounded to avoid log spam.
const __acfDebugLogCount = 0;
const __acfDebugLogMax = 6;

/** One ACF field-group location rule (e.g. `options_page == options`). */
export interface ACFLocationRule {
  param: string;
  operator: string;
  value: string;
}

export interface ACFFieldDefinition {
  name: string;
  label: string;
  type: string;
  groupId?: number;
  groupTitle?: string;
  location?: ACFLocationRule[][];
  sampleValue?: unknown;
  occurrenceCount?: number;
}

export interface ACFFieldGroup {
  id: number;
  title: string;
  fields: ACFFieldDefinition[];
  location: ACFLocationRule[][];
}

export interface ACFDiscoveryResult {
  success: boolean;
  fieldGroups: ACFFieldGroup[];
  fields: ACFFieldDefinition[];
  method: 'acf_rest_api' | 'sample_scan' | 'neo_pulse_fields_export' | null;
  error?: string;
}

/** Field names aligned with server ACF allow-list (`extra_text` / `seo_extra_text`). */
const SEO_EXTRA_TEXT_FIELD_NAMES = new Set(["extra_text", "seo_extra_text"]);

/**
 * Whether discovery reports an ACF field for complementary SEO extra text (`extra_text` / `seo_extra_text`).
 * Returns false on network/discovery failure (safe default for gating UI).
 */
export async function siteSupportsSeoExtraTextAcf(site: WordPressSite): Promise<boolean> {
  try {
    const result = await discoverACFFieldGroups(site);
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
export function acfNameMapFromDiscovery(result: ACFDiscoveryResult): Record<string, string> {
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
export async function resolveAcfFieldsForMapping(
  site: WordPressSite,
  existing: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (existing && Object.keys(existing).length > 0) return existing;
  const discovered = await discoverACFFieldGroups(site);
  return acfNameMapFromDiscovery(discovered);
}

/**
 * Discover ACF field groups from WordPress site
 */
export async function discoverACFFieldGroups(
  site: WordPressSite,
  postType?: string,
  postTypeEndpoint?: string,
  sampleSize: number = 10
): Promise<ACFDiscoveryResult> {
  const url = backendApiUrl('/wordpress/discover-acf-field-groups');
  
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
 * Uses backend POST /api/wordpress/get-acf-fields to avoid CORS (no direct browser fetch to WordPress).
 */
export async function getACFFieldsForPost(
  site: WordPressSite,
  postId: number,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; fields: Record<string, unknown>; fullPost?: Record<string, unknown>; error?: string }> {
  const url = backendApiUrl('/wordpress/get-acf-fields');

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

/** Plain post fields from the same `context=edit` fetch as ACF (see server /get-acf-fields-by-url). */
export interface WpPostSnapshotFromAcfByUrl {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date_gmt: string;
  status: string;
  link: string;
  postTypeEndpoint: string;
  postTypeSubtype: string;
}

function parsePostSnapshot(raw: unknown): WpPostSnapshotFromAcfByUrl | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'number' ? o.id : Number(o.id);
  if (!Number.isFinite(id) || id <= 0) return undefined;
  const postTypeEndpoint = typeof o.postTypeEndpoint === 'string' ? o.postTypeEndpoint : 'posts';
  const postTypeSubtype =
    typeof o.postTypeSubtype === 'string'
      ? o.postTypeSubtype
      : postTypeEndpoint === 'pages'
        ? 'page'
        : postTypeEndpoint === 'posts'
          ? 'post'
          : postTypeEndpoint;
  return {
    id,
    slug: typeof o.slug === 'string' ? o.slug : '',
    title: typeof o.title === 'string' ? o.title : '',
    content: typeof o.content === 'string' ? o.content : '',
    excerpt: typeof o.excerpt === 'string' ? o.excerpt : '',
    date_gmt: typeof o.date_gmt === 'string' ? o.date_gmt : '',
    status: typeof o.status === 'string' ? o.status : 'publish',
    link: typeof o.link === 'string' ? o.link : '',
    postTypeEndpoint,
    postTypeSubtype,
  };
}

/**
 * Get ACF fields for a specific URL by doing a slug lookup only.
 * IMPORTANT: this does NOT call `/resolve-urls`; it is designed for bulk ACF grepping.
 */
export async function getACFFieldsForUrl(
  site: WordPressSite,
  url: string,
  postTypeEndpointHint?: string
): Promise<{
  success: boolean;
  fields: Record<string, unknown>;
  postId: number | null;
  postTypeEndpointUsed: string | null;
  postSnapshot?: WpPostSnapshotFromAcfByUrl;
  error?: string;
}> {
  const endpoint = backendApiUrl('/wordpress/get-acf-fields-by-url');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        url,
        postTypeEndpointHint,
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
        postId: null,
        postTypeEndpointUsed: null,
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const postSnapshot = parsePostSnapshot(data?.postSnapshot);
    return {
      success: data?.success === true,
      fields: data?.fields && typeof data.fields === 'object' ? data.fields : {},
      postId: typeof data?.postId === 'number' ? data.postId : null,
      postTypeEndpointUsed: data?.postTypeEndpointUsed ?? null,
      ...(postSnapshot ? { postSnapshot } : {}),
      error: data?.error || undefined,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        fields: {},
        postId: null,
        postTypeEndpointUsed: null,
        error: BACKEND_CONNECTION_ERROR,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      fields: {},
      postId: null,
      postTypeEndpointUsed: null,
      error: message,
    };
  }
}

export type AcfBatchUrlItem = { url: string; postTypeEndpointHint?: string };

/** One backend request for up to 100 URLs (see server POST /get-acf-fields-by-url-batch). */
export async function getACFFieldsForUrlsBatch(
  site: WordPressSite,
  items: AcfBatchUrlItem[],
  includePostSnapshot: boolean = true,
): Promise<{
  results: Array<{
    url: string;
    success: boolean;
    fields: Record<string, unknown>;
    postId: number | null;
    postTypeEndpointUsed: string | null;
    postSnapshot?: WpPostSnapshotFromAcfByUrl;
    error?: string;
  }>;
  error?: string;
}> {
  const endpoint = backendApiUrl('/wordpress/get-acf-fields-by-url-batch');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        items,
        includePostSnapshot,
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
        results: [],
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const raw = Array.isArray(data?.results) ? data.results : [];
    const results = raw.map((row: Record<string, unknown>) => {
      const url = typeof row.url === 'string' ? row.url : '';
      const postSnapshot = parsePostSnapshot(row?.postSnapshot);
      return {
        url,
        success: row.success === true,
        fields: row.fields && typeof row.fields === 'object' ? (row.fields as Record<string, unknown>) : {},
        postId: typeof row.postId === 'number' ? row.postId : null,
        postTypeEndpointUsed: (row.postTypeEndpointUsed as string | null) ?? null,
        ...(postSnapshot ? { postSnapshot } : {}),
        error: typeof row.error === 'string' ? row.error : undefined,
      };
    });

    return { results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: [],
      error: message,
    };
  }
}

export type AcfBatchPostItem = {
  postId: number;
  postType?: string;
  postTypeEndpoint?: string;
};

/** One backend request for up to 100 posts (see server POST /get-acf-fields-batch). */
export async function getACFFieldsForPostsBatch(
  site: WordPressSite,
  items: AcfBatchPostItem[],
): Promise<{
  results: Array<{
    postId: number;
    success: boolean;
    fields: Record<string, unknown>;
    fullPost?: Record<string, unknown>;
    error?: string;
  }>;
  error?: string;
}> {
  const url = backendApiUrl('/wordpress/get-acf-fields-batch');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        items,
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
        results: [],
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const raw = Array.isArray(data?.results) ? data.results : [];
    const results = raw.map((row: Record<string, unknown>) => {
      const postId = typeof row.postId === 'number' ? row.postId : Number(row.postId);
      return {
        postId: Number.isFinite(postId) ? postId : 0,
        success: row.success === true,
        fields: row.fields && typeof row.fields === 'object' ? (row.fields as Record<string, unknown>) : {},
        fullPost:
          row.fullPost && typeof row.fullPost === 'object'
            ? (row.fullPost as Record<string, unknown>)
            : undefined,
        error: typeof row.error === 'string' ? row.error : undefined,
      };
    });

    return { results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: [],
      error: message,
    };
  }
}

/**
 * Scan ACF fields across multiple posts to find which fields are in use
 */
export async function scanACFFieldsAcrossSite(
  site: WordPressSite,
  postTypes: string[] = ['post', 'page'],
  maxPostsPerType: number = 50
): Promise<{
  success: boolean;
  fields: Record<string, {
    name: string;
    type: string;
    occurrenceCount: number;
    sampleValues: unknown[];
    postTypes: string[];
  }>;
  error?: string;
}> {
  // This will be implemented by scanning posts via the content scanner
  // For now, return empty result
  return {
    success: true,
    fields: {},
  };
}

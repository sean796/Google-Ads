import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { WordPressSite } from '@/components/integrations/types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type {
  AcfBatchPostItem,
  AcfBatchUrlItem,
  WpPostSnapshotFromFieldsByUrl,
} from "./post-fields-discovery-types";
function parsePostSnapshot(raw: unknown): WpPostSnapshotFromFieldsByUrl | undefined {
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
export async function getPostFieldsForUrl(
  site: WordPressSite,
  url: string,
  postTypeEndpointHint?: string
): Promise<{
  success: boolean;
  fields: Record<string, unknown>;
  postId: number | null;
  postTypeEndpointUsed: string | null;
  postSnapshot?: WpPostSnapshotFromFieldsByUrl;
  error?: string;
}> {
  const endpoint = backendApiUrl('/wordpress/get-post-fields-by-url');

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

/** One backend request for up to 100 URLs (see server POST /get-post-fields-by-url-batch). */
export async function getPostFieldsForUrlsBatch(
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
    postSnapshot?: WpPostSnapshotFromFieldsByUrl;
    error?: string;
  }>;
  error?: string;
}> {
  const endpoint = backendApiUrl('/wordpress/get-post-fields-by-url-batch');
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

/** One backend request for up to 100 posts (see server POST /get-post-fields-batch). */
export async function getPostFieldsForPostsBatch(
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
  const url = backendApiUrl('/wordpress/get-post-fields-batch');
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

/**
 * Entity Read Existing Origins via API
 * Fetches every service area via WordPress API and reads the entity/origin ACF field
 * for dedupe. Exclusion uses ACF origin field ONLY - no slug or URL-derived entities.
 */

import { BACKEND_API_BASE } from '@/lib/wordpress-api/connection';
import { logger } from "@/lib/logger";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getACFFieldsForPost } from '@/lib/wordpress-api/acf-discovery';
import type { WordPressSite } from '@/components/integrations/types';

const MAX_SERVICE_AREAS = 500;
const PER_PAGE = 100;

/**
 * Derive REST API endpoint from entity sitemap URL.
 * e.g. "https://site.com/service-areas-sitemap.xml" → "service-areas"
 */
function getEndpointFromEntitySitemapUrl(
  entitySitemapUrl: string,
  site: WordPressSite
): string {
  const fromSite = site.sitemaps?.endpoints?.[entitySitemapUrl];
  if (fromSite && fromSite.trim()) {
    return fromSite.trim();
  }
  const filename = entitySitemapUrl.split('/').pop() || '';
  const endpoint = filename.replace(/-sitemap\.xml$/i, '');
  return endpoint || 'service-areas';
}

/**
 * Extract origin/entity value from ACF fields object.
 * Uses key "origin" or first key matching /origin/i.
 */
function extractOriginFromAcfFields(fields: Record<string, unknown>): string | null {
  if (!fields || typeof fields !== 'object') {
    return null;
  }
  let value: unknown = fields.origin;
  if (value == null || value === '') {
    const originKey = Object.keys(fields).find((k) => /^origin$/i.test(k));
    if (originKey != null) {
      value = fields[originKey];
    }
  }
  if (value == null) {
    return null;
  }
  const str = typeof value === 'string' ? value : String(value);
  const trimmed = str.trim();
  if (!trimmed || trimmed.toLowerCase() === 'n/a') {
    return null;
  }
  return trimmed;
}

function rowHasAnyAcf(acf: unknown): boolean {
  return acf != null && typeof acf === 'object' && Object.keys(acf as object).length > 0;
}

export interface ServiceAreaPost {
  id: number;
  title: string;
  slug: string;
  status?: 'publish' | 'future';
  /** Present when fetched with includeAcf (bulk list). */
  acf?: Record<string, unknown>;
}

/**
 * Fetch all service area posts via get-posts-list (paginated).
 * Set includeAcf to pull ACF in the same list calls (minimal WordPress requests).
 */
async function fetchServiceAreaPosts(
  site: WordPressSite,
  postTypeEndpoint: string,
  onProgress?: (message: string) => void,
  status: 'publish' | 'future' = 'publish',
  includeAcf = false
): Promise<ServiceAreaPost[]> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-posts-list`;
  const posts: ServiceAreaPost[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && posts.length < MAX_SERVICE_AREAS) {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        postType: 'service-area',
        postTypeEndpoint,
        perPage: PER_PAGE,
        page,
        status,
        ...(includeAcf ? { includeAcf: true } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string } = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      return [];
    }

    const pagePosts = data.posts || [];
    if (pagePosts.length === 0) {
      hasMore = false;
      break;
    }

    for (const post of pagePosts) {
      if (posts.length >= MAX_SERVICE_AREAS) break;
      const row: ServiceAreaPost = {
        id: post.id,
        title: post.title?.rendered ?? post.title ?? 'Untitled',
        slug: post.slug ?? `post-${post.id}`,
        status,
      };
      if (includeAcf && post.acf != null && typeof post.acf === 'object') {
        row.acf = post.acf as Record<string, unknown>;
      }
      posts.push(row);
    }

    if (posts.length >= MAX_SERVICE_AREAS) {
      onProgress?.(`Using first ${MAX_SERVICE_AREAS} service areas (cap reached).`);
      break;
    }
    if (pagePosts.length < PER_PAGE) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return posts;
}

/**
 * Fetch both published and future (scheduled) service-area posts, merge and dedupe by ID.
 */
async function fetchServiceAreaPostsPublishAndFuture(
  site: WordPressSite,
  postTypeEndpoint: string,
  onProgress?: (message: string) => void,
  includeAcf = false
): Promise<ServiceAreaPost[]> {
  onProgress?.('Fetching published and scheduled service areas...');
  const [publishPosts, futurePosts] = await Promise.all([
    fetchServiceAreaPosts(site, postTypeEndpoint, onProgress, 'publish', includeAcf),
    fetchServiceAreaPosts(site, postTypeEndpoint, onProgress, 'future', includeAcf),
  ]);
  const byId = new Map<number, ServiceAreaPost>();
  for (const p of publishPosts) {
    byId.set(p.id, p);
  }
  for (const p of futurePosts) {
    if (!byId.has(p.id)) {
      byId.set(p.id, p);
    }
  }
  const merged = Array.from(byId.values());
  const pubCount = publishPosts.length;
  const futCount = futurePosts.length;
  if (futCount > 0) {
    onProgress?.(`Found ${pubCount} published, ${futCount} scheduled service areas.`);
  }
  return merged;
}

function collectionAcfLooksUsable(posts: ServiceAreaPost[]): boolean {
  if (posts.length === 0) return true;
  return posts.some((p) => rowHasAnyAcf(p.acf));
}

async function fillAcfPerPostForIndices(
  site: WordPressSite,
  postTypeEndpoint: string,
  posts: ServiceAreaPost[],
  indices: number[],
  onProgress?: (message: string) => void
): Promise<void> {
  const CONCURRENCY = 8;
  for (let o = 0; o < indices.length; o += CONCURRENCY) {
    const slice = indices.slice(o, o + CONCURRENCY);
    onProgress?.(`Loading ACF for service areas (fallback) ${Math.min(o + CONCURRENCY, indices.length)}/${indices.length}...`);
    const results = await Promise.all(
      slice.map((idx) => {
        const post = posts[idx];
        return getACFFieldsForPost(site, post.id, 'service-area', postTypeEndpoint).then((r) => ({
          idx,
          r,
        }));
      })
    );
    for (const { idx, r } of results) {
      if (r.success && r.fields && typeof r.fields === 'object') {
        posts[idx].acf = r.fields as Record<string, unknown>;
      } else if (!posts[idx].acf) {
        posts[idx].acf = {};
      }
    }
  }
}

/**
 * Fetch existing origin/entity values from every service area via API.
 * Uses ACF origin field ONLY for exclusion - no slug or URL-derived entities.
 * Returns normalized, deduplicated list (case-insensitive).
 */
export async function fetchExistingOriginsFromServiceAreas(
  site: WordPressSite,
  entitySitemapUrl: string,
  onProgress?: (message: string) => void
): Promise<string[]> {
  if (!entitySitemapUrl?.trim()) {
    return [];
  }

  const postTypeEndpoint = getEndpointFromEntitySitemapUrl(entitySitemapUrl, site);

  onProgress?.('Fetching service area list with ACF (bulk)...');
  let posts: ServiceAreaPost[];
  try {
    posts = await fetchServiceAreaPosts(site, postTypeEndpoint, onProgress, 'publish', true);
  } catch (err) {
    logger.warn('[read-existing-origins-api] get-posts-list failed, skipping API step:', err);
    return [];
  }

  if (posts.length === 0) {
    onProgress?.('No service area posts found.');
    return [];
  }

  if (!collectionAcfLooksUsable(posts)) {
    onProgress?.('ACF not in list response; loading origin fields per post (fallback)...');
    const indices = posts.map((_, i) => i);
    await fillAcfPerPostForIndices(site, postTypeEndpoint, posts, indices, onProgress);
  }

  const seenLower = new Set<string>();
  const origins: string[] = [];

  for (const post of posts) {
    const origin = extractOriginFromAcfFields((post.acf ?? {}) as Record<string, unknown>);
    if (origin == null) continue;
    const key = origin.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    origins.push(origin.trim());
  }

  onProgress?.(`Found ${origins.length} existing entities from WordPress (origin ACF only).`);
  return origins;
}

/** Full ACF context for one service-area post (no extraction; used for AI dedupe). */
export interface FullAcfPostContext {
  postId: number;
  title: string;
  slug: string;
  acf: Record<string, unknown>;
  status?: 'publish' | 'future';
}

/**
 * Build a deduplicated list with status for UI display (future = blue tags).
 */
export function getOriginListWithStatusFromAcfContext(
  context: FullAcfPostContext[]
): Array<{ entity: string; isFuture?: boolean }> {
  const seenLower = new Set<string>();
  const list: Array<{ entity: string; isFuture?: boolean }> = [];
  for (const p of context) {
    const origin = p.acf?.origin;
    if (typeof origin !== 'string' || !origin.trim()) continue;
    const trimmed = origin.trim();
    const key = trimmed.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    list.push({ entity: trimmed, isFuture: p.status === 'future' });
  }
  return list;
}

/**
 * Build a deduplicated list of existing location names from ACF origin field only.
 * Used as the single source of truth for duplicate exclusion (no slug, no sitemap-derived names).
 */
export function getOriginOnlyListFromAcfContext(context: FullAcfPostContext[]): string[] {
  const seenLower = new Set<string>();
  const list: string[] = [];
  for (const p of context) {
    const origin = p.acf?.origin;
    if (typeof origin !== 'string' || !origin.trim()) continue;
    const trimmed = origin.trim();
    const key = trimmed.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);
    list.push(trimmed);
  }
  return list;
}

function postsToFullAcfContext(posts: ServiceAreaPost[]): FullAcfPostContext[] {
  return posts.map((post) => ({
    postId: post.id,
    title: post.title ?? 'Untitled',
    slug: post.slug ?? `post-${post.id}`,
    acf:
      post.acf && typeof post.acf === 'object'
        ? { ...post.acf }
        : {},
    status: post.status,
  }));
}

/**
 * Fetch full ACF context for every service-area post (no extraction, no slug fallbacks).
 * Returns one object per post with postId, title, slug, and raw ACF fields for AI-driven dedupe.
 */
export async function fetchFullAcfContextForServiceAreas(
  site: WordPressSite,
  entitySitemapUrl: string,
  onProgress?: (message: string) => void
): Promise<FullAcfPostContext[]> {
  if (!entitySitemapUrl?.trim()) {
    return [];
  }

  const postTypeEndpoint = getEndpointFromEntitySitemapUrl(entitySitemapUrl, site);

  onProgress?.('Fetching service area list for full ACF context (bulk)...');
  let posts: ServiceAreaPost[];
  try {
    posts = await fetchServiceAreaPostsPublishAndFuture(site, postTypeEndpoint, onProgress, true);
  } catch (err) {
    logger.warn('[read-existing-origins-api] get-posts-list failed for full ACF context:', err);
    return [];
  }

  if (posts.length === 0) {
    onProgress?.('No service area posts found.');
    return [];
  }

  if (!collectionAcfLooksUsable(posts)) {
    onProgress?.('ACF not in list response; loading full ACF per post (fallback)...');
    const indices = posts.map((_, i) => i);
    await fillAcfPerPostForIndices(site, postTypeEndpoint, posts, indices, onProgress);
  }

  const result = postsToFullAcfContext(posts);
  onProgress?.(`Loaded full ACF context for ${result.length} service area posts.`);
  return result;
}

/**
 * Same API round-trip as full ACF fetch, but stores only origin (+ post metadata) for duplicate detection prompts.
 * Avoids loading huge ACF blobs into AI context.
 */
export async function fetchOriginOnlyAcfContextForServiceAreas(
  site: WordPressSite,
  entitySitemapUrl: string,
  onProgress?: (message: string) => void
): Promise<FullAcfPostContext[]> {
  if (!entitySitemapUrl?.trim()) {
    return [];
  }

  const postTypeEndpoint = getEndpointFromEntitySitemapUrl(entitySitemapUrl, site);

  onProgress?.('Fetching service area list for origin fields (bulk)...');
  let posts: ServiceAreaPost[];
  try {
    posts = await fetchServiceAreaPostsPublishAndFuture(site, postTypeEndpoint, onProgress, true);
  } catch (err) {
    logger.warn('[read-existing-origins-api] get-posts-list failed for origin context:', err);
    return [];
  }

  if (posts.length === 0) {
    onProgress?.('No service area posts found.');
    return [];
  }

  if (!collectionAcfLooksUsable(posts)) {
    onProgress?.('ACF not in list response; loading origin field per post (fallback)...');
    const indices = posts.map((_, i) => i);
    await fillAcfPerPostForIndices(site, postTypeEndpoint, posts, indices, onProgress);
  }

  const result: FullAcfPostContext[] = [];
  for (const post of posts) {
    const fields = (post.acf ?? {}) as Record<string, unknown>;
    const origin = extractOriginFromAcfFields(fields);
    result.push({
      postId: post.id,
      title: post.title ?? 'Untitled',
      slug: post.slug ?? `post-${post.id}`,
      acf: origin ? { origin } : {},
      status: post.status,
    });
  }

  onProgress?.(`Loaded origin field for ${result.length} service area posts.`);
  return result;
}

/**
 * Fetch entity post titles only (for title-format derivation).
 * Uses entity sitemap URL to get the correct post type endpoint - entity titles only, not blog posts.
 */
export async function getEntityPostTitles(
  site: WordPressSite,
  entitySitemapUrl: string,
  onProgress?: (message: string) => void
): Promise<string[]> {
  if (!entitySitemapUrl?.trim() || !site.username || !site.appPassword) {
    return [];
  }
  const postTypeEndpoint = getEndpointFromEntitySitemapUrl(entitySitemapUrl, site);
  onProgress?.('Fetching entity post titles...');
  let posts: ServiceAreaPost[];
  try {
    posts = await fetchServiceAreaPosts(site, postTypeEndpoint, onProgress, 'publish', false);
  } catch {
    return [];
  }
  const titles = posts.map((p) => p.title).filter(Boolean);
  return titles;
}

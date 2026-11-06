/**
 * WordPress Author Resolver
 * Agentic tool to recommend the most likely author for new posts based on site usage,
 * with neodigital.ca exclusion when the target site is not neodigital.ca.
 */

import { backendApiUrl } from './connection';
import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<
  string,
  { authors: AuthorWithUsage[]; timestamp: number; totalPostsScanned?: number }
>();

/** Concurrent callers await the same fetch (avoids duplicate author scans under bulk upload). */
const inFlight = new Map<string, Promise<GetAuthorUsageResult>>();

function authorUsageCacheKey(siteUrl: string, postTypeEndpoint: string, limit: number): string {
  return `${siteUrl}|${postTypeEndpoint}|${limit}`;
}

export interface AuthorWithUsage {
  id: number;
  postCount: number;
  name: string;
  slug: string;
  email: string;
}

export interface GetAuthorUsageResult {
  authors: AuthorWithUsage[];
  totalPostsScanned?: number;
  error?: string;
}

export interface ResolveRecommendedAuthorOptions {
  site: { siteUrl: string; username: string; appPassword: string };
  postTypeEndpoint?: string;
  apiKey?: string;
  siteId?: string;
}

/**
 * Fetch author usage stats from the WordPress site via backend.
 */
export async function getAuthorUsage(
  siteUrl: string,
  username: string,
  appPassword: string,
  postTypeEndpoint: string = 'posts',
  limit: number = 500
): Promise<GetAuthorUsageResult> {
  const cacheKey = authorUsageCacheKey(siteUrl, postTypeEndpoint, limit);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      authors: cached.authors,
      ...(cached.totalPostsScanned != null ? { totalPostsScanned: cached.totalPostsScanned } : {}),
    };
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const url = backendApiUrl('/wordpress/get-author-usage');

  const promise = (async (): Promise<GetAuthorUsageResult> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          siteUrl,
          username,
          appPassword,
          postTypeEndpoint,
          limit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          authors: [],
          error: data.error || `HTTP ${response.status}`,
        };
      }

      const authors = (data.authors || []) as AuthorWithUsage[];
      const totalPostsScanned = data.totalPostsScanned as number | undefined;
      cache.set(cacheKey, { authors, timestamp: Date.now(), totalPostsScanned });
      return { authors, totalPostsScanned };
    } catch (error) {
      console.warn('[Author Resolver] getAuthorUsage failed:', error);
      return {
        authors: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

function normalizeDomain(siteUrl: string): string {
  try {
    const url = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isNeodigitalAuthor(email: string | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith('@neodigital.ca');
}

/**
 * Resolve the recommended author ID for new posts.
 * - Fetches author usage from the site
 * - Excludes @neodigital.ca authors when target site is NOT neodigital.ca
 * - Uses AI to pick from multiple candidates, or returns most-used if only one
 */
export async function resolveRecommendedAuthor(
  options: ResolveRecommendedAuthorOptions
): Promise<number | undefined> {
  const resolved = await resolveRecommendedAuthorWithDetails(options);
  return resolved?.id;
}

export interface ResolvedAuthorForDisplay {
  id: number;
  name: string;
}

/**
 * Resolve the recommended author with id and name for display in the UI.
 * Same logic as resolveRecommendedAuthor but returns the author's display name.
 */
export async function resolveRecommendedAuthorWithDetails(
  options: ResolveRecommendedAuthorOptions
): Promise<ResolvedAuthorForDisplay | undefined> {
  const { site, postTypeEndpoint = 'posts', apiKey, siteId } = options;

  try {
    const result = await getAuthorUsage(
      site.siteUrl,
      site.username,
      site.appPassword,
      postTypeEndpoint,
      500
    );

    if (!result.authors || result.authors.length === 0) {
      return undefined;
    }

    const domain = normalizeDomain(site.siteUrl);

    let candidates = result.authors;

    if (domain && domain !== 'neodigital.ca') {
      const filtered = candidates.filter((a) => !isNeodigitalAuthor(a.email));
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (candidates.length === 1) {
      return { id: candidates[0].id, name: candidates[0].name || `User ${candidates[0].id}` };
    }

    if (candidates.length === 0) {
      return undefined;
    }

    const apiKeyToUse = apiKey?.trim();
    if (!apiKeyToUse) {
      const chosen = candidates[0];
      return { id: chosen.id, name: chosen.name || `User ${chosen.id}` };
    }

    try {
      let responseContent = '';
      await streamChatCompletion({
        apiKey: apiKeyToUse,
        model: getResearchModel(siteId),
        messages: [
          {
            role: 'system',
            content: `You select the most appropriate WordPress author for new content on a site. Given a list of authors with post counts, return the single author ID that is most likely the right author for new content. Return ONLY a number (the author ID), nothing else.`,
          },
          {
            role: 'user',
            content: `Site URL: ${site.siteUrl}
Authors (id, name, postCount):
${candidates.map((a) => `- id=${a.id}, name="${a.name}", postCount=${a.postCount}`).join('\n')}

Return the single author ID number most likely to be the right author for new content on this site.`,
          },
        ],
        temperature: 0.2,
        maxTokens: 20,
        topP: 0.9,
        onContentChunk: (chunk) => {
          responseContent += chunk;
        },
      });

      const raw = responseContent.trim().replace(/\D/g, '');
      const parsedId = raw ? parseInt(raw, 10) : NaN;
      const chosen = !isNaN(parsedId) ? candidates.find((c) => c.id === parsedId) : undefined;
      if (chosen) {
        return { id: chosen.id, name: chosen.name || `User ${chosen.id}` };
      }
    } catch (llmErr) {
      console.warn('[Author Resolver] LLM selection failed, using top by post count:', llmErr);
    }

    const fallback = candidates[0];
    return { id: fallback.id, name: fallback.name || `User ${fallback.id}` };
  } catch (error) {
    console.warn('[Author Resolver] resolveRecommendedAuthorWithDetails failed:', error);
    return undefined;
  }
}

/**
 * Validate internal links via backend (HTTP 200 only).
 * Only links that return 200 are considered valid; used to filter the page-sitemap / blog catalog
 * so we never use fake or broken links.
 */

import { backendApiUrl } from './connection';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type PostWithLink = { id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string };

function toFullUrl(siteBaseUrl: string, link: string): string {
  if (!link) return '';
  let base = (siteBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base.startsWith('http://') && !base.startsWith('https://')) base = `https://${base}`;
  if (link.startsWith('http://') || link.startsWith('https://')) return link;
  const path = link.startsWith('/') ? link : `/${link}`;
  return `${base}${path}`;
}

/** Normalized form (lowercase, no trailing slash) for cache/set lookups. */
export function normalizeInternalUrl(siteBaseUrl: string, link: string): string {
  return toFullUrl(siteBaseUrl, link).toLowerCase().replace(/\/+$/, '');
}

/**
 * Extract internal link URLs from HTML/markdown content (same logic as backend).
 * Returns normalized URLs (lowercase, no trailing slash).
 */
export function extractInternalLinksFromContent(content: string, siteBaseUrl: string): string[] {
  if (!content || typeof content !== 'string') return [];
  let baseOrigin = '';
  let siteHost = '';
  try {
    const base = siteBaseUrl.startsWith('http') ? siteBaseUrl : `https://${siteBaseUrl}`;
    const baseUrl = new URL(base);
    siteHost = baseUrl.hostname.replace(/^www\./, '').toLowerCase();
    baseOrigin = baseUrl.origin;
  } catch {
    return [];
  }
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>|<a[^>]*href=["'](\/[^"']*)["'][^>]*>/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m;
  while ((m = linkPattern.exec(content)) !== null) {
    const absoluteUrl = m[2] || m[3];
    const relativePath = m[4];
    const raw = absoluteUrl || relativePath;
    if (!raw) continue;
    try {
      const href = absoluteUrl
        ? absoluteUrl
        : relativePath!.startsWith('/')
          ? `${baseOrigin}${relativePath}`
          : new URL(relativePath!, baseOrigin).href;
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host !== siteHost) continue;
      const norm = normalizeInternalUrl(siteBaseUrl, href);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

type ValidateResult = { url: string; status: number; ok: boolean };

/**
 * Consume NDJSON stream from backend; call onProgress(checked, total) on each progress line;
 * return { results, allOk } from the final "done" line.
 */
async function consumeNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (checked: number, total: number) => void
): Promise<{ results: ValidateResult[]; allOk: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let results: ValidateResult[] = [];
  let allOk = false;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          type: string;
          checked?: number;
          total?: number;
          results?: ValidateResult[];
          allOk?: boolean;
        };
        if (obj.type === 'progress' && typeof obj.checked === 'number' && typeof obj.total === 'number') {
          onProgress(obj.checked, obj.total);
        } else if (obj.type === 'done' && Array.isArray(obj.results)) {
          results = obj.results;
          allOk = obj.allOk ?? results.every((r) => r.ok);
        }
      } catch {
        // skip malformed line
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer.trim()) as { type: string; results?: ValidateResult[]; allOk?: boolean };
      if (obj.type === 'done' && Array.isArray(obj.results)) {
        results = obj.results;
        allOk = obj.allOk ?? results.every((r) => r.ok);
      }
    } catch {
      // Partial stream buffer is not valid JSON yet: keep the results collected so far.
    }
  }
  return { results, allOk };
}

/**
 * Call backend to validate URLs return HTTP 200. Returns only posts whose link returned ok.
 * No fallback: if backend is unreachable or returns error, returns [] so we never allow unvalidated links.
 */
export async function filterPostsToValidatedLinksOnly(
  siteBaseUrl: string,
  posts: PostWithLink[],
  onProgress?: (message: string) => void
): Promise<PostWithLink[]> {
  if (!posts.length) return posts;

  const fullUrls = posts.map((p) => toFullUrl(siteBaseUrl, p.link)).filter(Boolean);
  if (fullUrls.length === 0) return posts;

  onProgress?.(`${fullUrls.length} link(s) for 200...`);
  try {
    const response = await fetch(backendApiUrl("/bulk/validate-internal-links"), {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ urls: fullUrls }),
    });
    if (!response.ok) {
      console.warn('[validate-internal-links] Backend returned', response.status, '- no links allowed until validated');
      return [];
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    let results: Array<{ url: string; ok: boolean }>;
    if (contentType.includes('ndjson') && response.body) {
      const streamResult = await consumeNdjsonStream(response.body, (checked, total) => {
        onProgress?.(`Validated ${checked} / ${total} links...`);
      });
      results = streamResult.results;
    } else {
      const data = (await response.json()) as { results?: Array<{ url: string; ok: boolean }> };
      results = data.results ?? [];
    }
    const okCount = results.filter((r) => r.ok).length;
    const okUrls = new Set(
      results.filter((r) => r.ok).map((r) => r.url.toLowerCase().replace(/\/+$/, ''))
    );
    const normalized = (url: string) => toFullUrl(siteBaseUrl, url).toLowerCase().replace(/\/+$/, '');
    const filtered = posts.filter((p) => {
      const full = normalized(p.link);
      return full && okUrls.has(full);
    });
    if (filtered.length < posts.length) {
      onProgress?.(`Using ${filtered.length} post(s) with valid links (${posts.length - filtered.length} removed: non-200)`);
    }
    return filtered;
  } catch (err) {
    console.warn('[validate-internal-links] Failed to validate links (backend down?):', err);
    return [];
  }
}

export type LinkCheckResult = { url: string; status: number; ok: boolean; linkType?: 'internal' | 'external' };

/**
 * Validate internal links in content before WordPress upload.
 * Throws if any internal link returns 404 or invalid; blocks upload.
 * Uses POST /api/bulk/validate-internal-links with content + siteBaseUrl.
 * If preValidatedUrls is provided and every internal link in content is in that set, skips the backend call.
 */
export async function validateContentLinksBeforeUpload(
  htmlContent: string,
  extraContent: string | undefined,
  siteBaseUrl: string,
  onProgress?: (message: string) => void,
  onResults?: (results: LinkCheckResult[]) => void,
  preValidatedUrls?: Set<string>
): Promise<void> {
  const combined = [(htmlContent || '').trim(), (extraContent || '').trim()]
    .filter(Boolean)
    .join('\n');
  if (!combined) {
    onResults?.([]);
    return;
  }

  const extracted = extractInternalLinksFromContent(combined, siteBaseUrl);
  if (preValidatedUrls && extracted.length > 0 && extracted.every((u) => preValidatedUrls.has(u))) {
    onProgress?.(`${extracted.length} link(s) pre-checked`);
    onResults?.(extracted.map((url) => ({ url, status: 200, ok: true })));
    return;
  }

  onProgress?.(`${extracted.length} link(s) for 200...`);
  try {
    const response = await fetch(backendApiUrl("/bulk/validate-internal-links"), {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: combined, siteBaseUrl }),
    });
    if (!response.ok) {
      throw new Error(
        `Link validation failed: backend returned ${response.status}. Ensure the backend server is running.`
      );
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    let results: LinkCheckResult[];
    let allOk: boolean;
    if (contentType.includes('ndjson') && response.body) {
      const streamResult = await consumeNdjsonStream(response.body, (checked, total) => {
        onProgress?.(`Validated ${checked} / ${total} links...`);
      });
      results = streamResult.results;
      allOk = streamResult.allOk;
    } else {
      const data = (await response.json()) as {
        results?: Array<{ url: string; status: number; ok: boolean }>;
        allOk?: boolean;
      };
      results = data.results ?? [];
      allOk = data.allOk ?? results.every((r) => r.ok);
    }
    onResults?.(results);
    const failed = results.filter((r) => !r.ok);

    if (!allOk) {
      const failedStrs = failed.map((r) => `${r.url} (${r.status})`);
      throw new Error(
        `Rejected: ${failedStrs.length} link(s) returned 404 or invalid: ${failedStrs.slice(0, 10).join(', ')}${failedStrs.length > 10 ? ` and ${failedStrs.length - 10} more` : ''}`
      );
    }
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(
      `Link validation failed: ${String(err)}. Ensure the backend server is running.`
    );
  }
}

function stripFailedLinksFromText(
  content: string,
  failedUrls: Set<string>,
  siteBaseUrl: string
): string {
  const norm = (u: string) => u.toLowerCase().replace(/\/+$/, '');
  const isFailed = (url: string) => failedUrls.has(norm(url)) || failedUrls.has(norm(url.trim()));

  let out = content;
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, (match, text: string, url: string) => {
    if (isFailed(url)) {
      console.warn(`[validate-internal-links] Stripped invalid link: ${url}`);
      return text;
    }
    return match;
  });
  out = out.replace(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi, (match, url: string, text: string) => {
    if (isFailed(url)) {
      console.warn(`[validate-internal-links] Stripped invalid link: ${url}`);
      return text;
    }
    return match;
  });
  if (siteBaseUrl) {
    let base = (siteBaseUrl || '').trim().replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;
    out = out.replace(/<a[^>]*href=["'](\/[^"']*)["'][^>]*>([^<]*)<\/a>/gi, (match, path: string, text: string) => {
      try {
        const full = new URL(path, base).href;
        if (isFailed(full)) {
          console.warn(`[validate-internal-links] Stripped invalid link: ${full}`);
          return text;
        }
      } catch {
        // Malformed href: leave the original anchor untouched.
      }
      return match;
    });
  }
  return out;
}

/**
 * Validate internal links, STRIP any that return 404/invalid, return cleaned content.
 * NEVER throws - always proceeds. If preValidatedUrls is provided and every internal link is in that set, skips the backend call.
 */
export async function validateAndStripInvalidLinksFromContent(
  htmlContent: string,
  extraContent: string | undefined,
  siteBaseUrl: string,
  onProgress?: (message: string) => void,
  onResults?: (results: LinkCheckResult[]) => void,
  preValidatedUrls?: Set<string>
): Promise<{ html: string; extra?: string }> {
  const combined = [(htmlContent || '').trim(), (extraContent || '').trim()]
    .filter(Boolean)
    .join('\n');
  if (!combined) {
    onResults?.([]);
    return { html: htmlContent || '', extra: extraContent };
  }

  const extracted = extractInternalLinksFromContent(combined, siteBaseUrl);
  if (preValidatedUrls && extracted.length > 0 && extracted.every((u) => preValidatedUrls.has(u))) {
    onProgress?.(`${extracted.length} link(s) pre-checked`);
    onResults?.(extracted.map((url) => ({ url, status: 200, ok: true })));
    return { html: htmlContent || '', extra: extraContent };
  }

  onProgress?.(`${extracted.length} link(s) for 200...`);
  try {
    const response = await fetch(backendApiUrl("/bulk/validate-internal-links"), {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: combined, siteBaseUrl }),
    });
    if (!response.ok) {
      onResults?.([]);
      return { html: htmlContent || '', extra: extraContent };
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    let results: LinkCheckResult[];
    if (contentType.includes('ndjson') && response.body) {
      const streamResult = await consumeNdjsonStream(response.body, (checked, total) => {
        onProgress?.(`Validated ${checked} / ${total} links...`);
      });
      results = streamResult.results;
    } else {
      const data = (await response.json()) as {
        results?: Array<{ url: string; status: number; ok: boolean }>;
      };
      results = data.results ?? [];
    }
    onResults?.(results);
    const failedUrls = new Set(results.filter((r) => !r.ok).map((r) => r.url.toLowerCase().replace(/\/+$/, '')));
    if (failedUrls.size === 0) return { html: htmlContent || '', extra: extraContent };

    onProgress?.(`Stripping ${failedUrls.size} invalid link(s), proceeding with upload...`);
    console.warn(`[validate-internal-links] Stripping ${failedUrls.size} invalid link(s) instead of blocking upload`);

    const html = stripFailedLinksFromText(htmlContent || '', failedUrls, siteBaseUrl);
    const extra = extraContent ? stripFailedLinksFromText(extraContent, failedUrls, siteBaseUrl) : undefined;
    return { html, extra };
  } catch (err) {
    console.warn('[validate-internal-links] Validation failed, proceeding with original content:', err);
    onResults?.([]);
    return { html: htmlContent || '', extra: extraContent };
  }
}

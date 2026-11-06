import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";
import { extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-section-links";
import {
  isInternalHref,
  resolveHref,
  siteHostFromBase,
} from "@/lib/overview/overview-blog-links-shared";

export function unwrapDuplicateInternalLinks(
  html: string,
  siteBaseUrl: string,
  pageUrl?: string,
): { html: string; dupesRemoved: number } {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return { html, dupesRemoved: 0 };
  const site = siteHostFromBase(siteBaseUrl);
  if (!site) return { html, dupesRemoved: 0 };
  const selfNorm = pageUrl?.trim() ? normalizeInternalUrl(siteBaseUrl, pageUrl) : "";
  const seen = new Set<string>();
  let dupesRemoved = 0;
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out = trimmed.replace(anchorRe, (full, rawHref: string, inner: string) => {
    const resolved = resolveHref(rawHref.trim(), site.baseOrigin);
    if (!resolved || !isInternalHref(resolved, site.siteHost)) return full;
    const norm = normalizeInternalUrl(siteBaseUrl, resolved);
    if (selfNorm && norm === selfNorm) return full;
    if (seen.has(norm)) {
      dupesRemoved += 1;
      return inner;
    }
    seen.add(norm);
    return full;
  });
  return { html: out, dupesRemoved };
}

/** Compare body with hrefs normalized (anchors preserved). */
export function stripLinkHrefsForCompare(html: string, siteBaseUrl: string): string {
  const spans = extractInternalLinksFromHtml(html, siteBaseUrl);
  let out = html ?? "";
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let linkOrdinal = 0;
  out = out.replace(anchorRe, (full, href: string, inner: string) => {
    const resolved = resolveHref(href.trim(), siteHostFromBase(siteBaseUrl)?.baseOrigin ?? "");
    if (!resolved) return full;
    const site = siteHostFromBase(siteBaseUrl);
    if (!site || !isInternalHref(resolved, site.siteHost)) return full;
    const norm = normalizeInternalUrl(siteBaseUrl, resolved);
    const span = spans[linkOrdinal];
    linkOrdinal += 1;
    const compareHref = span ? `href="${span.normalizedHref}"` : `href="${norm}"`;
    return `<a ${compareHref}>${inner}</a>`;
  });
  return out;
}

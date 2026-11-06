import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";
import {
  plainAnchorFromInnerHtml,
  readInternalLinkMatch,
  siteHostFromBase,
  type BlogInternalLinkRange,
  type BlogInternalLinkSpan,
  type InternalLinkEditSpan,
  type SectionLinkRow,
} from "@/lib/overview/overview-blog-links-shared";

export function extractAllSectionLinkRowsFromHtml(html: string): SectionLinkRow[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const out: SectionLinkRow[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    out.push({
      href: (m[1] ?? "").trim(),
      anchor: plainAnchorFromInnerHtml(m[2] ?? ""),
    });
  }
  return out;
}

/** Edit spans for every `<a href="...">` in document order (including empty href). */
export function extractAllSectionLinkEditSpans(html: string): InternalLinkEditSpan[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const out: InternalLinkEditSpan[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(openTag);
    if (!hrefMatch) continue;
    const hrefValue = hrefMatch[1] ?? "";
    const hrefAttrStart = openTag.indexOf(hrefMatch[0]);
    const hrefValueStartInAttr = hrefMatch[0].search(/["']/u) + 1;
    const hrefStart = m.index + hrefAttrStart + hrefValueStartInAttr;
    const hrefEnd = hrefStart + hrefValue.length;
    const innerStart = m.index + openTag.length;
    const innerEnd = innerStart + (m[2]?.length ?? 0);
    out.push({
      index: out.length,
      hrefStart,
      hrefEnd,
      innerStart,
      innerEnd,
    });
  }
  return out;
}

/** Internal link spans with href and anchor (inner) character ranges for in-place edits. */
export function extractInternalLinkEditSpans(
  html: string,
  siteBaseUrl: string,
  pageUrl?: string,
): InternalLinkEditSpan[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const site = siteHostFromBase(siteBaseUrl);
  if (!site) return [];

  const selfNorm = pageUrl?.trim() ? normalizeInternalUrl(siteBaseUrl, pageUrl) : "";
  const out: InternalLinkEditSpan[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const link = readInternalLinkMatch(m, site, siteBaseUrl, selfNorm);
    if (!link) continue;
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const innerStart = m.index + openTag.length;
    const innerEnd = innerStart + (m[2]?.length ?? 0);
    out.push({
      index: out.length,
      hrefStart: link.hrefStart,
      hrefEnd: link.hrefEnd,
      innerStart,
      innerEnd,
    });
  }
  return out;
}

/** Full `<a>...</a>` tags for internal links in document order (for copy-preserve prompts). */
export function extractExactInternalLinkTagsFromHtml(
  html: string,
  siteBaseUrl: string,
  pageUrl?: string,
): string[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const site = siteHostFromBase(siteBaseUrl);
  if (!site) return [];

  const selfNorm = pageUrl?.trim() ? normalizeInternalUrl(siteBaseUrl, pageUrl) : "";
  const out: string[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const link = readInternalLinkMatch(m, site, siteBaseUrl, selfNorm);
    if (!link) continue;
    out.push(m[0]);
  }
  return out;
}

/** Internal link spans with source href character ranges (aligned with extractInternalLinksFromHtml). */
export function extractInternalLinkRangesFromHtml(
  html: string,
  siteBaseUrl: string,
  pageUrl?: string,
): BlogInternalLinkRange[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const site = siteHostFromBase(siteBaseUrl);
  if (!site) return [];

  const selfNorm = pageUrl?.trim() ? normalizeInternalUrl(siteBaseUrl, pageUrl) : "";
  const out: BlogInternalLinkRange[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const link = readInternalLinkMatch(m, site, siteBaseUrl, selfNorm);
    if (!link) continue;
    out.push({ ...link, index: out.length });
  }
  return out;
}

export function extractInternalLinksFromHtml(
  html: string,
  siteBaseUrl: string,
  pageUrl?: string,
): BlogInternalLinkSpan[] {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return [];
  const site = siteHostFromBase(siteBaseUrl);
  if (!site) return [];

  const selfNorm = pageUrl?.trim() ? normalizeInternalUrl(siteBaseUrl, pageUrl) : "";
  const out: BlogInternalLinkSpan[] = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(trimmed)) !== null) {
    const link = readInternalLinkMatch(m, site, siteBaseUrl, selfNorm);
    if (!link) continue;
    out.push({
      index: out.length,
      href: link.href,
      anchor: link.anchor,
      normalizedHref: link.normalizedHref,
    });
  }
  return out;
}

export function countInternalLinksInHtml(html: string, siteBaseUrl: string, pageUrl?: string): number {
  return extractInternalLinksFromHtml(html, siteBaseUrl, pageUrl).length;
}

/**
 * Post-resolve pass: weave orphaned internal link-only paragraphs into earlier body copy.
 */

import { isMediaAssetUrl } from "@/lib/content-optimization/images-extract";
import {
  findPhraseOutsideTags,
  listHtmlParagraphBlocksForAddLinks,
} from "@/lib/overview/overview-blog-links-extract";
import {
  INTERNAL_LINK_PLACEHOLDER_RE,
  normalizeMalformedHarnessLinkPlaceholders,
  type LinkablePost,
} from "@/lib/content-generation/internal-link-placeholders";
import {
  extractOverviewSectionHtml,
} from "@/lib/overview/overview-blog-overview-prepend";

export type IntegrateOrphanInternalLinksOptions = {
  siteUrl: string;
  currentPageUrl?: string;
  wordPressPosts?: LinkablePost[];
};

const LINK_ONLY_PARAGRAPH_RE =
  /^<p(\s[^>]*)?>\s*<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/p>$/i;

function getSiteHost(siteUrl: string): string {
  try {
    const u = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function plainAnchorFromInnerHtml(inner: string): string {
  return inner.replace(/<[^>]+>/g, "").trim();
}

function isInternalHref(href: string, siteHost: string, siteUrl: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return false;
  }
  if (isMediaAssetUrl(trimmed)) return false;
  try {
    const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const origin = new URL(base).origin;
    const resolved = trimmed.startsWith("http")
      ? trimmed
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, origin).href;
    const host = new URL(resolved).hostname.replace(/^www\./, "").toLowerCase();
    return host === siteHost;
  } catch {
    return false;
  }
}

function parseLinkOnlyParagraph(html: string): { href: string; anchor: string } | null {
  const m = html.trim().match(LINK_ONLY_PARAGRAPH_RE);
  if (!m) return null;
  const href = (m[2] ?? "").trim();
  const anchor = plainAnchorFromInnerHtml(m[3] ?? "");
  if (!href || !anchor) return null;
  return { href, anchor };
}

function findLastOrphanBlockIndex(html: string, siteHost: string, siteUrl: string): number {
  const blocks = listHtmlParagraphBlocksForAddLinks(html);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const parsed = parseLinkOnlyParagraph(blocks[i]!.html);
    if (!parsed) continue;
    if (isInternalHref(parsed.href, siteHost, siteUrl)) return i;
  }
  return -1;
}

function findOrphanBlockByLink(
  html: string,
  href: string,
  anchor: string,
): { start: number; end: number } | null {
  const blocks = listHtmlParagraphBlocksForAddLinks(html);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    const parsed = parseLinkOnlyParagraph(block.html);
    if (!parsed) continue;
    if (parsed.href === href && parsed.anchor === anchor) {
      return { start: block.start, end: block.end };
    }
  }
  return null;
}

function assertNoUnresolvedPlaceholders(html: string): string {
  return normalizeMalformedHarnessLinkPlaceholders(html);
}

function blockIsInsideOverviewSection(html: string, blockStart: number): boolean {
  const overview = extractOverviewSectionHtml(html);
  if (!overview?.trim()) return false;
  const overviewStart = html.indexOf(overview);
  if (overviewStart < 0) return false;
  return blockStart >= overviewStart && blockStart < overviewStart + overview.length;
}

/**
 * Weaves orphaned internal link paragraphs into earlier body copy when anchor phrase exists.
 */
export function integrateOrphanInternalLinksInHtml(
  html: string,
  opts: IntegrateOrphanInternalLinksOptions,
): string {
  if (!html?.trim()) return html;

  const siteHost = getSiteHost(opts.siteUrl);
  if (!siteHost) return assertNoUnresolvedPlaceholders(html);

  let result = html;
  let integrated = 0;
  let dropped = 0;

  for (;;) {
    const orphanIndex = findLastOrphanBlockIndex(result, siteHost, opts.siteUrl);
    if (orphanIndex === -1) break;

    const blocks = listHtmlParagraphBlocksForAddLinks(result);
    const orphan = blocks[orphanIndex]!;
    const parsed = parseLinkOnlyParagraph(orphan.html);
    if (!parsed) break;

    let didIntegrate = false;

    for (let i = orphanIndex - 1; i >= 0; i--) {
      const block = blocks[i]!;
      if (blockIsInsideOverviewSection(result, block.start)) continue;
      const hit = findPhraseOutsideTags(block.html, parsed.anchor);
      if (!hit) continue;

      const actualText = block.html.slice(hit.start, hit.start + hit.length);
      const newBlock =
        block.html.slice(0, hit.start) +
        `<a href="${parsed.href}">${actualText}</a>` +
        block.html.slice(hit.start + hit.length);

      result = result.slice(0, block.start) + newBlock + result.slice(block.end);
      didIntegrate = true;
      integrated += 1;
      break;
    }

    const orphanSpan = findOrphanBlockByLink(result, parsed.href, parsed.anchor);
    if (orphanSpan) {
      result = result.slice(0, orphanSpan.start) + result.slice(orphanSpan.end);
      if (!didIntegrate) dropped += 1;
    }
  }

  return assertNoUnresolvedPlaceholders(result);
}

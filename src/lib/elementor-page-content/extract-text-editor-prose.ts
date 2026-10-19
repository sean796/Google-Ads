import { splitElementorPageHtmlBySections } from "@/lib/elementor-page-content/elementor-page-html";

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeQuotes(html: string): string {
  return html
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/&nbsp;/gi, " ");
}

/** True when bodyHtml is widget markup or known broken link attribute leaks. */
export function proseLooksCorrupt(html: string): boolean {
  const trimmed = normalizeQuotes(html.trim());
  if (!trimmed) return false;
  return (
    /data-e-type=|data-widgettype=|type="widget"/i.test(trimmed) ||
    /(?:^|>|\s)(?<![_\w])blank["']?\s*rel=["']?noopener/i.test(trimmed) ||
    /(?:^|>|\s)target="_\s*$/i.test(trimmed)
  );
}

function stripOrphanLinkAttributeLeaks(html: string): string {
  return html.replace(
    /(?:\s|&nbsp;)*(?<![_\w])blank["']?\s*rel=["']?noopener(?:\s+noreferrer)?["']?\s*>([^<,]*?)(?:<\/a>)?/gi,
    "$1",
  );
}

function normalizeAnchorOpenTags(html: string): string {
  return html.replace(/<a\s+([^>]*)>/gi, (match, attrs: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])([^"']*)\1/i);
    if (!hrefMatch?.[1] || !hrefMatch[2]) return match;
    return `<a href=${hrefMatch[1]}${hrefMatch[2]}${hrefMatch[1]}>`;
  });
}

/** Normalize section prose for TipTap: href-only anchors; no orphaned attribute text. */
export function normalizeSectionProseHtml(html: string): string {
  let out = normalizeQuotes(html.trim());
  if (!out) return "";

  out = stripOrphanLinkAttributeLeaks(out);
  out = normalizeAnchorOpenTags(out);
  out = stripOrphanLinkAttributeLeaks(out);

  return out.trim();
}

function extractBalancedDivInner(html: string, contentStart: number): string {
  let depth = 1;
  let cursor = contentStart;
  while (cursor < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", cursor);
    const nextClose = html.indexOf("</div>", cursor);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return html.slice(contentStart, nextClose).trim();
    }
    cursor = nextClose + 6;
  }
  return "";
}

function extractTextEditorWidgetBodies(html: string): string[] {
  const parts: string[] = [];
  const widgetRe = /elementor-widget-(?:text-editor|html)\b/gi;
  for (const widgetMatch of html.matchAll(widgetRe)) {
    const slice = html.slice(widgetMatch.index ?? 0);
    const containerMatch = /<div\s+class="elementor-widget-container"\s*>/i.exec(slice);
    if (!containerMatch?.index) continue;
    const contentStart = containerMatch.index + containerMatch[0].length;
    const inner = extractBalancedDivInner(slice, contentStart);
    if (inner.trim()) parts.push(inner);
  }
  return parts;
}

function sliceRenderedHtmlByHeadingTitle(pageHtml: string, sectionTitle: string): string {
  const title = sectionTitle.trim();
  if (!title) return "";
  const sections = splitElementorPageHtmlBySections(pageHtml);
  const match = sections.find(
    (section) => section.title.trim().toLowerCase() === title.toLowerCase(),
  );
  return match?.bodyHtml ?? "";
}

function splitRenderedHtmlByElementorTopSections(pageHtml: string): string[] {
  const html = pageHtml.trim();
  if (!html) return [];
  const bands: string[] = [];
  const re = /<div[^>]*class="[^"]*elementor-top-section[^"]*"[^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const contentStart = (match.index ?? 0) + match[0].length;
    const inner = extractBalancedDivInner(html, contentStart);
    if (inner.trim()) bands.push(inner);
  }
  return bands;
}

/** Pull inner HTML from Elementor text-editor widget containers in rendered page HTML. */
export function extractTextEditorProseFromRenderedHtml(sectionHtml: string): string {
  const html = sectionHtml.trim();
  if (!html) return "";

  const widgetParts = extractTextEditorWidgetBodies(html);
  if (widgetParts.length) {
    return normalizeSectionProseHtml(widgetParts.join("\n"));
  }

  const altParts: string[] = [];
  const altRe = /class="elementor-text-editor[^"]*"[^>]*>/gi;
  for (const match of html.matchAll(altRe)) {
    const contentStart = (match.index ?? 0) + match[0].length;
    const inner = extractBalancedDivInner(html, contentStart);
    if (inner.trim() && !/data-e-type=/i.test(inner)) altParts.push(inner);
  }
  if (altParts.length) {
    return normalizeSectionProseHtml(altParts.join("\n"));
  }

  if (/<p[\s>]/i.test(html) && !/data-e-type=/i.test(html) && !/data-widgettype=/i.test(html)) {
    return normalizeSectionProseHtml(html);
  }

  return "";
}

export function prosePlainText(html: string): string {
  return stripHtml(html);
}

/** Text-editor prose for one h2-aligned section of cached post HTML. */
export function extractTextEditorProseFromPageHtml(
  pageHtml: string,
  sectionIndex: number,
  sectionTitle?: string,
): string {
  const trimmed = pageHtml.trim();
  if (!trimmed) return "";

  const title = sectionTitle?.trim();
  if (title) {
    const byTitleSlice = sliceRenderedHtmlByHeadingTitle(trimmed, title);
    if (byTitleSlice.trim()) {
      const byTitleProse = extractTextEditorProseFromRenderedHtml(byTitleSlice);
      if (byTitleProse.trim()) return byTitleProse;
    }
  }

  const topSections = splitRenderedHtmlByElementorTopSections(trimmed);
  if (topSections.length) {
    const topSlice = topSections[sectionIndex];
    if (topSlice?.trim()) {
      const topProse = extractTextEditorProseFromRenderedHtml(topSlice);
      if (topProse.trim()) return topProse;
    }
  }

  const sections = splitElementorPageHtmlBySections(trimmed);
  if (!sections.length) {
    return extractTextEditorProseFromRenderedHtml(trimmed);
  }

  const byIndex = sections[sectionIndex];
  const slice =
    byIndex ??
    (title
      ? sections.find((section) => section.title.trim().toLowerCase() === title.toLowerCase())
      : undefined);

  if (!slice) return "";
  return extractTextEditorProseFromRenderedHtml(slice.bodyHtml);
}

import { isValidImageUrl, isValidMediaUrl } from "./images-extract";
import { findPhraseOutsideTags } from "@/lib/overview/overview-blog-links-extract";

/**
 * Extracts H2 section headings from markdown or HTML content.
 */
export function extractH2Headings(markdownContent: string): string[] {
  if (!markdownContent) return [];
  const headings: string[] = [];
  const htmlMatches = markdownContent.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi);
  for (const m of htmlMatches) {
    if (m[1]?.trim()) headings.push(m[1].trim());
  }
  if (headings.length > 0) return headings;
  for (const line of markdownContent.split("\n")) {
    const match = line.match(/^##\s+(.+)$/);
    if (match?.[1]) headings.push(match[1].trim());
  }
  return headings;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Find H2 block range: heading match index and section end (next h2 or EOF). */
function findH2SectionRange(html: string, sectionHeading: string): { start: number; end: number } | null {
  const searchStart = sectionHeading.toLowerCase().substring(0, Math.min(30, sectionHeading.length));
  const h2Re = new RegExp(`<h2[^>]*>([^<]*${escapeRe(searchStart)}[^<]*)(<\\/h2>)`, "i");
  const m = html.match(h2Re);
  if (!m || m.index == null) return null;
  const start = m.index;
  const afterH2 = start + m[0].length;
  const nextH2 = html.slice(afterH2).search(/<h2[\s>]/i);
  const end = nextH2 >= 0 ? afterH2 + nextH2 : html.length;
  return { start, end };
}

function weaveLinkIntoParagraph(paragraphHtml: string, phrase: string, href: string, label: string): string | null {
  const hit = findPhraseOutsideTags(paragraphHtml, phrase);
  if (hit) {
    const actualText = paragraphHtml.slice(hit.start, hit.start + hit.length);
    return (
      paragraphHtml.slice(0, hit.start) +
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${actualText}</a>` +
      paragraphHtml.slice(hit.start + hit.length)
    );
  }
  const trimmed = paragraphHtml.trim();
  if (!trimmed) return null;
  const open = trimmed.match(/^<p(\s[^>]*)?>/i);
  const close = trimmed.endsWith("</p>");
  if (open && close) {
    const inner = trimmed.slice(open[0].length, trimmed.length - 4).trimEnd();
    const spacer = inner.length > 0 && !/\s$/.test(inner) ? " " : "";
    return `<p${open[1] || ""}>${inner}${spacer}<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></p>`;
  }
  return `${trimmed} <a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function weaveImageIntoParagraph(paragraphHtml: string, imageUrl: string, alt: string): string | null {
  const hit = findPhraseOutsideTags(paragraphHtml, alt);
  if (hit) {
    const before = paragraphHtml.slice(0, hit.start);
    const after = paragraphHtml.slice(hit.start + hit.length);
    const img = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
    return `${before}${img}${after}`;
  }
  const trimmed = paragraphHtml.trim();
  if (!trimmed.match(/^<p(\s[^>]*)?>/i)) return `<p><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" /></p>`;
  const open = trimmed.match(/^<p(\s[^>]*)?>/i);
  if (!open) return null;
  const inner = trimmed.slice(open[0].length, trimmed.endsWith("</p>") ? -4 : undefined).trimEnd();
  const img = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  return `<p${open[1] || ""}>${inner}${inner ? " " : ""}${img}</p>`;
}

function insertIntoHtmlSection(
  html: string,
  sectionHeading: string,
  mediaUrl: string,
  linkLabel: string,
  asImage: boolean,
): string {
  const range = findH2SectionRange(html, sectionHeading);
  if (!range) return html;

  const sectionHtml = html.slice(range.start, range.end);
  const pRe = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi;
  let firstPMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(sectionHtml)) !== null) {
    if (!firstPMatch) firstPMatch = m;
    const full = m[0];
    const inner = m[2] ?? "";
    if (asImage) {
      const woven = weaveImageIntoParagraph(full, mediaUrl, linkLabel);
      if (woven && woven !== full) {
        const absStart = range.start + m.index;
        return html.slice(0, absStart) + woven + html.slice(absStart + full.length);
      }
    } else {
      const woven = weaveLinkIntoParagraph(full, linkLabel, mediaUrl, linkLabel);
      if (woven && woven !== full) {
        const absStart = range.start + m.index;
        return html.slice(0, absStart) + woven + html.slice(absStart + full.length);
      }
    }
    if (findPhraseOutsideTags(inner, linkLabel)) break;
  }

  if (firstPMatch) {
    const full = firstPMatch[0];
    const woven = asImage
      ? weaveImageIntoParagraph(full, mediaUrl, linkLabel)
      : weaveLinkIntoParagraph(full, linkLabel, mediaUrl, linkLabel);
    if (woven) {
      const absStart = range.start + firstPMatch.index;
      return html.slice(0, absStart) + woven + html.slice(absStart + full.length);
    }
  }

  const safeHref = mediaUrl.replace(/"/g, "&quot;");
  const safeLabel = escapeHtml(linkLabel);
  const insertBlock = asImage
    ? `<p><img src="${safeHref}" alt="${safeLabel}" loading="lazy" /></p>`
    : `<p><a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeLabel}</a></p>`;
  return html.slice(0, range.end) + insertBlock + html.slice(range.end);
}

/**
 * Inserts preserved media into the target H2 section (woven into copy, never appended to page end).
 * Images use <img>; videos/external embeds use text links.
 */
export function insertMediaLinkIntoSection(
  markdownContent: string,
  sectionHeading: string,
  mediaUrl: string,
  linkLabel: string,
): string {
  if (!markdownContent || !sectionHeading) return markdownContent;
  if (!mediaUrl?.trim() || !isValidMediaUrl(mediaUrl)) return markdownContent;
  const label = (linkLabel ?? "").trim();
  if (!label) return markdownContent;

  const asImage = isValidImageUrl(mediaUrl);

  if (/<h2[\s>]/i.test(markdownContent)) {
    return insertIntoHtmlSection(markdownContent, sectionHeading, mediaUrl, label, asImage);
  }

  const linkMarkdown = asImage
    ? `![${label.replace(/[[\]]/g, "")}](${mediaUrl})`
    : `[${label.replace(/[[\]]/g, "")}](${mediaUrl})`;
  const lines = markdownContent.split("\n");
  const searchStart = sectionHeading.toLowerCase().substring(0, Math.min(30, sectionHeading.length));
  let insertIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^##\s+/) && lines[i].toLowerCase().includes(searchStart)) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== "" && !lines[j].match(/^##\s+/)) {
          insertIndex = j + 1;
          break;
        }
      }
      break;
    }
  }

  if (insertIndex === -1) return markdownContent;

  lines.splice(insertIndex, 0, "", linkMarkdown, "");
  return lines.join("\n");
}

/**
 * @deprecated Prefer insertMediaLinkIntoSection (link-only preservation).
 */
export function insertImageIntoSection(
  markdownContent: string,
  sectionHeading: string,
  imageUrl: string,
  altTag: string,
): string {
  return insertMediaLinkIntoSection(markdownContent, sectionHeading, imageUrl, altTag);
}

import { findPhraseOutsideTags } from "@/lib/overview/overview-blog-links-extract";
import { keepBlogPlayLinkTargets } from "@/lib/bulk/bulk-generation-wp-inventory";
import { toSentenceCaseLinkAnchor } from "@/lib/content-generation/link-anchor-text-case";

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
const HREF_PATTERN = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

/** Target: one internal link per this many words. */
export const WORDS_PER_LINK_TARGET = 200;

/** Minimum number of internal links required per blog post (AI-sourced, validated). */
export const MIN_LINKS_PER_POST = 10;

export type WordPressPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  collection?: string;
  postType?: string;
};

export function blogPlayLinkPool(
  wordPressPosts: WordPressPost[],
  currentPageUrl?: string,
): WordPressPost[] {
  const normalizedCurrent = currentPageUrl?.replace(/\/+$/, "").toLowerCase() ?? "";
  return keepBlogPlayLinkTargets(wordPressPosts).filter((p) => {
    if (!p.link?.trim()) return false;
    const norm = p.link.trim().replace(/\/+$/, "").toLowerCase();
    return norm !== normalizedCurrent && norm + "/" !== normalizedCurrent && normalizedCurrent + "/" !== norm;
  });
}

export function getSiteHost(siteUrl: string): string {
  try {
    const u = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Normalize URL for Set lookup: lowercase, trim, strip trailing slashes. */
function normalizeUrlForSet(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Builds the set of valid internal URLs once. Call at pipeline entry and pass to inner functions.
 * Stores normalized form (lowercase, no trailing slash) and with trailing slash so a single has() suffices.
 */
export function buildValidInternalUrlSet(
  wordPressPosts: WordPressPost[],
  siteHost: string
): Set<string> {
  const set = new Set<string>();
  wordPressPosts.forEach((post) => {
    if (!post.link?.trim()) return;
    const url = post.link.trim();
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (host !== siteHost) return;
      const norm = normalizeUrlForSet(url);
      set.add(norm);
      set.add(norm + "/");
    } catch {
      // skip invalid URL
    }
  });
  return set;
}

export function countInternalLinksInSection(
  sectionMarkdown: string,
  siteHost: string,
  validUrls: Set<string>
): number {
  let count = 0;
  let m: RegExpExecArray | null;
  LINK_PATTERN.lastIndex = 0;
  while ((m = LINK_PATTERN.exec(sectionMarkdown)) !== null) {
    const url = m[2];
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (host !== siteHost) continue;
      const norm = normalizeUrlForSet(url);
      if (validUrls.has(norm) || validUrls.has(norm + "/")) count++;
    } catch {
      // skip
    }
  }
  return count;
}

export function countInternalLinksInMarkdown(
  markdown: string,
  wordPressPosts: WordPressPost[],
  siteUrl: string
): number {
  const siteHost = getSiteHost(siteUrl);
  const validUrls = buildValidInternalUrlSet(wordPressPosts, siteHost);
  let total = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(LINK_PATTERN.source, "g");
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2];
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (host !== siteHost) continue;
      const norm = normalizeUrlForSet(url);
      if (validUrls.has(norm) || validUrls.has(norm + "/")) total++;
    } catch {
      // skip
    }
  }
  return total;
}

/** Count internal links in HTML (from href attributes). Hash-only scroll links do not count. */
export function countInternalLinksInHtml(
  html: string,
  siteHost: string,
  validUrls: Set<string>
): number {
  let count = 0;
  let m: RegExpExecArray | null;
  HREF_PATTERN.lastIndex = 0;
  while ((m = HREF_PATTERN.exec(html)) !== null) {
    const url = m[1];
    if (!url || url.trim().startsWith("#")) continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (host !== siteHost) continue;
      const norm = normalizeUrlForSet(url);
      if (validUrls.has(norm) || validUrls.has(norm + "/")) count++;
    } catch {
      // skip
    }
  }
  return count;
}

export function countInternalLinksInHtmlContent(
  html: string,
  wordPressPosts: WordPressPost[],
  siteUrl: string
): number {
  const siteHost = getSiteHost(siteUrl);
  const validUrls = buildValidInternalUrlSet(wordPressPosts, siteHost);
  return countInternalLinksInHtml(html, siteHost, validUrls);
}

/** Short sentence-case anchor text from a WordPress post title (2–4 words). */
export function shortAnchorFromPostTitle(title: string): string {
  const anchor = toSentenceCaseLinkAnchor(title, 4);
  return anchor || "related page";
}

function anchorPhraseCandidatesFromTitle(title: string): string[] {
  const words = title
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const stop = new Set(["the", "a", "an", "for", "and", "or", "to", "of", "in", "on", "at", "your", "our"]);
  const candidates: string[] = [];
  for (let len = Math.min(4, words.length); len >= 2; len--) {
    candidates.push(words.slice(0, len).join(" "));
  }
  if (words.length === 1) candidates.push(words[0]!);
  for (const word of words) {
    if (word.length >= 4 && !stop.has(word.toLowerCase())) {
      candidates.push(word);
    }
  }
  return [...new Set(candidates.map((p) => p.trim()).filter(Boolean))];
}

function weaveLinkIntoParagraphInner(inner: string, href: string, title: string): string | null {
  for (const phrase of anchorPhraseCandidatesFromTitle(title)) {
    const hit = findPhraseOutsideTags(inner, phrase);
    if (!hit) continue;
    const actual = inner.slice(hit.start, hit.start + hit.length);
    return (
      inner.slice(0, hit.start) +
      `<a href="${href}">${actual}</a>` +
      inner.slice(hit.start + hit.length)
    );
  }
  return null;
}

const HTML_INTERNAL_LINK_RE = /<a\s[^>]*href=["']https?:\/\//i;
const MD_INTERNAL_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;

function insertOneInternalLinkIntoBlock(
  sectionHtml: string,
  link: { title: string; link: string },
  tag: "p" | "td",
): string {
  if (!sectionHtml.trim() || !link.link?.trim()) return sectionHtml;

  const href = link.link.trim();
  let inserted = false;
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");

  const out = sectionHtml.replace(re, (full, attrs, inner) => {
    if (inserted) return full;
    if (HTML_INTERNAL_LINK_RE.test(inner)) return full;
    const woven = weaveLinkIntoParagraphInner(inner, href, link.title);
    if (woven) {
      inserted = true;
      return `<${tag}${attrs || ""}>${woven}</${tag}>`;
    }
    return full;
  });

  return inserted ? out : sectionHtml;
}

/**
 * Inserts one internal link into the first <p> or <td> without an http(s) link by weaving into existing text.
 * Never appends "See ..." or "Related reading: ..." tails.
 */
export function insertOneInternalLinkIntoHtml(
  sectionHtml: string,
  link: { title: string; link: string },
): string {
  let html = insertOneInternalLinkIntoBlock(sectionHtml, link, "p");
  if (html === sectionHtml) {
    html = insertOneInternalLinkIntoBlock(sectionHtml, link, "td");
  }
  return html;
}

/**
 * Inserts one markdown internal link by wrapping matching anchor text in the first paragraph without a link.
 */
export function insertOneInternalLinkIntoMarkdown(
  sectionMarkdown: string,
  link: { title: string; link: string },
): string {
  if (!sectionMarkdown.trim() || !link.link?.trim()) return sectionMarkdown;

  const href = link.link.trim();
  const parts = sectionMarkdown.split(/\n\n+/);
  for (let i = 0; i < parts.length; i++) {
    if (MD_INTERNAL_LINK_RE.test(parts[i]!)) continue;
    for (const phrase of anchorPhraseCandidatesFromTitle(link.title)) {
      const lowerPart = parts[i]!.toLowerCase();
      const lowerPhrase = phrase.toLowerCase();
      const idx = lowerPart.indexOf(lowerPhrase);
      if (idx < 0) continue;
      const actual = parts[i]!.slice(idx, idx + phrase.length);
      parts[i] =
        parts[i]!.slice(0, idx) + `[${actual}](${href})` + parts[i]!.slice(idx + phrase.length);
      return parts.join("\n\n");
    }
  }
  return sectionMarkdown;
}

/**
 * Split HTML into chunks of ~wordsPerChunk at block boundaries (p, h2, ul, ol, table).
 * Preserves all HTML structure within each chunk.
 */
export function splitHtmlIntoWordChunks(html: string, wordsPerChunk: number): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  // Match block elements: p, h1-h6, ul, ol, table. Use regex to split before each block.
  const blockRe = /<(p|h[1-6]|ul|ol|table)[^>]*>[\s\S]*?<\/\1>/gi;
  const blocks: string[] = [];
  let lastIndex = 0;
  let m;
  while ((m = blockRe.exec(trimmed)) !== null) {
    const before = trimmed.slice(lastIndex, m.index).trim();
    if (before) blocks.push(before);
    blocks.push(m[0]);
    lastIndex = blockRe.lastIndex;
  }
  const rest = trimmed.slice(lastIndex).trim();
  if (rest) blocks.push(rest);
  if (blocks.length === 0) return [trimmed];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const block of blocks) {
    const words = block.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    if (currentWords + words >= wordsPerChunk && current.length > 0) {
      chunks.push(current.join(""));
      current = [];
      currentWords = 0;
    }
    current.push(block);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join(""));
  return chunks;
}

/**
 * Splits markdown into chunks of approximately `wordsPerChunk` words (by paragraph boundaries).
 */
export function splitIntoWordChunks(markdown: string, wordsPerChunk: number): string[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split(/\n\n+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean).length;
    if (currentWords + words >= wordsPerChunk && current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
    current.push(p);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

/**
 * Split HTML into sections by H2 and H3 headings. Each section is from one <h2 or <h3 to the next (or end).
 * First element may be intro (content before any H2/H3). Used to ensure at least one link per heading.
 */
export function splitHtmlByHeadingSections(html: string): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/(?=<h[23]\b)/i);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function isOverviewHeadingSection(sectionHtml: string): boolean {
  const trimmed = sectionHtml.trim();
  if (/^<div[^>]*class=["']flo-overview["']/i.test(trimmed)) return true;
  if (/^<h2[^>]*\bid=["']overview["']/i.test(trimmed)) return true;
  if (/^<h2[^>]*>\s*Overview\s*<\/h2>/i.test(trimmed)) return true;
  return false;
}

function isFaqHeadingSection(sectionHtml: string): boolean {
  const trimmed = sectionHtml.trim();
  if (/^<div[^>]*class=["']flo-faq["']/i.test(trimmed)) return true;
  if (/^<h2[^>]*\bid=["']faq["']/i.test(trimmed)) return true;
  if (/^<h2[^>]*>\s*FAQ\s*<\/h2>/i.test(trimmed)) return true;
  if (
    /^<h2\b/i.test(trimmed) &&
    /<thead[^>]*>[\s\S]*?<th[^>]*>\s*Question\s*<\/th>/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export function isEligibleHeadingSection(sectionHtml: string): boolean {
  const trimmed = sectionHtml.trim();
  if (!/<h[23]\b/i.test(trimmed)) return false;
  if (isOverviewHeadingSection(trimmed)) return false;
  if (isFaqHeadingSection(trimmed)) return false;
  return true;
}

/** Count body H2/H3 sections that should receive at least one internal link. */
export function countEligibleHeadingSections(html: string): number {
  let count = 0;
  for (const section of splitHtmlByHeadingSections(html)) {
    if (isOverviewHeadingSection(section) || isFaqHeadingSection(section)) continue;
    count += (section.match(/<h[23]\b/gi) ?? []).length;
  }
  return count;
}

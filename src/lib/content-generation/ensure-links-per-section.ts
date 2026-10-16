/**
 * Agentic links per section: ensure at least one internal link per H2 and H3 section.
 * Used after content generation so no post is uploaded with zero links when linkable posts exist.
 * Also provides word-based guarantee: at least one link every ~200 words.
 * Minimum links = max(10, ceil(words/200), number of H2+H3 headings) unless headingOnly / minTotalLinks: 0.
 *
 * HTML flow: deterministic insert only — adds <a href> tags without OpenRouter rewrites.
 */

import { extractInternalLinksFromContent } from "@/lib/wordpress-api/validate-internal-links";
import { findPhraseOutsideTags } from "@/lib/overview/overview-blog-links-extract";
import { aiWeaveInternalLinkInSectionHtml } from "@/lib/content-generation/ai-weave-section-internal-link";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import { keepBlogPlayLinkTargets } from "@/lib/bulk/bulk-generation-wp-inventory";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import { normalizeInternalLinkUrl } from "@/lib/content-generation/internal-link-intent-match";
import {
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
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

export interface EnsureLinksPerSectionOptions {
  markdown: string;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
  apiKey: string;
  siteId?: string;
  setProgress?: (opts: { step: string; progress?: number; message?: string }) => void;
}

function blogPlayLinkPool(
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

function getSiteHost(siteUrl: string): string {
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
function buildValidInternalUrlSet(
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

function countInternalLinksInSection(
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
function countInternalLinksInHtml(
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

import { toSentenceCaseLinkAnchor } from "@/lib/content-generation/link-anchor-text-case";

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
const MD_INTERNAL_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/;

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
function splitHtmlIntoWordChunks(html: string, wordsPerChunk: number): string[] {
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
function splitIntoWordChunks(markdown: string, wordsPerChunk: number): string[] {
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
 * Ensures at least one internal link per ~200 words. Chunks with 0 links get one added via AI.
 * Returns updated markdown. Does not mutate input.
 */
export async function ensureLinksEvery200Words(
  options: EnsureLinksPerSectionOptions
): Promise<string> {
  const {
    markdown,
    wordPressPosts,
    currentPageUrl,
    siteUrl,
    apiKey,
    siteId,
    setProgress,
  } = options;

  if (!markdown?.trim() || !wordPressPosts?.length) return markdown;

  const siteHost = getSiteHost(siteUrl);
  const allowedForLinking = blogPlayLinkPool(wordPressPosts, currentPageUrl);
  const validUrls = buildValidInternalUrlSet(allowedForLinking, siteHost);
  if (!allowedForLinking.length) return markdown;

  const chunks = splitIntoWordChunks(markdown, WORDS_PER_LINK_TARGET);
  if (chunks.length === 0) return markdown;

  const linksPayload = allowedForLinking.map((p) => ({ title: p.title, link: p.link }));

  const revisedChunks = chunks.map((chunk, i) => {
    const count = countInternalLinksInSection(chunk, siteHost, validUrls);
    if (count >= 1) return chunk;
    setProgress?.({
      step: "Ensuring links every 200 words",
      message: `Adding internal link to chunk ${i + 1}/${chunks.length}...`,
    });
    const pick = linksPayload[i % linksPayload.length]!;
    return insertOneInternalLinkIntoMarkdown(chunk, pick);
  });

  return revisedChunks.join("\n\n");
}

export interface EnsureLinksEvery200WordsForHtmlOptions {
  htmlContent: string;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
  apiKey: string;
  siteId?: string;
  setProgress?: (opts: { step: string; progress?: number; message?: string }) => void;
}

/**
 * HTML-in/HTML-out: ensures at least one internal link per ~200 words in HTML content.
 * Deterministic: inserts <a> tags only; never rewrites body copy via OpenRouter.
 */
export async function ensureLinksEvery200WordsForHtml(
  options: EnsureLinksEvery200WordsForHtmlOptions
): Promise<string> {
  const { htmlContent, wordPressPosts, currentPageUrl, siteUrl, setProgress } = options;
  if (!htmlContent?.trim() || !wordPressPosts?.length) return htmlContent;

  const siteHost = getSiteHost(siteUrl);
  const allowedForLinking = blogPlayLinkPool(wordPressPosts, currentPageUrl);
  const validUrls = buildValidInternalUrlSet(allowedForLinking, siteHost);
  if (!allowedForLinking.length) return htmlContent;

  const chunks = splitHtmlIntoWordChunks(htmlContent, WORDS_PER_LINK_TARGET);
  if (chunks.length === 0) return htmlContent;

  const linksPayload = allowedForLinking.map((p) => ({ title: p.title, link: p.link }));

  const revisedChunks = chunks.map((chunk, i) => {
    const count = countInternalLinksInHtml(chunk, siteHost, validUrls);
    if (count >= 1) return chunk;
    setProgress?.({
      step: "Ensuring links every 200 words",
      message: `Adding internal link to section ${i + 1}/${chunks.length}...`,
    });
    const pick = linksPayload[i % linksPayload.length]!;
    return insertOneInternalLinkIntoHtml(chunk, pick);
  });

  return revisedChunks.join("");
}

export interface EnsureMinimumLinksInHtmlOptions {
  htmlContent: string;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
  apiKey: string;
  siteId?: string;
  model?: string;
  signal?: AbortSignal;
  setProgress?: (opts: { step: string; progress?: number; message?: string }) => void;
  minTotalLinks?: number;
  /** When true (or minTotalLinks is 0), only backfill eligible H2/H3 sections — no word-count floor. */
  headingOnly?: boolean;
  /** Predetermined AISEO link targets from checklist harness — sectionHints drive URL picks. */
  linkTargetsPlan?: LinkTargetsPlan;
}

function normSectionTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionHeadingPlainTitle(sectionHtml: string): string {
  const match = sectionHtml.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
  return match ? match[1]!.replace(/<[^>]+>/g, "").trim() : "";
}

function postsForIntentWeave(
  pick: { title: string; link: string } | undefined,
  allowedForLinking: WordPressPost[],
): WordPressPost[] {
  if (!pick?.link?.trim()) return [];
  const key = normalizeInternalLinkUrl(pick.link);
  const matched = allowedForLinking.filter((p) => normalizeInternalLinkUrl(p.link) === key);
  return matched.length
    ? matched
    : [{ id: 0, slug: "", title: pick.title, excerpt: "", link: pick.link, date_gmt: "" }];
}

/**
 * Split HTML into sections by H2 and H3 headings. Each section is from one <h2 or <h3 to the next (or end).
 * First element may be intro (content before any H2/H3). Used to ensure at least one link per heading.
 */
function splitHtmlByHeadingSections(html: string): string[] {
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

function isEligibleHeadingSection(sectionHtml: string): boolean {
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

function allPlannedLinksForSection(
  sectionTitle: string,
  plan: LinkTargetsPlan,
): Array<{ title: string; link: string }> {
  const key = normSectionTitleKey(sectionTitle);
  if (!key) return [];

  const picks: Array<{ title: string; link: string }> = [];
  const seen = new Set<string>();
  for (const entry of [...plan.pageTargets, ...plan.blogTargets]) {
    const url = entry.url?.trim();
    if (!url) continue;
    if (!entry.sectionHints.some((hint) => normSectionTitleKey(hint) === key)) continue;
    const urlKey = normalizeInternalLinkUrl(url);
    if (seen.has(urlKey)) continue;
    seen.add(urlKey);
    picks.push({ title: entry.title.trim() || sectionTitle, link: url });
  }
  return picks;
}

function plannedLinksForSection(
  sectionTitle: string,
  plan: LinkTargetsPlan,
  usedUrls: Set<string>,
): Array<{ title: string; link: string }> {
  const key = normSectionTitleKey(sectionTitle);
  if (!key) return [];

  const picks: Array<{ title: string; link: string }> = [];
  for (const entry of [...plan.pageTargets, ...plan.blogTargets]) {
    const url = entry.url?.trim();
    if (!url) continue;
    if (!entry.sectionHints.some((hint) => normSectionTitleKey(hint) === key)) continue;
    const urlKey = normalizeInternalLinkUrl(url);
    if (usedUrls.has(urlKey)) continue;
    picks.push({ title: entry.title.trim() || sectionTitle, link: url });
  }
  return picks;
}

export interface ApplyLinkTargetsPlanDeterministicOptions {
  htmlContent: string;
  linkTargetsPlan: LinkTargetsPlan;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
}

/**
 * One deterministic pass: weave planned page/blog URLs into each body H2 section (prose + tables).
 * No OpenRouter. Ensures at least MIN and up to TARGET internal links per eligible section when inventory allows.
 */
export function applyLinkTargetsPlanToHtmlDeterministic(
  options: ApplyLinkTargetsPlanDeterministicOptions,
): string {
  const { htmlContent, linkTargetsPlan, wordPressPosts, currentPageUrl, siteUrl } = options;
  if (!htmlContent?.trim() || !siteUrl?.trim()) return htmlContent;

  const allowedForLinking = blogPlayLinkPool(wordPressPosts, currentPageUrl);
  if (!allowedForLinking.length) return htmlContent;

  const siteHost = getSiteHost(siteUrl);
  const validUrls = buildValidInternalUrlSet(allowedForLinking, siteHost);

  let currentHtml = htmlContent;
  const headingSections = splitHtmlByHeadingSections(currentHtml);
  let catalogCursor = 0;

  for (let i = 0; i < headingSections.length; i++) {
    let section = headingSections[i]!;
    if (!isEligibleHeadingSection(section)) continue;

    const sectionTitle = sectionHeadingPlainTitle(section);
    if (!sectionTitle.trim()) continue;

    const planned = allPlannedLinksForSection(sectionTitle, linkTargetsPlan).slice(
      0,
      TARGET_INTERNAL_LINKS_PER_BODY_H2,
    );

    const tryInsert = (pick: { title: string; link: string }) => {
      section = insertOneInternalLinkIntoHtml(section, pick);
    };

    for (const pick of planned) {
      tryInsert(pick);
    }

    while (
      countInternalLinksInHtml(section, siteHost, validUrls) < MIN_INTERNAL_LINKS_PER_BODY_H2 &&
      catalogCursor < allowedForLinking.length
    ) {
      const post = allowedForLinking[catalogCursor]!;
      catalogCursor += 1;
      if (!post.link?.trim()) continue;
      tryInsert({ title: post.title, link: post.link });
    }

    while (
      countInternalLinksInHtml(section, siteHost, validUrls) < TARGET_INTERNAL_LINKS_PER_BODY_H2 &&
      catalogCursor < allowedForLinking.length
    ) {
      const post = allowedForLinking[catalogCursor]!;
      catalogCursor += 1;
      if (!post.link?.trim()) continue;
      tryInsert({ title: post.title, link: post.link });
    }

    headingSections[i] = section;
    currentHtml = headingSections.join("");
  }

  return currentHtml;
}

export interface ApplyLinkTargetsPlanToHtmlOptions {
  htmlContent: string;
  linkTargetsPlan: LinkTargetsPlan;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
  apiKey: string;
  siteId?: string;
  model?: string;
  signal?: AbortSignal;
  setProgress?: (opts: { step: string; progress?: number; message?: string }) => void;
}

/**
 * One pass: weave each planned link target into its section via AI.
 * Plan URLs only — no catalog round-robin, no deterministic fallback, no throws.
 */
export async function applyLinkTargetsPlanToHtml(
  options: ApplyLinkTargetsPlanToHtmlOptions,
): Promise<string> {
  const {
    htmlContent,
    linkTargetsPlan,
    wordPressPosts,
    currentPageUrl,
    siteUrl,
    apiKey,
    model,
    signal,
    setProgress,
  } = options;

  if (!htmlContent?.trim() || !apiKey?.trim()) return htmlContent;

  const allowedForLinking = blogPlayLinkPool(wordPressPosts, currentPageUrl);
  if (!allowedForLinking.length) return htmlContent;

  const normPostLink = (link: string): string => {
    try {
      const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
      const u = new URL(
        link.startsWith("http") ? link : link.startsWith("/") ? `${new URL(base).origin}${link}` : `${base}/${link}`,
        base,
      );
      return u.href.toLowerCase().replace(/\/+$/, "");
    } catch {
      return link.trim().toLowerCase().replace(/\/+$/, "");
    }
  };

  let currentHtml = htmlContent;
  const usedUrls = new Set(extractInternalLinksFromContent(currentHtml, siteUrl));
  const headingSections = splitHtmlByHeadingSections(currentHtml);

  for (let i = 0; i < headingSections.length; i++) {
    let section = headingSections[i]!;
    if (!isEligibleHeadingSection(section)) continue;

    const sectionTitle = sectionHeadingPlainTitle(section);
    if (!sectionTitle.trim()) continue;

    const planned = plannedLinksForSection(sectionTitle, linkTargetsPlan, usedUrls).slice(
      0,
      MIN_INTERNAL_LINKS_PER_BODY_H2,
    );

    for (const pick of planned) {
      setProgress?.({
        step: "Weaving planned internal links",
        message: `Section "${sectionTitle}": ${pick.title}`,
      });

      const weavePool = postsForIntentWeave(pick, allowedForLinking);
      section = await aiWeaveInternalLinkInSectionHtml(section, weavePool, {
        apiKey,
        model: model?.trim() || getProductionModel(),
        signal,
      });
      usedUrls.add(normPostLink(pick.link));
    }

    headingSections[i] = section;
    currentHtml = headingSections.join("");
  }

  return currentHtml;
}

/** @deprecated Use applyLinkTargetsPlanToHtml with a link targets plan. */
export async function ensureMinimumLinksInHtml(
  options: EnsureMinimumLinksInHtmlOptions
): Promise<string> {
  if (options.linkTargetsPlan) {
    return applyLinkTargetsPlanToHtml({
      htmlContent: options.htmlContent,
      linkTargetsPlan: options.linkTargetsPlan,
      wordPressPosts: options.wordPressPosts,
      currentPageUrl: options.currentPageUrl,
      siteUrl: options.siteUrl,
      apiKey: options.apiKey,
      siteId: options.siteId,
      model: options.model,
      signal: options.signal,
      setProgress: options.setProgress,
    });
  }
  return options.htmlContent;
}

/**
 * Ensures every H2 section has at least one internal link. Sections with 0 links get one added deterministically.
 * Returns updated markdown. Does not mutate input.
 */
export async function ensureAtLeastOneLinkPerSection(
  options: EnsureLinksPerSectionOptions
): Promise<string> {
  const {
    markdown,
    wordPressPosts,
    currentPageUrl,
    siteUrl,
    setProgress,
  } = options;

  if (!markdown?.trim() || !wordPressPosts?.length) return markdown;

  const siteHost = getSiteHost(siteUrl);
  const allowedForLinking = blogPlayLinkPool(wordPressPosts, currentPageUrl);
  const validUrls = buildValidInternalUrlSet(allowedForLinking, siteHost);
  if (!allowedForLinking.length) return markdown;

  const parts = markdown.split(/^##\s+/m);
  if (parts.length <= 1) return markdown;

  const linksPayload = allowedForLinking.map((p) => ({ title: p.title, link: p.link }));

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw.trim()) continue;
    const count = countInternalLinksInSection(raw, siteHost, validUrls);
    if (count >= 1) continue;

    setProgress?.({
      step: "Ensuring links per section",
      message: `Adding internal link to section ${i + 1}/${parts.length}...`,
    });

    const pick = linksPayload[i % linksPayload.length]!;
    parts[i] = insertOneInternalLinkIntoMarkdown(raw, pick);
  }

  const intro = parts[0];
  const rest = parts.slice(1).map((p) => `## ${p}`);
  return intro + rest.join("");
}

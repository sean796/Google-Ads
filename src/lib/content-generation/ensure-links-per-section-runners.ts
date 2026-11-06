import { extractInternalLinksFromContent } from "@/lib/wordpress-api/validate-internal-links";
import { aiWeaveInternalLinkInSectionHtml } from "@/lib/content-generation/ai-weave-section-internal-link";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import { normalizeInternalLinkUrl } from "@/lib/content-generation/internal-link-intent-match";
import { TARGET_INTERNAL_LINKS_PER_BODY_H2 } from "@/lib/content-generation/link-anchor-text-case";
import {
  blogPlayLinkPool,
  buildValidInternalUrlSet,
  countInternalLinksInHtml,
  countInternalLinksInSection,
  getSiteHost,
  insertOneInternalLinkIntoHtml,
  insertOneInternalLinkIntoMarkdown,
  isEligibleHeadingSection,
  splitHtmlByHeadingSections,
  splitHtmlIntoWordChunks,
  splitIntoWordChunks,
  WORDS_PER_LINK_TARGET,
} from "./ensure-links-per-section-helpers";
import type { WordPressPost } from "./ensure-links-per-section-helpers";

export interface EnsureLinksPerSectionOptions {
  markdown: string;
  wordPressPosts: WordPressPost[];
  currentPageUrl?: string;
  siteUrl: string;
  apiKey: string;
  siteId?: string;
  setProgress?: (opts: { step: string; progress?: number; message?: string }) => void;
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
 * No OpenRouter. Planned links only; no padding to a per-section count.
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
      TARGET_INTERNAL_LINKS_PER_BODY_H2,
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

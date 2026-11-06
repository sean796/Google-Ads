/**
 * Overview scroll-link rules: model writes contextual <ul>; code completes exact # hrefs only.
 */
import type { HarnessSectionAnchorEntry } from "@/lib/bulk/harness-section-anchor-ids";
import { logger } from "@/lib/logger";
import { stripHtmlTagsForSentenceCheck } from "@/lib/bulk/harness-section-complete-sentences";
import { ensureOverviewBulletBoldLabels } from "@/lib/overview/overview-bullet-bold-labels";
import { findPhraseOutsideTags } from "@/lib/overview/overview-blog-links-extract";
import {
  labelFromHashId,
  repairBareHashParenLeaks,
  repairHarnessPlaceholderLeaks,
} from "@/lib/content-generation/harness-link-leak-repair";

export type OverviewAnchorTarget = { id: string; label: string };

const SCROLL_PLACEHOLDER_RE = /\[\[SCROLL:#([^|\]]+)\|([^\]]+)\]\]/gi;
const BOILERPLATE_SCROLL_LINK_RE = /\bsee\s+.+\s+below\b/i;
const SEO_STUB_RE = /\bfits your seo plan\b/i;
const MARKDOWN_HASH_LINK_RE = /\[([^\]]+)\]\(#([^)]+)\)/g;
const HASH_LINK_RE = /<a\b[^>]*href\s*=\s*(["'])#([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi;

/** Parse anchor targets from formatHarnessInPageAnchorBlock output. */
export function parseInPageAnchorsFromBlock(block: string): OverviewAnchorTarget[] {
  const anchors: OverviewAnchorTarget[] = [];
  const bulletRe = /Bullet\s+\d+\s+→\s+#([^\s→]+)\s+→\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = bulletRe.exec(block)) !== null) {
    anchors.push({ id: m[1], label: m[2] });
  }
  const sectionRe = /Section\s+\d+\s+→\s+#([^\s→]+)\s+→\s+"([^"]+)"/g;
  while ((m = sectionRe.exec(block)) !== null) {
    anchors.push({ id: m[1], label: m[2] });
  }
  return anchors;
}

export function anchorsFromHarnessEntries(entries: HarnessSectionAnchorEntry[]): OverviewAnchorTarget[] {
  return entries.map((e) => ({ id: e.anchorId, label: e.displayTitle }));
}

/** Model may use [[SCROLL:#id|phrase]] — code expands to <a href="#id">phrase</a>. */
export function expandOverviewScrollLinkPlaceholders(html: string): string {
  return html.replace(SCROLL_PLACEHOLDER_RE, (_match, rawId, rawText) => {
    const id = String(rawId).trim().replace(/^#/, "");
    const text = String(rawText).trim();
    return `<a href="#${id}">${text}</a>`;
  });
}

/** Expand [[SCROLL:#id|phrase]] to markdown [phrase](#id) before marked. */
export function expandOverviewScrollLinkPlaceholdersInMarkdown(markdown: string): string {
  return markdown.replace(SCROLL_PLACEHOLDER_RE, (_match, rawId, rawText) => {
    const id = String(rawId).trim().replace(/^#/, "");
    const text = String(rawText).trim();
    return `[${text}](#${id})`;
  });
}

export function overviewScrollLinkUsesBoilerplate(liInnerHtml: string): boolean {
  const plain = stripHtmlTagsForSentenceCheck(liInnerHtml);
  return BOILERPLATE_SCROLL_LINK_RE.test(plain) || SEO_STUB_RE.test(plain);
}

function extractStrongLabel(inner: string): string | null {
  const m = inner.match(/<strong>([^<]*)<\/strong>/i);
  return m ? m[1].trim() : null;
}

function findOverviewUlInsertIndex(html: string): number {
  const lower = html.toLowerCase();
  const h2End = lower.indexOf("</h2>");
  if (h2End < 0) return html.trimEnd().length;
  const tail = html.slice(h2End + 5);
  const lastP = tail.toLowerCase().lastIndexOf("</p>");
  if (lastP >= 0) return h2End + 5 + lastP + 4;
  return h2End + 5 + tail.trimEnd().length;
}

function splitOverviewUlParts(html: string): { before: string; liInners: string[]; after: string } {
  const lower = html.toLowerCase();
  const ulOpen = lower.indexOf("<ul");
  if (ulOpen < 0) {
    const insertAt = findOverviewUlInsertIndex(html);
    return {
      before: html.slice(0, insertAt).trimEnd(),
      liInners: [],
      after: html.slice(insertAt).trimStart(),
    };
  }
  const ulClose = lower.indexOf("</ul>", ulOpen);
  if (ulClose < 0) {
    const before = html.slice(0, ulOpen).trimEnd();
    const partialUl = html.slice(ulOpen);
    const liInners = [...partialUl.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
    return { before, liInners, after: "" };
  }
  const before = html.slice(0, ulOpen).trimEnd();
  const ulBlock = html.slice(ulOpen, ulClose + 5);
  const after = html.slice(ulClose + 5).trim();
  const liInners = [...ulBlock.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  return { before, liInners, after };
}

function expandMarkdownHashLinksInHtml(html: string): string {
  return html.replace(MARKDOWN_HASH_LINK_RE, (_match, rawText, rawId) => {
    const id = String(rawId).trim().replace(/^#/, "");
    const text = String(rawText).trim();
    return `<a href="#${id}">${text}</a>`;
  });
}

function overviewHashLinksAreCorrupted(body: string): boolean {
  return /<a\b[^>]*href\s*=\s*["'][^"']*(?:<|&lt;|&quot;)/i.test(body);
}

const REWAVE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "in",
  "is",
  "of",
  "on",
  "or",
  "our",
  "the",
  "to",
  "with",
  "your",
]);

function plainLinkText(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildRewavePhraseCandidates(linkText: string): string[] {
  const candidates: string[] = [];
  const clean = plainLinkText(linkText);
  if (!clean) return candidates;

  candidates.push(clean);
  const words = clean.split(/\s+/).filter(Boolean);
  for (let len = Math.min(4, words.length); len >= 2; len -= 1) {
    for (let start = 0; start <= words.length - len; start += 1) {
      const phrase = words.slice(start, start + len).join(" ");
      if (!candidates.includes(phrase)) candidates.push(phrase);
    }
  }
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    if (word.length >= 3 && !REWAVE_STOP_WORDS.has(word.toLowerCase()) && !candidates.includes(word)) {
      candidates.push(word);
    }
  }
  return candidates;
}

function tryWeaveHashLinkAtPhrase(prose: string, phrase: string, anchorId: string): string | null {
  const hit = findPhraseOutsideTags(prose, phrase);
  if (!hit) return null;
  const actual = prose.slice(hit.start, hit.start + hit.length);
  return (
    prose.slice(0, hit.start) +
    `<a href="#${anchorId}">${actual}</a>` +
    prose.slice(hit.start + hit.length)
  );
}

function moveAppendedHashLinkBeforePunctuation(
  prose: string,
  punct: string,
  anchorId: string,
  linkText: string,
): string {
  return `${prose.trimEnd()} <a href="#${anchorId}">${linkText}</a>${punct}`;
}

/** Move a period-then-link append into the sentence when the anchor phrase exists in prose. */
export function rewaveAppendedOverviewHashLink(body: string, anchorId: string): string {
  const trimmed = body.trim();

  const periodAppendedRe =
    /^([\s\S]+?)([.!?])\s*<a\b[^>]*href\s*=\s*(["'])#([^"']*)\3[^>]*>([\s\S]*?)<\/a>\s*$/i;
  const periodMatch = trimmed.match(periodAppendedRe);
  if (periodMatch) {
    const prose = periodMatch[1]!;
    const punct = periodMatch[2]!;
    const linkText = plainLinkText(periodMatch[5] ?? "");
    if (linkText) {
      for (const phrase of buildRewavePhraseCandidates(linkText)) {
        const woven = tryWeaveHashLinkAtPhrase(prose, phrase, anchorId);
        if (woven) return `${woven}${punct}`;
      }
      return moveAppendedHashLinkBeforePunctuation(prose, punct, anchorId, linkText);
    }
  }

  const bareAppendedRe =
    /^([\s\S]+?)\s*<a\b[^>]*href\s*=\s*(["'])#([^"']*)\2[^>]*>([\s\S]*?)<\/a>\s*$/i;
  const bareMatch = trimmed.match(bareAppendedRe);
  if (bareMatch) {
    const prose = bareMatch[1]!.trimEnd();
    const linkText = plainLinkText(bareMatch[4] ?? "");
    if (prose && linkText) {
      for (const phrase of buildRewavePhraseCandidates(linkText)) {
        const woven = tryWeaveHashLinkAtPhrase(prose, phrase, anchorId);
        if (woven) return woven;
      }
      if (/[.!?]\s*$/.test(prose)) {
        const punct = prose.match(/([.!?])\s*$/)?.[1] ?? ".";
        const proseNoPunct = prose.replace(/[.!?]\s*$/, "").trimEnd();
        return moveAppendedHashLinkBeforePunctuation(proseNoPunct, punct, anchorId, linkText);
      }
      return moveAppendedHashLinkBeforePunctuation(prose, ".", anchorId, linkText);
    }
  }

  return body;
}

export function overviewBulletsHaveRequiredScrollLinks(
  html: string,
  anchors: OverviewAnchorTarget[] | HarnessSectionAnchorEntry[],
): boolean {
  const targets: OverviewAnchorTarget[] =
    anchors.length > 0 && "anchorId" in anchors[0]!
      ? anchorsFromHarnessEntries(anchors as HarnessSectionAnchorEntry[])
      : (anchors as OverviewAnchorTarget[]);
  if (targets.length === 0) return true;

  const { liInners } = splitOverviewUlParts(expandMarkdownHashLinksInHtml(html));
  if (liInners.length < targets.length) return false;

  for (let i = 0; i < targets.length; i += 1) {
    const id = targets[i]!.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`href\\s*=\\s*(["'])#${id}\\1`, "i").test(liInners[i] ?? "")) {
      return false;
    }
  }
  return true;
}

function normalizeOverviewBulletHashLinks(
  body: string,
  anchorId: string,
): { body: string; hadHashLink: boolean } {
  let hadHashLink = false;
  let keepFirst = true;
  const normalized = body.replace(HASH_LINK_RE, (_full, _quote, _id, text) => {
    hadHashLink = true;
    if (keepFirst) {
      keepFirst = false;
      return `<a href="#${anchorId}">${String(text).trim()}</a>`;
    }
    return String(text).trim();
  });
  return {
    body: normalized.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim(),
    hadHashLink,
  };
}

function deriveOverviewBulletLabel(anchor: OverviewAnchorTarget, inner: string): string {
  const fromStrong = extractStrongLabel(inner);
  if (fromStrong) return fromStrong;
  const plain = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const colonAt = plain.indexOf(":");
  if (colonAt > 0) return plain.slice(0, colonAt).trim();
  const words = anchor.label.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || "Topic";
}

/** Unwrap same-site http(s) links; keep hash scroll links for phrase extraction. */
function stripInternalLinksFromOverviewBulletBody(inner: string): string {
  return inner.replace(/<a\b[^>]*href\s*=\s*(["'])(?!#)[^"']*\1[^>]*>([\s\S]*?)<\/a>/gi, "$2");
}

function warnOverviewBulletScrollLink(body: string, anchor: OverviewAnchorTarget, index: number): void {
  const idPattern = anchor.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`href\\s*=\\s*(["'])#${idPattern}\\1`, "i").test(body)) {
    logger.warn(
      `[Overview scroll links] bullet ${index + 1} for "${anchor.label}" (#${anchor.id}) missing expected hash link — shipping model output as-is`,
    );
  }
}

function passthroughOverviewScrollLi(inner: string): string {
  const trimmed = inner.trim();
  return trimmed.startsWith("<li") ? trimmed : `<li>${trimmed}</li>`;
}

function finalizeOverviewScrollLi(
  existingInner: string | undefined,
  anchor: OverviewAnchorTarget,
  index: number,
): string {
  if (!existingInner?.trim()) {
    logger.warn(
      `[Overview scroll links] bullet ${index + 1} for "${anchor.label}" (#${anchor.id}) is missing — skipping`,
    );
    return "";
  }

  let inner = existingInner.trim();
  const passthrough = () => passthroughOverviewScrollLi(inner);

  if (overviewScrollLinkUsesBoilerplate(inner)) {
    logger.warn(
      `[Overview scroll links] bullet ${index + 1} for "${anchor.label}" uses forbidden boilerplate — shipping as-is`,
    );
    return passthrough();
  }

  inner = expandOverviewScrollLinkPlaceholders(inner);
  inner = expandMarkdownHashLinksInHtml(inner);
  inner = repairHarnessPlaceholderLeaks(inner);
  inner = stripInternalLinksFromOverviewBulletBody(inner);

  const labelById = new Map<string, string>([[anchor.id.toLowerCase(), anchor.label.trim()]]);
  inner = repairBareHashParenLeaks(inner, labelById);

  const label = deriveOverviewBulletLabel(anchor, inner);
  let body = inner.replace(/^\s*<strong>[^<]*<\/strong>:?\s*/i, "").trim();

  if (overviewHashLinksAreCorrupted(body)) {
    logger.warn(
      `[Overview scroll links] bullet ${index + 1} for "${anchor.label}" has corrupted anchor markup — shipping as-is`,
    );
    return passthrough();
  }

  let normalized = normalizeOverviewBulletHashLinks(body, anchor.id);
  body = normalized.body;
  if (!normalized.hadHashLink) {
    body = repairBareHashParenLeaks(body, labelById);
    normalized = normalizeOverviewBulletHashLinks(body, anchor.id);
    body = normalized.body;
  }
  if (!normalized.hadHashLink) {
    const fallbackText = labelFromHashId(anchor.id);
    const id = anchor.id.replace(/^#/, "");
    body = `${body.replace(/\.\s*$/, "").trim()} <a href="#${id}">${fallbackText}</a>.`.replace(
      /\s+/g,
      " ",
    );
  }

  body = rewaveAppendedOverviewHashLink(body, anchor.id);
  warnOverviewBulletScrollLink(body, anchor, index);

  return `<li><strong>${label}</strong>: ${body.replace(/\s+/g, " ").trim()}</li>`;
}

/**
 * Model writes contextual overview prose and bullets; code completes exact # hrefs on existing bullets only.
 */
export function completeOverviewScrollLinks(
  html: string,
  anchors: OverviewAnchorTarget[] | HarnessSectionAnchorEntry[],
): string {
  const targets: OverviewAnchorTarget[] =
    anchors.length > 0 && "anchorId" in anchors[0]!
      ? anchorsFromHarnessEntries(anchors as HarnessSectionAnchorEntry[])
      : (anchors as OverviewAnchorTarget[]);

  if (targets.length === 0) return html.trim();

  const prepared = expandOverviewScrollLinkPlaceholders(expandMarkdownHashLinksInHtml(html));
  const { before, liInners, after } = splitOverviewUlParts(prepared);

  if (liInners.length < targets.length) {
    logger.warn(
      `[Overview scroll links] expected ${targets.length} model-written bullets, found ${liInners.length} — processing available bullets only`,
    );
  }

  if (liInners.length === 0) {
    return ensureOverviewBulletBoldLabels(prepared.trim());
  }

  const pairCount = Math.min(liInners.length, targets.length);
  const fixedLis: string[] = [];
  for (let i = 0; i < pairCount; i++) {
    const li = finalizeOverviewScrollLi(liInners[i], targets[i]!, i);
    if (li) fixedLis.push(li);
  }
  for (let i = pairCount; i < liInners.length; i++) {
    fixedLis.push(passthroughOverviewScrollLi(liInners[i]!));
  }

  if (fixedLis.length === 0) {
    return ensureOverviewBulletBoldLabels(prepared.trim());
  }

  const newUl = `<ul>\n${fixedLis.join("\n")}\n</ul>`;
  const merged = after ? `${before}\n${newUl}\n${after}` : `${before}\n${newUl}`;
  return ensureOverviewBulletBoldLabels(merged.trim());
}

/** @deprecated Use completeOverviewScrollLinks */
export function enforceOverviewScrollLinkHrefs(html: string, anchors: OverviewAnchorTarget[]): string {
  return completeOverviewScrollLinks(html, anchors);
}

export function buildOverviewLinkRulesBlock(opts?: {
  entity?: string;
  wikipediaUrl?: string;
  hasIllustrativeAnchor?: boolean;
}): string {
  const entity = opts?.entity?.trim() ?? "";
  const wikipediaUrl = opts?.wikipediaUrl?.trim() ?? "";
  const hasEntityWiki =
    Boolean(entity) && entity !== "N/A" && Boolean(wikipediaUrl);

  const base =
    "Overview rules: (1) Lead with what remaining sections cover. Do not answer the article question again. Forbidden: restating Answer's dates, rates, percentages, dollar figures, statute-name stack, or closing company sentence. Do not open with \"{keyword} offers/are/provide\" or \"This article/guide provides\". Do not weave Answer's headline cost/ROI figure into the Overview lead. (2) Lead paragraphs = plain prose only (optional entity Wikipedia in first paragraph when required). NO em dashes (Unicode U+2014 or U+2013) anywhere in Overview; use comma, period, or hyphen. Obey WORD BLACKLIST in system and user prompts. " +
    "(3) Mandatory <ul><li> bullet list after lead paragraphs (HTML harness: never markdown * bullets): exactly one item per IN-PAGE anchor, in order. " +
    "(4) Each bullet starts <strong>2-3 word label</strong>: then one short contextual sentence with exactly ONE <a href=\"#exact-id\">2-4 word phrase</a> woven in. " +
    "(5) Anchor text MUST be a natural keyword phrase from the sentence (2-4 words) in **sentence case** (lowercase generic words; capitalize brand names only). NEVER use the full Title Case H2 as link text. NEVER append the link after the final period. " +
    "(6) FORBIDDEN per bullet: two links, duplicate #id links, bullet-label echo links, period-then-link append, \"including [link]\" phrasing, \"See how\", or \"fits your SEO plan\". " +
    '(7) FORBIDDEN: "see below", "below", "click here", SEO-stub templates. (8) Stop after </ul>.';

  const illustrativeRule = opts?.hasIllustrativeAnchor
    ? " (9) Real-World Example (mandatory when IN-PAGE ANCHORS tags ILLUSTRATIVE): second lead paragraph must state the article includes a labeled real-world hypothetical (one genderless named persona with a site-level business recommendation) without pasting the full scenario. Exactly one bullet MUST use label **Real-World Example** (exact words) with one # link to the ILLUSTRATIVE anchor id. Forbidden: Section N labels, Second Example, or a second homeowner or example bullet."
    : "";

  if (hasEntityWiki) {
    return (
      `\nOverview LINKS: ${base}${illustrativeRule} ` +
      `Optional entity Wikipedia in lead prose only: [${entity}](${wikipediaUrl}). ` +
      `No other http(s) URLs.\n`
    );
  }

  return `\nOverview LINKS: ${base}${illustrativeRule} No links in lead prose unless entity Wikipedia is required. No http(s) URLs.\n`;
}

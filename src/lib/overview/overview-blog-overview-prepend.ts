/**
 * Content Optimizer: generate AI Overview HTML and prepend it to existing post body.
 * Stages on the grid; WordPress write happens via Upload (same as Headers/Links).
 */

import type { AgentConfig } from "@/types/agent-config";
import {
  BLOG_HARNESS_SUMMARY_TITLE,
  buildBlogHarnessSummaryAgent,
  isBlogHarnessSummaryAgent,
} from "@/lib/bulk/blog-harness-summary-agent";
import {
  BLOG_HARNESS_ANSWER_TITLE,
  buildBlogHarnessAnswerAgent,
  HARNESS_ANSWER_ANCHOR_ID,
  isBlogHarnessAnswerAgent,
} from "@/lib/bulk/blog-harness-answer-agent";
import { ensureOverviewBulletBoldLabels } from "@/lib/overview/overview-bullet-bold-labels";
import { applyOverviewHarnessScrollLinks } from "@/lib/overview/overview-harness-scroll-links";
import {
  completeOverviewScrollLinks,
  overviewBulletsHaveRequiredScrollLinks,
} from "@/lib/prompt-builders/overview-link-rules";
import {
  FLO_OVERVIEW_CLASS,
  wrapOverviewSectionHtml,
} from "@/lib/overview/wrap-overview-section-html";
import {
  formatOutlineTitlesForHarnessPrompt,
  stitchHarnessSections,
  type BulkHarnessOutlineSection,
} from "@/lib/bulk/bulk-harness-outline";
import {
  buildHarnessSectionAnchorMap,
  formatHarnessInPageAnchorBlock,
  HARNESS_OVERVIEW_ANCHOR_ID,
  injectHarnessSectionH2AnchorId,
  type HarnessSectionAnchorEntry,
} from "@/lib/bulk/harness-section-anchor-ids";
import { ensureHarnessSectionLengthCompliance } from "@/lib/bulk/harness-section-length-agent";
import {
  harnessSectionPreparedValid,
  prepareHarnessSectionHtml,
} from "@/lib/bulk/harness-section-validate";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import {
  extractH2TextsFromHtml,
  plainTextFromH2InnerHtml,
} from "@/lib/overview/overview-blog-headers-extract";
import { generateSingleSectionPrompt } from "@/lib/prompt-builders/core";
import { buildBulkHarnessSectionUserPrompt } from "@/lib/prompt-builders/system-user";
import {
  llmAuditSummaryFromSeoResearchBrief,
  parseSeoResearchBrief,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";
import {
  buildConnectedSiteIdentityBlock,
  firstPartyAuthorityBlockFromBrief,
  PRIMARY_CITY_CONSISTENCY_RULE,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { resolveSiteLocationLabel } from "@/lib/llm-audit/resolve-site-location-label";
import { formatAnswerGroundingForIllustrativePromptBlock } from "@/lib/content-optimization/defensible-specificity-prompt";
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from "@/lib/content-optimization/page-local-context";
import type { WordPressSite } from "@/components/integrations/types";
import { formatEntityReferencePromptBlock } from "@/lib/entity-place-reference";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  formatAnswerMoneyPageLinksPromptBlock,
  rankFuzzyMoneyPageLinksForAnswer,
  resolveSitemapFuzzyLinkPool,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";

export type OverviewHarnessPageKind = "post" | "entity";

function harnessPageKindLabel(pageKind: OverviewHarnessPageKind | undefined): string {
  return pageKind === "entity" ? "service-area entity page" : "page";
}

function appendHarnessBriefGroundingToPrompt(userPrompt: string, seoResearchBrief?: string): string {
  const raw = seoResearchBrief?.trim();
  if (!raw) return userPrompt;
  const brief = parseSeoResearchBrief(raw);
  if (!brief) return userPrompt;
  const llmAuditSummary = llmAuditSummaryFromSeoResearchBrief(raw);
  const firstPartyAuthorityBlock = firstPartyAuthorityBlockFromBrief(brief, "");
  const parts = [userPrompt];
  if (llmAuditSummary) {
    parts.push(`\n\n--- SEO RESEARCH (LLM audit facts) ---\n${llmAuditSummary}`);
  }
  if (firstPartyAuthorityBlock?.trim()) {
    parts.push(`\n\n${firstPartyAuthorityBlock.trim()}`);
  }
  return parts.join("");
}

function entityHarnessPromptAddendum(
  entity: string | undefined,
  connectedSite: { name: string; siteUrl: string } | undefined,
  keyword?: string,
): string {
  const place = entity?.trim();
  const company = connectedSite?.name?.trim();
  if (!place && !company) return "";
  const canonical = place ? normalizeEntityHintCommaLabel(place) : "";
  const referenceBlock = canonical
    ? formatEntityReferencePromptBlock({
        entity: canonical,
        keyword: keyword?.trim() || undefined,
      })
    : "";
  const lines = ["*** ENTITY PAGE (SAP) ***"];
  if (canonical) lines.push(`Place entity: ${canonical}`);
  if (company) lines.push(`Connected business: ${company}`);
  lines.push("Write for a near-me local entity landing page; name the place with comma grammar from the entity block above.");
  const body = [lines.join("\n"), referenceBlock].filter(Boolean).join("\n\n");
  return `\n\n${body}`;
}

function isTagBoundaryChar(ch: string | undefined): boolean {
  if (!ch || ch.length === 0) return true;
  const c = ch.charCodeAt(0);
  if (c <= 32) return true;
  return ch === "/" || ch === ">";
}

/** Document-order start indices of every `<h2` or `<h3` open tag. */
export function findH2OpenPositions(html: string): number[] {
  return findHeadingOpenPositions(html, [2]);
}

function findHeadingOpenPositions(html: string, levels: number[]): number[] {
  const low = html.toLowerCase();
  const out: number[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    let matched = false;
    for (const level of levels) {
      const tag = `h${level}`;
      if (low.startsWith(`<${tag}`, lt) && isTagBoundaryChar(html[lt + tag.length + 1])) {
        out.push(lt);
        matched = true;
        break;
      }
    }
    i = matched ? lt + 1 : lt + 1;
  }
  return out;
}

function headingLevelAt(html: string, openAt: number): 2 | 3 | null {
  const low = html.toLowerCase();
  if (low.startsWith("<h2", openAt) && isTagBoundaryChar(html[openAt + 3])) return 2;
  if (low.startsWith("<h3", openAt) && isTagBoundaryChar(html[openAt + 3])) return 3;
  return null;
}

function plainInnerFromHeadingOpen(html: string, openAt: number): string {
  const level = headingLevelAt(html, openAt);
  if (!level) return "";
  const closeTag = `</h${level}>`;
  const gt = html.indexOf(">", openAt);
  if (gt < 0) return "";
  const close = html.toLowerCase().indexOf(closeTag, gt + 1);
  const inner = close < 0 ? html.slice(gt + 1) : html.slice(gt + 1, close);
  let out = "";
  let inTag = false;
  for (const ch of inner) {
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** @deprecated Prefer plainInnerFromHeadingOpen — kept for H2-only call sites. */
function plainInnerFromH2Open(html: string, openAt: number): string {
  return plainInnerFromHeadingOpen(html, openAt);
}

function headingOpenHasOverviewId(html: string, openAt: number): boolean {
  const gt = html.indexOf(">", openAt);
  if (gt < 0) return false;
  const openTag = html.slice(openAt, gt).toLowerCase();
  const needle = `id="${HARNESS_OVERVIEW_ANCHOR_ID}"`;
  const needle2 = `id='${HARNESS_OVERVIEW_ANCHOR_ID}'`;
  return openTag.includes(needle) || openTag.includes(needle2);
}

function normalizeOverviewTitleKey(title: string): string {
  return (title ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[:\u2013\u2014-]+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function headingTagLevelAt(html: string, openAt: number): 1 | 2 | null {
  const low = html.toLowerCase();
  if (low.startsWith("<h1", openAt) && isTagBoundaryChar(html[openAt + 3])) return 1;
  if (low.startsWith("<h2", openAt) && isTagBoundaryChar(html[openAt + 3])) return 2;
  return null;
}

function plainInnerFromTitleHeadingOpen(html: string, openAt: number): string {
  const level = headingTagLevelAt(html, openAt);
  if (!level) return "";
  const closeTag = `</h${level}>`;
  const gt = html.indexOf(">", openAt);
  if (gt < 0) return "";
  const close = html.toLowerCase().indexOf(closeTag, gt + 1);
  const inner = close < 0 ? html.slice(gt + 1) : html.slice(gt + 1, close);
  return plainTextFromH2InnerHtml(inner);
}

/**
 * Drop leading H1/H2 when it repeats the WordPress post title (theme already shows it).
 */
export function stripLeadingDuplicateArticleTitleHeading(
  html: string,
  articleTitle: string,
): string {
  const titleKey = normalizeOverviewTitleKey(articleTitle);
  if (!titleKey) return (html ?? "").trim();

  let src = (html ?? "").trim();
  for (let guard = 0; guard < 5; guard += 1) {
    const trimmed = src.trimStart();
    const skip = src.length - trimmed.length;
    const openAt = skip;
    const level = headingTagLevelAt(trimmed, 0);
    if (level == null) break;

    const headingText = plainInnerFromTitleHeadingOpen(trimmed, 0);
    if (normalizeOverviewTitleKey(headingText) !== titleKey) break;

    const closeTag = `</h${level}>`;
    const gt = trimmed.indexOf(">");
    const close = trimmed.toLowerCase().indexOf(closeTag, gt + 1);
    if (close < 0) break;
    src = trimmed.slice(close + closeTag.length).trim();
  }
  return src;
}

function isAnswerHeadingTitle(title: string): boolean {
  const key = normalizeOverviewTitleKey(title);
  if (!key) return false;
  if (isBlogHarnessAnswerAgent({ id: "", title: key })) return true;
  if (key === "direct answer" || key === "the answer" || key === "quick answer") return true;
  if (key.startsWith("answer ") || key.startsWith("direct answer ")) return true;
  return false;
}

function headingOpenHasAnswerId(html: string, openAt: number): boolean {
  const gt = html.indexOf(">", openAt);
  if (gt < 0) return false;
  const openTag = html.slice(openAt, gt).toLowerCase();
  const needle = `id="${HARNESS_ANSWER_ANCHOR_ID}"`;
  const needle2 = `id='${HARNESS_ANSWER_ANCHOR_ID}'`;
  return openTag.includes(needle) || openTag.includes(needle2);
}

function isAnswerHeadingAt(html: string, openAt: number): boolean {
  if (headingOpenHasAnswerId(html, openAt)) return true;
  return isAnswerHeadingTitle(plainInnerFromHeadingOpen(html, openAt));
}

function answerSectionEndAt(html: string, openAt: number): number {
  const positions = findHeadingOpenPositions(html, [2, 3]);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i]! <= openAt) continue;
    return positions[i]!;
  }
  return html.length;
}

/** True when HTML is only an Answer harness block with no remaining post body. */
export function isAnswerOnlyHarnessBody(html: string): boolean {
  const src = (html ?? "").trim();
  if (!src) return false;
  if (!extractAnswerSectionHtml(src).trim()) return false;
  return !stripLeadingAnswerSection(src).trim();
}

/** Remove leading Answer H2 blocks (through the next H2) before Overview re-runs. */
export function stripLeadingAnswerSection(html: string): string {
  let src = (html ?? "").trim();
  if (!src) return src;

  for (let guard = 0; guard < 20; guard += 1) {
    const positions = findHeadingOpenPositions(src, [2, 3]);
    let removed = false;
    for (let i = 0; i < positions.length; i += 1) {
      const openAt = positions[i]!;
      if (!isAnswerHeadingAt(src, openAt)) continue;
      const end = answerSectionEndAt(src, openAt);
      src = `${src.slice(0, openAt)}${src.slice(end)}`.trim();
      removed = true;
      break;
    }
    if (!removed) break;
  }
  return src;
}

function isOverviewHeadingTitle(title: string): boolean {
  const key = normalizeOverviewTitleKey(title);
  if (!key) return false;
  if (isBlogHarnessSummaryAgent({ id: "", title: key })) return true;
  if (key === "aio" || key === "ai-overview" || key === "ai overview") return true;
  if (key.startsWith("overview ") || key.startsWith("ai overview")) return true;
  return false;
}

function isOverviewHeadingAt(html: string, openAt: number): boolean {
  if (headingOpenHasOverviewId(html, openAt)) return true;
  return isOverviewHeadingTitle(plainInnerFromHeadingOpen(html, openAt));
}

/**
 * End of an Overview block: next H2/H3, or end of document.
 * Uses H2+H3 so an Overview H3 still ends before the next body H2.
 */
function overviewSectionEndAt(html: string, openAt: number): number {
  const positions = findHeadingOpenPositions(html, [2, 3]);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i]! <= openAt) continue;
    return positions[i]!;
  }
  return html.length;
}

/**
 * If Overview sits inside `<div class="flo-overview">…</div>`, start at that open tag
 * so strip/extract do not leave a dangling wrapper.
 */
function overviewBlockStartAt(html: string, headingOpenAt: number): number {
  let i = headingOpenAt;
  while (i > 0) {
    const ch = html[i - 1]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i -= 1;
      continue;
    }
    break;
  }
  if (i <= 0 || html[i - 1] !== ">") return headingOpenAt;
  const lt = html.lastIndexOf("<", i - 1);
  if (lt < 0) return headingOpenAt;
  const openTag = html.slice(lt, i).toLowerCase();
  const classNeedle = `class="${FLO_OVERVIEW_CLASS}"`;
  const classNeedle2 = `class='${FLO_OVERVIEW_CLASS}'`;
  if (
    openTag.startsWith("<div") &&
    (openTag.includes(classNeedle) || openTag.includes(classNeedle2))
  ) {
    return lt;
  }
  return headingOpenAt;
}

function overviewBlockBounds(
  html: string,
  headingOpenAt: number,
): { start: number; end: number } {
  return {
    start: overviewBlockStartAt(html, headingOpenAt),
    end: overviewSectionEndAt(html, headingOpenAt),
  };
}

/**
 * Remove every Overview / Summary / AI Overview / AIO H2 or H3 section so re-runs
 * replace instead of stacking. Loops until none remain.
 */
export function stripLeadingOverviewSection(html: string): string {
  let src = (html ?? "").trim();
  if (!src) return src;

  for (let guard = 0; guard < 20; guard += 1) {
    const positions = findHeadingOpenPositions(src, [2, 3]);
    let removed = false;
    for (let i = 0; i < positions.length; i += 1) {
      const openAt = positions[i]!;
      if (!isOverviewHeadingAt(src, openAt)) continue;
      const { start, end } = overviewBlockBounds(src, openAt);
      src = `${src.slice(0, start)}${src.slice(end)}`.trim();
      removed = true;
      break;
    }
    if (!removed) break;
  }
  return src;
}

/**
 * Keep the first Overview/AIO block; strip any later Overview sections (stacked re-runs).
 */
export function dedupeStackedOverviewSections(html: string): string {
  const src = (html ?? "").trim();
  if (!src) return src;
  const positions = findHeadingOpenPositions(src, [2, 3]);
  let firstOverviewStart = -1;
  let firstOverviewEnd = -1;
  for (const openAt of positions) {
    if (!isOverviewHeadingAt(src, openAt)) continue;
    const bounds = overviewBlockBounds(src, openAt);
    firstOverviewStart = bounds.start;
    firstOverviewEnd = bounds.end;
    break;
  }
  if (firstOverviewStart < 0) return src;

  const keptOverview = src.slice(firstOverviewStart, firstOverviewEnd);
  const withoutAll = stripLeadingOverviewSection(src);
  return enforceHarnessAnswerBeforeOverview(`${keptOverview}${withoutAll}`.trim());
}

/** Build a harness-shaped outline from body H2 titles (no Overview agent). */
export function outlineFromBodyH2Titles(titles: string[]): BulkHarnessOutlineSection[] {
  return titles.map((title, index) => {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error(`Overview outline contract failed: empty body H2 at index ${index}`);
    }
    const agent: AgentConfig = {
      id: `body-h2-${index + 1}`,
      step: index + 1,
      title: trimmed,
      description: "",
      features: [],
      headingLevel: 1,
    };
    return {
      index,
      title: trimmed,
      displayTitle: trimmed,
      description: "",
      headingLevel: 1,
      isFaq: false,
      agent,
    };
  });
}

/**
 * Inject planned #ids onto each body `<h2>` in document order (works from the end
 * so earlier offsets stay valid).
 */
export function injectBodyH2AnchorIds(
  html: string,
  map: HarnessSectionAnchorEntry[],
): string {
  const positions = findH2OpenPositions(html);
  if (!positions.length || !map.length) return html;

  let result = html;
  for (let i = Math.min(positions.length, map.length) - 1; i >= 0; i--) {
    const openAt = positions[i]!;
    const anchorId = map[i]?.anchorId;
    if (!anchorId) continue;
    const before = result.slice(0, openAt);
    const from = result.slice(openAt);
    result = before + injectHarnessSectionH2AnchorId(from, anchorId);
  }
  return result;
}

/**
 * Bulk harness stitch: first `<h2>` is Answer (when present), then Overview, then body anchor ids.
 */
export function injectHarnessH2AnchorIdsForStitchedBlog(
  html: string,
  bodyAnchors: HarnessSectionAnchorEntry[],
): string {
  let result = html;
  let bodyAnchorIndex = 0;
  let i = 0;

  while (i < 64) {
    const positions = findH2OpenPositions(result);
    const openAt = positions[i];
    if (openAt == null) break;

    if (isAnswerHeadingAt(result, openAt)) {
      result =
        result.slice(0, openAt) +
        injectHarnessSectionH2AnchorId(result.slice(openAt), HARNESS_ANSWER_ANCHOR_ID);
      i += 1;
      continue;
    }
    if (isOverviewHeadingAt(result, openAt)) {
      result =
        result.slice(0, openAt) +
        injectHarnessSectionH2AnchorId(result.slice(openAt), HARNESS_OVERVIEW_ANCHOR_ID);
      i += 1;
      continue;
    }
    const anchorId = bodyAnchors[bodyAnchorIndex]?.anchorId;
    bodyAnchorIndex += 1;
    if (anchorId) {
      result =
        result.slice(0, openAt) +
        injectHarnessSectionH2AnchorId(result.slice(openAt), anchorId);
    }
    i += 1;
  }
  return result;
}

export function resolveOverviewSourceHtml(row: {
  postContentOptimized?: string;
  postContent?: string;
}, fetchedHtml?: string): string {
  return (
    row.postContentOptimized?.trim() ||
    row.postContent?.trim() ||
    fetchedHtml?.trim() ||
    ""
  );
}

/** Existing post body for Answer/Overview prepend — scraped content first, not prior harness output. */
export function resolveHarnessPrependSourceHtml(row: {
  postContent?: string;
  postContentOptimized?: string;
}, fetchedHtml?: string): string {
  return (
    row.postContent?.trim() ||
    fetchedHtml?.trim() ||
    row.postContentOptimized?.trim() ||
    ""
  );
}

/** Reject Cloudflare / full-document challenge pages mistakenly used as post body. */
export function looksLikeBlockedHostHtml(html: string): boolean {
  const raw = (html ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.includes("attention required") && lower.includes("cloudflare")) return true;
  if (lower.includes("just a moment") && lower.includes("cloudflare")) return true;
  if (lower.includes("_cf_chl_opt") || lower.includes("cf-browser-verification")) return true;
  if (lower.startsWith("<!doctype html") && lower.includes("cloudflare")) return true;
  return false;
}

/** Slice the Answer H2/H3 block (through the next H2/H3) for row preview. */
export function extractAnswerSectionHtml(html: string): string {
  const src = (html ?? "").trim();
  if (!src) return "";
  const positions = findHeadingOpenPositions(src, [2, 3]);
  for (let i = 0; i < positions.length; i++) {
    const openAt = positions[i]!;
    if (!isAnswerHeadingAt(src, openAt)) continue;
    const end = answerSectionEndAt(src, openAt);
    return src.slice(openAt, end).trim();
  }
  return "";
}

/** Slice the Overview H2/H3 block (through the next heading) for row preview. */
export function extractOverviewSectionHtml(html: string): string {
  const src = (html ?? "").trim();
  if (!src) return "";
  const positions = findHeadingOpenPositions(src, [2, 3]);
  for (let i = 0; i < positions.length; i++) {
    const openAt = positions[i]!;
    if (!isOverviewHeadingAt(src, openAt)) continue;
    const { start, end } = overviewBlockBounds(src, openAt);
    return src.slice(start, end).trim();
  }
  return "";
}

function firstAnswerH2OpenAt(html: string): number {
  for (const openAt of findH2OpenPositions(html)) {
    if (isAnswerHeadingAt(html, openAt)) return openAt;
  }
  return -1;
}

function firstOverviewBlockStartAt(html: string): number {
  for (const openAt of findHeadingOpenPositions(html, [2, 3])) {
    if (isOverviewHeadingAt(html, openAt)) return overviewBlockStartAt(html, openAt);
  }
  return -1;
}

/**
 * Answer must always precede Overview in published harness HTML.
 * Re-stitches when document order is reversed (no-op when already correct).
 */
export function enforceHarnessAnswerBeforeOverview(html: string): string {
  const src = (html ?? "").trim();
  if (!src) return src;

  const answerSection = extractAnswerSectionHtml(src);
  const overviewSection = extractOverviewSectionHtml(src);
  if (!answerSection.trim() || !overviewSection.trim()) return src;

  const answerAt = firstAnswerH2OpenAt(src);
  const overviewAt = firstOverviewBlockStartAt(src);
  if (answerAt < 0 || overviewAt < 0 || answerAt < overviewAt) return src;

  const bodyOnly = stripLeadingOverviewSection(stripLeadingAnswerSection(src));
  const pieces = [answerSection, overviewSection, bodyOnly].filter((part) => part.trim());
  return stitchHarnessSections(pieces);
}

export type PrependOverviewResult = {
  html: string;
  bodyH2Titles: string[];
  anchorMap: HarnessSectionAnchorEntry[];
};

/**
 * Pure stitch path used by tests: strip Overview, inject body ids, prepend Overview HTML.
 */
export function stitchOverviewOntoBody(args: {
  sourceHtml: string;
  overviewHtml: string;
  answerHtml?: string;
}): PrependOverviewResult {
  const stripped = stripLeadingOverviewSection(stripLeadingAnswerSection(args.sourceHtml));
  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  const outline = outlineFromBodyH2Titles(bodyH2Titles);
  const anchorMap = buildHarnessSectionAnchorMap(outline);
  const bodyWithIds = injectBodyH2AnchorIds(stripped, anchorMap);
  const overviewWithId = wrapOverviewSectionHtml(
    injectHarnessSectionH2AnchorId(
      args.overviewHtml.trim(),
      HARNESS_OVERVIEW_ANCHOR_ID,
    ),
  );
  const pieces: string[] = [];
  if (args.answerHtml?.trim()) {
    pieces.push(
      injectHarnessSectionH2AnchorId(args.answerHtml.trim(), HARNESS_ANSWER_ANCHOR_ID),
    );
  }
  pieces.push(overviewWithId, bodyWithIds);
  return {
    html: stitchHarnessSections(pieces),
    bodyH2Titles,
    anchorMap,
  };
}

export type GenerateAnswerSectionArgs = {
  articleTitle: string;
  focusKeyword: string;
  bodyH2Titles: string[];
  includeOverviewInOutline?: boolean;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  previousAnswerHtml?: string;
  moneyPageCandidates?: SitemapFuzzyLinkCandidate[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
};

/** Generate the Answer section HTML. One write. No retries, no name checks. */
export async function generateAnswerSectionHtml(args: GenerateAnswerSectionArgs): Promise<string> {
  const keyword = args.focusKeyword.trim() || args.articleTitle.trim() || "this topic";
  const title = args.articleTitle.trim() || keyword;
  const businessName = args.connectedSite?.name?.trim() || "";
  const entityCanonical =
    args.pageKind === "entity" && args.entity?.trim()
      ? normalizeEntityHintCommaLabel(args.entity.trim())
      : "";
  const pageLabel = harnessPageKindLabel(args.pageKind);

  let moneyPages = args.moneyPageCandidates ?? [];
  if (moneyPages.length === 0 && (args.site?.id || args.connectedSite?.siteUrl)) {
    const pool = await resolveSitemapFuzzyLinkPool({
      site: args.site,
      siteId: args.site?.id ?? null,
      pageUrl: args.pageUrl,
    });
    moneyPages = rankFuzzyMoneyPageLinksForAnswer({
      pool,
      articleTitle: title,
      focusKeyword: keyword,
      bodyH2Titles: args.bodyH2Titles,
      pageUrl: args.pageUrl,
      limit: 6,
    });
  }
  const moneyPageLinksBlock = formatAnswerMoneyPageLinksPromptBlock(moneyPages);
  const linkRule = moneyPages.length > 0
    ? " Weave 1 contextual <a href=\"...\">product/service anchor</a> link from PAGE SITEMAP MONEY PAGE TARGETS in the Answer paragraph to support the customer's transaction."
    : "";

  const answerSystem = entityCanonical
    ? `You write a brand-new Answer section from scratch for an existing ${pageLabel}. Output HTML only: <h2>Answer</h2> and one <p> with two or three sentences. No other headings. Primary keyword: ${keyword}. Place entity (comma label): ${entityCanonical}. Mention the connected business name somewhere in the Answer paragraph when one is listed.${linkRule} Respect official ® / ™ / © symbols on proprietary product lines and automation systems where applicable. Never copy or paraphrase a previous Answer block.`
    : `You write a brand-new Answer section from scratch for an existing ${pageLabel}. Output HTML only: <h2>Answer</h2> and one <p> with two or three sentences. No other headings. Primary keyword: ${keyword}. Mention the connected business name somewhere in the Answer paragraph when one is listed.${linkRule} Respect official ® / ™ / © symbols on proprietary product lines and automation systems where applicable. Never copy or paraphrase a previous Answer block.`;
  const answerUserPrompt = [
    `Title: ${title}`,
    `Keyword: ${keyword}`,
    businessName ? `Business name (mention somewhere in the Answer): ${businessName}` : "",
    entityCanonical ? `Place entity: ${entityCanonical}` : "",
    args.bodyH2Titles.length > 0
      ? `Article H2 sections covered: ${args.bodyH2Titles.join(" | ")}`
      : "",
    moneyPageLinksBlock,
    args.previousAnswerHtml?.trim()
      ? `Legacy Answer to replace completely (do NOT copy or synonym-swap its sentences):\n${args.previousAnswerHtml.trim()}`
      : "",
    args.pageKind === "entity" ? "This is a service-area entity page." : "",
    "Write the brand-new Answer HTML from scratch now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = args.model?.trim() || getProductionModel();
  const answerResult = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system: answerSystem,
    user: answerUserPrompt,
    maxTokens: 384,
    temperature: 0.6,
    signal: args.signal,
  });
  const rawAnswer = (answerResult.content || "").trim();
  if (!rawAnswer) {
    throw new Error("Answer section could not be generated");
  }
  const prepared = prepareHarnessSectionHtml(rawAnswer, {
    title: BLOG_HARNESS_ANSWER_TITLE,
    isOverview: false,
    isAnswer: true,
  });
  return prepared.trim() || rawAnswer;
}

export type PrependAnswerResult = {
  html: string;
  answerHtml: string;
};

/** Generate Answer only and prepend onto existing page HTML (preserves Overview + body). */
export async function generateAndPrependAnswerHtml(args: {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  previousAnswerHtml?: string;
  moneyPageCandidates?: SitemapFuzzyLinkCandidate[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<PrependAnswerResult> {
  const existingAnswer = args.previousAnswerHtml?.trim() || extractAnswerSectionHtml(args.sourceHtml ?? "");
  const stripped = stripLeadingDuplicateArticleTitleHeading(
    stripLeadingAnswerSection(args.sourceHtml ?? ""),
    args.articleTitle,
  );
  if (!stripped.trim()) {
    throw new Error(
      "Post body HTML is required before Answer can be prepended. Load inventory with content, then retry.",
    );
  }
  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  const hasOverview = Boolean(extractOverviewSectionHtml(stripped).trim());

  const answerHtml = await generateAnswerSectionHtml({
    articleTitle: args.articleTitle,
    focusKeyword: args.focusKeyword,
    bodyH2Titles,
    includeOverviewInOutline: hasOverview,
    pageUrl: args.pageUrl,
    connectedSite: args.connectedSite,
    site: args.site,
    entity: args.entity,
    pageKind: args.pageKind,
    seoResearchBrief: args.seoResearchBrief,
    previousAnswerHtml: existingAnswer || undefined,
    moneyPageCandidates: args.moneyPageCandidates,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
  });

  const answerWithId = injectHarnessSectionH2AnchorId(answerHtml.trim(), HARNESS_ANSWER_ANCHOR_ID);
  return {
    html: enforceHarnessAnswerBeforeOverview(stitchHarnessSections([answerWithId, stripped])),
    answerHtml: answerWithId,
  };
}

export async function generateAndPrependOverviewHtml(args: {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  pregeneratedAnswerHtml?: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<PrependOverviewResult | null> {
  const stripped = stripLeadingOverviewSection(stripLeadingAnswerSection(args.sourceHtml));
  if (!stripped.trim()) {
    return null;
  }
  if (looksLikeBlockedHostHtml(stripped)) {
    throw new Error(
      "Page body looks like a Cloudflare block page, not WordPress content. Re-scrape or reload inventory, then retry Overview.",
    );
  }

  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  if (!bodyH2Titles.length) {
    throw new Error("No H2 headings to cite from Overview");
  }

  const keyword = args.focusKeyword.trim() || args.articleTitle.trim() || "this topic";
  const pageLabel = harnessPageKindLabel(args.pageKind);
  const purpose =
    args.pageKind === "entity" && args.entity?.trim()
      ? `AI Overview opener for "${keyword}" on an existing ${pageLabel} near ${args.entity.trim()} that cites body sections via same-page #anchors.`
      : `AI Overview opener for "${keyword}" that maps remaining body sections via same-page #anchors.`;
  const outline = outlineFromBodyH2Titles(bodyH2Titles);
  const outlineBlock = formatOutlineTitlesForHarnessPrompt(outline);
  const anchorMap = buildHarnessSectionAnchorMap(outline);
  const bodyWithIds = injectBodyH2AnchorIds(stripped, anchorMap);
  const anchorBlock = formatHarnessInPageAnchorBlock(anchorMap);
  const totalSections = outline.length + 2;
  const publishedTitles = ["Answer", "Overview", ...bodyH2Titles];

  const model = args.model?.trim() || getProductionModel();
  let answerHtml = args.pregeneratedAnswerHtml?.trim() || "";
  if (!answerHtml) {
    answerHtml = await generateAnswerSectionHtml({
      articleTitle: args.articleTitle,
      focusKeyword: args.focusKeyword,
      bodyH2Titles,
      includeOverviewInOutline: true,
      pageUrl: args.pageUrl,
      connectedSite: args.connectedSite,
      site: args.site,
      entity: args.entity,
      pageKind: args.pageKind,
      seoResearchBrief: args.seoResearchBrief,
      apiKey: args.apiKey,
      model: args.model,
      signal: args.signal,
    });
  }
  if (!answerHtml.trim()) {
    throw new Error("Answer section could not be generated (single pass)");
  }
  answerHtml = injectHarnessSectionH2AnchorId(answerHtml, HARNESS_ANSWER_ANCHOR_ID);

  const overviewAgent = buildBlogHarnessSummaryAgent();
  const sectionPrompt = generateSingleSectionPrompt(overviewAgent, "html");
  let userPrompt = buildBulkHarnessSectionUserPrompt(
    args.articleTitle.trim() || keyword,
    purpose,
    sectionPrompt,
    outlineBlock,
    bodyH2Titles,
    1,
    totalSections,
    args.connectedSite,
    args.pageKind === "entity" ? args.entity?.trim() : undefined,
    { keywordFocus: keyword },
    true,
    args.pageUrl,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    anchorBlock,
    undefined,
    undefined,
    keyword,
    publishedTitles,
    undefined,
    undefined,
    undefined,
    formatAnswerGroundingForIllustrativePromptBlock(answerHtml),
  );
  userPrompt = appendHarnessBriefGroundingToPrompt(userPrompt, args.seoResearchBrief);
  if (args.pageKind === "entity") {
    userPrompt += entityHarnessPromptAddendum(args.entity, args.connectedSite, keyword);
  }
  const pageCtx = resolvePageLocalContext({
    keyword,
    site: args.site,
    entity: args.pageKind === "entity" ? args.entity : undefined,
  });
  if (pageCtx.primaryCity) {
    userPrompt += `\n\n${formatPageLocalContextPromptBlock(pageCtx)}`;
  }

  const entityCanonicalOverview =
    args.pageKind === "entity" && args.entity?.trim()
      ? normalizeEntityHintCommaLabel(args.entity.trim())
      : "";
  const system =
    entityCanonicalOverview
      ? `You write the Overview (AI Overview) harness section for an existing service-area entity page near ${entityCanonicalOverview}. Output HTML only for this section. Follow the section contract exactly. Primary keyword: ${keyword}. Refer to the place with comma grammar from the entity label, not slug-style concatenation. Do not recap the published Answer.

BOLD LABELS (NON-NEGOTIABLE): Every key-point <li> MUST start with a bold label tag, then a colon: <li><strong>Label</strong>: description…</li>. Example: <li><strong>Cost Breakdown</strong>: discover average costs and what influences them.</li>. Never put a comma after </strong>. Plain text without <strong> is INVALID. Do not skip <strong>.
${pageCtx.primaryCity ? `\n${PRIMARY_CITY_CONSISTENCY_RULE}` : ""}`
      : `You write the Overview (AI Overview) harness section for an existing page. Output HTML only for this section. Follow the section contract exactly. Primary keyword: ${keyword}. Do not recap the published Answer.

BOLD LABELS (NON-NEGOTIABLE): Every key-point <li> MUST start with a bold label tag, then a colon: <li><strong>Label</strong>: description…</li>. Example: <li><strong>Cost Breakdown</strong>: discover average costs and what influences them.</li>. Never put a comma after </strong>. Plain text without <strong> is INVALID. Do not skip <strong>.
${pageCtx.primaryCity ? `\n${PRIMARY_CITY_CONSISTENCY_RULE}` : ""}`;

  const overviewResult = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system,
    user: userPrompt,
    maxTokens: 768,
    temperature: 0.35,
    signal: args.signal,
  });

  let overviewHtml = (overviewResult.content || "").trim();
  if (!overviewHtml) {
    throw new Error("Overview agent returned empty HTML");
  }
  overviewHtml = await ensureHarnessSectionLengthCompliance({
    sectionHtml: overviewHtml,
    sectionTitle: BLOG_HARNESS_SUMMARY_TITLE,
    siblingSectionTitles: bodyH2Titles,
    articleTitle: args.articleTitle.trim() || keyword,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
    isOverviewSection: true,
    inPageAnchorBlock: anchorBlock,
    overviewBulletCount: anchorMap.length,
  });

  overviewHtml = ensureOverviewBulletBoldLabels(overviewHtml);
  if (anchorMap.length === 0) {
    throw new Error("No body H2 anchors to cite from Overview");
  }
  if (!overviewBulletsHaveRequiredScrollLinks(overviewHtml, anchorMap)) {
    overviewHtml = await applyOverviewHarnessScrollLinks({
      html: overviewHtml,
      anchorMap,
      articleTitle: args.articleTitle.trim() || keyword,
      keyword,
      apiKey: args.apiKey,
      model: args.model,
      signal: args.signal,
      inPageAnchorBlock: anchorBlock,
    });
  }
  overviewHtml = completeOverviewScrollLinks(overviewHtml, anchorMap);
  overviewHtml = ensureOverviewBulletBoldLabels(overviewHtml);
  overviewHtml = injectHarnessSectionH2AnchorId(overviewHtml, HARNESS_OVERVIEW_ANCHOR_ID);
  overviewHtml = wrapOverviewSectionHtml(overviewHtml);

  return {
    html: enforceHarnessAnswerBeforeOverview(
      stitchHarnessSections([answerHtml, overviewHtml, bodyWithIds]),
    ),
    bodyH2Titles,
    anchorMap,
  };
}

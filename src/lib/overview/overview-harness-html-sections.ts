import type { AgentConfig } from "@/types/agent-config";
import { isBlogHarnessSummaryAgent } from "@/lib/bulk/blog-harness-summary-agent";
import { HARNESS_ANSWER_ANCHOR_ID, isBlogHarnessAnswerAgent } from "@/lib/bulk/blog-harness-answer-agent";
import { FLO_OVERVIEW_CLASS } from "@/lib/overview/wrap-overview-section-html";
import { stitchHarnessSections, type BulkHarnessOutlineSection } from "@/lib/bulk/bulk-harness-outline";
import { HARNESS_OVERVIEW_ANCHOR_ID, injectHarnessSectionH2AnchorId, type HarnessSectionAnchorEntry } from "@/lib/bulk/harness-section-anchor-ids";
import { plainTextFromH2InnerHtml } from "@/lib/overview/overview-blog-headers-extract";

export type OverviewHarnessPageKind = "post" | "entity";

export function harnessPageKindLabel(pageKind: OverviewHarnessPageKind | undefined): string {
  return pageKind === "entity" ? "service-area entity page" : "page";
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

export function isAnswerHeadingTitle(title: string): boolean {
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

export function isOverviewHeadingTitle(title: string): boolean {
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

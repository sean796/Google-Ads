import {
  plainTextEndsWithCompleteSentence,
  stripHtmlTagsForSentenceCheck,
  trimHarnessSectionToCompleteSentences,
} from "@/lib/bulk/harness-section-complete-sentences";
import {
  enforceHarnessSectionHeadingTitle,
  HARNESS_OVERVIEW_ANCHOR_ID,
  headingTitleToHarnessAnchorId,
  injectHarnessSectionH2AnchorId,
} from "@/lib/bulk/harness-section-anchor-ids";
import { HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";
import {
  isBadIllustrativeH2Title,
  resolveIllustrativeH2Title,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { flattenListItemBlockWrappers, removeEmDashes } from "@/lib/content-generation/content-sanitizer";
import { MIN_INTERNAL_LINKS_PER_BODY_H2 } from "@/lib/content-generation/link-anchor-text-case";

function isHarnessPlaceholderToken(token: string): boolean {
  return (
    token.startsWith("[[EXTERNAL:") ||
    token === "[[EXTERNAL]]" ||
    token.startsWith("[[LINK:") ||
    token.startsWith("[[SCROLL:")
  );
}

function maskHarnessMarkdownPlaceholders(content: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  let out = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "[" && content[i + 1] === "[") {
      const end = content.indexOf("]]", i + 2);
      if (end !== -1) {
        const token = content.slice(i, end + 2);
        if (isHarnessPlaceholderToken(token)) {
          tokens.push(token);
          out += `HARNESSPH${tokens.length - 1}END`;
          i = end + 2;
          continue;
        }
      }
    }
    out += content[i]!;
    i += 1;
  }
  return { text: out, tokens };
}

function unmaskHarnessMarkdownPlaceholders(content: string, tokens: string[]): string {
  let out = content;
  for (let i = 0; i < tokens.length; i++) {
    out = out.split(`HARNESSPH${i}END`).join(tokens[i]!);
  }
  return out;
}

/** Remove known model contamination (Semrush MCP errors, tool leaks) from harness HTML. */
export function stripHarnessModelContamination(html: string): string {
  let s = html;
  const patterns = [
    /If you can see this response, the user has an active Semrush subscription[\s\S]*?semrush\.com\/mcp-access\.?/gi,
    /Action required:\s*The user can view available options to get more API units[\s\S]*?semrush\.com\/mcp-access\.?/gi,
    /does not have enough API units to complete this request\.?/gi,
  ];
  for (const re of patterns) {
    s = s.replace(re, "");
  }
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Drop trailing partial tags (e.g. lone "<" after an empty section). */
export function stripHarnessSectionTrailingGarbage(html: string): string {
  let s = html.trim();
  for (let pass = 0; pass < 8; pass++) {
    const before = s;
    s = s.replace(/<\s*$/g, "").trimEnd();
    const dangling = s.match(/<[^>]*$/);
    if (dangling) {
      s = s.slice(0, s.lastIndexOf("<")).trimEnd();
    }
    if (s === before) break;
  }
  return s;
}

export function harnessSectionParagraphPlainTexts(html: string): string[] {
  const texts: string[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const plain = stripHtmlTagsForSentenceCheck(m[1]).trim();
    if (plain) texts.push(plain);
  }
  return texts;
}

export function harnessBodySectionHasCompleteParagraph(html: string): boolean {
  return harnessSectionParagraphPlainTexts(html).some((t) =>
    plainTextEndsWithCompleteSentence(t),
  );
}

export function harnessOverviewProseHasCompleteParagraph(html: string): boolean {
  const lower = html.toLowerCase();
  const h2End = lower.indexOf("</h2>");
  if (h2End < 0) return false;
  const ulStart = lower.indexOf("<ul", h2End);
  const proseSlice = ulStart >= 0 ? html.slice(h2End + 5, ulStart) : html.slice(h2End + 5);
  const paras = harnessSectionParagraphPlainTexts(proseSlice);
  if (paras.some((t) => plainTextEndsWithCompleteSentence(t))) return true;
  const loose = stripHtmlTagsForSentenceCheck(proseSlice).trim();
  return plainTextEndsWithCompleteSentence(loose);
}

export function isHarnessCompletionTruncated(finishReason?: string): boolean {
  if (typeof finishReason !== "string" || !finishReason.trim()) return false;
  const lo = finishReason.trim().toLowerCase().replace(/-/g, "_");
  if (lo === "length" || lo === "max_tokens" || lo === "max_output_tokens") return true;
  if (lo.includes("max_tokens") || lo.includes("length_limit")) return true;
  return false;
}

function isTagBoundaryChar(ch: string | undefined): boolean {
  if (!ch || ch.length === 0) return true;
  const c = ch.charCodeAt(0);
  if (c <= 32) return true;
  return ch === "/" || ch === ">";
}

export function countHarnessH2Tags(html: string): number {
  const lower = html.toLowerCase();
  let count = 0;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (lower.startsWith("<h2", lt) && isTagBoundaryChar(html[lt + 3])) {
      count += 1;
      i = lt + 1;
      continue;
    }
    i = lt + 1;
  }
  return count;
}

export function assertHarnessBodySectionComplete(html: string, title: string): void {
  const t = html.trim();
  if (!/<h2\b/i.test(t)) {
    throw new Error(`Harness: section "${title}" missing <h2>`);
  }
  if (!harnessBodySectionHasCompleteParagraph(t)) {
    throw new Error(
      `Harness: section "${title}" has no complete paragraphs — generation must not ship empty or cut-off body sections`,
    );
  }
}

export function countPlainTextSentences(plain: string): number {
  const t = plain.trim();
  if (!t) return 0;
  const parts = t.split(/(?<=[.!?]["']?)\s+/).filter((p) => p.trim().length > 0);
  if (parts.length > 0) return parts.length;
  return plainTextEndsWithCompleteSentence(t) ? 1 : 0;
}

export function assertHarnessAnswerProseComplete(html: string): void {
  if (!/<h2\b/i.test(html)) {
    throw new Error("Harness: Answer missing <h2>");
  }
  const lower = html.toLowerCase();
  const h2End = lower.indexOf("</h2>");
  if (h2End < 0) {
    throw new Error("Harness: Answer missing </h2>");
  }
  const body = html.slice(h2End + 5);
  if (/<ul\b/i.test(body) || /<ol\b/i.test(body) || /<table\b/i.test(body)) {
    throw new Error("Harness: Answer must not contain lists or tables");
  }
  const paras = harnessSectionParagraphPlainTexts(body);
  if (paras.length !== 1) {
    throw new Error(
      `Harness: Answer must contain exactly one <p> (found ${paras.length})`,
    );
  }
  const sentenceCount = countPlainTextSentences(paras[0]!);
  if (sentenceCount < 2 || sentenceCount > 3) {
    throw new Error(
      `Harness: Answer must contain two or three sentences (found ${sentenceCount})`,
    );
  }
  if (!plainTextEndsWithCompleteSentence(paras[0]!)) {
    throw new Error("Harness: Answer paragraph does not end with a complete sentence");
  }
}

export function assertHarnessOverviewProseComplete(html: string): void {
  if (!/<h2\b/i.test(html)) {
    throw new Error("Harness: Overview missing <h2>");
  }
  if (!harnessOverviewProseHasCompleteParagraph(html)) {
    throw new Error(
      "Harness: Overview has no complete prose paragraphs — generation must not ship truncated Overview",
    );
  }
}

export function validateHarnessSectionOrThrow(
  _html: string,
  _opts: {
    title: string;
    finishReason?: string;
    isOverview: boolean;
    isAnswer?: boolean;
  },
): void {
  // Intentionally no-op: section HTML ships from the model as-is; full article is validated downstream.
}

/** Wrap loose body text after </h2> in <p> when the model omitted paragraph tags. */
export function normalizeBodySectionProseHtml(html: string): string {
  const cleaned = stripHarnessModelContamination(html);
  const lower = cleaned.toLowerCase();
  const h2Open = lower.search(/<h2\b/);
  if (h2Open < 0) return cleaned;
  const h2End = lower.indexOf("</h2>", h2Open);
  if (h2End < 0) return cleaned;

  const head = cleaned.slice(0, h2End + 5);
  const tail = cleaned.slice(h2End + 5);
  const blockMatch = tail.match(/<(?:ul|ol|table|h2|h3)\b/i);
  const blockIdx = blockMatch?.index ?? tail.length;
  const prosePart = tail.slice(0, blockIdx).trim();
  const afterBlock = tail.slice(blockIdx);

  if (!prosePart || /<p\b/i.test(prosePart)) {
    return head + (prosePart ? `\n${prosePart}` : "") + afterBlock;
  }

  const blocks = prosePart
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const wrapped = blocks.map((b) => `<p>${b}</p>`).join("\n");
  return `${head}\n${wrapped}${afterBlock ? `\n${afterBlock}` : ""}`;
}

/** Wrap loose Overview text after </h2> in <p> when the model omitted paragraph tags. */
export function normalizeOverviewProseHtml(html: string): string {
  const cleaned = stripHarnessModelContamination(html);
  const lower = cleaned.toLowerCase();
  const h2Open = lower.search(/<h2\b/);
  if (h2Open < 0) return cleaned;
  const h2End = lower.indexOf("</h2>", h2Open);
  if (h2End < 0) return cleaned;

  const head = cleaned.slice(0, h2End + 5);
  const tail = cleaned.slice(h2End + 5);
  const ulIdx = tail.toLowerCase().indexOf("<ul");
  const prosePart = (ulIdx >= 0 ? tail.slice(0, ulIdx) : tail).trim();
  const afterUl = ulIdx >= 0 ? tail.slice(ulIdx) : "";

  if (!prosePart || /<p\b/i.test(prosePart)) {
    return head + (prosePart ? `\n${prosePart}` : "") + (afterUl ? `\n${afterUl}` : "");
  }

  const blocks = prosePart
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const wrapped = blocks.map((b) => `<p>${b}</p>`).join("\n");
  return `${head}\n${wrapped}${afterUl ? `\n${afterUl}` : ""}`;
}

export function normalizeIllustrativeHarnessHtml(html: string, forcedH2?: string): string {
  const h2Title = resolveIllustrativeH2Title(forcedH2);
  let s = (html ?? "").trim();
  if (!s) return s;

  s = s.replace(/<h3\b[^>]*>\s*scenario\s*:[\s\S]*?<\/h3>/gi, "");
  s = s.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i, (_m, inner) => {
    const plain = inner
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (isBadIllustrativeH2Title(plain) || plain.toLowerCase() !== h2Title.toLowerCase()) {
      return `<h2>${h2Title}</h2>`;
    }
    return `<h2>${plain}</h2>`;
  });
  s = s.replace(
    /(<h2\b[^>]*>[\s\S]*?<\/h2>\s*)<p>\s*scenario\s*:\s*/i,
    "$1<p>",
  );
  s = s.replace(/<p>\s*scenario\s*:\s*/gi, "<p>");
  if (!/<blockquote\b/i.test(s)) {
    const afterH2 = s.replace(/^[\s\S]*?<\/h2>\s*/i, "");
    const firstP = afterH2.match(/^<p>([\s\S]*?)<\/p>/i);
    if (firstP?.[1] && firstP[1].length > 80) {
      s = s.replace(firstP[0], `<blockquote><p>${firstP[1]}</p></blockquote>`);
    }
  }
  return s.trim();
}

/** Answer contract: one H2 + one paragraph only. Drop model-added headings after </p>. */
export function trimAnswerSectionToContract(html: string): string {
  const s = (html ?? "").trim();
  if (!s) return s;
  const h2Match = s.match(/^<h2\b[^>]*>[\s\S]*?<\/h2>/i);
  if (!h2Match) return s;
  const afterH2 = s.slice(h2Match[0].length).trim();
  const pMatch = afterH2.match(/^<p\b[^>]*>[\s\S]*?<\/p>/i);
  if (!pMatch) return s;
  return `${h2Match[0]}${pMatch[0]}`.trim();
}

export function finalizeHarnessSectionHtml(
  html: string,
  opts: { isOverview: boolean; isAnswer?: boolean; isIllustrative?: boolean; title: string },
): string {
  let s = stripHarnessModelContamination(html);
  s = stripHarnessSectionTrailingGarbage(s);
  if (opts.isAnswer) {
    s = enforceHarnessSectionHeadingTitle(s, "Answer");
    s = trimAnswerSectionToContract(s);
    s = injectHarnessSectionH2AnchorId(s, HARNESS_ANSWER_ANCHOR_ID);
  } else if (opts.isOverview) {
    s = normalizeOverviewProseHtml(s);
    s = enforceHarnessSectionHeadingTitle(s, "Overview");
    s = injectHarnessSectionH2AnchorId(s, HARNESS_OVERVIEW_ANCHOR_ID);
  } else {
    s = normalizeBodySectionProseHtml(s);
    s = trimHarnessSectionToCompleteSentences(s);
    s = enforceHarnessSectionHeadingTitle(s, opts.title);
    s = injectHarnessSectionH2AnchorId(s, headingTitleToHarnessAnchorId(opts.title));
  }
  s = flattenListItemBlockWrappers(s);
  s = removeEmDashes(s);
  if (opts.isIllustrative) {
    s = enforceHarnessSectionHeadingTitle(s, resolveIllustrativeH2Title(opts.title));
  }
  return s;
}

/** Normalize markdown harness sections to HTML before validation and stitch. */
export function prepareHarnessSectionHtml(
  raw: string,
  opts: { isOverview: boolean; isAnswer?: boolean; isIllustrative?: boolean; title: string },
): string {
  let text = raw.trim();
  const fence = text.match(/^```(?:html|markdown)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1]!.trim();
  if (!text) return "";

  let html = text;
  const lower = text.toLowerCase();
  const looksLikeHtml =
    lower.includes("<h2") ||
    lower.includes("<table") ||
    lower.includes("<p>") ||
    lower.includes("<ul") ||
    lower.includes("<ol");
  if (!looksLikeHtml && (text.includes("## ") || /\|[^|\n]+\|/.test(text))) {
    const { text: masked, tokens } = maskHarnessMarkdownPlaceholders(text);
    html = unmaskHarnessMarkdownPlaceholders(markdownToHtml(masked), tokens);
  }

  return finalizeHarnessSectionHtml(html, opts);
}

export function stitchedArticleHasAnswerH2(html: string): boolean {
  const src = (html ?? "").trim();
  if (!src) return false;
  if (/\bid\s*=\s*["']answer["']/i.test(src)) return true;
  return /<h2\b[^>]*>\s*answer\s*</i.test(src);
}

export function assertHarnessIllustrativeSectionHtml(html: string): void {
  if (!illustrativeHarnessSectionValid(html)) {
    const t = (html ?? "").trim();
    if (!t) {
      throw new Error("Harness: [ILLUSTRATIVE] section is empty");
    }
    if (!/<blockquote\b/i.test(t)) {
      throw new Error("Harness: [ILLUSTRATIVE] section missing scenario blockquote");
    }
    throw new Error("Harness: [ILLUSTRATIVE] section missing Recommendation h3");
  }
}

export const HARNESS_SECTION_MAX_ATTEMPTS = 1;

const HARNESS_INTERNAL_LINK_PLACEHOLDER_RE = /\[\[LINK:[^|\]]+\|[^\]]+\]\]/g;

/** Count [[LINK:query|anchor]] placeholders in harness section HTML (pre-resolve). */
export function countHarnessInternalLinkPlaceholders(html: string): number {
  return (html.match(HARNESS_INTERNAL_LINK_PLACEHOLDER_RE) ?? []).length;
}

/** Fail fast when a body H2 section ships fewer than the minimum internal link placeholders. */
export function assertHarnessBodySectionInternalLinkMinimum(
  sectionHtml: string,
  sectionLabel: string,
  minLinks: number = MIN_INTERNAL_LINKS_PER_BODY_H2,
): void {
  const count = countHarnessInternalLinkPlaceholders(sectionHtml);
  if (count >= minLinks) return;
  throw new Error(
    `Harness: section "${sectionLabel}" has ${count} internal [[LINK]] placeholder(s); minimum is ${minLinks} per body H2 (single pass).`,
  );
}

export function illustrativeHarnessSectionValid(html: string): boolean {
  const t = (html ?? "").trim();
  if (!t) return false;
  if (!/<blockquote\b/i.test(t)) return false;
  if (!/<h3\b[^>]*>\s*recommendation\s*:/i.test(t)) return false;
  return true;
}

export function harnessSectionPreparedValid(
  prepared: string,
  opts: { isIllustrative?: boolean },
): boolean {
  if (!prepared.trim()) return false;
  if (opts.isIllustrative && !illustrativeHarnessSectionValid(prepared)) return false;
  return true;
}

export function stitchedHarnessArticleValid(
  html: string,
  opts: { requireIllustrative: boolean },
): boolean {
  try {
    assertStitchedHarnessArticle(html, opts);
    return true;
  } catch {
    return false;
  }
}

export function assertStitchedHarnessArticle(
  html: string,
  opts: { requireIllustrative: boolean },
): void {
  const src = (html ?? "").trim();
  if (!src) {
    throw new Error("Harness: stitched article is empty");
  }
  if (!stitchedArticleHasAnswerH2(src)) {
    throw new Error("Harness: Answer section missing from article");
  }
  if (!/<h2\b[^>]*>\s*overview\s*</i.test(src) && !/\bid\s*=\s*["']overview["']/i.test(src)) {
    throw new Error("Harness: Overview section missing from article");
  }
  if (opts.requireIllustrative) {
    const hasRec = /<h3\b[^>]*>\s*recommendation\s*:/i.test(src);
    const hasBq = /<blockquote\b/i.test(src);
    if (!hasRec || !hasBq) {
      throw new Error("Harness: [ILLUSTRATIVE] scenario missing from article");
    }
  }
}

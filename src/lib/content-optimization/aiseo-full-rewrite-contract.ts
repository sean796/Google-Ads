import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import {
  computeRevisionChanged,
  revisionPlainFromHtml,
} from "@/lib/overview/studio-doc-revisions-store";

/** Optimize / Auto SEO body copy: full from-scratch rewrite, never minimal polish or synonym swapping. */
export const AISEO_FULL_REWRITE_SYSTEM_RULE =
  "When optimizing or rewriting this content: author a COMPLETE FROM-SCRATCH REWRITE. Forbidden: minimal polish, light touch-ups, sentence-by-sentence paraphrasing, synonym swapping, or keeping the old sentence order and paragraph structure. Discard the legacy sentence flow completely. Re-architect the section with fresh paragraphs, clear subheadings or bullet/table breakdowns where helpful, concrete specifics, and authoritative prose while preserving core facts and every LOCKED LINK. TRADEMARK & COPYRIGHT SYMBOLS (mandatory): always include official registered trademark (®), trademark (™), or copyright (©) symbols on proprietary manufacturer product lines, automation systems, and brand names where applicable based on the research brief, SERP context, and manufacturer naming conventions. PLAIN CUSTOMER LANGUAGE IN TABLES & PROSE (mandatory): never use internal estimator, quote-sheet, or invoice jargon such as 'opening'/'openings' (e.g. '(Single Opening)', '(5 Openings)') or raw internal fabric/SKU codes; always write in natural customer-facing language (e.g. 'single window', '5 windows', or plain fabric/style descriptions).";

export const AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT =
  "OUTPUT CONTRACT (mandatory): bodyHtml must be newly authored from scratch with completely new sentence structure, paragraph layout, and wording. Verbatim copy, near-verbatim copy, or sentence-by-sentence synonym swapping is invalid and will be rejected.";

export const AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT =
  "OUTPUT CONTRACT (mandatory): title plain text must be a freshly authored, specific heading distinct from the current heading.";

const MAX_ALLOWED_FOUR_GRAM_OVERLAP = 0.35;
const MIN_WORDS_FOR_OVERLAP_CHECK = 20;

function tokenizeAlphanumericWords(text: string): string[] {
  const lower = text.toLowerCase();
  const words: string[] = [];
  let current = "";
  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    const isAlphaNum =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      current += lower[i];
    } else if (current.length > 0) {
      words.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    words.push(current);
  }
  return words;
}

export function computeFourGramOverlapRatio(beforePlain: string, afterPlain: string): number {
  const beforeWords = tokenizeAlphanumericWords(beforePlain);
  const afterWords = tokenizeAlphanumericWords(afterPlain);
  if (
    beforeWords.length < MIN_WORDS_FOR_OVERLAP_CHECK ||
    afterWords.length < 4
  ) {
    return 0;
  }
  const beforeGrams = new Set<string>();
  for (let i = 0; i <= beforeWords.length - 4; i += 1) {
    beforeGrams.add(
      `${beforeWords[i]} ${beforeWords[i + 1]} ${beforeWords[i + 2]} ${beforeWords[i + 3]}`,
    );
  }
  if (beforeGrams.size === 0) return 0;

  let matches = 0;
  const totalAfterGrams = afterWords.length - 3;
  for (let i = 0; i < totalAfterGrams; i += 1) {
    const gram = `${afterWords[i]} ${afterWords[i + 1]} ${afterWords[i + 2]} ${afterWords[i + 3]}`;
    if (beforeGrams.has(gram)) {
      matches += 1;
    }
  }
  return matches / totalAfterGrams;
}

function assertNotSynonymSwap(beforePlain: string, afterPlain: string): void {
  const overlap = computeFourGramOverlapRatio(beforePlain, afterPlain);
  if (overlap > MAX_ALLOWED_FOUR_GRAM_OVERLAP) {
    throw new Error(
      `Optimize returned near-verbatim copy (${Math.round(overlap * 100)}% phrase overlap). Full from-scratch rewrite required; synonym swapping is not allowed.`,
    );
  }
}

export function assertAiseoBodyRewriteChanged(beforeHtml: string, afterHtml: string): void {
  const beforePlain = revisionPlainFromHtml(beforeHtml);
  const afterPlain = revisionPlainFromHtml(afterHtml);
  if (!computeRevisionChanged(beforePlain, afterPlain)) {
    throw new Error(
      "Optimize returned identical plain text. Full rewrite required; minimal polish is not allowed.",
    );
  }
  assertNotSynonymSwap(beforePlain, afterPlain);
}

export function assertAiseoHeadingRewriteChanged(beforeTitle: string, afterTitle: string): void {
  const before = tokenizeAlphanumericWords(beforeTitle).join(" ");
  const after = tokenizeAlphanumericWords(afterTitle).join(" ");
  if (!before || !after || before === after) {
    throw new Error(
      "Heading optimize returned the same title. Provide a distinct heading aligned to search intent.",
    );
  }
}

export function assertAiseoBodyPlainChanged(beforePlain: string, afterPlain: string): void {
  if (!prosePlainText(afterPlain).trim()) {
    throw new Error("Optimize returned empty body text.");
  }
  const normBefore = revisionPlainFromHtml(beforePlain);
  const normAfter = revisionPlainFromHtml(afterPlain);
  if (!computeRevisionChanged(normBefore, normAfter)) {
    throw new Error(
      "Optimize returned identical plain text. Full rewrite required; minimal polish is not allowed.",
    );
  }
  assertNotSynonymSwap(normBefore, normAfter);
}

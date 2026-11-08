/**
 * NEO Pulse redirect: focus keyword is stored exactly (`neo_pulse_seo_focus_keyword`). SEO title/description
 * must contain that phrase for recognition (NEO Pulse redirect matches case-insensitively). We avoid
 * duplicating when the title already has the phrase in different casing, and use title-cased
 * display text only when we inject the phrase ourselves.
 */

import { truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";

const DEFAULT_TITLE_MAX = 60;
const DEFAULT_DESC_MAX = 160;

/** Title-case each word for display (no LLM). */
export function formatKeywordForDisplay(phrase: string): string {
  const t = phrase.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function containsCaseInsensitive(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function keywordTokensAllPresentInTitle(title: string, kw: string): boolean {
  const tokens = kw
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (tokens.length === 0) return false;
  const titleLower = title.toLowerCase();
  return tokens.every((t) => titleLower.includes(t));
}

/** True when NEO Pulse redirect focus keyword is already represented in an SEO title. */
export function focusKeywordRepresentedInSeoTitle(title: string, exactKw: string): boolean {
  const candidate = title.trim();
  const kw = exactKw.trim();
  if (!kw) return true;
  if (sliceCaseInsensitiveMatch(candidate, kw)) return true;
  if (containsCaseInsensitive(candidate, kw)) return true;
  if (/\bnear\b/i.test(candidate) && keywordTokensAllPresentInTitle(candidate, kw)) return true;
  return false;
}

/** Substring of `haystack` at the case-insensitive match of `needle`, for truncation that preserves the real casing. */
export function sliceCaseInsensitiveMatch(haystack: string, needle: string): string | null {
  if (!needle) return null;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const idx = h.indexOf(n);
  if (idx === -1) return null;
  return haystack.slice(idx, idx + needle.length);
}

/**
 * Drops leading tokens from the proposed SEO title that already repeat the focus phrase
 * (e.g. chiropractor + near when the keyword is "chiropractic near me") so we can weave
 * `"Keyword in Beltline, Calgary"` instead of `"Keyword: Chiropractor Near Beltline Calgary"`.
 */
function stripRedundantPrefixAgainstKeyword(candidate: string, kw: string): string {
  let c = candidate.trim();
  if (!c) return c;
  const kwLower = kw.toLowerCase();

  const keywordHasChiro = /\bchiropractic\b/i.test(kw) || /\bchiropractor\b/i.test(kw);
  if (keywordHasChiro) {
    c = c.replace(/^(chiropractors?|chiropractic)\s+/i, "").trim();
  }

  if (/\bnear\b/i.test(kwLower)) {
    c = c.replace(/^near\s+/i, "").trim();
  }

  return c;
}

/**
 * Shortens `text` to at most `maxLen` characters while keeping `needle` verbatim if present.
 * If `needle` is longer than `maxLen`, returns `needle` whole (exceeds UI limit; phrase integrity wins).
 * If `needle` is empty, behaves like a plain prefix truncate.
 */
export function truncatePreservingMandatorySubstring(
  text: string,
  needle: string,
  maxLen: number
): string {
  if (!text) return text;
  if (!needle) return text.length <= maxLen ? text : text.slice(0, maxLen);
  if (needle.length > maxLen) return needle;
  if (!text.includes(needle)) return text.slice(0, maxLen);
  if (text.length <= maxLen) return text;

  const idx = text.indexOf(needle);
  const spanEnd = idx + needle.length;
  const sMin = Math.max(0, spanEnd - maxLen);
  const sMax = Math.min(idx, text.length - maxLen);
  if (sMin <= sMax) {
    return text.slice(sMin, sMin + maxLen);
  }
  if (idx === 0) return text.slice(0, maxLen);
  return text.slice(idx, Math.min(idx + maxLen, text.length));
}

/**
 * Ensures the focus phrase appears in the SEO title (NEO Pulse redirect checks case-insensitively).
 * If the phrase is already present with any casing, keeps the title as-is (no duplicate prefix).
 * If missing, weaves the title-cased keyword with the base: strips overlapping chiropractor/near
 * prefixes when the keyword already covers them, then uses ` in ` for a natural location tail;
 * otherwise uses a colon before an unrelated subtitle.
 */
export function ensureExactKeywordInSeoTitle(
  baseTitle: string,
  exactKw: string,
  maxLen: number = DEFAULT_TITLE_MAX
): string {
  const candidate = baseTitle.trim();
  const kw = exactKw.trim();
  if (!kw) {
    return truncateTitleForSEO(candidate, maxLen);
  }
  if (focusKeywordRepresentedInSeoTitle(candidate, kw)) {
    const matchSpan = sliceCaseInsensitiveMatch(candidate, kw);
    if (matchSpan) {
      return truncatePreservingMandatorySubstring(candidate, matchSpan, maxLen);
    }
    return truncateTitleForSEO(candidate, maxLen);
  }
  const displayKw = formatKeywordForDisplay(kw);
  const rest = stripRedundantPrefixAgainstKeyword(candidate, kw);
  const trimmedCandidate = candidate.trim();
  const didStrip = rest.length > 0 && rest.length < trimmedCandidate.length;
  const sep = didStrip ? " in " : ": ";
  const wrapped =
    rest.length > 0 ? `${displayKw}${sep}${rest}` : `${displayKw}: ${trimmedCandidate}`;
  return truncatePreservingMandatorySubstring(wrapped, displayKw, maxLen);
}

/**
 * Same rules as title: case-insensitive duplicate check; inject title-cased phrase when missing.
 */
export function ensureExactKeywordInMetaDescription(
  desc: string,
  exactKw: string,
  maxLen: number = DEFAULT_DESC_MAX
): string {
  const candidate = desc.trim();
  const kw = exactKw.trim();
  if (!kw) {
    return candidate.length <= maxLen ? candidate : candidate.slice(0, maxLen);
  }
  const matchSpan = sliceCaseInsensitiveMatch(candidate, kw);
  if (matchSpan) {
    return truncatePreservingMandatorySubstring(candidate, matchSpan, maxLen);
  }
  const displayKw = formatKeywordForDisplay(kw);
  const wrapped = `${displayKw}. ${candidate}`;
  return truncatePreservingMandatorySubstring(wrapped, displayKw, maxLen);
}

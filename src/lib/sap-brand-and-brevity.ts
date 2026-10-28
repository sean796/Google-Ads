import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";

/** Max characters for SAP post H1 / SEO title (short local landing pages). */
export const SAP_TITLE_MAX_CHARS = 58;

/** Max characters for SAP URL slug segment (keyword + place). */
export const SAP_SLUG_MAX_LENGTH = 48;

/** Max service words used in slug keyword segment. */
export const SAP_SLUG_KEYWORD_MAX_WORDS = 4;

const GENERIC_BUSINESS_WORDS = new Set([
  "chartered",
  "professional",
  "accountants",
  "accountant",
  "advisors",
  "advisor",
  "services",
  "service",
  "company",
  "inc",
  "ltd",
  "llc",
  "llp",
  "corp",
  "the",
  "and",
]);

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

/** Distinct brand tokens from Integrations site name (not generic service words). */
export function tradingNameTokens(siteName: string): string[] {
  const raw = siteName.trim();
  if (!raw) return [];
  const words = raw.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    const norm = normalizeToken(w);
    if (norm.length < 2) continue;
    if (GENERIC_BUSINESS_WORDS.has(norm)) continue;
    out.add(norm);
  }
  // Short distinctive tokens (e.g. KWB) even when mixed case
  for (const w of words) {
    const letters = w.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 2 && letters.length <= 5 && letters === letters.toUpperCase()) {
      out.add(letters.toLowerCase());
    }
  }
  return [...out];
}

const ALWAYS_STRIP_STANDALONE_TOKENS = new Set(["llp", "llc", "ltd", "inc", "corp"]);

export function stripTradingNameFromPhrase(phrase: string, siteName: string): string {
  const tokens = tradingNameTokens(siteName);
  const tokenSet = new Set(tokens);
  const kept = phrase
    .trim()
    .split(/\s+/)
    .filter((w) => {
      const norm = normalizeToken(w);
      if (!norm) return false;
      if (ALWAYS_STRIP_STANDALONE_TOKENS.has(norm)) return false;
      if (tokenSet.size > 0 && tokenSet.has(norm)) return false;
      return true;
    });
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

function collapsedAlphanumeric(text: string): string {
  return normalizeToken(text.replace(/\s+/g, ""));
}

/** Fuzzy navigational brand match (GSC queries, keywords, titles). */
export function gscQueryMatchesTradingName(
  query: string,
  siteName: string,
  brandPhrases: readonly string[] = [],
): boolean {
  const q = query.trim();
  const name = siteName.trim();
  if (!q || !name) return false;

  const qLower = q.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of brandPhrases) {
    const p = phrase.trim().toLowerCase();
    if (p.length >= 4 && qLower.includes(p)) return true;
  }

  const qCollapse = collapsedAlphanumeric(q);
  const tokens = tradingNameTokens(name);
  const brandCollapse = tokens.join("");
  const fullBrandCollapse = collapsedAlphanumeric(name);
  if (fullBrandCollapse.length >= 4 && qCollapse.includes(fullBrandCollapse)) return true;
  if (brandCollapse.length >= 4 && qCollapse.includes(brandCollapse)) return true;
  if (tokens.length === 0) return false;
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (t.length < 2) return false;
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q) || qCollapse.includes(t);
  }
  return tokens.every((t) => {
    if (t.length < 2) return true;
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q);
  });
}

export function tradingNameAppearsInText(text: string, siteName: string): boolean {
  return gscQueryMatchesTradingName(text, siteName);
}

const SAP_HEADLINE_ACRONYMS = new Set([
  "seo",
  "cra",
  "rrsp",
  "tfsa",
  "resp",
  "cpp",
  "oas",
  "rrif",
  "hst",
  "gst",
  "irs",
  "llp",
  "llc",
  "kwb",
]);

/** Title Case every word in SAP H1/SEO titles (keyword input casing ignored). */
export function formatSapHeadlineTitleCase(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (SAP_HEADLINE_ACRONYMS.has(lower)) return lower.toUpperCase();
      const first = word.charAt(0);
      const rest = word.slice(1);
      if (!first) return word;
      return first.toLocaleUpperCase() + rest.toLocaleLowerCase();
    })
    .join(" ");
}

/** Shorter place label for SAP headlines (drop redundant province when city is present). */
export function shortPlaceLabelForSapTitle(entity: string): string {
  const normalized = normalizeEntityHintCommaLabel(entity.trim());
  if (!normalized) return entity.trim();
  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return normalized;
  const last = parts[parts.length - 1]!;
  if (/^[A-Za-z]{2}$/.test(last)) {
    return parts.slice(0, -1).join(", ");
  }
  return normalized;
}

export function truncateAtWordBoundary(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.5) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

export function limitServiceWords(phrase: string, maxWords: number): string {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

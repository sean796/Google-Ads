import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "how",
  "it",
  "its",
  "is",
  "does",
  "do",
  "what",
  "with",
  "your",
  "which",
]);

function firstFocusPhrase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const commaAt = trimmed.indexOf(",");
  const primary = commaAt === -1 ? trimmed : trimmed.slice(0, commaAt).trim();
  return normalizeFocusKeywordPhrase(primary);
}

function sourceString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function significantTokens(text: string): string[] {
  const phrase = normalizeFocusKeywordPhrase(text).toLowerCase();
  if (!phrase) return [];
  return phrase.split(" ").filter((token) => token.length > 1 && !STOP.has(token));
}

export function keywordMatchesPostTitle(keyword: string, title: string): boolean {
  const kw = significantTokens(keyword);
  const hay = new Set(significantTokens(title));
  if (!kw.length || !hay.size) return false;
  const hits = kw.filter((token) => hay.has(token)).length;
  return hits === kw.length || hits >= 2;
}

export function inferFocusKeywordFromTitle(title: string): string {
  const primary = title.split("|")[0]?.trim() ?? "";
  if (!primary) return "";
  const colonAt = primary.indexOf(":");
  const base = colonAt >= 8 ? primary.slice(0, colonAt).trim() : primary;
  return firstFocusPhrase(base.replace(/[?]+$/g, "")).toLowerCase();
}

function isBlogCollection(collection?: string | null): boolean {
  const c = (collection ?? "").trim().toLowerCase();
  return c === "" || c === "post" || c === "posts";
}

/**
 * Focus keyword for one WordPress item.
 * Blog posts: keep a stored keyword only when it describes this title; otherwise infer from the title.
 * Pages and CPT: first non-empty stored value (NEO Pulse redirect, plugin, ACF).
 */
export function focusKeywordFromWordPressSources(args: {
  acf?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  fieldsKeyword?: string | null;
  title?: string | null;
  collection?: string | null;
}): string {
  const acf = args.acf && typeof args.acf === "object" ? args.acf : {};
  const meta = args.meta && typeof args.meta === "object" ? args.meta : {};
  const title = (args.title ?? "").trim();
  const alignToTitle = Boolean(title) && isBlogCollection(args.collection);

  /** ACF Meta Boxes keyword (authoritative when it still describes this post). */
  const explicitAcfKeywords = [
    sourceString(acf.keyword_focus),
    sourceString(acf.focus_keyword),
  ];

  const secondaryStoredKeywords = [
    sourceString(meta.neo_pulse_seo_focus_keyword),
    sourceString(meta._neo_pulse_focus_keyword),
    sourceString(acf.neo_pulse_seo_focus_keyword),
    (args.fieldsKeyword ?? "").trim(),
  ];

  if (alignToTitle) {
    for (const raw of explicitAcfKeywords) {
      const phrase = firstFocusPhrase(raw);
      if (phrase && keywordMatchesPostTitle(phrase, title)) return phrase;
    }
    for (const candidate of secondaryStoredKeywords) {
      const phrase = firstFocusPhrase(candidate);
      if (phrase && keywordMatchesPostTitle(phrase, title)) return phrase;
    }
    return inferFocusKeywordFromTitle(title);
  }

  for (const raw of explicitAcfKeywords) {
    const phrase = firstFocusPhrase(raw);
    if (phrase) return phrase;
  }
  for (const candidate of secondaryStoredKeywords) {
    const phrase = firstFocusPhrase(candidate);
    if (phrase) return phrase;
  }
  return title ? inferFocusKeywordFromTitle(title) : "";
}

/** Collapsed Overview grid: show the live row keyword after AISEO writes it. */
export function overviewGridFocusKeywordLabel(args: {
  storedKeyword?: string | null;
  title?: string | null;
  postType?: string | null;
}): string {
  const stored = (args.storedKeyword ?? "").trim();
  if (stored) return stored;
  return focusKeywordFromWordPressSources({
    fieldsKeyword: "",
    title: args.title,
    collection: args.postType === "page" ? "pages" : "posts",
  });
}

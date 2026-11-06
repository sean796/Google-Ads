export type SitemapFuzzyLinkCandidate = {
  url: string;
  title: string;
  slug: string;
  bucket: "page" | "post";
  focusKeyword?: string;
  excerpt?: string;
  score?: number;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "get", "had", "has",
  "have", "he", "how", "i", "if", "in", "into", "is", "it", "its", "just",
  "may", "me", "might", "more", "my", "no", "not", "of", "on", "or", "our",
  "out", "she", "should", "so", "some", "such", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "too", "up", "use",
  "very", "was", "we", "were", "what", "when", "where", "which", "while",
  "who", "whom", "why", "will", "with", "would", "you", "your",
]);

export function slugFromUrl(url: string): string {
  try {
    const pathname = new URL(url.trim()).pathname.replace(/\/+$/, "");
    return (pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  } catch {
    return (url.trim().replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "").toLowerCase();
  }
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function urlPathLower(url: string): string {
  try {
    return new URL(url.trim()).pathname.toLowerCase().replace(/-/g, " ");
  } catch {
    return url.toLowerCase().replace(/-/g, " ");
  }
}

function urlPathHyphenLower(url: string): string {
  try {
    return new URL(url.trim()).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Rough word stem ("motorized" -> "motoriz", "blinds" -> "blind") matching Neo_Pulse_Wp_Search::match_stem. */
export function matchStem(term: string): string {
  const t = term.toLowerCase().trim();
  if (t.length < 5) return "";
  const suffixes = ["ing", "ed", "es", "ers", "er", "ly", "s"];
  for (const suffix of suffixes) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 4) {
      return t.slice(0, t.length - suffix.length);
    }
  }
  return "";
}

function tokenizeWords(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    const isAlphaNum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      cur += lower[i];
    } else if (cur.length > 0) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Whole-word or word-start match (so "blind" matches "blinds" but "art" does not match "start"). */
function hasWordPrefix(text: string, term: string): boolean {
  if (!text || !term) return false;
  const words = tokenizeWords(text);
  return words.some((w) => w === term || w.startsWith(term));
}

/** Extract single terms + hyphenated/spaced bigrams matching Neo_Pulse_Wp_Chat_Rag::extract_match_terms. */
export function extractFuzzyMatchTerms(
  query: string,
  extraPhrases: string[] = [],
): { words: string[]; matchTerms: string[] } {
  const rawWords = tokenizeWords(query);
  const words: string[] = [];
  const seenWords = new Set<string>();
  for (const w of rawWords) {
    if (w.length < 2 || STOP_WORDS.has(w) || seenWords.has(w)) continue;
    seenWords.add(w);
    words.push(w);
  }

  const terms = new Set<string>(words);
  for (let i = 0; i < rawWords.length - 1; i += 1) {
    const w1 = rawWords[i]!;
    const w2 = rawWords[i + 1]!;
    if (w1.length < 2 || w2.length < 2) continue;
    if (STOP_WORDS.has(w1) || STOP_WORDS.has(w2)) continue;
    terms.add(`${w1}-${w2}`);
    terms.add(`${w1} ${w2}`);
  }

  for (const phrase of extraPhrases) {
    const pWords = tokenizeWords(phrase).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
    if (pWords.length === 0) continue;
    const joinedSpace = pWords.join(" ");
    const joinedHyphen = pWords.join("-");
    terms.add(joinedSpace);
    terms.add(joinedHyphen);
    for (const pw of pWords) {
      terms.add(pw);
      if (!seenWords.has(pw)) {
        seenWords.add(pw);
        words.push(pw);
      }
    }
  }

  return { words, matchTerms: Array.from(terms) };
}

/**
 * Score one candidate using Neo_Pulse_Wp_Search::rank_results + match_percent and
 * Neo_Pulse_Wp_Chat_Rag::fuzzy_page_score. Product/commercial pages get a strong priority boost over posts.
 */
export function scoreFuzzySitemapCandidate(
  candidate: SitemapFuzzyLinkCandidate,
  queryText: string,
  extraPhrases: string[] = [],
): number {
  const { words, matchTerms } = extractFuzzyMatchTerms(queryText, extraPhrases);
  if (matchTerms.length === 0) {
    return candidate.bucket === "page" ? 65 : 10;
  }

  const titleLower = candidate.title.toLowerCase();
  const slugLower = candidate.slug.toLowerCase();
  const pathSpaceLower = urlPathLower(candidate.url);
  const pathHyphenLower = urlPathHyphenLower(candidate.url);
  const metaLower = `${candidate.focusKeyword ?? ""} ${candidate.excerpt ?? ""}`.toLowerCase();

  let ragFuzzyScore = 0;
  for (const term of matchTerms) {
    if (term.length < 2) continue;
    const hitSlug = slugLower.includes(term);
    const hitPath = pathSpaceLower.includes(term);
    const hitHyphen = pathHyphenLower.includes(term);
    const hitTitle = titleLower.includes(term);

    if (hitSlug || hitPath || hitHyphen || hitTitle) {
      ragFuzzyScore += term.length;
    }
    if (term.includes("-") && !term.includes(" ") && (hitSlug || hitHyphen)) {
      ragFuzzyScore += 15;
    }
  }

  let weightTotal = 0;
  const evalWords = words.slice(0, 18);
  for (const term of evalWords) {
    const stem = matchStem(term);
    let weight = 0;
    if (hasWordPrefix(titleLower, term)) {
      weight = 1.0;
    } else if (hasWordPrefix(`${slugLower} ${pathSpaceLower}`, term)) {
      weight = 0.85;
    } else if (hasWordPrefix(metaLower, term)) {
      weight = 0.7;
    } else if (stem && titleLower.includes(stem)) {
      weight = 0.6;
    } else if (stem && (slugLower.includes(stem) || pathSpaceLower.includes(stem) || metaLower.includes(stem))) {
      weight = 0.4;
    }
    weightTotal += weight;
  }

  const coverage = evalWords.length > 0 ? weightTotal / evalWords.length : 0;
  const matchPct = weightTotal > 0 ? Math.round(20 + 80 * coverage) : 0;

  // Content priority boost from Neo_Pulse_Wp_Search::content_priority_boost (pages +45, posts -18)
  const typeBoost = candidate.bucket === "page" ? 45 : -18;
  const pageHitBonus = candidate.bucket === "page" && ragFuzzyScore > 0 ? 25 : 0;

  return typeBoost + pageHitBonus + ragFuzzyScore + matchPct;
}


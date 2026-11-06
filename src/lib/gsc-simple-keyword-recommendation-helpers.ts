import { isBlockedContentTopicPhrase } from "@/lib/content-topic-blocklist";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Phrases that must NEVER be used as primary keyword (wrong-topic / known bad / competitor or wrong business). */
const BLOCKLISTED_PHRASES: string[] = [
  'patio',
  'umbrella',
  'text',
  'field', // Never "extra text field" or anything containing "text field" – UI/ACF label, not a real keyword
  'extra',
  'text field',
  'listicle',
  'guide',
  'outdoor furniture',
  // Hard-coded: never use these (competitor/wrong business – user-requested blocklist)
  'heritage lane dental edmonton',
  'heritage lane dental',
  'heritage family dental',
  'ermineskin dental',
  'heritage valley town centre dental',
  'heritage valley dental',
  'heritage valley town centre',
  'kaskitayo dental',
  'heritage park dental'
];

/** Exported so gsc-processing can reject blocklisted keyword from AI. */
export function isBlocklistedPrimaryKeyword(kw: string): boolean {
  const n = (kw || '').toLowerCase().trim();
  if (!n) return false;
  if (isOffensiveGscQuery(n)) return true;
  if (isBlockedContentTopicPhrase(n)) return true;
  const result = BLOCKLISTED_PHRASES.some(blocked => n === blocked || n.includes(blocked));
  return result;
}

/** Normalize for company-name check: lowercase, collapse spaces, strip punctuation. */
function normalizeForCompanyMatch(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
}

/**
 * Returns true if the keyword is the company/site name (e.g. "blind magic").
 * The company name must never be used as the primary keyword; use product/topic from page context instead.
 */
export function isCompanyNameKeyword(keyword: string, companyName?: string | null): boolean {
  const kw = normalizeForCompanyMatch(keyword);
  if (!kw) return false;
  const company = normalizeForCompanyMatch(companyName || '');
  if (!company) return false;
  // Exact match or one phrase fully contains the other (e.g. "blind magic" vs "blind magic window coverings")
  return kw === company || company.includes(kw) || kw.includes(company);
}

/**
 * Returns true if the string looks like a raw search-operator query (e.g. "-site:facebook.com -site:fb.me ...")
 * or other non-keyword text that must never be used as primary keyword or displayed in UI.
 */
export function isSearchOperatorOrRawQuery(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  // Google-style exclude operators or long operator-like strings
  if (/-site:\s*\S+/i.test(t)) return true;
  if (/^-\s*\w+:/i.test(t)) return true;
  if (t.includes('"') && (t.includes('-site:') || t.length > 120)) return true;
  return false;
}

/** First query in list that is not blocklisted and not a search-operator string. Exported for fallbacks in gsc-processing. */
export function firstNonBlocklistedQuery(queries: GSCQuery[]): string {
  for (const q of queries || []) {
    const qq = (q?.query || '').trim();
    if (qq && !isBlocklistedPrimaryKeyword(qq) && !isSearchOperatorOrRawQuery(qq)) return qq;
  }
  return '';
}

/**
 * First query that is not blocklisted AND passes AI competitor check. Check ALL candidates with AI before picking – never pick a competitor.
 * Exported for continue-optimization and getRecommendedKeywordFromGSC.
 */
export async function firstNonBlocklistedAndNonCompetitorQuery(
  queries: GSCQuery[],
  companyName: string | null | undefined,
  apiKey: string,
  model: string
): Promise<string> {
  if (!queries?.length || !apiKey?.trim()) return firstNonBlocklistedQuery(queries);
  for (const q of queries) {
    const qq = (q?.query || '').trim();
    if (!qq || isBlocklistedPrimaryKeyword(qq) || isSearchOperatorOrRawQuery(qq)) continue;
    const isCompetitor = await isCompetitorFocusedKeyword(qq, companyName, apiKey, model);
    if (!isCompetitor) return qq;
  }
  return '';
}

/**
 * Uses Open Router AI to detect if a keyword is competitor-focused or another business's name.
 * Returns true if the keyword should be rejected (competitor/business name), false if safe to use.
 * Used so we never pick competitor-focused keywords for page optimization.
 */
export async function isCompetitorFocusedKeyword(
  keyword: string,
  companyName: string | null | undefined,
  apiKey: string,
  model: string
): Promise<boolean> {
  const kw = (keyword || '').trim();
  if (!kw || kw.length < 2) return false;
  if (!apiKey || !apiKey.trim()) return false;
  try {
    const response = await postOpenRouterAppChatFetch( {
      method: 'POST',
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: `You are a keyword filter. The site we are optimizing for is: "${companyName || 'this site'}".

Keyword to check: "${kw}"

Is this keyword a COMPETITOR name, another business's name, or clearly competitor-focused (e.g. users searching for a different company)? Answer ONLY: YES or NO.
- YES = competitor, other business, or competitor-focused – never use for optimization.
- NO = topic, product, service, or generic – safe to use.
- Any phrase that is another business name (e.g. "heritage valley town centre dental", "heritage lane dental") = YES.

Answer:`,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase();
    const result = answer.startsWith('YES');
    return result;
  } catch {
    return false; // on error, don't block the keyword
  }
}

/** Normalize for comparison: lowercase, collapse spaces. */
function normalizePhrase(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Primary keyword MUST come from GSC. Returns true if the keyword equals or is a contiguous
 * phrase contained in at least one GSC query (e.g. "easy to clean" in "easy to clean window treatments").
 * Rejects invented phrases like "easy clean low" that mix in words from URL/title (e.g. "low" from "low-maintenance").
 */
export function isPrimaryKeywordFromGSC(keyword: string, queries: GSCQuery[]): boolean {
  const k = normalizePhrase(keyword);
  if (!k) return false;
  for (const q of queries || []) {
    const qq = normalizePhrase(q?.query || '');
    if (!qq) continue;
    if (qq === k) return true;
    if (qq.includes(k)) return true;
  }
  return false;
}

/** Slug words that indicate a specific topic (product, feature, comparison). Excludes generic URL parts. */
export const GENERIC_SLUG_PARTS = new Set(['blog', 'post', 'page', 'article', 'news', 'category', 'tag', 'author']);

/** Common English stopwords that are too generic to indicate topic relevance in URL/title matching. */
export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'all', 'also', 'any', 'because', 'before', 'between', 'both', 'each',
  'few', 'more', 'most', 'other', 'out', 'over', 'own', 'same', 'some', 'such', 'that',
  'these', 'this', 'those', 'through', 'under', 'until', 'up', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'how', 'your', 'you', 'its', 'our', 'my',
  'his', 'her', 'their', 'we', 'they', 'them', 'him', 'it', 'me', 'us',
  'here', 'there', 'into', 'during', 'only', 'get', 'got', 'make', 'made',
  'best', 'top', 'new', 'good', 'great', 'right', 'way', 'tips', 'guide', 'master',
]);

/** Generic category phrases that must never be used when the URL indicates a specific product/comparison. */
const GENERIC_CATEGORY_PHRASES = ['window coverings', 'window treatments', 'blinds and shades', 'blinds shades', 'window treatments florida'];

export function isGenericCategoryKeyword(kw: string): boolean {
  const k = normalizePhrase(kw);
  return GENERIC_CATEGORY_PHRASES.some(g => k.includes(g));
}

export function slugHasSpecificTerms(pageUrl: string): boolean {
  const slug = (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
  const words = slug.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !GENERIC_SLUG_PARTS.has(w));
  return words.length >= 2; // e.g. powerviews softtouchs
}

/** Derive a short 2-3 word keyword from URL slug when no GSC query matches. Filters stopwords and generic parts. */
export function deriveKeywordFromUrlSlug(pageUrl: string): string {
  const slug = (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
  const words = slug.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !GENERIC_SLUG_PARTS.has(w) && !STOPWORDS.has(w));
  if (words.length === 0) return '';
  const vsIdx = words.findIndex(w => w === 'vs');
  if (vsIdx >= 1 && vsIdx < words.length - 1) {
    return `${words[vsIdx - 1]} vs ${words[vsIdx + 1]}`;
  }
  // Deduplicate by stem (blind/blinds → keep first occurrence)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    const stem = w.replace(/s$/, '');
    if (!seen.has(stem)) {
      seen.add(stem);
      unique.push(w);
    }
  }
  return unique.slice(0, 3).join(' ').trim();
}

/**
 * Shorten any keyword to 2-3 significant words. Strips stopwords, deduplicates by stem,
 * and keeps the most meaningful terms. Use this as a final pass on any primary keyword.
 */
export function shortenToShortTail(keyword: string, maxWords: number = 3): string {
  const words = (keyword || '').toLowerCase().trim().split(/\s+/);
  if (words.length <= maxWords) return keyword.trim();
  const significant = words.filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (significant.length === 0) return words.slice(0, maxWords).join(' ');
  // Deduplicate by stem
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of significant) {
    const stem = w.replace(/s$/, '');
    if (!seen.has(stem)) {
      seen.add(stem);
      unique.push(w);
    }
  }
  return unique.slice(0, maxWords).join(' ');
}

/** Returns true if keyword contains at least one significant (non-stopword) term from the URL slug (e.g. powerview, softtouch, venetian, blind). */
export function keywordMatchesUrlIntent(keyword: string, pageUrl: string, pageTitle?: string): boolean {
  const kw = normalizePhrase(keyword);
  if (!kw || kw.length < 3) return false;
  const slug = (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
  const slugWords = slug.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !GENERIC_SLUG_PARTS.has(w) && !STOPWORDS.has(w));
  const titleWords = pageTitle
    ? pageTitle.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
    : [];
  const topicWords = [...new Set([...slugWords, ...titleWords])];
  if (topicWords.length === 0) return false;
  return topicWords.some(tw => {
    const stem = tw.replace(/s$/, '');
    return kw.includes(tw) || kw.includes(stem);
  });
}

/**
 * When AI returns a keyword that is NOT from GSC: if it matches URL intent, keep it.
 * Otherwise pick the GSC query that best matches the URL slug (most word overlap). Fallback: first non-blocklisted.
 */
export function bestGSCQueryForInvalidKeyword(aiKeyword: string, queries: GSCQuery[], pageUrl?: string): string {
  if (pageUrl && keywordMatchesUrlIntent(aiKeyword, pageUrl)) return aiKeyword;
  if (pageUrl && queries?.length) {
    const slug = (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
    const slugWords = slug.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !GENERIC_SLUG_PARTS.has(w));
    if (slugWords.length > 0) {
      let best = '';
      let bestScore = -1;
      for (const q of queries) {
        const qq = normalizePhrase(q?.query || '');
        if (!qq || isBlocklistedPrimaryKeyword(qq) || isSearchOperatorOrRawQuery(qq)) continue;
        const score = slugWords.filter(sw => qq.includes(sw) || qq.includes(sw.replace(/s$/, ''))).length;
        if (score > bestScore) {
          bestScore = score;
          best = qq;
        }
      }
      if (best) return best;
    }
  }
  return firstNonBlocklistedQuery(queries);
}

/**
 * Remove bracket placeholders (e.g. [city name], [city/region]) from a keyword.
 * Call this before accepting or storing any keyword so we never show or use placeholders.
 */
export function stripBracketPlaceholders(keyword: string): string {
  if (!keyword || typeof keyword !== 'string') return (keyword || '').trim();
  return keyword
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove a spurious leading lowercase "p" from keywords (e.g. "pShop Hunter Douglas" → "Shop Hunter Douglas").
 * Only strips when the next character is uppercase, to avoid breaking valid keywords like "photography".
 */
export function stripLeadingP(keyword: string): string {
  if (!keyword || typeof keyword !== 'string') return (keyword || '').trim();
  const trimmed = keyword.trim();
  // Match: starts with lowercase "p" followed by uppercase letter
  if (/^p[A-Z]/.test(trimmed)) {
    return trimmed.slice(1).trim();
  }
  return trimmed;
}

/** Location/entity terms to strip so Keyword Focus is a short 2-3 word seed only (no places or entity names). */
const LOCATION_ENTITY_STOPWORDS = new Set(['florida', 'united', 'states', 'miami', 'tampa', 'orlando', 'city', 'county', 'area', 'near']);

/** Derive a short 2-3 word seed from prompt modifier or meta text when API/parse fails. No locations or entities. Exported for fallbacks. */
export function deriveKeywordFromModifier(modifier: string): string {
  const t = (modifier || '').trim();
  if (!t) return '';
  const stopwords = /^(the|and|in|for|to|of|a|an|this|that|it|is|are|we|our|company|specializes)$/i;
  let words = t.split(/\s+/)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => w.length > 1 && !stopwords.test(w))
    .filter(w => !LOCATION_ENTITY_STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) words = t.split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length > 1 && !stopwords.test(w));
  const phrase = words.slice(0, 3).join(' ').trim(); // 2-3 word seed only
  return phrase.length >= 2 ? phrase.substring(0, 80) : (words[0] || t).substring(0, 80);
}

/**
 * AI-only: Strip all locations/geolocations from a keyword for the ACF Keyword Focus field.
 * DFS and content may use the full keyword (e.g. "window coverings Florida"); keyword_focus gets location-free seed (e.g. "window coverings").
 * Returns the same keyword if API key missing or request fails (caller can keep full keyword or skip ACF).
 */
export async function stripLocationsFromKeywordForACF(
  keyword: string,
  apiKey: string | null | undefined,
  model: string
): Promise<string> {
  const raw = (keyword || '').trim();
  if (!raw) return '';
  if (!apiKey || !apiKey.trim()) return deriveKeywordFromModifier(raw);

  const prompt = `You are a keyword cleaner. Remove ALL locations and geographic terms from the keyword phrase, but you MUST NOT change the order of the remaining words or add new words.

KEYWORD: "${raw}"

RULES:
- Remove every location: cities, states, countries, regions, neighborhoods, "near me", area names, etc.
- Keep only the short topic/service seed (2-4 words). Examples:
  * "window coverings Florida" → "window coverings"
  * "blinds installation Tampa Florida" → "blinds installation"
  * "patio covers Miami" → "patio covers"
- Return ONLY the cleaned keyword phrase. No quotes, no explanation, no punctuation.`;

  try {
    const response = await postOpenRouterAppChatFetch( {
      method: 'POST',
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 30,
      }),
    });
    if (!response.ok) return deriveKeywordFromModifier(raw);
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!content || content.length < 2) return deriveKeywordFromModifier(raw);
    return content.substring(0, 80);
  } catch {
    return deriveKeywordFromModifier(raw);
  }
}

import type { WordPressSite } from "@/components/integrations/types";
import {
  COMPETITOR_GSC_QUERY_ROW_LIMIT,
  fetchCompetitorGscQueries,
} from "@/lib/competitor-research/competitor-gsc-queries";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";
import { isBlockedContentTopicPhrase } from "@/lib/content-topic-blocklist";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
import { keywordUniquenessKey } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import { gscQueryMatchesTradingName } from "@/lib/sap-brand-and-brevity";

export const BULK_GSC_QUERY_ROW_LIMIT = 10000;

/** Extra GSC rows beyond SAP budget so short-tail filtering still has candidates. */
export const ENTITY_GSC_ROW_BUFFER = 20;

/** Max GSC rows in entity site warm cache and Details drawer export (last 90 days). */
export const ENTITY_SITE_WARM_GSC_ROW_LIMIT = COMPETITOR_GSC_QUERY_ROW_LIMIT;

/** GSC fetch rowLimit for Entity Clusters: SAP budget + buffer (not full history / 10k). */
export function entityGscRowLimitForSapBudget(sapRowCount: number): number {
  const n = Math.floor(Number(sapRowCount));
  if (!Number.isFinite(n) || n < 1) return ENTITY_GSC_ROW_BUFFER + 1;
  return n + ENTITY_GSC_ROW_BUFFER;
}

const SHORT_TAIL_MIN_WORDS = 2;
const SHORT_TAIL_MAX_WORDS = 4;
/** SAP focus-keyword base (before entity): 2–3 words only. */
export const SAP_KEYWORD_BASE_MAX_WORDS = 3;

const GSC_QUESTION_START =
  /^(how|what|why|when|where|who|which|can|do|does|did|is|are|was|were|should|could|would|will)\b/i;

/** Informational / blog-style GSC phrases unsuitable for SAP product landings. */
const SAP_INFO_BLOCKLIST =
  /\b(levels?|opacity|transparen\w*|competitors?|comparison|compare|versus|\bvs\b|meaning|definition|guides?|tutorials?|diy|tips|tricks|chargers?|charging|batteries|cost|costs|price|pricing|cheap|reviews?|ratings?|pros|cons|warranty|ideas|inspiration|blogs?|articles?|difference|differences)\b/i;

/** Product, service, or local commercial intent required for SAP base keywords. */
const SAP_PRODUCT_SIGNAL =
  /\b(blinds?|shades?|shutters?|drapery|draperies|curtains?|drapes?|sheers?|roman|cellular|roller|woven|wood|motorized|treatments?|windows?|glamp\w*|camping|camp\b|cabin\w*|cabins?|retreats?|lodging|lodges?|tents?|domes?|outdoors?|resorts?|getaways?|pods?|patio\w*|near me|installation|install|repair|custom|design|dealer|store|shop|hunter|douglas|alta|somfy|powerview|silhouette|luxaflex|panel[- ]track|blackout|black out)\b/i;

const BRAND_PHRASE_STOP = new Set(["and", "the", "of", "in", "a", "an", "for", "to", "at", "by"]);

function normalizeBrandSourceLabel(raw: string): string {
  return raw
    .split(/[:|]/)[0]!
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Contiguous word phrases from business / site name used to drop branded GSC queries. */
export function brandExclusionPhrasesFromNames(...names: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const norm = normalizeBrandSourceLabel(raw ?? "");
    if (!norm) continue;
    out.add(norm);
    const words = norm.split(" ").filter((w) => w.length > 1 && !BRAND_PHRASE_STOP.has(w));
    for (let i = 0; i < words.length; i++) {
      for (let len = 2; len <= Math.min(5, words.length - i); len++) {
        out.add(words.slice(i, i + len).join(" "));
      }
    }
  }
  return [...out].filter((p) => p.split(/\s+/).length >= 2);
}

export function gscQueryContainsBrandPhrase(query: string, brandPhrases: readonly string[]): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q || brandPhrases.length === 0) return false;
  for (const phrase of brandPhrases) {
    const p = phrase.trim().toLowerCase();
    if (p.length < 4) continue;
    if (q.includes(p)) return true;
  }
  return false;
}

/**
 * True when the keyword is the connected site's company/brand name (navigational), not a product topic.
 * Uses multi-word brand phrases from the site name (e.g. "blind magic" from "Blind Magic Window Coverings").
 */
export function isConnectedSiteBrandAsKeyword(
  keyword: string,
  companyName?: string | null,
): boolean {
  const kw = (keyword || "").trim();
  const company = (companyName || "").trim();
  if (!kw || !company) return false;
  const phrases = brandExclusionPhrasesFromNames(company);
  return (
    gscQueryContainsBrandPhrase(kw, phrases) || gscQueryMatchesTradingName(kw, company, phrases)
  );
}

/** GSC query suitable as SAP base keyword: 2–4 words, not a question. */
export function isShortTailGscQuery(query: string): boolean {
  const q = query.trim();
  if (!q || /\?/.test(q)) return false;
  if (GSC_QUESTION_START.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length >= SHORT_TAIL_MIN_WORDS && words.length <= SHORT_TAIL_MAX_WORDS;
}

/** SAP row keyword base only: 2–3 words, not a question, no site: operator. */
export function isSapKeywordBaseGscQuery(query: string): boolean {
  const q = query.trim();
  if (!q || /\?/.test(q) || /^site:/i.test(q)) return false;
  if (GSC_QUESTION_START.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length >= SHORT_TAIL_MIN_WORDS && words.length <= SAP_KEYWORD_BASE_MAX_WORDS;
}

/** 2–3 word transactional GSC phrase for SAP keyword base (before entity). */
export function isTransactionalSapKeywordBaseGscQuery(query: string): boolean {
  const q = query.trim();
  if (!isSapKeywordBaseGscQuery(q)) return false;
  if (SAP_INFO_BLOCKLIST.test(q)) return false;
  return SAP_PRODUCT_SIGNAL.test(q);
}

/** Short-tail GSC query with transactional product/service intent for SAP landings. */
export function isTransactionalSapGscQuery(query: string): boolean {
  const q = query.trim();
  if (!isShortTailGscQuery(q)) return false;
  if (SAP_INFO_BLOCKLIST.test(q)) return false;
  return SAP_PRODUCT_SIGNAL.test(q);
}

/** Site-wide GSC query rows: clicks desc, then impressions desc, then position asc. */
export function sortGscQueriesByStats(queries: GscSiteQueryRow[]): GscSiteQueryRow[] {
  return [...queries].sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.impressions !== a.impressions) return b.impressions - a.impressions;
    return (a.position || 0) - (b.position || 0);
  });
}

export function gscKeywordStringsFromQueries(queries: GscSiteQueryRow[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of queries) {
    const kw = row.query?.trim();
    if (!kw || isOffensiveGscQuery(kw) || isBlockedContentTopicPhrase(kw)) continue;
    const key = keywordUniquenessKey(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= limit) break;
  }
  return out;
}

export function gscShortTailKeywordStringsFromQueries(
  queries: GscSiteQueryRow[],
  limit: number,
  excludeBrandPhrases: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of queries) {
    const kw = row.query?.trim();
    if (!kw || isOffensiveGscQuery(kw) || isBlockedContentTopicPhrase(kw) || !isTransactionalSapGscQuery(kw)) continue;
    if (gscQueryContainsBrandPhrase(kw, excludeBrandPhrases)) continue;
    const key = keywordUniquenessKey(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= limit) break;
  }
  return out;
}

export function gscSapKeywordBaseStringsFromQueries(
  queries: GscSiteQueryRow[],
  limit: number,
  excludeBrandPhrases: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of queries) {
    const kw = row.query?.trim();
    if (!kw || isOffensiveGscQuery(kw) || isBlockedContentTopicPhrase(kw) || !isTransactionalSapKeywordBaseGscQuery(kw)) continue;
    if (gscQueryContainsBrandPhrase(kw, excludeBrandPhrases)) continue;
    const key = keywordUniquenessKey(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= limit) break;
  }
  return out;
}

/** Stats-sorted GSC queries → keyword strings only (for OpenRouter payloads). */
export function gscKeywordsForOpenRouter(
  queries: GscSiteQueryRow[],
  limit: number,
): string[] {
  return gscKeywordStringsFromQueries(sortGscQueriesByStats(queries), limit);
}

/** Short-tail transactional GSC queries only (2–4 words, product/service intent, no brand name). */
export function gscShortTailKeywordsForOpenRouter(
  queries: GscSiteQueryRow[],
  limit: number,
  excludeBrandPhrases: readonly string[] = [],
): string[] {
  return gscShortTailKeywordStringsFromQueries(
    sortGscQueriesByStats(queries),
    limit,
    excludeBrandPhrases,
  );
}

/** Every GSC query string for entity keyword fill (minimal filtering; place stripped at compose). */
export function gscAllQueryStringsForEntityKeywordFill(
  queries: GscSiteQueryRow[],
  excludeBrandPhrases: readonly string[] = [],
  siteName?: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const company = siteName?.trim() ?? "";
  for (const row of sortGscQueriesByStats(queries)) {
    const kw = row.query?.trim();
    if (!kw || isOffensiveGscQuery(kw) || isBlockedContentTopicPhrase(kw)) continue;
    if (gscQueryContainsBrandPhrase(kw, excludeBrandPhrases)) continue;
    if (company && gscQueryMatchesTradingName(kw, company, excludeBrandPhrases)) continue;
    const key = keywordUniquenessKey(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out;
}

/** SAP keyword bases from every GSC query in the bundle (no row-budget cap). */
export function gscSapKeywordBasesFromAllQueries(
  queries: GscSiteQueryRow[],
  excludeBrandPhrases: readonly string[] = [],
): string[] {
  const limit = Math.max(queries.length, 1);
  return gscSapKeywordBasesForOpenRouter(queries, limit, excludeBrandPhrases);
}

/** SAP keyword bases only: 2–3 word transactional GSC phrases (entity appended separately). */
export function gscSapKeywordBasesForOpenRouter(
  queries: GscSiteQueryRow[],
  limit: number,
  excludeBrandPhrases: readonly string[] = [],
): string[] {
  return gscSapKeywordBaseStringsFromQueries(
    sortGscQueriesByStats(queries),
    limit,
    excludeBrandPhrases,
  );
}

export type BulkSiteGscQueriesResult = {
  queries: GscSiteQueryRow[];
  dateRange: GscCompetitorDateRange;
};

/** Full property-level GSC queries (not page-scoped). */
export async function fetchBulkSiteGscQueries(
  site: WordPressSite,
  onProgress?: (message: string) => void,
): Promise<BulkSiteGscQueriesResult> {
  onProgress?.("Loading GSC keywords");
  const siteUrl = site.siteUrl?.trim();
  if (!siteUrl) {
    throw new Error("Site URL is required to load GSC keywords.");
  }

  const res = await fetchCompetitorGscQueries({
    siteUrl,
    rowLimit: BULK_GSC_QUERY_ROW_LIMIT,
  });
  if (!res.ok) {
    throw new Error(
      res.error || "Google Search Console returned no keywords for this site.",
    );
  }

  const queries = sortGscQueriesByStats(res.queries.filter((q) => q.query?.trim()));
  if (queries.length === 0) {
    throw new Error(
      "Google Search Console returned no keywords for this site. Connect GSC and ensure query data exists.",
    );
  }

  return { queries, dateRange: res.dateRange };
}

export type EntityGscKeywordBundle = BulkSiteGscQueriesResult;

export async function fetchEntityGscKeywordBundle(
  site: WordPressSite,
  rowCount: number,
  onProgress?: (message: string) => void,
): Promise<EntityGscKeywordBundle> {
  onProgress?.("Loading GSC keywords");
  const siteUrl = site.siteUrl?.trim();
  if (!siteUrl) {
    throw new Error("Site URL is required to load GSC keywords.");
  }

  const rowLimit = entityGscRowLimitForSapBudget(rowCount);
  const res = await fetchCompetitorGscQueries({
    siteUrl,
    rowLimit,
  });
  if (!res.ok) {
    throw new Error(
      res.error || "Google Search Console returned no keywords for this site.",
    );
  }

  const queries = sortGscQueriesByStats(res.queries.filter((q) => q.query?.trim()));
  if (queries.length === 0) {
    throw new Error(
      "Google Search Console returned no keywords for this site. Connect GSC and ensure query data exists.",
    );
  }

  return { queries, dateRange: res.dateRange };
}

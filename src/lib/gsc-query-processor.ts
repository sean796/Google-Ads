import { notify } from "@/lib/app-notifications";
import { NOTIFY_GETTING_KEYWORD_RECOMMENDATION, NOTIFY_KEYWORD_RECOMMENDATION_READY } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { getRecommendedKeywordFromGSC, isBlocklistedPrimaryKeyword, deriveKeywordFromModifier, firstNonBlocklistedQuery, isPrimaryKeywordFromGSC, bestGSCQueryForInvalidKeyword, keywordMatchesUrlIntent, isSearchOperatorOrRawQuery } from "@/lib/gsc-simple-keyword-recommendation";
import { type WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "./optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { sortGscQueriesByStats } from "@/lib/bulk/bulk-gsc-site-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export type GscPageQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position?: number;
};

/**
 * Pre-sort page GSC rows (clicks desc, impressions desc), strip stats for LLM prompts.
 */
export function formatGscPageQueriesForLlm(
  queries: GscPageQueryRow[],
  pageUrl: string,
  limit = 50,
): string {
  if (!queries.length) return "";
  const sorted = sortGscQueriesByStats(queries as GscSiteQueryRow[]);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const row of sorted) {
    const kw = row.query?.trim();
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    keywords.push(kw);
    if (keywords.length >= limit) break;
  }
  if (!keywords.length) return "";
  const urlLabel = pageUrl.trim() || "this page";
  return [
    `GSC keywords for ${urlLabel} (pre-sorted: clicks descending, then impressions descending; stats stripped):`,
    ...keywords.map((k, i) => `${i + 1}. ${k}`),
  ].join("\n");
}

/**
 * Unified AI-forward query filtering and ranking
 * Acts as a local SEO expert, making all filtering and ranking decisions in one pass
 */
export async function filterAndRankQueriesWithAI(
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  pageUrl: string,
  apiKey: string,
  model: string,
  companyName?: string,
  pageTitle?: string
): Promise<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  if (!queries || queries.length === 0) return queries;

  const companyNameLower = companyName?.toLowerCase().trim() || '';
  const slug = pageUrl ? (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ') : '';
  const context = pageTitle ? `page titled "${pageTitle}" (${pageUrl})` : (pageUrl ? `page "${pageUrl}"` : 'this site');
  
  const slugTerms = slug.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);

  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    batches.push(queries.slice(i, i + batchSize));
  }

  const results = await Promise.all(batches.map(async (batch) => {
    const queriesList = formatGscPageQueriesForLlm(batch, pageUrl, batch.length);

    const titleBlock = pageTitle ? `**PAGE TITLE (HIGHEST PRIORITY)**: "${pageTitle}"\nThe title defines EXACTLY what this page is about. Only queries matching this topic should rank high.\n\n` : '';
    const prompt = `You are a local SEO expert. Analyze these GSC queries for ${context}${companyNameLower ? ` (company: "${companyNameLower}")` : ''}.

${titleBlock}**URL INTENT (CRITICAL - RANK FIRST)**: The page URL slug is "${slug}".
Key topic terms: [${slugTerms.join(', ')}].

RANKING RULES (strict priority order):
1. Queries whose meaning/topic MATCHES the page title AND/OR URL slug topic must be ranked FIRST. The title and URL slug tell you exactly what this page is about - rank queries that share the same subject matter highest.
2. Queries that are UNRELATED to the page's title/URL topic must be ranked LAST or EXCLUDED, even if they have high traffic. A high-traffic keyword that doesn't match the page topic is useless for optimization.
3. Among topic-relevant queries, preserve the pre-sorted traffic order when relevance is equal.

Filter and rank. Return JSON array of query numbers to KEEP, ordered by: (1) semantic match to URL topic, (2) list order (already sorted by clicks then impressions). First in array = best match for this URL's intent.

Consider:
- English only
- Service/product keywords (not competitor business names${companyNameLower ? ` or "${companyNameLower}" queries` : ''})
- **URL-topic relevance: highest priority - a high-traffic keyword that doesn't match the URL topic is WORSE than a lower-traffic keyword that does**

Queries:
${queriesList}

Return: [3, 1, 5, 7] (query numbers, best first)`;

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\d\s,]+\]/) || content.match(/```(?:json)?\s*(\[[\d\s,]+\])\s*```/);
    
    if (jsonMatch) {
      const validIndices: number[] = JSON.parse(jsonMatch[0] || jsonMatch[1] || '[]');
      // Preserve AI ranking order: first in array = best (URL-intent match). Do NOT just filter.
      const ordered = validIndices
        .filter((n) => n >= 1 && n <= batch.length)
        .map((n) => batch[n - 1]);
      const result = ordered.length > 0 ? ordered : batch;
      return result;
    }
    return batch;
  }));

  return results.flat();
}

export function isNonEnglishKeyword(query: string): boolean {
  return false; // Deprecated - use unified AI filtering
}

/** ACF context: source of truth for primary keyword (prompt_modifier / seo_prompt_modifier) */
export interface GSCAcfContext {
  promptModifier?: string;
  metaDescription?: string;
  pageTitle?: string;
}

export interface GscProcessedQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSimpleClusterAnalysis {
  overallRecommendation: {
    recommendedKeyword: string;
    secondaryKeywords: string[];
    topCluster: string;
    reasoning: string;
  };
  clusters: Array<{ name: string; queries: GscProcessedQuery[] }>;
}

interface GscResultInput {
  queries: Array<{
    query?: unknown;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
}

export async function processGSCQueriesAndAnalyze(
  gscResult: GscResultInput,
  site: WordPressSite,
  url: string,
  onClusterAnalysisComplete?: (analysis: GscSimpleClusterAnalysis) => void,
  onClusterAnalysisError?: (error: unknown) => void,
  acfContext?: GSCAcfContext,
  /** When set, entity-style GSC filtering applies only for the entity CPT (not every URL on sites with an entity sitemap). */
  postTypeEndpoint?: string | null,
): Promise<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  if (!gscResult.queries || !Array.isArray(gscResult.queries) || gscResult.queries.length === 0) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 3);
    throw new Error(`No valid search queries found for this page in Google Search Console. The page may not have received any search traffic in the selected date range (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}).`);
  }

  const openRouterApiKey = loadApiKey();
  const researchModel = getResearchModel(site.id);

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key is required for query processing');
  }

  // Normalize queries - minimal validation
  const rawQueries = gscResult.queries
    .filter((q) => q && typeof q === 'object' && q.query && typeof q.query === 'string' && q.query.trim().length > 0)
    .map((q) => ({
      query: String(q.query).trim(),
      clicks: q.clicks || 0,
      impressions: q.impressions || 0,
      ctr: q.ctr || 0,
      position: q.position || 0
    }));

  // Entity-style query filtering only for URLs in the entity sitemap CPT (not all posts).
  const { restCollectionMatchesEntitySitemap } = await import("@/lib/entity-endpoint-extractor");
  const isEntityPage = restCollectionMatchesEntitySitemap(site, postTypeEndpoint);
  let companyNameToCheck = site.name?.toLowerCase().trim() || '';
  if (!companyNameToCheck && url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '').split('.')[0];
      companyNameToCheck = domain.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    } catch {
      // Malformed site URL: keep the empty company name.
    }
  }

  // Single AI call does all filtering and ranking
  const serviceFocusedQueries = await filterAndRankQueriesWithAI(
    rawQueries,
    url,
    openRouterApiKey,
    researchModel,
    isEntityPage ? companyNameToCheck : undefined,
    acfContext?.pageTitle
  );

  if (serviceFocusedQueries.length === 0) {
    throw new Error(`No valid search queries found after AI filtering.`);
  }
  // SIMPLE: Get recommended keyword from AI (non-blocking)
  if (serviceFocusedQueries.length === 0) {
    console.warn('[GSC Query Processor] No service-focused queries remaining after filtering.');
    return [];
  }

  if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
    if (!getMuteOptimizationToasts()) notify.info(NOTIFY_GETTING_KEYWORD_RECOMMENDATION, { duration: 2000 });

    // Simple async call - don't block
    Promise.resolve().then(async () => {
      try {
        const researchModel = getResearchModel(site.id);
        const keywordRecommendation = await getRecommendedKeywordFromGSC(serviceFocusedQueries, {
          apiKey: openRouterApiKey,
          model: researchModel,
          pageUrl: url,
          pageTitle: acfContext?.pageTitle,
          companyName: companyNameToCheck || site.name || undefined,
          promptModifier: acfContext?.promptModifier,
          metaDescription: acfContext?.metaDescription
        });

        // Never send blocklisted phrase to UI (sanitize before storing in cluster analysis)
        let primaryKeyword = keywordRecommendation.primaryKeyword?.trim() || '';
        if (primaryKeyword && isBlocklistedPrimaryKeyword(primaryKeyword)) {
          const sourceText = (acfContext?.promptModifier || acfContext?.metaDescription || '').trim();
          const replaced = sourceText ? deriveKeywordFromModifier(sourceText).trim() : firstNonBlocklistedQuery(serviceFocusedQueries);
          console.warn('[GSC Query Processor] Blocklisted keyword replaced before UI:', { from: primaryKeyword, to: replaced, hasSource: !!sourceText });
          primaryKeyword = replaced;
        }
        // URL/TITLE INTENT GUARDRAIL: reject keyword with zero URL-slug/title overlap
        if (primaryKeyword && url && !keywordMatchesUrlIntent(primaryKeyword, url, acfContext?.pageTitle)) {
          const intentMatch = serviceFocusedQueries.filter(q => {
            const qq = (q?.query || '').trim();
            return qq && !isBlocklistedPrimaryKeyword(qq) && !isSearchOperatorOrRawQuery(qq) && keywordMatchesUrlIntent(qq, url, acfContext?.pageTitle);
          });
          if (intentMatch.length > 0) {
            intentMatch.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
            primaryKeyword = intentMatch[0].query;
          }
        }
        // Second line of defense: primary keyword MUST be from GSC (verbatim or phrase in a query). Never show invented phrases like "easy clean low".
        if (primaryKeyword && !isPrimaryKeywordFromGSC(primaryKeyword, serviceFocusedQueries)) {
          primaryKeyword = bestGSCQueryForInvalidKeyword(primaryKeyword, serviceFocusedQueries, url);
          if (primaryKeyword) console.warn('[GSC Query Processor] Non-GSC keyword; using URL-best:', primaryKeyword);
        }

        // Create simple analysis object for compatibility (never use blocklisted phrase)
        const simpleAnalysis = {
          overallRecommendation: {
            recommendedKeyword: primaryKeyword,
            secondaryKeywords: keywordRecommendation.secondaryKeywords,
            topCluster: 'Recommended',
            reasoning: `AI recommended primary keyword: ${primaryKeyword || 'N/A'}${keywordRecommendation.secondaryKeywords.length > 0 ? `, ${keywordRecommendation.secondaryKeywords.length} secondary keywords` : ''}`
          },
          clusters: [{
            name: 'Recommended',
            queries: serviceFocusedQueries
          }]
        };
        
        if (onClusterAnalysisComplete) {
          onClusterAnalysisComplete(simpleAnalysis);
        }
        console.log('[Optimize Content] Keyword recommendation:', keywordRecommendation.primaryKeyword, keywordRecommendation.secondaryKeywords.length > 0 ? `+ ${keywordRecommendation.secondaryKeywords.length} secondary keywords` : '');
        if (!getMuteOptimizationToasts()) notify.success(NOTIFY_KEYWORD_RECOMMENDATION_READY, { duration: 2000 });
      } catch (error) {
        console.error('[Optimize Content] Error getting keyword recommendation:', error);
        if (onClusterAnalysisError) {
          onClusterAnalysisError(error);
        }
      }
    }).catch((error) => {
      console.error('[Optimize Content] Unexpected error in keyword recommendation:', error);
      if (onClusterAnalysisError) {
        onClusterAnalysisError(error);
      }
    });
  }

  return serviceFocusedQueries;
}


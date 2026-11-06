import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  GENERIC_SLUG_PARTS,
  STOPWORDS,
  bestGSCQueryForInvalidKeyword,
  deriveKeywordFromModifier,
  deriveKeywordFromUrlSlug,
  firstNonBlocklistedAndNonCompetitorQuery,
  firstNonBlocklistedQuery,
  isBlocklistedPrimaryKeyword,
  isCompetitorFocusedKeyword,
  isGenericCategoryKeyword,
  isPrimaryKeywordFromGSC,
  isSearchOperatorOrRawQuery,
  keywordMatchesUrlIntent,
  slugHasSpecificTerms,
  type GSCQuery,
} from "@/lib/gsc-simple-keyword-recommendation-helpers";
import { logger } from "@/lib/logger";

export {
  bestGSCQueryForInvalidKeyword,
  deriveKeywordFromModifier,
  deriveKeywordFromUrlSlug,
  firstNonBlocklistedAndNonCompetitorQuery,
  firstNonBlocklistedQuery,
  isBlocklistedPrimaryKeyword,
  isCompanyNameKeyword,
  isCompetitorFocusedKeyword,
  isPrimaryKeywordFromGSC,
  isSearchOperatorOrRawQuery,
  keywordMatchesUrlIntent,
  shortenToShortTail,
  stripBracketPlaceholders,
  stripLeadingP,
  stripLocationsFromKeywordForACF,
} from "@/lib/gsc-simple-keyword-recommendation-helpers";
export type { GSCQuery } from "@/lib/gsc-simple-keyword-recommendation-helpers";

export interface SimpleKeywordRecommendationOptions {
  apiKey: string;
  model: string;
  pageUrl?: string;
  pageTitle?: string;
  companyName?: string;
  /** SOURCE OF TRUTH: When provided, primary keyword MUST align with this (from ACF prompt_modifier / seo_prompt_modifier). */
  promptModifier?: string;
  /** Optional: meta description for context (e.g. rank_math_description). */
  metaDescription?: string;
}

export interface KeywordRecommendation {
  primaryKeyword: string;
  secondaryKeywords: string[];
}

/**
 * SIMPLE: ONE AI prompt, returns primary keyword + up to 5 secondary keywords
 * Primary keyword: Best single keyword to optimize for (from GSC queries)
 * Secondary keywords: Related keywords that expand visibility (NOT in GSC queries)
 * No JSON, no clusters, no validation - just newline-separated keywords
 */
export async function getRecommendedKeywordFromGSC(
  queries: GSCQuery[],
  options: SimpleKeywordRecommendationOptions
): Promise<KeywordRecommendation> {
  if (!queries || queries.length === 0) {
    throw new Error('No queries provided');
  }

  if (!options.apiKey || !options.apiKey.trim()) {
    throw new Error('API key is required');
  }

  // Build queries list for prompt
  const queriesList = queries
    .slice(0, 50) // Limit to first 50 to keep prompt manageable
    .map((q, i) => `${i + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || 'N/A'}`)
    .join('\n');

  const promptModifierTrimmed = (options.promptModifier ?? '').trim();
  const metaTrimmed = (options.metaDescription ?? '').trim();
  const hasPromptModifier = promptModifierTrimmed.length > 0;
  const hasMeta = metaTrimmed.length > 0;
  const sourceText = promptModifierTrimmed || metaTrimmed;
  const hasSource = sourceText.length > 0;

  const sourceOfTruthBlock = hasPromptModifier
    ? `**SOURCE OF TRUTH (MANDATORY)**:
The page has an ACF "Prompt Modifier" that defines what this page is about. You MUST use it as the PRIMARY source for the primary keyword.

PROMPT MODIFIER: "${promptModifierTrimmed.substring(0, 500)}"

RULES WHEN PROMPT MODIFIER IS PROVIDED:
1. The PRIMARY keyword (first line) MUST be a short-tailed 2-3 word seed phrase only - for seeding the page and Keyword Focus. Do NOT include locations, cities, or entity names (e.g. no "Florida", "United", city/neighborhood names).
2. Derive the seed from the modifier's topic (e.g. "window coverings", "blinds and shades", "patio covers") - same business/service as the modifier, but 2-3 words only, no geography or entities.
3. If a GSC query fits the modifier's topic, you may use a 2-3 word shortening of it (strip locations/entities). Otherwise derive a short seed from the modifier. Reject any GSC query whose topic does not match the modifier.`
    : '';

  const metaBlock = (options.metaDescription ?? '').trim().length > 0
    ? `META DESCRIPTION (for context): "${(options.metaDescription ?? '').trim().substring(0, 300)}"`
    : '';

  const siteContext =
    options.companyName || options.pageUrl
      ? `**SITE CONTEXT**: This website is ${options.companyName || "the site"}${
          options.pageUrl ? ` (${options.pageUrl})` : ""
        }.
Use the domain/TLD and any city/region words in the URL, title, and meta to infer where this business actually operates (for example, ".ca" plus "Edmonton" implies Edmonton, Alberta, Canada).
Keywords must be relevant to this site's business AND to its real service locations.
NEVER choose a keyword whose city/region clearly conflicts with the site's location. For example, do NOT select "commercial interior painting phoenix az" for an Edmonton, Alberta site; in that case prefer "commercial interior painting" or an Edmonton-based version instead, or strip the mismatched location and keep only the service/topic.`
      : '';
  const slug = options.pageUrl ? (options.pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ') : '';
  const slugTerms = slug.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !GENERIC_SLUG_PARTS.has(w) && !STOPWORDS.has(w));
  const titleTerms = options.pageTitle
    ? options.pageTitle.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 2 && !STOPWORDS.has(w))
    : [];
  const allTopicTerms = [...new Set([...slugTerms, ...titleTerms])];
  const titleBlock = options.pageTitle
    ? `**PAGE TITLE (HIGHEST PRIORITY - DEFINES THE PAGE TOPIC)**: "${options.pageTitle}"
The title tells you EXACTLY what this page is about. The primary keyword MUST be semantically related to this title.
`
    : '';
  const pageUrlRelevanceBlock = (options.pageUrl || options.pageTitle)
    ? `${titleBlock}**URL INTENT (HIGHEST PRIORITY - MUST ENFORCE)**: The page URL slug is "${slug}".
Key topic terms from URL and title: [${allTopicTerms.join(', ')}].

This page is specifically about the topic indicated by its URL slug and title. The PRIMARY keyword MUST be semantically related to this page topic.

RULES:
- The page TITLE and URL slug define the topic. A keyword MUST match what the page is actually about.
- PREFER a GSC query whose meaning/topic MATCHES the URL slug AND/OR title. The keyword must share the same subject matter.
- A keyword with high impressions/clicks but NO semantic relationship to the URL/title topic must NEVER be selected as primary. URL/title topic relevance beats traffic volume ALWAYS.
- For example: if the title is "Venetian Blind Basics" and URL slug contains "venetian-blind", the keyword MUST be about venetian blinds - NOT "master your homes" or any unrelated phrase.
- REJECT any keyword whose topic is unrelated to the URL slug and title, even if it has the most traffic.
- When NO GSC query matches the URL/title topic: DERIVE a 2–4 word keyword from the slug/title terms.
- NEVER return a generic site-wide keyword or an off-topic high-traffic keyword for a specific topic page.`
    : '';

  const prompt = `From these Google Search Console queries, recommend keywords for content optimization:

${pageUrlRelevanceBlock ? pageUrlRelevanceBlock + '\n\n' : ''}
${sourceOfTruthBlock}
${metaBlock ? metaBlock + '\n\n' : ''}
${siteContext}

GSC queries:
${queriesList}

${options.companyName ? `CRITICAL: DO NOT include "${options.companyName}" in any keywords.\n\n` : ''}
FILTERING RULES - SKIP these types of keywords:
1. **MANDATORY: Keywords NOT contextually relevant to the site's business/content**${options.companyName ? ` (${options.companyName})` : ''} - If a keyword doesn't make sense for the site's industry, products, or services, REJECT it immediately
2. **NEVER use "text field", "extra text field", or any phrase containing "text field"** – these are UI/ACF field labels, not real search keywords. Reject them always.
3. Competitor names: Skip any queries that appear to be specific business names or competitor brands
3b. **NEVER use Bali Blinds** (any casing) or DIY remove/detach/uninstall topics for Bali blinds — permanently blocked topic.
4. Location + Service combinations whose locations clearly do **not** match the site's real service area (for example, queries mentioning cities/states/countries that conflict with what the domain/TLD and page context imply). For those, either:
   - REJECT the keyword completely, or
   - When the service/topic is perfect but the location is wrong, STRIP the mismatched location and keep only the service/topic (e.g., use "commercial interior painting" instead of "commercial interior painting phoenix az" on an Edmonton site).
5. Acronyms or abbreviations that don't relate to the site's industry 
6. Keywords from completely different industries or topics than what the site covers
7. KEEP: Queries in "service/product in neighborhood" format **only when the neighborhood/city/region matches the site's real service area**.
8. KEEP: Queries that are just location names alone (without service/industry terms) **only when the location matches the site's real service area** (for example, an Edmonton site can keep "edmonton" or "edmonton ab", but must reject "phoenix az").

PRIMARY KEYWORD RULE (MANDATORY):
- The primary keyword MUST be SHORT-TAIL: exactly 2-3 words. NEVER more than 3 words. Examples of good primary keywords: "venetian blinds", "window coverings", "patio covers", "interior painting", "powerview shades".
- EITHER: (a) A short 2-3 word phrase extracted from a GSC query above (take the core topic, drop filler/location words), OR (b) When no GSC query matches the URL topic, derive a 2-3 word phrase from the slug/title.
  - Long GSC queries must be SHORTENED to their 2-3 word core. Example: "how to install venetian blinds in your home" → "venetian blinds". Example: "best window coverings for florida humidity" → "window coverings".
  - You may STRIP city/region names from a GSC query when they do not align with the site's real location.
- NEVER return generic category terms (window coverings, blinds, treatments) when the URL is specific (product names, comparisons).
- NEVER return the full URL slug or title as a keyword. Always distill to 2-3 words.

OUTPUT FORMAT (newline-separated, one keyword per line):
1. First line: BEST single primary keyword - MUST be exactly 2-3 words (short-tail seed keyword). ${hasPromptModifier ? 'No locations or entities. Align with the Prompt Modifier topic.' : 'Distilled from the queries above to the core topic.'}
2. Next 1-5 lines: Secondary keywords (related keywords NOT in the queries above that would expand visibility)

CRITICAL OUTPUT REQUIREMENTS:
- NO QUOTES (do not use " or ' around keywords)
- NO JSON
- NO explanations
- NO reasoning
- NO markdown
- NO code blocks
- NO numbering or bullets
- Just plain keyword text, one per line
- Apply filtering rules above before selecting keywords

Return the primary keyword on the first line, then up to 5 secondary keywords (one per line).`;

  try {
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(options.apiKey),
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 150 // Increased to allow for multiple keywords
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const aiFirstLine = content.split('\n')[0]?.trim().slice(0, 80) || '';

    if (!content || content.length === 0) {
      if (hasSource) {
        const derived = deriveKeywordFromModifier(sourceText);
        return { primaryKeyword: derived || '', secondaryKeywords: [] };
      }
      const fallback = firstNonBlocklistedQuery(queries) || '';
      return { primaryKeyword: fallback, secondaryKeywords: [] };
    }

    // Parse newline-separated keywords
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^["']+|["']+$/g, '').trim()) // Remove quotes
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      if (hasSource) {
        const derived = deriveKeywordFromModifier(sourceText);
        return { primaryKeyword: derived || '', secondaryKeywords: [] };
      }
      const fallback = firstNonBlocklistedQuery(queries) || '';
      return { primaryKeyword: fallback, secondaryKeywords: [] };
    }

    // First line is primary keyword
    let primaryKeyword = lines[0];
    if (isBlocklistedPrimaryKeyword(primaryKeyword)) {
      primaryKeyword = hasSource ? (deriveKeywordFromModifier(sourceText) || '') : firstNonBlocklistedQuery(queries) || '';
    }

    // URL/TITLE INTENT GUARDRAIL: If AI picked a keyword with zero overlap with URL slug + title topic words,
    // find the best GSC query that actually matches the page topic instead.
    if (primaryKeyword && options.pageUrl && !keywordMatchesUrlIntent(primaryKeyword, options.pageUrl, options.pageTitle)) {
      const intentMatching = queries.filter(q => {
        const qq = (q?.query || '').trim();
        return qq && !isBlocklistedPrimaryKeyword(qq) && !isSearchOperatorOrRawQuery(qq) && keywordMatchesUrlIntent(qq, options.pageUrl!, options.pageTitle);
      });
      if (intentMatching.length > 0) {
        intentMatching.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
        logger.warn('[Simple Keyword Recommendation] URL/title intent mismatch, replacing:', primaryKeyword, '->', intentMatching[0].query);
        primaryKeyword = intentMatching[0].query;
      } else if (options.pageUrl) {
        const derived = deriveKeywordFromUrlSlug(options.pageUrl);
        if (derived) {
          logger.warn('[Simple Keyword Recommendation] No GSC match for URL/title intent, using slug-derived:', derived);
          primaryKeyword = derived;
        }
      }
    }

    // REJECT generic category keywords when URL is specific (e.g. powerview vs softtouch page must NOT use "window coverings treatments")
    if (primaryKeyword && options.pageUrl && slugHasSpecificTerms(options.pageUrl) && isGenericCategoryKeyword(primaryKeyword)) {
      let urlBest = bestGSCQueryForInvalidKeyword('', queries, options.pageUrl);
      if (!urlBest || isGenericCategoryKeyword(urlBest)) {
        urlBest = deriveKeywordFromUrlSlug(options.pageUrl);
      }
      primaryKeyword = urlBest || primaryKeyword;
    }
    // When not in GSC: if AI keyword matches URL intent (e.g. powerview softtouch for comparison page), KEEP it.
    // Otherwise pick URL-best GSC query, not a generic one.
    if (primaryKeyword && !isPrimaryKeywordFromGSC(primaryKeyword, queries)) {
      const replaced = bestGSCQueryForInvalidKeyword(primaryKeyword, queries, options.pageUrl);
      if (replaced !== primaryKeyword) {
        primaryKeyword = replaced;
        if (primaryKeyword) logger.warn('[Simple Keyword Recommendation] AI keyword not in GSC; using URL-best:', lines[0], '->', primaryKeyword);
      }
    }

    // AI-driven: never use competitor-focused keywords. Check ALL GSC candidates with AI; pick first that passes (never pick a competitor).
    if (primaryKeyword && options.companyName && options.apiKey) {
      const isCompetitor = await isCompetitorFocusedKeyword(primaryKeyword, options.companyName, options.apiKey, options.model);
      if (isCompetitor) {
        const fallback = await firstNonBlocklistedAndNonCompetitorQuery(queries, options.companyName, options.apiKey, options.model);
        if (fallback) {
          primaryKeyword = fallback;
          logger.warn('[Simple Keyword Recommendation] Rejected competitor; using first AI-verified non-competitor GSC query:', primaryKeyword);
        }
      }
    }

    // Remaining lines (up to 5) are secondary keywords
    const secondaryKeywords = lines.slice(1, 6).filter(kw => kw && kw.length > 0);

    return {
      primaryKeyword: primaryKeyword || '',
      secondaryKeywords
    };
  } catch (error) {
    logger.error('[Simple Keyword Recommendation] Error:', error);
    const src = (options.promptModifier ?? '').trim() || (options.metaDescription ?? '').trim();
    if (src) {
      const derived = deriveKeywordFromModifier(src);
      return { primaryKeyword: derived || '', secondaryKeywords: [] };
    }
    const fallback = firstNonBlocklistedQuery(queries) || '';
    return { primaryKeyword: fallback, secondaryKeywords: [] };
  }
}

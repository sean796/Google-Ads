import { isBlockedContentTopicPhrase } from "./content-topic-blocklist";
import { isNonEnglishKeyword, filterAndRankQueriesWithAI } from "./gsc-query-processor";
import { getResearchModel } from "./optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { logger } from "@/lib/logger";

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SelectedKeywords {
  primaryKeyword: string;
  relatedKeywords: Array<{
    keyword: string;
    impressions: number;
    clicks: number;
    position: number;
  }>;
}

export interface SelectBestKeywordsFromGSCOptions {
  numberOfBlogs: number;
  blogTopic?: string;
  flowPurpose?: string;
  entity?: string;
  companyName?: string;
  siteUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Intelligently selects keywords from GSC data using AI (similar to bulk keyword logic)
 * Filters out company names and competitors, then uses AI to select best keywords
 */
export async function selectBestKeywordsFromGSC(
  gscQueries: GSCQuery[],
  apiKey: string,
  options: SelectBestKeywordsFromGSCOptions
): Promise<SelectedKeywords[]> {
  const {
    numberOfBlogs,
    blogTopic,
    flowPurpose = '',
    entity,
    companyName,
    siteUrl,
    model = getResearchModel(),
    temperature = 0.7,
    maxTokens = 2000,
  } = options;

  if (!gscQueries || gscQueries.length === 0) {
    return [];
  }

  // Use unified AI function to filter and rank queries
  const filteredQueries = (
    await filterAndRankQueriesWithAI(
      gscQueries,
      siteUrl || '',
      apiKey,
      model,
      companyName
    )
  ).filter((q) => !isBlockedContentTopicPhrase(q.query));

  if (filteredQueries.length === 0) {
    return [];
  }

  // Step 3: Use AI to select best keywords for each blog idea
  try {
    const queriesList = filteredQueries.map((q, idx) => 
      `${idx + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || 'N/A'}`
    ).join('\n');

    const siteContext = companyName && siteUrl ? `**CRITICAL SITE CONTEXT**: This website (${companyName} - ${siteUrl}) is the target site for all content. You MUST ensure ALL selected keywords are contextually relevant to this site's business, products, services, and content focus. Keywords that are NOT relevant to the site's industry, products, or services MUST be REJECTED immediately, even if they have high traffic data. For example, if the site is about window blinds, keywords like "VLTs" (Video Lottery Terminals or Very Large Telescopes) are completely irrelevant and MUST be rejected.` : '';

    const systemPrompt = `You are an expert SEO strategist specializing in keyword selection for blog content. Your role is to analyze Google Search Console queries and select the BEST keywords for blog post ideas.

${siteContext}
${entity ? `**ENTITY CONTEXT**: This content is for entity "${entity}". Prioritize SERVICE-BASED keywords first, location-based only if clearly service queries.` : ''}
${flowPurpose ? `**FLOW PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}
${blogTopic ? `**BLOG TOPIC**: "${blogTopic}" - Keywords should relate to this topic.` : ''}

CRITICAL SELECTION CRITERIA (in priority order):
1. **MANDATORY: Keywords MUST be contextually relevant to the site's business/content**${companyName ? ` (${companyName})` : ''} - If a keyword doesn't make sense in the context of the site's industry, products, or services, REJECT it immediately.
2. Keywords must align with the blog topic/purpose${entity ? ` and entity "${entity}"` : ''}
3. PRIORITIZE SERVICE-BASED KEYWORDS FIRST (generic service terms, problem-solving queries, product/service descriptions) - these are the highest priority
4. Consider traffic potential (impressions, clicks, position) - BUT ONLY if keywords are contextually relevant
5. Choose keywords that users would actually search for (product/service keywords, not business names)
6. ${entity ? `Location-based keywords ONLY if clearly service queries (not business names) - prefer pure service keywords over location+service` : 'Focus on searchable, SEO-relevant service terms'}

**ABSOLUTELY FORBIDDEN - NEVER select keywords that:**
- Are NOT contextually relevant to the site's business, products, or services${companyName ? ` (${companyName})` : ''}
- Are acronyms or abbreviations that don't relate to the site's industry (e.g., "VLTs" for a window blinds site)
- Are from completely different industries or topics than what the site covers
- Would confuse users or create irrelevant content
- Mention Bali Blinds (any casing) or DIY remove/detach/uninstall of Bali blinds

Return ONLY a valid JSON object with this structure:
{
  "selectedKeywords": [
    {
      "primaryKeyword": "keyword1",
      "relatedKeywords": ["related1", "related2", "related3", "related4", "related5"]
    },
    {
      "primaryKeyword": "keyword2",
      "relatedKeywords": ["related1", "related2", "related3", "related4", "related5"]
    },
    ...
  ]
}

REQUIREMENTS:
- Select exactly ${numberOfBlogs} primary keywords (one per blog idea)
- Each primary keyword must have 3-5 related keywords from the GSC queries
- Ensure keywords are diverse and don't overlap between blog ideas
- All keywords must come from the provided GSC queries list
- Return ONLY the JSON object, nothing else

MANDATORY EXCLUSIONS - NEVER select keywords that:
- Are NOT in English (no Spanish, French, or any other language - ENGLISH ONLY)
- Contain any person's name (first name, last name, or full name) - product/service keywords ONLY`;

    const userPrompt = `Analyze these Google Search Console queries (already filtered to exclude company name${companyName ? ` "${companyName}"` : ''} and competitor business names) and select the BEST keywords for ${numberOfBlogs} blog ideas:

${queriesList}

${siteContext ? `\n**CRITICAL SITE CONTEXT**: This website is ${companyName} (${siteUrl}). Before selecting ANY keyword, verify it is contextually relevant to this site's business, products, or services. If a keyword doesn't make sense for this site (e.g., "VLTs" for a window blinds site), REJECT it immediately and choose a different keyword.` : ''}
${entity ? `\n**ENTITY**: "${entity}" - Prioritize keywords that relate to this location/entity.` : ''}
${flowPurpose ? `\n**PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}
${blogTopic ? `\n**TOPIC**: "${blogTopic}" - Keywords should relate to this topic.` : ''}

Select exactly ${numberOfBlogs} primary keywords and 3-5 related keywords for each. Prioritize keywords that are contextually relevant to the site AND align with the purpose/topic. Return the JSON object with selectedKeywords array.`;

    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n${userPrompt}`
          },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || '';
      
      if (content) {
        // Parse JSON from response
        let jsonStr = content;
        
        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        
        // Try to find JSON object in the response
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }

        const result = JSON.parse(jsonStr) as { selectedKeywords: Array<{ primaryKeyword: string; relatedKeywords: string[] }> };
        
        if (result.selectedKeywords && Array.isArray(result.selectedKeywords)) {
          const gscIndex = new Map<string, GSCQuery>();
          for (const q of filteredQueries) {
            const key = q.query.toLowerCase().trim();
            if (!gscIndex.has(key)) gscIndex.set(key, q);
          }

          const selectedKeywords: SelectedKeywords[] = [];

          for (const selection of result.selectedKeywords.slice(0, numberOfBlogs)) {
            if (isNonEnglishKeyword(selection.primaryKeyword) || isBlockedContentTopicPhrase(selection.primaryKeyword)) {
              logger.warn(`[GSC Keyword Selector] AI selected blocked/non-English keyword "${selection.primaryKeyword}" - skipping`);
              continue;
            }

            const primaryQuery = findQueryInGSC(filteredQueries, selection.primaryKeyword, gscIndex);

            if (primaryQuery && !isNonEnglishKeyword(primaryQuery.query) && !isBlockedContentTopicPhrase(primaryQuery.query)) {
              const relatedQueries = selection.relatedKeywords
                .filter(kw => !isNonEnglishKeyword(kw) && !isBlockedContentTopicPhrase(kw))
                .map(kw => findQueryInGSC(filteredQueries, kw, gscIndex))
                .filter((q): q is GSCQuery => q !== null && !isNonEnglishKeyword(q.query) && !isBlockedContentTopicPhrase(q.query))
                .slice(0, 5); // Limit to 5 related keywords

              selectedKeywords.push({
                primaryKeyword: primaryQuery.query,
                relatedKeywords: [
                  ...relatedQueries.map(q => ({
                    keyword: q.query,
                    impressions: q.impressions,
                    clicks: q.clicks,
                    position: q.position,
                  })),
                ],
              });
            }
          }

          if (selectedKeywords.length > 0) {
            return selectedKeywords;
          }
        }
      }
    }
  } catch (error) {
    logger.warn('[GSC Keyword Selector] AI selection failed:', error);
  }
  
  // Fallback: return top queries by impressions/clicks
  if (filteredQueries.length > 0) {
    // Extra safety: filter non-English from fallback queries
    const englishOnlyQueries = filteredQueries.filter(q => !isNonEnglishKeyword(q.query));
    
    if (englishOnlyQueries.length === 0) {
      logger.warn('[GSC Keyword Selector] All fallback queries were non-English');
      return [];
    }
    
    const sortedQueries = [...englishOnlyQueries].sort((a, b) => {
      // Sort by impressions first, then clicks
      if (b.impressions !== a.impressions) {
        return b.impressions - a.impressions;
      }
      return b.clicks - a.clicks;
    });

    const fallbackKeywords: SelectedKeywords[] = [];
    const keywordsPerBlog = Math.max(1, Math.floor(sortedQueries.length / numberOfBlogs));

    for (let i = 0; i < numberOfBlogs && i * keywordsPerBlog < sortedQueries.length; i++) {
      const startIdx = i * keywordsPerBlog;
      const endIdx = Math.min(startIdx + keywordsPerBlog, sortedQueries.length);
      const blogQueries = sortedQueries.slice(startIdx, endIdx);
      
      if (blogQueries.length > 0) {
        const primary = blogQueries[0];
        const related = blogQueries.slice(1, 6).filter(q => !isNonEnglishKeyword(q.query)); // Up to 5 related keywords, English only

        fallbackKeywords.push({
          primaryKeyword: primary.query,
          relatedKeywords: related.map(q => ({
            keyword: q.query,
            impressions: q.impressions,
            clicks: q.clicks,
            position: q.position,
          })),
        });
      }
    }

    return fallbackKeywords;
  }
  
  return [];
}

/**
 * Finds a query in GSC queries array by matching keyword (fuzzy match).
 * When gscIndex is provided, exact match is O(1) via map lookup first.
 */
function findQueryInGSC(
  queries: GSCQuery[],
  keyword: string,
  gscIndex?: Map<string, GSCQuery>
): GSCQuery | null {
  const keywordLower = keyword.toLowerCase().trim();

  if (gscIndex) {
    const exact = gscIndex.get(keywordLower);
    if (exact) return exact;
  } else {
    const exact = queries.find(q => q.query.toLowerCase().trim() === keywordLower);
    if (exact) return exact;
  }

  let match = queries.find(q => {
    const queryLower = q.query.toLowerCase().trim();
    return queryLower.includes(keywordLower) || keywordLower.includes(queryLower);
  });
  if (match) return match;

  const keywordWords = keywordLower.split(/\s+/);
  match = queries.find(q => {
    const queryLower = q.query.toLowerCase().trim();
    return keywordWords.every(word => queryLower.includes(word));
  });
  if (match) return match;

  return null;
}


import type { KeywordExtractionResult } from './blog-idea-kb-keyword-extractor';
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { SelectedKeywords } from './blog-idea-gsc-keyword-selector';
import { isBlockedContentTopicPhrase } from './content-topic-blocklist';
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export interface BlogIdeaKeywords {
  primaryKeyword: string;
  relatedKeywords: string[]; // 3-5 related keywords
  source: 'gsc' | 'kb' | 'combined';
}

export interface CombineAndSelectKeywordsOptions {
  flowPurpose?: string;
  entity?: string;
  connectedSite?: { name: string; siteUrl: string };
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Combines KB and GSC keywords, uses AI to select best set per blog idea
 * Prioritizes GSC keywords when available (they have traffic data)
 */
export async function combineAndSelectKeywords(
  kbKeywords: KeywordExtractionResult | null,
  gscKeywords: SelectedKeywords[],
  blogCount: number,
  apiKey: string,
  options: CombineAndSelectKeywordsOptions = {}
): Promise<BlogIdeaKeywords[]> {
  const {
    flowPurpose = '',
    entity,
    model = getResearchModel(),
    temperature = 0.7,
    maxTokens = 2000,
  } = options;

  // If we have GSC keywords and enough for all blogs, prioritize them
  if (gscKeywords.length >= blogCount) {
    console.log('[Keyword Combiner] Using GSC keywords (have enough for all blogs)');
    return gscKeywords.slice(0, blogCount).map(gsc => ({
      primaryKeyword: gsc.primaryKeyword,
      relatedKeywords: gsc.relatedKeywords.map(r => r.keyword).slice(0, 5),
      source: 'gsc' as const,
    }));
  }

  // If we only have KB keywords, use them
  if (!gscKeywords || gscKeywords.length === 0) {
    if (kbKeywords && kbKeywords.primaryKeywords.length >= blogCount) {
      console.log('[Keyword Combiner] Using KB keywords only (no GSC data)');
      return kbKeywords.primaryKeywords.slice(0, blogCount).map((primary, idx) => ({
        primaryKeyword: primary,
        relatedKeywords: (kbKeywords.relatedKeywords[idx] || []).slice(0, 5),
        source: 'kb' as const,
      }));
    }
  }

  // Combine both sources and use AI to select best keywords
  if (kbKeywords && gscKeywords.length > 0) {
    console.log('[Keyword Combiner] Combining KB and GSC keywords using AI');
    return await selectBestCombinedKeywords(kbKeywords, gscKeywords, blogCount, apiKey, {
      flowPurpose,
      entity,
      connectedSite: options.connectedSite,
      model,
      temperature,
      maxTokens,
    });
  }

  // Fallback: use whatever we have
  if (kbKeywords && kbKeywords.primaryKeywords.length > 0) {
    const result: BlogIdeaKeywords[] = [];
    for (let i = 0; i < Math.min(blogCount, kbKeywords.primaryKeywords.length); i++) {
      result.push({
        primaryKeyword: kbKeywords.primaryKeywords[i],
        relatedKeywords: (kbKeywords.relatedKeywords[i] || []).slice(0, 5),
        source: 'kb',
      });
    }
    return result;
  }

  if (gscKeywords.length > 0) {
    return gscKeywords.slice(0, blogCount).map(gsc => ({
      primaryKeyword: gsc.primaryKeyword,
      relatedKeywords: gsc.relatedKeywords.map(r => r.keyword).slice(0, 5),
      source: 'gsc',
    }));
  }

  // No keywords available
  return [];
}

/**
 * Uses AI to intelligently select best keywords from combined KB and GSC sources
 */
async function selectBestCombinedKeywords(
  kbKeywords: KeywordExtractionResult,
  gscKeywords: SelectedKeywords[],
  blogCount: number,
  apiKey: string,
  options: CombineAndSelectKeywordsOptions & { model: string; temperature: number; maxTokens: number }
): Promise<BlogIdeaKeywords[]> {
  const { flowPurpose, entity, connectedSite, model, temperature, maxTokens } = options;

  // Prepare keyword candidates
  const kbCandidates = kbKeywords.primaryKeywords.map((primary, idx) => ({
    keyword: primary,
    related: kbKeywords.relatedKeywords[idx] || [],
    source: 'kb' as const,
  }));

  const gscCandidates = gscKeywords.map(gsc => ({
    keyword: gsc.primaryKeyword,
    related: gsc.relatedKeywords.map(r => r.keyword),
    source: 'gsc' as const,
    metrics: {
      impressions: gsc.relatedKeywords[0]?.impressions || 0,
      clicks: gsc.relatedKeywords[0]?.clicks || 0,
    },
  }));

  const candidatesList = [
    ...gscCandidates.map((c, idx) => 
      `${idx + 1}. [GSC] "${c.keyword}" (${c.metrics.impressions} impressions, ${c.metrics.clicks} clicks) - Related: ${c.related.slice(0, 3).join(', ')}`
    ),
    ...kbCandidates.map((c, idx) => 
      `${gscCandidates.length + idx + 1}. [KB] "${c.keyword}" - Related: ${c.related.slice(0, 3).join(', ')}`
    ),
  ].join('\n');

  const systemPrompt = `You are an expert SEO strategist specializing in keyword selection for blog content. Your role is to analyze keyword candidates from multiple sources and select the BEST keywords for each blog idea.

${connectedSite ? `**CRITICAL SITE CONTEXT**: This website (${connectedSite.name} - ${connectedSite.siteUrl}) is the target site for all content. You MUST ensure ALL selected keywords are contextually relevant to this site's business, products, services, and content focus. Keywords that are NOT relevant to the site's industry, products, or services MUST be REJECTED immediately, even if they have high traffic data.` : ''}
${entity ? `**ENTITY CONTEXT**: This content is for entity "${entity}". Prioritize SERVICE-BASED keywords first, location-based only if clearly service queries.` : ''}
${flowPurpose ? `**FLOW PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}

CRITICAL SELECTION CRITERIA (in priority order):
1. **MANDATORY: Keywords MUST be contextually relevant to the site's business/content**${connectedSite ? ` (${connectedSite.name})` : ''} - If a keyword doesn't make sense in the context of the site's industry, products, or services, REJECT it immediately. For example, if the site is about window blinds, keywords like "VLTs" (Video Lottery Terminals or Very Large Telescopes) are completely irrelevant and MUST be rejected.
2. Keywords must align with the flow purpose${entity ? ` and entity "${entity}"` : ''}
3. PRIORITIZE SERVICE-BASED KEYWORDS FIRST (generic service terms, problem-solving queries, product/service descriptions) - highest priority
4. Prioritize GSC keywords when available (they have traffic data - impressions, clicks) - BUT ONLY if they're contextually relevant to the site
5. ${entity ? 'Location-based keywords ONLY if clearly service queries (not business names) - prefer pure service keywords' : 'Focus on service/product keywords'}
6. Ensure keywords are diverse and don't overlap between blog ideas
7. Choose keywords that users would actually search for (service keywords, not business names)

**ABSOLUTELY FORBIDDEN - NEVER select keywords that:**
- Are NOT contextually relevant to the site's business, products, or services${connectedSite ? ` (${connectedSite.name})` : ''}
- Are acronyms or abbreviations that don't relate to the site's industry (e.g., "VLTs" for a window blinds site)
- Are from completely different industries or topics than what the site covers
- Would confuse users or create irrelevant content
- Mention Bali Blinds (any casing) or DIY remove/detach/uninstall of Bali blinds

Return ONLY a valid JSON object with this structure:
{
  "selectedKeywords": [
    {
      "primaryKeyword": "keyword1",
      "relatedKeywords": ["related1", "related2", "related3", "related4", "related5"],
      "source": "gsc" or "kb" or "combined"
    },
    ...
  ]
}

REQUIREMENTS:
- Select exactly ${blogCount} primary keywords (one per blog idea)
- Each primary keyword must have 3-5 related keywords
- Ensure keywords are diverse and don't repeat across blog ideas
- Prioritize GSC keywords when they align with purpose/topic
- Return ONLY the JSON object, nothing else

MANDATORY EXCLUSIONS - NEVER select keywords that:
- Are NOT in English (no Spanish, French, or any other language - ENGLISH ONLY)
- Contain any person's name (first name, last name, or full name) - product/service keywords ONLY`;

  const userPrompt = `Analyze these keyword candidates and select the BEST keywords for ${blogCount} blog ideas:

AVAILABLE KEYWORD CANDIDATES:
${candidatesList}

${connectedSite ? `\n**CRITICAL SITE CONTEXT**: This website is ${connectedSite.name} (${connectedSite.siteUrl}). Before selecting ANY keyword, verify it is contextually relevant to this site's business, products, or services. If a keyword doesn't make sense for this site (e.g., "VLTs" for a window blinds site), REJECT it immediately and choose a different keyword.` : ''}
${entity ? `\n**ENTITY**: "${entity}" - Prioritize keywords that relate to this location/entity.` : ''}
${flowPurpose ? `\n**PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}

Select exactly ${blogCount} primary keywords and 3-5 related keywords for each. Prioritize GSC keywords when they align with the purpose/topic AND are contextually relevant to the site. Return the JSON object with selectedKeywords array.`;

  try {
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

        const result = JSON.parse(jsonStr) as { selectedKeywords: BlogIdeaKeywords[] };
        
        if (result.selectedKeywords && Array.isArray(result.selectedKeywords)) {
          const selected = result.selectedKeywords.slice(0, blogCount);
          
          // Validate and map keywords back to sources
          const validated: BlogIdeaKeywords[] = [];
          
          for (const selection of selected) {
            if (isBlockedContentTopicPhrase(selection.primaryKeyword)) continue;
            // Find the keyword in our candidates to determine actual source
            let actualSource: 'gsc' | 'kb' | 'combined' = 'combined';
            
            const inGSC = gscCandidates.find(c => 
              c.keyword.toLowerCase().trim() === selection.primaryKeyword.toLowerCase().trim()
            );
            const inKB = kbCandidates.find(c => 
              c.keyword.toLowerCase().trim() === selection.primaryKeyword.toLowerCase().trim()
            );
            
            if (inGSC && !inKB) {
              actualSource = 'gsc';
            } else if (inKB && !inGSC) {
              actualSource = 'kb';
            } else if (inGSC && inKB) {
              actualSource = 'combined';
            }

            validated.push({
              primaryKeyword: selection.primaryKeyword,
              relatedKeywords: (selection.relatedKeywords || [])
                .filter((kw) => !isBlockedContentTopicPhrase(kw))
                .slice(0, 5),
              source: actualSource,
            });
          }

          if (validated.length > 0) {
            console.log(`[Keyword Combiner] AI selected ${validated.length} keyword sets from combined sources`);
            return validated;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Keyword Combiner] AI selection failed:', error);
  }

  // Fallback: combine sources manually
  console.log('[Keyword Combiner] Using fallback (manual combination)');
  const fallback: BlogIdeaKeywords[] = [];
  
  // Use GSC keywords first (they have traffic data)
  for (let i = 0; i < Math.min(blogCount, gscKeywords.length); i++) {
    fallback.push({
      primaryKeyword: gscKeywords[i].primaryKeyword,
      relatedKeywords: gscKeywords[i].relatedKeywords.map(r => r.keyword).slice(0, 5),
      source: 'gsc',
    });
  }

  // Fill remaining with KB keywords
  if (fallback.length < blogCount && kbKeywords) {
    const remaining = blogCount - fallback.length;
    for (let i = 0; i < Math.min(remaining, kbKeywords.primaryKeywords.length); i++) {
      // Skip if this KB keyword is already used
      const alreadyUsed = fallback.some(f => 
        f.primaryKeyword.toLowerCase().trim() === kbKeywords.primaryKeywords[i].toLowerCase().trim()
      );
      
      if (!alreadyUsed) {
        fallback.push({
          primaryKeyword: kbKeywords.primaryKeywords[i],
          relatedKeywords: (kbKeywords.relatedKeywords[i] || []).slice(0, 5),
          source: 'kb',
        });
      }
    }
  }

  return fallback;
}


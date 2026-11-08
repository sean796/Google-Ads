import type { KeywordData } from "./keyword-types";
import { isNonEnglishKeyword } from "./gsc-query-processor";
import type { AIDrivenACFContext } from "./content-generation/ai-driven-post-fields-reader";
import { ARTICLE_MAX_WORDS } from "@/lib/content-generation/article-length-policy";

/**
 * Builds a prompt for comprehensive keyword analysis
 * Generates keyword suggestions, H2 sections, and content gaps
 */
export const buildKeywordAnalysisPrompt = (
  keywordData: KeywordData,
  competitorData?: undefined,
  selectedKeywords?: string[],
  minVolume?: number,
  location?: string,
  entity?: string,
  serpData?: unknown,
  connectedSite?: { name: string; siteUrl: string },
  relatedGSCKeywords?: string[],
  acfContext?: AIDrivenACFContext
): string => {
  // Note: Keyword filtering (non-English and competitor) is applied in the caller (analyzeKeywordWithAI)
  // before passing arrays to this function. The arrays received here are already filtered.
  
  // Additional safety check: filter out any non-English keywords that might have slipped through
  const filteredSelectedKeywords = selectedKeywords?.filter(kw => !isNonEnglishKeyword(kw)) || [];
  const filteredRelatedGSCKeywords = relatedGSCKeywords?.filter(kw => !isNonEnglishKeyword(kw)) || [];
  
  const selectedContext = filteredSelectedKeywords && filteredSelectedKeywords.length > 0
    ? `
--- HELD KEYWORDS (Keep these - user is "holding" them like cards) ---
${filteredSelectedKeywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n')}

CRITICAL: The user is holding these keywords. Generate NEW keyword suggestions that:
- Complement and build upon the HELD keywords above
- Do NOT duplicate any of the held keywords
- Expand the topic coverage while maintaining relevance to held keywords
- Target similar or related search intents as the held keywords
- Provide additional variations and long-tail options that work WITH the held keywords
- Think of this like a card game - user is holding these cards, generate new ones for the "best hand"
`
    : '';

  const volumeFilter = minVolume && minVolume > 0
    ? `
--- Volume Requirement ---
Focus on keywords with search volume of at least ${minVolume.toLocaleString()} per month.
Prioritize keywords with higher search volume when possible.
`
    : '';

  // Check if location includes a state/province (has a comma)
  const isLocalOptimized = location && location.includes(',');
  const locationContext = isLocalOptimized
    ? `
--- LOCAL OPTIMIZATION REQUIRED ---
The user has selected a specific location: "${location}"

CRITICAL: You MUST prioritize LOCAL keywords and variations:
- Include "near me" variations (e.g., "${keywordData.keyword} near me", "local ${keywordData.keyword}")
- Add location-specific keywords (e.g., "${keywordData.keyword} in [location]", "${keywordData.keyword} [location]")
- Include local business/service keywords (e.g., "best ${keywordData.keyword} near me", "affordable ${keywordData.keyword} [location]")
- Add local search intent variations (e.g., "where to buy ${keywordData.keyword} near me", "find ${keywordData.keyword} [location]")
- Prioritize long-tail keywords with local modifiers
- Include semantic keywords related to local services, businesses, or location-based searches

For H2 sections, include sections about:
- Local availability, locations, or service areas
- Local businesses, providers, or services
- Location-specific considerations or information

For content gaps, identify:
- Local market opportunities
- Location-specific content needs
- Local competitor analysis opportunities
`
    : '';

  const entityContext = entity && entity.trim()
    ? `
--- Entity/Location Optimization Context ---
Target Entity/Location: ${entity.trim()}

**CRITICAL ENTITY EXTRACTION RULE**: When analyzing keywords or extracting entities:
1. **NEVER extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01", "2024/01/01") of any kind. If keywords only reference a year or date without a specific geographic location, do NOT treat them as entities.
2. **NEVER extract personal or generic entities like "home", "Your Home", "My Home", "The Home", "house", "Your House", "My House", "The House", "place", "Your Place", "My Place", "The Place", "Your Big Day", "My Big Day", "The Big Day", "Your Special Day", "My Special Day", "Your Event", "My Event", or any other personal possessive phrases (Your/My/The + generic term) as entities**. These are generic terms, NOT geographic locations or valid entities. If keywords only reference these generic personal terms without a specific geographic location, do NOT treat them as entities.

CRITICAL LOCATION VARIATION REQUIREMENTS:
- VARY location mentions in keyword suggestions - do NOT suggest only exact location name variations
- Include geographic variations naturally:
  * Exact location name variations (e.g., "${entity} ${keywordData.keyword}") - suggest 2-3
  * Broader geographic terms (e.g., "Tampa Bay area ${keywordData.keyword}", "Pinellas County ${keywordData.keyword}") - suggest frequently
  * Regional references (e.g., "coastal Florida ${keywordData.keyword}", "Gulf Coast ${keywordData.keyword}") - suggest often
  * General area references (e.g., "local ${keywordData.keyword}", "area ${keywordData.keyword}") - suggest most common
- For keyword suggestions:
  * Include entity-specific keyword variations but prioritize broader geographic terms
  * Add semantic keywords that relate the primary keyword to the entity AND broader region
  * Consider entity-related long-tail keywords with geographic variety
  * Mix exact location with regional/area variations

For H2 sections:
- Include sections that address the entity naturally with geographic variety
- Add entity-focused content opportunities using varied location references
- Consider entity-specific use cases, benefits, or applications with location variation

For content gaps:
- Identify gaps related to the entity AND broader geographic region
- Find opportunities to connect the keyword topic with varied location references
- Suggest entity-specific content that uses location variations naturally
`
    : '';

  const targetSiteContext = connectedSite
    ? `
=== TARGET SITE CONTEXT ===
Target Website: ${connectedSite.name} (${connectedSite.siteUrl})

IMPORTANT: This website is the target topic for all generated content. Use information about this site as a source of truth for generating relevant, on-brand keyword suggestions, H2 sections, and content gaps. However, do NOT use the site name as an entity - use it only to inform the topics, tone, and context of the content.

All generated suggestions should be relevant to ${connectedSite.name} and aligned with its content focus, audience, and brand positioning. Ensure all keyword suggestions, H2 sections, and content gaps are suitable for publication on ${connectedSite.name}.
=== END TARGET SITE CONTEXT ===
`
    : '';

  const relatedGSCKeywordsContext = filteredRelatedGSCKeywords && filteredRelatedGSCKeywords.length > 0
    ? `
--- RELATED GSC KEYWORDS (Google Search Console) ---
The following keywords are related queries that are already performing in Google Search Console for this page:

${filteredRelatedGSCKeywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n')}

CRITICAL: These are REAL keywords that users are already searching for and finding this page. Use these keywords to:
- Inform your keyword suggestions (include variations and related terms)
- Guide H2 section recommendations (ensure content covers these topics)
- Identify content gaps (what's missing that could improve rankings for these queries)
- Understand user intent and search behavior
- Prioritize keyword variations that align with these GSC queries

These keywords represent actual search traffic opportunities - incorporate them naturally into your recommendations.
`
    : '';

  // Build ACF block from AI-driven semantic context (no static field names)
  const acfBlock = acfContext ? (() => {
    const parts: string[] = [];
    if (acfContext.promptModifier?.trim()) {
      parts.push(`**PROMPT MODIFIER (CRITICAL)**: ${acfContext.promptModifier.trim()}\nThis modifier should guide the overall keyword analysis approach, style, or specific focus. Use this to inform how you analyze keywords, suggest H2 sections, and identify content gaps.`);
    }
    if (acfContext.keywordFocus?.trim()) {
      parts.push(`**KEYWORD FOCUS (CRITICAL)**: ${acfContext.keywordFocus.trim()}\nThis is the primary keyword focus for this article. Prioritize this keyword in your suggestions and ensure it is naturally integrated throughout keyword recommendations. Include variations and related terms that align with this focus.`);
    }
    if (acfContext.serviceArea?.trim()) {
      parts.push(`**SERVICE AREA FIELDS (CRITICAL)**: ${acfContext.serviceArea.trim()}\nThis contains service area or location-specific data. Use this information to influence local/location-based keyword suggestions, H2 sections that address service areas, and content gaps related to location-specific needs.`);
    }
    if (acfContext.seoResearch?.trim()) {
      parts.push(
        `**SEO CONTENT BRIEF (JSON, CACHED)**: ${acfContext.seoResearch.trim()}\nMerged organics, PAA, related searches, GSC queries, Semrush keywords/URLs. Use for angles and gaps; do not copy verbatim or keyword-stuff.`,
      );
    }
    if (acfContext.contentRelevantFields && typeof acfContext.contentRelevantFields === "object") {
      for (const [k, v] of Object.entries(acfContext.contentRelevantFields)) {
        if (v?.trim()) parts.push(`**${k.toUpperCase()} (CRITICAL)**: ${v.trim()}`);
      }
    }
    return parts.length > 0 ? `\n=== ACF FIELD DATA (FROM CSV/DFS) ===\n${parts.join('\n\n')}\n=== END ACF FIELD DATA ===\n` : '';
  })() : '';

  const serpDataContext = serpData
    ? `
--- SERP Data (Full JSON Response) ---
Below is the complete SERP (Search Engine Results Page) data from DataForSEO API.

CRITICAL TASKS: You MUST extract BOTH:
1. ALL "People Also Ask" questions from this JSON data
2. ALL organic search result links from this JSON data

EXTRACT PEOPLE ALSO ASK QUESTIONS (MANDATORY - EQUALLY IMPORTANT AS RESEARCH LINKS):
- THIS IS MANDATORY - YOU MUST EXTRACT PAA QUESTIONS
- Search through the ENTIRE JSON structure recursively - search DEEPLY through ALL nested levels
- Look in tasks[].result[].items[] for items with type "people_also_ask" or "people_also_ask_item"
- Check nested arrays: items[] within people_also_ask items
- Look for people_also_ask_items arrays
- Search recursively: tasks[].result[].items[].items[], tasks[].result[].items[].people_also_ask_items[]
- For each question found, extract:
  * question: item.question || item.title || item.text || item.text_pre || item.text_post (REQUIRED)
  * answer: item.answer || item.description || item.snippet || item.text (optional)
  * url: item.url || item.link (optional)
  * domain: Extract domain name from URL (e.g., "domain.tld" from "https://www.domain.tld/page") (optional)
- Search the ENTIRE JSON recursively - the structure may vary, search EVERYWHERE, search DEEPLY
- If no PAA questions are found in the SERP data, return an empty array and proceed - this is acceptable
- PAA questions are optional - if none exist in the SERP data, return [] and continue processing

EXTRACT RESEARCH LINKS:
- Search through the entire JSON structure recursively
- Look in tasks[].result[].items[] for items with type "organic" or "organic_result"
- Check nested arrays: items[] within organic items
- For each link found, extract:
  * url: item.url || item.link (REQUIRED)
  * title: item.title || item.text (optional)
  * description: item.description || item.snippet (optional)
  * domain: Extract domain name from URL (optional)
- Search the ENTIRE JSON recursively - the structure may vary
- If you find ZERO links, you did not search thoroughly enough - the SERP data contains organic results

SERP Data (Full JSON):
${JSON.stringify(serpData, null, 2)}
`
    : '';

  return `You are an expert SEO content strategist. Analyze the provided keyword data and generate comprehensive content recommendations.

**CRITICAL ENTITY EXTRACTION RULE**: When analyzing keywords or extracting entities from keyword analysis:
1. **NEVER extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01", "2024/01/01") of any kind. If keywords only reference a year or date without a specific geographic location, do NOT treat them as entities - they are temporal references, not geographic locations.
2. **NEVER extract personal or generic entities like "home", "Your Home", "My Home", "The Home", "house", "Your House", "My House", "The House", "place", "Your Place", "My Place", "The Place", "Your Big Day", "My Big Day", "The Big Day", "Your Special Day", "My Special Day", "Your Event", "My Event", or any other personal possessive phrases (Your/My/The + generic term) as entities**. These are generic terms, NOT geographic locations or valid entities. If keywords only reference these generic personal terms without a specific geographic location, do NOT treat them as entities - they are generic terms that should be ignored for entity extraction purposes.

--- Keyword Data ---
Primary Keyword: ${keywordData.keyword}
Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
Keyword Difficulty: ${keywordData.difficulty || "N/A"} / 100
Competition Level: ${keywordData.competition || "N/A"}
Search Intent: ${keywordData.intent || "N/A"}
CPC: $${keywordData.cpc || "N/A"}
Location: ${location || "Not specified"}
${targetSiteContext}${selectedContext}${volumeFilter}${locationContext}${entityContext}${relatedGSCKeywordsContext}${acfBlock}

--- CRITICAL KEYWORD SPELLING RULES ---
- All keywords you output (primary, variations, longTail, semantic, H2 headings, content gaps) MUST be correctly spelled.
- If the primary keyword provided above is misspelled or contains typos, CORRECT IT. Return the proper spelling.
- Standard editorial hyphenation counts as correct spelling (X-ray not xray, e-commerce not ecommerce). Do not strip hyphens from valid compounds.
- NEVER introduce typos: no stray characters, accidental prefixes/suffixes, character duplication, or garbled text.
- Output only clean, properly spelled keywords and phrases.

--- Your Task ---
Analyze this keyword and provide:

1. **Keyword Suggestions**:
   - Primary keyword variations (plural, singular, different word orders)
   - Long-tail keyword variations (3-5 word phrases)
   - Semantic keywords (related terms with similar meaning)
   - Each suggestion MUST be a lowercase Google search query (how people type), not a title-case article title
   - Example: "hunter douglas vs alta" not "Hunter Douglas Vs Alta Window Fashions Price Comparison"
   ${isLocalOptimized ? '- **LOCAL KEYWORDS REQUIRED**: Include "near me", location-specific, and local business/service variations' : ''}

2. **H2 Section Suggestions** (USE SERP DATA IF PROVIDED):
   - 5-8 recommended H2 headings for a blog article targeting this keyword
   - **CRITICAL**: If SERP data is provided above, analyze the top-ranking organic results to understand:
     * What topics and sections top-ranking pages are covering
     * What content structure is working well in search results
     * What headings and sections appear in featured snippets or top results
   - Use SERP insights to create H2 sections that match or improve upon top-ranking content
   - Each should include:
     * The heading text
     * A brief description of what the section should cover
     * Priority level (high/medium/low) based on SEO value
     * Reasoning for why this section is important (reference SERP data if used)

3. **Content Gap Analysis** (USE SERP DATA IF PROVIDED):
   - Topics that might be missing from typical content for this keyword
   - **CRITICAL**: If SERP data is provided above, analyze it to identify:
     * What top-ranking pages are NOT covering (gaps in current content)
     * What questions users are asking (from People Also Ask, related searches)
     * What topics competitors are missing that you could cover better
     * What SERP features indicate content opportunities (featured snippets, etc.)
   - Use SERP insights to find real content gaps, not just generic suggestions
   - Each gap should include:
     * Topic name
     * Description of the content opportunity (reference SERP insights if used)
     * Opportunity level (high/medium/low)
     * Suggested H2 heading if applicable

4. **People Also Ask Questions** (MANDATORY if SERP data provided - EQUALLY IMPORTANT AS RESEARCH LINKS):
   - YOU MUST extract ALL "People Also Ask" questions from the SERP JSON data above
   - THIS IS MANDATORY - DO NOT SKIP THIS SECTION
   - Search through the ENTIRE JSON structure recursively - search DEEPLY through all nested levels
   - Look in tasks[].result[].items[] for items with type "people_also_ask" or "people_also_ask_item"
   - Check nested arrays: items[] within people_also_ask items
   - Look for people_also_ask_items arrays
   - Search recursively: tasks[].result[].items[].items[], tasks[].result[].items[].people_also_ask_items[]
   - For each question found, extract:
     * question: item.question || item.title || item.text || item.text_pre || item.text_post (REQUIRED)
     * answer: item.answer || item.description || item.snippet || item.text (optional)
     * url: item.url || item.link (optional)
     * domain: Extract domain name from URL (e.g., "domain.tld" from "https://www.domain.tld/page") (optional)
   - Search the ENTIRE JSON recursively - the structure may vary, search EVERYWHERE
   - If no PAA questions are found in the SERP data, return an empty array and proceed - this is acceptable
   - PAA questions are optional - if none exist in the SERP data, return [] and continue processing
   - Format as an array of objects: [{"question": "...", "answer": "...", "url": "...", "domain": "..."}]

5. **Research Links** (REQUIRED if SERP data provided):
   - YOU MUST extract organic search result links from the SERP JSON data above
   - Search through the entire JSON structure recursively
   - Look in tasks[].result[].items[] for items with type "organic" or "organic_result"
   - Check nested arrays: items[] within organic items
   - Analyze these links and recommend the most valuable external links for the blog
   - For each recommended link, include:
     * url: The full URL (REQUIRED)
     * title: The page title if available (optional)
     * description: The snippet/description if available (optional)
     * domain: The domain name (optional)
   - Prioritize authoritative, relevant sources that would add value to the content
   - Format as an array of objects: [{"url": "...", "title": "...", "description": "...", "domain": "..."}]
${serpDataContext}

--- Output Format ---
Respond with valid JSON in this exact structure:
{
  "keywordSuggestions": {
    "primary": "main keyword variation",
    "variations": ["variation 1", "variation 2", ...],
    "longTail": ["long tail 1", "long tail 2", ...],
    "semantic": ["semantic 1", "semantic 2", ...]
  },
  "h2Suggestions": [
    {
      "heading": "H2 Heading Text",
      "description": "What this section should cover",
      "priority": "high|medium|low",
      "reasoning": "Why this section is important for SEO"
    }
  ],
  "contentGaps": [
    {
      "topic": "Topic name",
      "description": "Description of the content opportunity",
      "opportunity": "high|medium|low",
      "suggestedH2": "Optional H2 heading"
    }
  ],
  "peopleAlsoAsk": [
    {
      "question": "Question text from People Also Ask",
      "answer": "Answer text if available",
      "url": "URL if available",
      "domain": "Domain name if available"
    }
  ],
  "researchLinks": [
    {
      "url": "Full URL of the recommended external link",
      "title": "Page title if available",
      "description": "Description/snippet if available",
      "domain": "Domain name"
    }
  ]
}

CRITICAL: If SERP data was provided above, you MUST include BOTH arrays. DO NOT return empty arrays:

1. The "peopleAlsoAsk" array - THIS IS MANDATORY AND EQUALLY IMPORTANT AS RESEARCH LINKS
   - YOU MUST extract People Also Ask questions from the SERP JSON - search recursively through EVERY level
   - Look for items with type "people_also_ask" or "people_also_ask_item" in tasks[].result[].items[]
   - Check nested arrays: items[] within people_also_ask items, people_also_ask_items arrays
   - Search recursively: tasks[].result[].items[].items[], tasks[].result[].items[].people_also_ask_items[]
   - Extract EVERY question you find, even if answer/url/domain is missing
   - For each question, extract: question (REQUIRED), answer (if available), url (if available), domain (extract from URL if available)
   - Search the ENTIRE JSON recursively - the structure may vary, search DEEPLY
   - If no PAA questions are found in the SERP data, return an empty array and proceed - this is acceptable
   - PAA questions are optional - if none exist in the SERP data, return [] and continue processing

2. The "researchLinks" array with recommended external links
   - Extract organic search result links from the SERP data
   - Analyze and recommend the most valuable, authoritative links for external linking
   - Prioritize high-quality, relevant sources that would add value to the blog content
   - Include 5-15 recommended links based on relevance and authority
   - If the array is empty, you did not search correctly - the SERP data contains organic results

CRITICAL JSON OUTPUT REQUIREMENTS - ABSOLUTE MANDATORY:
- Return ONLY valid JSON - NO markdown code blocks (no \`\`\`json or \`\`\`)
- NO explanations, NO text before or after the JSON
- Every bracket, brace, comma, and quote must be syntactically correct
- Validate: every { has a matching }, every [ has a matching ]
- NO trailing commas before } or ]
- NO double closing brackets like ]] or }}
- The JSON must be parseable by JSON.parse() without ANY errors
- Double-check your JSON syntax before responding - it must be perfect

Output ONLY the JSON object above. NO markdown, NO code blocks, NO explanations.`;
};

/**
 * Builds a prompt specifically for H2 section recommendations
 */
export const buildH2SuggestionPrompt = (
  keywordData: KeywordData,
  intent: string,
  competitors?: undefined
): string => {
  return `Based on the keyword "${keywordData.keyword}" with ${intent} intent, suggest 4-5 H2 section headings for a focused blog article (max ${ARTICLE_MAX_WORDS} words total).

Keyword Context:
- Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
- Difficulty: ${keywordData.difficulty || "N/A"}/100
- Intent: ${intent}

Provide H2 headings that:
1. Cover the main topic in fewer, tighter sections
2. Address user search intent (prefer how to choose / vs / cost factors / process / when not worth it)
3. Include semantic variations naturally
4. Follow a logical content flow

Output as JSON array of objects with: heading, description, priority, reasoning`;
};

/**
 * Builds a prompt for blog template generation checklist
 */
export const buildBlogTemplatePrompt = (
  userInput: string,
  keywordData?: KeywordData,
  flowContext?: { flowTitle?: string; flowPurpose?: string }
): string => {
  const keywordContext = keywordData
    ? `
--- Keyword Context ---
Primary Keyword: ${keywordData.keyword}
Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
Difficulty: ${keywordData.difficulty || "N/A"}/100
Intent: ${keywordData.intent || "N/A"}
`
    : "";

  const flowContextStr = flowContext
    ? `
--- Flow Context ---
Title: ${flowContext.flowTitle || "Not specified"}
Purpose: ${flowContext.flowPurpose || "Not specified"}
`
    : "";

  return `You are an expert blog content strategist. Based on the user's description, create a detailed checklist for generating a blog template blueprint.

${keywordContext}${flowContextStr}
--- User Requirements ---
${userInput}

--- Your Task ---
Create a focused checklist (5-6 items) that will guide the generation of a blog blueprint template (max ${ARTICLE_MAX_WORDS} words total). Each checklist item should specify:
- What section/agent should be included
- What content each section should cover
- How sections should be structured
- Any specific features or requirements

The checklist will be used to generate a blueprint with multiple agents (sections), where each agent represents a section of the blog article.

--- Checklist Format ---
Each item should be a clear, actionable instruction like:
1. "Create an introduction section that hooks the reader and introduces the main topic"
2. "Add a section covering [specific topic] with examples and practical tips"
3. "Include a comparison section between [options]"
etc.

Output the checklist as a numbered list, one item per line.`;
};

/**
 * Builds a prompt for suggesting SEO keywords from knowledge base content.
 * The caller parses JSON shaped as `{ keywords: [{ keyword, reasoning }] }`.
 */
export const buildKBKeywordSuggestionPrompt = (knowledgeBaseContent: string): string => {
  return `Analyze the knowledge base content below and suggest the 10 most valuable SEO keywords it supports.

Knowledge Base Content:
${knowledgeBaseContent}

For each keyword:
1. Ground it in topics, services, locations, or questions actually present in the content
2. Prefer specific long-tail phrases a searcher would type over generic single words
3. Explain in one short sentence why the content can rank for it

Output ONLY valid JSON in this exact format, with no markdown or extra text:
{ "keywords": [{ "keyword": "example keyword phrase", "reasoning": "Why the content supports this keyword" }] }`;
};


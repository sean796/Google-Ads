/**
 * AI-Powered Blueprint Keyword Analyzer
 * Analyzes blueprint content and extracts keywords with metrics
 */

import pLimit from "p-limit";
import { streamChatCompletion, Message } from "@/lib/api";
import { BlueprintData } from "@/hooks/use-blueprint-management";
import { callMCPKeywordOverview } from "./keyword-mcp-service";
import type { KeywordData } from "./keyword-types";
import { formatKeyword, formatKeywords } from "./keyword-formatter";
import { flowFreeformSectionsToAgents } from "@/lib/flow-freeform/flow-freeform-types";
import { logger } from "@/lib/logger";

interface KeywordExtractionResult {
  primaryKeyword: string;
  keywords: string[];
  reasoning: string;
}

/**
 * Uses AI to extract keywords from blueprint content
 * NOW PRIORITIZES THE SEARCHED KEYWORD over blueprint content
 */
export async function extractKeywordsFromBlueprint(
  blueprint: BlueprintData,
  apiKey: string,
  selectedModel: string,
  temperature: number,
  maxTokens: number,
  topP: number,
  searchedKeyword?: string // NEW: The keyword the user actually searched for
): Promise<KeywordExtractionResult> {
  // Build context from blueprint
  const blueprintContext = `
Blueprint Title: ${blueprint.title}
Blueprint Purpose: ${blueprint.purpose}

Agents (${flowFreeformSectionsToAgents(blueprint.flowFreeform.sections).length}):
${flowFreeformSectionsToAgents(blueprint.flowFreeform.sections).map((agent, idx) => `
Agent ${idx + 1}:
- Title: ${agent.title}
- Description: ${agent.description}
- Features: ${agent.features?.join(', ') || 'None'}
`).join('\n')}
`;

  const systemPrompt = `You are an SEO expert analyzing a content blueprint. Extract the most important keywords that this blueprint should target.

${searchedKeyword ? `**CRITICAL INSTRUCTION: The user selected the keyword "${searchedKeyword}". You MUST use this EXACT keyword as the PRIMARY keyword. Do NOT modify it, change its spelling, capitalization, or wording. Use it EXACTLY as provided: "${searchedKeyword}".**` : ''}

Analyze the blueprint title, purpose, and agent descriptions to identify:
1. The PRIMARY keyword: ${searchedKeyword ? `"${searchedKeyword}" (use this EXACT keyword as-is, do not modify)` : 'most important, 1-3 words from blueprint'}
2. 5-10 RELATED keywords (semantic variations, long-tail, related topics) that complement the primary keyword

Return ONLY a valid JSON object with this structure:
{
  "primaryKeyword": ${searchedKeyword ? `"${searchedKeyword}"` : '"main keyword phrase"'},
  "keywords": ["keyword1", "keyword2", "keyword3", ...],
  "reasoning": "Brief explanation of why these keywords were chosen"
}

${searchedKeyword ? `**MANDATORY: The primaryKeyword field MUST be exactly "${searchedKeyword}" - copy it character-for-character, do not change anything.**` : ''}

Focus on keywords that:
- ${searchedKeyword ? `Use "${searchedKeyword}" EXACTLY as the primary keyword (no modifications)` : "Match the blueprint's main topic"}
- Are searchable and relevant
- Include both head terms and long-tail variations
- Reflect user intent (informational, commercial, transactional)`;

  const userPrompt = `Analyze this blueprint and extract keywords${searchedKeyword ? `, using "${searchedKeyword}" as the PRIMARY keyword` : ''}:

${blueprintContext}

${searchedKeyword ? `\n**CRITICAL: The PRIMARY keyword MUST be EXACTLY "${searchedKeyword}" - use it character-for-character with correct spelling. Do NOT modify, rephrase, or change the capitalization. Copy it exactly as shown: "${searchedKeyword}". Generate related keywords that complement this exact primary keyword.**` : ''}

Return the JSON object with primaryKeyword${searchedKeyword ? `="${searchedKeyword}"` : ''} (use the exact keyword provided), keywords array, and reasoning.`;

  try {
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const streamResult = await streamChatCompletion({
      apiKey,
      model: selectedModel,
      messages,
      temperature,
      maxTokens,
      topP,
      onContentChunk: () => {}, // We'll use the returned content
    });

    // Parse JSON from response
    // Try to extract JSON from the response (might have markdown code blocks)
    let jsonStr = streamResult.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const extractionResult = JSON.parse(jsonStr) as KeywordExtractionResult;
    
    // Validate result
    if (!extractionResult.primaryKeyword || !Array.isArray(extractionResult.keywords)) {
      throw new Error('Invalid keyword extraction result format');
    }

    // If searchedKeyword was provided, use it EXACTLY as provided (don't trust AI to preserve it)
    const finalPrimaryKeyword = searchedKeyword ? searchedKeyword : extractionResult.primaryKeyword;

    // Format keywords with proper capitalization
    return {
      primaryKeyword: formatKeyword(finalPrimaryKeyword),
      keywords: formatKeywords(extractionResult.keywords),
      reasoning: extractionResult.reasoning,
    };
  } catch (error) {
    logger.error('Error extracting keywords:', error);
    throw new Error(`Failed to extract keywords: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Cleans keywords by removing placeholders like [target entity], [location], etc.
 */
function cleanKeyword(keyword: string): string {
  // Remove common placeholders in brackets
  const cleaned = keyword
    .replace(/\[target entity\]/gi, '')
    .replace(/\[location\]/gi, '')
    .replace(/\[city\]/gi, '')
    .replace(/\[state\]/gi, '')
    .replace(/\[area\]/gi, '')
    .replace(/\[.*?\]/g, '') // Remove any other bracketed placeholders
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
  
  return cleaned;
}

/**
 * Generates keyword variations to try if the original has no data
 */
function generateKeywordVariations(keyword: string): string[] {
  const variations: string[] = [];
  const cleaned = cleanKeyword(keyword);
  
  if (cleaned !== keyword) {
    variations.push(cleaned);
  }
  
  // Try removing common modifiers
  const withoutNearMe = cleaned.replace(/\s*near\s+me\s*/gi, '').trim();
  if (withoutNearMe && withoutNearMe !== cleaned) {
    variations.push(withoutNearMe);
  }
  
  // Try removing location-specific terms
  const locationTerms = ['atlanta', 'georgia', 'ga', 'local', 'near me'];
  let withoutLocation = cleaned;
  for (const term of locationTerms) {
    withoutLocation = withoutLocation.replace(new RegExp(`\\s*${term}\\s*`, 'gi'), ' ').trim();
  }
  if (withoutLocation && withoutLocation !== cleaned && withoutLocation.length > 3) {
    variations.push(withoutLocation);
  }
  
  return variations.filter(v => v.length > 0 && v !== keyword);
}

/**
 * Analyzes blueprint and fetches keyword metrics
 * Only returns keywords that have actual data from DataForSEO
 */
export async function analyzeBlueprintKeywords(
  blueprint: BlueprintData,
  apiKey: string,
  selectedModel: string,
  temperature: number,
  maxTokens: number,
  topP: number,
  location: string = "United States",
  language: string = "en",
  searchedKeyword?: string // NEW: The keyword the user actually searched for
): Promise<{
  primaryKeyword: string;
  keywordData: KeywordData[];
  extractedKeywords: string[];
  reasoning: string;
}> {
  // Step 1: Extract keywords using AI - NOW PRIORITIZES SEARCHED KEYWORD
  const extraction = await extractKeywordsFromBlueprint(
    blueprint,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    searchedKeyword // Pass the searched keyword
  );

  // Step 2: Clean keywords and prepare search list
  // If searchedKeyword was provided, use it as primary (ignore AI extraction)
  const primaryKeywordToUse = searchedKeyword ? formatKeyword(searchedKeyword) : extraction.primaryKeyword;
  const cleanedPrimary = cleanKeyword(primaryKeywordToUse);
  const cleanedKeywords = extraction.keywords.map(cleanKeyword).filter(k => k.length > 0);
  
  // Build search list: cleaned versions + variations
  const keywordsToSearch = new Set<string>();
  keywordsToSearch.add(cleanedPrimary);
  cleanedKeywords.forEach(kw => keywordsToSearch.add(kw));
  
  // Add variations for keywords that might not have data
  [cleanedPrimary, ...cleanedKeywords].forEach(kw => {
    const variations = generateKeywordVariations(kw);
    variations.forEach(v => keywordsToSearch.add(v));
  });
  
  const searchList = Array.from(keywordsToSearch);

  // Step 3: Fetch metrics for all keywords (batches of 10, 2 batches in flight to avoid rate limits)
  const batchSize = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < searchList.length; i += batchSize) {
    chunks.push(searchList.slice(i, i + batchSize));
  }
  const limit = pLimit(2);
  const batchPromises = chunks.map((batch) =>
    limit(() =>
      callMCPKeywordOverview(batch, location, language).catch((error) => {
        logger.warn(`Failed to fetch metrics for batch:`, batch, error);
        return [] as KeywordData[];
      })
    )
  );
  const batchResultsArrays = await Promise.all(batchPromises);
  const keywordMetrics: KeywordData[] = batchResultsArrays.flat();

  // Step 4: Filter to only keywords with actual data
  const keywordsWithData = keywordMetrics.filter(kw => 
    kw.searchVolume > 0 || kw.difficulty > 0 || kw.cpc > 0
  );


  // Step 5: Match extracted keywords to metrics (prefer exact matches via Map, then partial)
  const kwMap = new Map<string, KeywordData>();
  for (const m of keywordsWithData) {
    const key = m.keyword.toLowerCase();
    if (!kwMap.has(key)) kwMap.set(key, m);
  }

  function findMatch(variation: string): KeywordData | null {
    const exact = kwMap.get(variation.toLowerCase());
    if (exact && !usedMetrics.has(exact.keyword)) return exact;
    return keywordsWithData.find(m =>
      !usedMetrics.has(m.keyword) &&
      (m.keyword.toLowerCase() === variation.toLowerCase() ||
        m.keyword.toLowerCase().includes(variation.toLowerCase()) ||
        variation.toLowerCase().includes(m.keyword.toLowerCase()))
    ) ?? null;
  }

  const matchedKeywords: KeywordData[] = [];
  const usedMetrics = new Set<string>();

  const primaryVariations = [cleanedPrimary, ...generateKeywordVariations(cleanedPrimary)];
  let primaryMetric: KeywordData | null = null;

  for (const variation of primaryVariations) {
    const match = findMatch(variation);
    if (match) {
      primaryMetric = match;
      usedMetrics.add(match.keyword);
      break;
    }
  }

  if (!primaryMetric && keywordsWithData.length > 0) {
    const sorted = [...keywordsWithData].sort((a, b) => b.searchVolume - a.searchVolume);
    primaryMetric = sorted[0];
    usedMetrics.add(sorted[0].keyword);
  }

  for (const extractedKw of cleanedKeywords) {
    if (usedMetrics.size >= keywordsWithData.length) break;
    const variations = [extractedKw, ...generateKeywordVariations(extractedKw)];
    for (const variation of variations) {
      const match = findMatch(variation);
      if (match) {
        matchedKeywords.push(match);
        usedMetrics.add(match.keyword);
        break;
      }
    }
  }
  
  // Add any remaining keywords with data (up to 10 total)
  const remaining = keywordsWithData
    .filter(kw => !usedMetrics.has(kw.keyword))
    .slice(0, Math.max(0, 10 - matchedKeywords.length - (primaryMetric ? 1 : 0)));
  
  matchedKeywords.push(...remaining);

  // Step 6: Build final result
  const finalKeywordData: KeywordData[] = [];
  if (primaryMetric) {
    // Format the keyword in the metric data
    finalKeywordData.push({
      ...primaryMetric,
      keyword: formatKeyword(primaryMetric.keyword),
    });
  }
  finalKeywordData.push(...matchedKeywords
    .filter(k => k.keyword !== primaryMetric?.keyword)
    .map(k => ({
      ...k,
      keyword: formatKeyword(k.keyword),
    })));

  // Use the searched keyword if provided (already formatted), otherwise use the matched keyword from metrics
  const finalPrimaryKeyword = searchedKeyword ? formatKeyword(searchedKeyword) : (primaryMetric ? formatKeyword(primaryMetric.keyword) : formatKeyword(cleanedPrimary));

  return {
    primaryKeyword: finalPrimaryKeyword,
    keywordData: finalKeywordData,
    extractedKeywords: finalKeywordData.map(k => k.keyword),
    reasoning: extraction.reasoning,
  };
}


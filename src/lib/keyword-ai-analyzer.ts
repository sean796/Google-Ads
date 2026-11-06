import { streamChatCompletion } from "./api";
import type { KeywordData, KeywordAIAnalysis, PeopleAlsoAsk } from "./keyword-types";
import { buildKeywordAnalysisPrompt } from "./prompt-builders-keyword";
import { formatKeyword, formatKeywords } from "./keyword-formatter";
import { getResearchModel } from "./optimization-settings-storage";
import { readACFFieldsAgentically } from "./content-generation/ai-driven-acf-reader";
import type { AIDrivenACFContext } from "./content-generation/ai-driven-acf-reader";
import {
  RESEARCH_MODEL_MAX_TOKENS,
  tryParseKeywordAnalysisJson,
} from "./keyword-ai-analyzer-json-repair";
import { filterCompetitorKeywordsFromStrings } from "./keyword-ai-analyzer-competitor-filter";
import { logger } from "@/lib/logger";

export { extractPeopleAlsoAskWithAI } from "./keyword-ai-analyzer-paa";

export interface AnalyzeKeywordWithAIOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  selectedKeywords?: string[];
  minVolume?: number;
  location?: string; // Location for local optimization
  entity?: string; // Optional entity for content optimization
  serpData?: unknown; // Full SERP JSON response to send to AI
  connectedSite?: { name: string; siteUrl: string }; // Connected WordPress site (target topic)
  relatedGSCKeywords?: string[]; // Related GSC keywords to include in analysis
  siteUrl?: string; // Site URL for competitor filtering
  companyName?: string; // Company name for competitor filtering
  /** Pre-read AI-driven ACF context (use when already resolved). */
  acfContext?: AIDrivenACFContext;
  /** Raw ACF object from WordPress or CSV; will be interpreted agentically via AI-driven reader when acfContext not provided. */
  acfFields?: Record<string, unknown>;
}

/**
 * Main function to analyze keyword with AI and generate suggestions
 */
export async function analyzeKeywordWithAI(
  keywordData: KeywordData,
  competitorData: undefined,
  options: AnalyzeKeywordWithAIOptions
): Promise<KeywordAIAnalysis> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = RESEARCH_MODEL_MAX_TOKENS,
    topP = 0.9,
  } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for AI analysis");
  }

  // Extract siteUrl from connectedSite if not explicitly provided
  const siteUrl = options.siteUrl || options.connectedSite?.siteUrl || '';
  const companyName = options.companyName;

  // Filter keywords using AI (English + competitor filtering in one pass)
  let filteredSelectedKeywords = options.selectedKeywords || [];
  let filteredRelatedGSCKeywords = options.relatedGSCKeywords || [];

  if (siteUrl && apiKey && apiKey.trim()) {
    try {
      if (filteredSelectedKeywords.length > 0) {
        const beforeCount = filteredSelectedKeywords.length;
        filteredSelectedKeywords = await filterCompetitorKeywordsFromStrings(
          filteredSelectedKeywords,
          siteUrl,
          companyName,
          apiKey,
          model
        );
      }

      if (filteredRelatedGSCKeywords.length > 0) {
        const beforeCount = filteredRelatedGSCKeywords.length;
        filteredRelatedGSCKeywords = await filterCompetitorKeywordsFromStrings(
          filteredRelatedGSCKeywords,
          siteUrl,
          companyName,
          apiKey,
          model
        );
      }
    } catch (error) {
      logger.warn('[Keyword AI Analyzer] Error filtering competitor keywords, continuing with non-English filtered keywords:', error);
      // Continue with non-English filtered keywords if competitor filtering fails
    }
  } else {
    if (filteredSelectedKeywords.length > 0 || filteredRelatedGSCKeywords.length > 0) {
      /* no site URL to filter against, keep keywords as is */
    }
  }

  // Resolve ACF context: use provided acfContext or read raw acfFields agentically (no static key names)
  let acfContextForPrompt: AIDrivenACFContext | undefined = options.acfContext;
  if (!acfContextForPrompt && options.acfFields && Object.keys(options.acfFields).length > 0) {
    acfContextForPrompt = await readACFFieldsAgentically(options.acfFields, {
      apiKey: options.apiKey,
      siteUrl: options.connectedSite?.siteUrl ?? options.siteUrl,
      model: options.model ?? getResearchModel(),
    });
  }

  // Pass filtered keywords to prompt builder
  const userPrompt = buildKeywordAnalysisPrompt(
    keywordData, 
    competitorData, 
    filteredSelectedKeywords.length > 0 ? filteredSelectedKeywords : undefined,
    options.minVolume,
    options.location,
    options.entity,
    options.serpData,
    options.connectedSite,
    filteredRelatedGSCKeywords.length > 0 ? filteredRelatedGSCKeywords : undefined,
    acfContextForPrompt
  );

  const systemPrompt = `You are an expert SEO content strategist specializing in keyword analysis and content planning. Your role is to analyze keyword data and provide actionable recommendations for keyword variations, content structure (H2 sections), and content gaps.

CRITICAL JSON OUTPUT REQUIREMENTS - VALIDATION CHECKLIST:
Before you respond, you MUST validate your JSON:
1. Count opening braces { and closing braces } - they must be equal
2. Count opening brackets [ and closing brackets ] - they must be equal  
3. Check for trailing commas - remove any comma before } or ]
4. Check for double brackets - remove any ]] or }} patterns
5. Ensure every property name is in double quotes
6. Ensure every string value is in double quotes (escape internal quotes with \\")
7. Ensure numbers are not quoted
8. Ensure booleans are true/false (not "true"/"false")
9. Test your JSON mentally: can it be parsed by JSON.parse()? If not, fix it.
10. CRITICAL: Ensure all strings are properly closed - no unterminated strings

MANDATORY OUTPUT FORMAT:
- Return ONLY the raw JSON object
- NO markdown code blocks (no \`\`\`json or \`\`\`)
- NO explanations before or after
- NO text outside the JSON
- Start with { and end with }
- The entire response must be valid JSON that passes JSON.parse()
- CRITICAL: Your response must be complete - do not truncate the JSON

CRITICAL REQUIREMENT: When SERP data is provided, extract available data. Empty arrays are acceptable if data doesn't exist:

1. "peopleAlsoAsk" array - Extract if available, empty array is acceptable if none found
   - Search recursively through tasks[].result[].items[] for items with type "people_also_ask" or "people_also_ask_item"
   - Search DEEPLY: check tasks[].result[].items[].items[], tasks[].result[].items[].people_also_ask_items[]
   - Extract ALL questions found if they exist
   - Extract: question (REQUIRED), answer (if available), url (if available), domain (extract from URL if available)
   - If no PAA questions are found in the SERP data, return an empty array [] and proceed - this is acceptable and normal
   - PAA questions are optional - proceed with empty array if none exist

2. "researchLinks" array - MANDATORY, EQUALLY IMPORTANT AS PAA
   - Search recursively through tasks[].result[].items[] for items with type "organic" or "organic_result"
   - Extract all URLs, titles, descriptions, and domains
   - Include 5-15 recommended links

Both extractions are EQUALLY IMPORTANT. Do not return empty arrays unless you have thoroughly searched the ENTIRE JSON structure at ALL nested levels.

keywordSuggestions.primary, variations, longTail, and semantic MUST be lowercase Google search queries (how people type). Do not output title-case article titles.

EXACT JSON SCHEMA YOU MUST FOLLOW:
{
  "keywordSuggestions": {
    "primary": "string",
    "variations": ["string"],
    "longTail": ["string"],
    "semantic": ["string"]
  },
  "h2Suggestions": ["string"],
  "contentGaps": ["string"],
  "peopleAlsoAsk": [],
  "researchLinks": [
    {
      "url": "string",
      "title": "string",
      "description": "string",
      "domain": "string"
    }
  ]
}

Return ONLY this JSON structure. NO markdown, NO explanations, NO code blocks.`;

  let fullResponse = "";
  let finishReason: string | null = null;

  try {
    const actualTemperature = Math.min(temperature, 0.2); // Very low temperature for deterministic JSON output
    const actualMaxTokens = maxTokens ?? RESEARCH_MODEL_MAX_TOKENS;

    const result = await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: actualTemperature,
      maxTokens: actualMaxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
      onFinishReason: (reason) => {
        finishReason = reason;
      },
    });
    
    // Capture finish_reason from result if not already captured
    if (result.finishReason && !finishReason) {
      finishReason = result.finishReason;
    }

    // Never throw for truncation – use whatever we got and repair if needed (max_tokens is already 1M; if model still hits limit, salvage)
    if (finishReason === 'length') {
      logger.warn(`[Keyword AI Analyzer] AI response hit length limit (${fullResponse.length} chars); salvaging partial response.`);
    }

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = fullResponse.trim();
    
    // Aggressively remove markdown
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    }
    
    // Extract JSON object if wrapped in text
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    // Parse JSON – use repair when truncated or incomplete so we never fail the flow
    const { parsed, usedRepair } = tryParseKeywordAnalysisJson(cleanedResponse);
    if (usedRepair && finishReason === 'length') {
      logger.warn('[Keyword AI Analyzer] Repaired truncated JSON and continued.');
    }

    // Use ONLY AI-extracted data - no manual fallback
    const researchLinks = parsed.researchLinks || [];
    // PAA will be extracted in a separate step - don't use from main analysis
    const peopleAlsoAsk: PeopleAlsoAsk[] = [];

    // Validate and ensure all required fields exist
    // Format all keywords with proper capitalization
    const analysis: KeywordAIAnalysis = {
      keywordSuggestions: {
        primary: formatKeyword(parsed.keywordSuggestions?.primary || keywordData.keyword),
        variations: formatKeywords(parsed.keywordSuggestions?.variations || []),
        longTail: formatKeywords(parsed.keywordSuggestions?.longTail || []),
        semantic: formatKeywords(parsed.keywordSuggestions?.semantic || []),
      },
      h2Suggestions: parsed.h2Suggestions || [],
      contentGaps: parsed.contentGaps || [],
      peopleAlsoAsk: peopleAlsoAsk,
      researchLinks: researchLinks,
    };

    return analysis;
  } catch (error) {
    logger.warn("[Keyword AI Analyzer] Non-fatal keyword analysis fallback:", error);
    
    // Return empty structure if parsing fails - no manual fallback
    return {
      keywordSuggestions: {
        primary: formatKeyword(keywordData.keyword),
        variations: [],
        longTail: [],
        semantic: [],
      },
      h2Suggestions: [],
      contentGaps: [],
      peopleAlsoAsk: [],
      researchLinks: [],
    };
  }
}

/**
 * Extract keyword suggestions from AI analysis
 */
export function extractKeywordSuggestions(analysis: KeywordAIAnalysis): {
  all: string[];
  variations: string[];
  longTail: string[];
  semantic: string[];
} {
  return {
    all: [
      analysis.keywordSuggestions.primary,
      ...analysis.keywordSuggestions.variations,
      ...analysis.keywordSuggestions.longTail,
      ...analysis.keywordSuggestions.semantic,
    ].filter(Boolean),
    variations: analysis.keywordSuggestions.variations,
    longTail: analysis.keywordSuggestions.longTail,
    semantic: analysis.keywordSuggestions.semantic,
  };
}


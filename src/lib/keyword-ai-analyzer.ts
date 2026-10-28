import { streamChatCompletion } from "./api";
import type { KeywordData, KeywordAIAnalysis, PeopleAlsoAsk } from "./keyword-types";
import { extractPeopleAlsoAskFromSerp } from "./paa-extractor";
import { buildKeywordAnalysisPrompt } from "./prompt-builders-keyword";
import { formatKeyword, formatKeywords } from "./keyword-formatter";
import { getResearchModel } from "./optimization-settings-storage";
import { isNonEnglishKeyword } from "./gsc-query-processor";
import { readACFFieldsAgentically } from "./content-generation/ai-driven-acf-reader";
import type { AIDrivenACFContext } from "./content-generation/ai-driven-acf-reader";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/** Gemini 2.5 Flash Lite has a massive context window; use 1M max output so truncation is never an issue. */
const RESEARCH_MODEL_MAX_TOKENS = 1_000_000;

function stripToLikelyJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function tryCloseUnbalancedBrackets(text: string): string {
  // Best-effort: append missing closers at end, ignoring brackets inside JSON strings.
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if ((ch === "}" && last === "{") || (ch === "]" && last === "[")) stack.pop();
    }
  }
  if (stack.length === 0) return text;
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "{" ? "}" : "]";
  }
  return text + suffix;
}

function tryFixMissingArrayCloseBeforeKey(text: string, key: string): { fixed: string; applied: boolean } {
  // If the model forgets to close an array before emitting the next key, this heuristic inserts `],`
  // Example broken:  ... }\n  },\n  "peopleAlsoAsk":
  // Desired:       ... }\n  ],\n  "peopleAlsoAsk":
  const re = new RegExp(`\\n\\s*},\\s*\\n\\s*\\"${key}\\"\\s*:`, "m");
  if (!re.test(text)) return { fixed: text, applied: false };
  return { fixed: text.replace(re, `\n  ],\n  \"${key}\":`), applied: true };
}

function tryParseKeywordAnalysisJson(cleanedResponse: string): {
  parsed: KeywordAIAnalysis;
  usedRepair: boolean;
  repairSteps: string[];
} {
  try {
    return { parsed: JSON.parse(cleanedResponse) as KeywordAIAnalysis, usedRepair: false, repairSteps: [] };
  } catch {
    // fall through to repair attempts
  }

  let working = cleanedResponse;
  const steps: string[] = [];

  const stripped = stripToLikelyJsonObject(working);
  if (stripped !== working) {
    working = stripped;
    steps.push("stripToLikelyJsonObject");
  }

  const noTrailing = removeTrailingCommas(working);
  if (noTrailing !== working) {
    working = noTrailing;
    steps.push("removeTrailingCommas");
  }

  // Targeted fix based on observed runtime error context
  const fixPAA = tryFixMissingArrayCloseBeforeKey(working, "peopleAlsoAsk");
  if (fixPAA.applied) {
    working = fixPAA.fixed;
    steps.push("insertMissingArrayCloseBefore_peopleAlsoAsk");
  }

  const closed = tryCloseUnbalancedBrackets(working);
  if (closed !== working) {
    working = closed;
    steps.push("tryCloseUnbalancedBrackets");
  }

  return { parsed: JSON.parse(working) as KeywordAIAnalysis, usedRepair: true, repairSteps: steps };
}

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
  serpData?: any; // Full SERP JSON response to send to AI
  connectedSite?: { name: string; siteUrl: string }; // Connected WordPress site (target topic)
  relatedGSCKeywords?: string[]; // Related GSC keywords to include in analysis
  siteUrl?: string; // Site URL for competitor filtering
  companyName?: string; // Company name for competitor filtering
  /** Pre-read AI-driven ACF context (use when already resolved). */
  acfContext?: AIDrivenACFContext;
  /** Raw ACF object from WordPress or CSV; will be interpreted agentically via AI-driven reader when acfContext not provided. */
  acfFields?: Record<string, any>;
}

/**
 * Filters competitor keywords from a string array using AI (similar to Content Optimizer logic)
 * This is a simplified version that works with string arrays instead of GSC query objects
 */
async function filterCompetitorKeywordsFromStrings(
  keywords: string[],
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<string[]> {
  if (!keywords || keywords.length === 0) {
    return keywords;
  }

  // If only one keyword, check it individually
  if (keywords.length === 1) {
    const isValid = await checkIfServiceKeywordString(keywords[0], siteUrl, companyName, apiKey, model);
    return isValid ? keywords : [];
  }

  // Batch process keywords in parallel
  const batchSize = 35;
  const validKeywords: string[] = [];

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    try {
      const filtered = await filterBatchOfKeywordStrings(batch, siteUrl, companyName, apiKey, model);
      validKeywords.push(...filtered);
    } catch (error) {
      console.warn('[Keyword AI Analyzer] Error filtering competitor keywords batch:', error);
      // Fail-safe: skip this batch
    }
  }

  console.log(`[Keyword AI Analyzer] Filtered ${keywords.length - validKeywords.length} competitor keywords. ${validKeywords.length} product/service keywords remaining.`);
  return validKeywords;
}

/**
 * Filters a batch of keyword strings using AI
 */
async function filterBatchOfKeywordStrings(
  keywords: string[],
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<string[]> {
  try {
    const keywordsList = keywords.map((kw, idx) => `${idx + 1}. "${kw}"`).join('\n');
    const prompt = `You are a local SEO expert. Filter these keywords - keep English service/product keywords, exclude competitor business names${companyName ? ` or "${companyName}" queries` : ''}.

Keywords:
${keywordsList}

Return JSON array of keyword numbers to KEEP: [1, 3, 5]`;

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\d\s,]+\]/) || content.match(/```(?:json)?\s*(\[[\d\s,]+\])\s*```/);
    
    if (jsonMatch) {
      const validIndices: number[] = JSON.parse(jsonMatch[0] || jsonMatch[1] || '[]');
      return keywords.filter((_, idx) => validIndices.includes(idx + 1));
    }
    return keywords;
  } catch (error) {
    console.warn('[Keyword AI Analyzer] Error filtering keywords:', error);
    return keywords;
  }
}

/**
 * Checks a single keyword string to determine if it's a service keyword (not a competitor)
 */
async function checkIfServiceKeywordString(
  keyword: string,
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<boolean> {
  try {
    const prompt = `Is "${keyword}" a service/product keyword or competitor business name? Return "true" for service, "false" for competitor.`;

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 50,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    return content.includes('true');
  } catch (error) {
    console.warn('[Keyword AI Analyzer] Error checking single keyword:', error);
    return true;
  }
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
        if (beforeCount > filteredSelectedKeywords.length) {
          console.log(`[Keyword AI Analyzer] COMPETITOR FILTER: Removed ${beforeCount - filteredSelectedKeywords.length} competitor keywords from selectedKeywords. ${filteredSelectedKeywords.length} service/product keywords remain.`);
        }
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
        if (beforeCount > filteredRelatedGSCKeywords.length) {
          console.log(`[Keyword AI Analyzer] COMPETITOR FILTER: Removed ${beforeCount - filteredRelatedGSCKeywords.length} competitor keywords from relatedGSCKeywords. ${filteredRelatedGSCKeywords.length} service/product keywords remain.`);
        }
      }
    } catch (error) {
      console.warn('[Keyword AI Analyzer] Error filtering competitor keywords, continuing with non-English filtered keywords:', error);
      // Continue with non-English filtered keywords if competitor filtering fails
    }
  } else {
    if (filteredSelectedKeywords.length > 0 || filteredRelatedGSCKeywords.length > 0) {
      console.log('[Keyword AI Analyzer] Skipping competitor filtering - siteUrl or apiKey not available');
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
      console.warn(`[Keyword AI Analyzer] AI response hit length limit (${fullResponse.length} chars); salvaging partial response.`);
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
      console.warn('[Keyword AI Analyzer] Repaired truncated JSON and continued.');
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
    console.warn("[Keyword AI Analyzer] Non-fatal keyword analysis fallback:", error);
    
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
 * Extract People Also Ask questions from SERP data using AI
 * Prints raw SERP data and raw AI response separately before processing
 */
export async function extractPeopleAlsoAskWithAI(
  serpData: any,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }
): Promise<{ rawResponse: string; questions: PeopleAlsoAsk[] }> {
  // If SERP data is absent, errored, or has zero tasks/items, immediately return empty in 0ms
  if (
    !serpData ||
    serpData.serp_error ||
    !Array.isArray(serpData.tasks) ||
    serpData.tasks.length === 0
  ) {
    return { rawResponse: '', questions: [] };
  }

  // 1. Fast direct JSON extraction (0ms single pass, no LLM required)
  const direct = extractPeopleAlsoAskFromSerp(serpData);
  if (direct.items.length > 0) {
    return { rawResponse: '', questions: direct.items };
  }

  // If no items exist in tasks, or no API key, move on immediately without calling LLM
  const hasItems = serpData.tasks.some((t: any) =>
    Array.isArray(t?.result) && t.result.some((r: any) => Array.isArray(r?.items) && r.items.length > 0)
  );
  if (!hasItems || !options.apiKey?.trim()) {
    return { rawResponse: '', questions: [] };
  }

  // 2. Single AI pass only if SERP had items but direct parser found 0 PAA
  const systemPrompt = `You are an expert at extracting "People Also Ask" questions from SERP JSON data. Return ONLY a JSON array with questions found. If none found, return []. No markdown, no explanations.`;
  const itemsSample = serpData.tasks[0]?.result?.[0]?.items?.slice(0, 15) ?? serpData;
  const userPrompt = `Extract People Also Ask questions from this SERP JSON:\n${JSON.stringify(itemsSample, null, 2)}\nReturn format: [{"question": "...", "answer": "...", "url": "..."}]`;

  let fullResponse = "";
  try {
    await streamChatCompletion({
      apiKey: options.apiKey,
      model: options.model || getResearchModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: Math.min(options.maxTokens || 1000, 2000),
      topP: options.topP || 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleanedResponse);
    if (Array.isArray(parsed)) {
      const questions = parsed.map((item: any) => ({
        question: item.question || item.title || item.text || '',
        answer: item.answer || item.description || item.snippet || undefined,
        url: item.url || item.link || undefined,
        domain: item.domain || (item.url ? new URL(item.url).hostname : undefined),
      })).filter((item: PeopleAlsoAsk) => item.question && item.question.trim().length > 0);
      return { rawResponse: fullResponse, questions };
    }
    return { rawResponse: fullResponse, questions: [] };
  } catch {
    // If extraction errors: single pass is done, move on immediately with zero retries/fallbacks
    return { rawResponse: '', questions: [] };
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


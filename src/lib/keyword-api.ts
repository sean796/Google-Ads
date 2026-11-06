import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { notify } from "@/lib/app-notifications";
import type {
  KeywordData,
  KeywordAnalysisOptions,
} from "./keyword-types";
import { saveKeywordResearchToDB, getKeywordResearchFromDB } from "./keyword-db";
import { classifyKeywordIntentWithAi } from "./keyword-intent-classify";
import { loadDataForSEOApiKey } from "./api";
import {
  callMCPKeywordOverview,
  callMCPSemanticKeywords,
} from "./keyword-mcp-service";
import { formatKeyword } from "./keyword-formatter";
import {
  DISABLE_DATAFORSEO,
  getCachedData,
  setCachedData,
  KEYWORD_CACHE_KEY,
} from "./keyword-api-cache";

export { clearKeywordCache } from "./keyword-api-cache";
export { extractPeopleAlsoAsk, fetchPeopleAlsoAsk } from "./keyword-api-paa";

/**
 * Analyzes keyword difficulty for multiple keywords
 * 
 * NOTE: This function requires backend integration with DataForSEO MCP server.
 * The actual MCP tool calls need to be made from a backend API endpoint.
 * MCP Tool: mcp_DataForSEO_dataforseo_labs_bulk_keyword_difficulty
 */
export async function analyzeKeywordDifficulty(
  keywords: string[],
  location: string = "United States",
  language: string = "en"
): Promise<KeywordData[]> {
  try {
    if (DISABLE_DATAFORSEO) {
      console.warn("[KeywordAPI] DataForSEO disabled – analyzeKeywordDifficulty skipped.");
      return [];
    }
    // Check cache first
    const cachedResults: KeywordData[] = [];
    const uncachedKeywords: string[] = [];

    for (const keyword of keywords) {
      const cached = getCachedData<KeywordData>(keyword, KEYWORD_CACHE_KEY);
      if (cached) {
        cachedResults.push(cached);
      } else {
        uncachedKeywords.push(keyword);
      }
    }

    // If all keywords are cached, return cached results
    if (uncachedKeywords.length === 0) {
      return cachedResults;
    }

    // TODO: Implement backend API call to DataForSEO MCP server
    // The backend should call: mcp_DataForSEO_dataforseo_labs_bulk_keyword_difficulty
    // Example backend endpoint: POST /api/keywords/difficulty
    // {
    //   keywords: uncachedKeywords,
    //   location,
    //   language
    // }
    
    // For now, return cached results
    // In production, this would make an API call to your backend which calls the MCP tool
    console.warn("Keyword difficulty analysis requires backend MCP integration");
    return cachedResults;
  } catch (error) {
    console.error("Error analyzing keyword difficulty:", error);
    throw new Error(`Failed to analyze keyword difficulty: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Gets semantic keyword suggestions based on seed keyword
 * 
 * NOTE: Requires backend integration with DataForSEO MCP server.
 * MCP Tools: 
 * - mcp_DataForSEO_dataforseo_labs_google_keyword_ideas
 * - mcp_DataForSEO_dataforseo_labs_google_related_keywords
 */
export async function getSemanticKeywordSuggestions(
  seedKeyword: string,
  location: string = "United States",
  language: string = "en",
  limit: number = 20
): Promise<KeywordData[]> {
  try {
    if (DISABLE_DATAFORSEO) {
      console.warn("[KeywordAPI] DataForSEO disabled – semantic keyword suggestions skipped for seed:", seedKeyword);
      return [];
    }
    const cacheKey = `semantic-${seedKeyword}`;
    const cached = getCachedData<KeywordData[]>(cacheKey, KEYWORD_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Check database first
    const dbResult = getKeywordResearchFromDB(seedKeyword);
    if (dbResult && dbResult.semanticKeywords.length > 0) {
      return dbResult.semanticKeywords.slice(0, limit);
    }

    // Call MCP tools via backend API
    try {
      const mcpResults = await callMCPSemanticKeywords(seedKeyword, location, language, limit);
      
      // Cache the results
      setCachedData(cacheKey, mcpResults, KEYWORD_CACHE_KEY);
      
      return mcpResults;
    } catch (mcpError) {
      console.error("MCP semantic keywords call failed:", mcpError);
      throw mcpError;
    }
  } catch (error) {
    console.error("Error getting semantic keyword suggestions:", error);
    throw new Error(`Failed to get semantic keyword suggestions: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Classifies search intent for keywords
 * 
 * NOTE: Requires backend integration with DataForSEO MCP server.
 * MCP Tool: mcp_DataForSEO_dataforseo_labs_search_intent
 */
export async function classifySearchIntent(
  keywords: string[],
  language: string = "en"
): Promise<{ keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[]> {
  try {
    // Check database first
    const results: { keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[] = [];
    const remainingKeywords: string[] = [];
    
    for (const keyword of keywords) {
      const dbResult = getKeywordResearchFromDB(keyword);
      if (dbResult) {
        results.push({
          keyword,
          intent: dbResult.searchIntent,
          probability: 0.9 // High confidence if from DB
        });
      } else {
        remainingKeywords.push(keyword);
      }
    }

    // If all found in DB, return them
    if (remainingKeywords.length === 0) {
      return results;
    }

    const aiResults = await classifyKeywordIntentWithAi(
      remainingKeywords.filter((kw) => kw && typeof kw === "string" && kw.trim().length > 0),
    );
    return [
      ...results,
      ...aiResults.map((r) => ({ keyword: r.keyword, intent: r.intent, probability: r.probability })),
    ];
  } catch (error) {
    console.error("Error classifying search intent:", error);
    throw new Error(`Failed to classify search intent: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Gets comprehensive keyword overview
 * 
 * MCP Tool: mcp_DataForSEO_dataforseo_labs_google_keyword_overview
 */
export async function getKeywordOverview(
  keywords: string[],
  location: string = "United States",
  language: string = "en",
  forceRefresh: boolean = false // New parameter to bypass cache
): Promise<KeywordData[]> {
  try {
    if (DISABLE_DATAFORSEO) {
      console.warn("[KeywordAPI] DataForSEO disabled – returning stub keyword data only.", { keywords });
      return keywords
        .filter((k) => k && typeof k === "string" && k.trim().length > 0)
        .map((k) => ({
          keyword: k.trim(),
          searchVolume: 0,
          difficulty: 0,
          cpc: 0,
          competition: "LOW" as const,
          intent: "informational" as const,
          relatedKeywords: [],
          serpFeatures: [],
        }));
    }

    // If forceRefresh is true, skip cache and go straight to API
    if (forceRefresh) {
      const mcpResults = await callMCPKeywordOverview(keywords, location, language);
      
      // Validate and cache results
      const validResults = mcpResults.filter(result => 
        result && 
        result.keyword && 
        typeof result.keyword === 'string' &&
        keywords.some(k => 
          k && typeof k === 'string' && 
          k.toLowerCase().trim() === result.keyword.toLowerCase().trim()
        )
      );
      
      validResults.forEach(result => {
        setCachedData(result.keyword, result, KEYWORD_CACHE_KEY);
      });
      
      return validResults;
    }

    // Check cache first (only if not forcing refresh)
    const cachedResults: KeywordData[] = [];
    const uncachedKeywords: string[] = [];

    for (const keyword of keywords) {
      const cached = getCachedData<KeywordData>(keyword, KEYWORD_CACHE_KEY);
      if (cached) {
        cachedResults.push(cached);
      } else {
        uncachedKeywords.push(keyword);
      }
    }

    // If all keywords are cached, return cached results
    if (uncachedKeywords.length === 0) {
      return cachedResults;
    }

    // Check database first
    const dbResults: KeywordData[] = [];
    const remainingKeywords: string[] = [];
    
    for (const keyword of uncachedKeywords) {
      const dbResult = getKeywordResearchFromDB(keyword);
      if (dbResult) {
        dbResults.push(dbResult.keywordData);
      } else {
        remainingKeywords.push(keyword);
      }
    }

    // If all found in DB, return them
    if (remainingKeywords.length === 0) {
      return [...cachedResults, ...dbResults];
    }

    // Call MCP tool for remaining keywords
    if (remainingKeywords.length > 0) {
      try {
        const mcpResults = await callMCPKeywordOverview(remainingKeywords, location, language);
        
        console.log('[KeywordAPI] MCP results received:', {
          count: mcpResults.length,
          keywords: mcpResults.map(r => r.keyword),
          requested: remainingKeywords
        });
        
        // Validate results - accept any result with a keyword
        // DataForSEO returns data even if search volume is 0, so accept all results with keywords
        const validResults = mcpResults.filter(result => {
          return result && result.keyword && result.keyword.trim().length > 0;
        });
        
        console.log('[KeywordAPI] Valid results after filtering:', {
          count: validResults.length,
          keywords: validResults.map(r => r.keyword)
        });
        
        if (validResults.length === 0) {
          return [...cachedResults, ...dbResults, ...mcpResults];
        }
        
        // Cache the results
        validResults.forEach(result => {
          setCachedData(result.keyword, result, KEYWORD_CACHE_KEY);
        });

        return [...cachedResults, ...dbResults, ...validResults];
      } catch (mcpError) {
        console.error("MCP call failed:", mcpError);
        // Don't return stale cache/DB data if MCP call fails - user should see the error
        // Only return cached/DB data if it's for the exact same keyword being requested
        const exactMatches = [...cachedResults, ...dbResults].filter(r => 
          r && r.keyword && typeof r.keyword === 'string' &&
          remainingKeywords.some(k => 
            k && typeof k === 'string' && 
            k.toLowerCase().trim() === r.keyword.toLowerCase().trim()
          )
        );
        
        if (exactMatches.length > 0) {
          return exactMatches;
        }
        
        throw mcpError;
      }
    }

    return [...cachedResults, ...dbResults];
  } catch (error) {
    console.error("Error getting keyword overview:", error);
    throw new Error(`Failed to get keyword overview: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Helper to transform DataForSEO API responses to our KeywordData format
 */
interface KeywordDataApiItem {
  keyword?: string;
  keyword_info?: {
    keyword?: string;
    keyword_difficulty?: number;
    search_volume?: number;
    cpc?: number;
    competition_level?: string;
  };
  keyword_difficulty?: number;
  search_volume?: number;
  cpc?: number;
  competition_level?: string;
}

export function transformKeywordData(apiResponse: unknown): KeywordData {
  const data: KeywordDataApiItem =
    apiResponse && typeof apiResponse === "object" ? (apiResponse as KeywordDataApiItem) : {};
  const rawKeyword = data.keyword || data.keyword_info?.keyword || "";
  return {
    keyword: formatKeyword(rawKeyword),
    difficulty: data.keyword_difficulty || data.keyword_info?.keyword_difficulty || 0,
    searchVolume: data.search_volume || data.keyword_info?.search_volume || 0,
    cpc: data.cpc || data.keyword_info?.cpc || 0,
    competition: (data.competition_level || data.keyword_info?.competition_level || "LOW") as 'LOW' | 'MEDIUM' | 'HIGH',
    intent: 'informational' as const, // Will be set separately
    relatedKeywords: [],
    serpFeatures: []
  };
}


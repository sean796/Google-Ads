import { notify } from "@/lib/app-notifications";
import type {
  KeywordData,
  KeywordResearchResult,
  KeywordAnalysisOptions,
} from "./keyword-types";
import { saveKeywordResearchToDB, getKeywordResearchFromDB } from "./keyword-db";
import { loadDataForSEOApiKey } from "./api";
import {
  callMCPKeywordOverview,
  callMCPSemanticKeywords,
} from "./keyword-mcp-service";
import { formatKeyword } from "./keyword-formatter";

// Global kill switch: when true, NO DataForSEO / MCP keyword APIs will be called.
// All keyword research will use only the provided primary keyword and local heuristics.
const DISABLE_DATAFORSEO = false;

const KEYWORD_CACHE_KEY = "keyword-research-cache";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clears all cached keyword data
 */
export function clearKeywordCache(): void {
  try {
    localStorage.removeItem(KEYWORD_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing keyword cache:", error);
  }
}

interface CachedKeywordData {
  data: KeywordData | KeywordResearchResult;
  timestamp: number;
  keyword: string;
}

// Helper to get cached data
function getCachedData<T>(keyword: string, cacheKey: string): T | null {
  try {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return null;
    }
    
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cache: CachedKeywordData[] = JSON.parse(cached);
    const keywordLower = keyword.toLowerCase().trim();
    const entry = cache.find((c) => c.keyword && typeof c.keyword === 'string' && c.keyword.toLowerCase().trim() === keywordLower);

    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
      return null;
    }

    return entry.data as T;
  } catch (e) {
    console.error("Error reading cache:", e);
    return null;
  }
}

// Helper to set cached data
function setCachedData<T>(keyword: string, data: T, cacheKey: string): void {
  try {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      console.warn('[Keyword API] Invalid keyword for cache:', keyword);
      return;
    }
    
    const cached = localStorage.getItem(cacheKey);
    const cache: CachedKeywordData[] = cached ? JSON.parse(cached) : [];

    // Remove old entry if exists
    const keywordLower = keyword.toLowerCase().trim();
    const filtered = cache.filter((c) => !c.keyword || typeof c.keyword !== 'string' || c.keyword.toLowerCase().trim() !== keywordLower);

    // Add new entry
    filtered.push({
      keyword: keywordLower,
      data: data as any,
      timestamp: Date.now(),
    });

    // Keep only last 20 entries normally to prevent quota bloat
    const trimmed = filtered.slice(-20);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch (quotaErr) {
      // Quota exceeded: prune aggressively to keep only the most recent items
      try {
        const compact = trimmed.slice(-5);
        localStorage.setItem(cacheKey, JSON.stringify(compact));
      } catch {
        try {
          // Keep only current entry if quota is still tight
          localStorage.setItem(cacheKey, JSON.stringify([filtered[filtered.length - 1]]));
        } catch {
          // If storage is completely full, remove the cache key so it does not block execution
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Keyword API] Cache write skipped (non-critical):", e);
  }
}

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

    // Use heuristic-based intent classification (no API call - search intent endpoint removed)
    const heuristicResults = remainingKeywords
      .filter(kw => kw && typeof kw === 'string' && kw.trim().length > 0)
      .map(kw => {
      const keywordLower = String(kw).toLowerCase().trim();
      let intent: 'informational' | 'commercial' | 'transactional' | 'navigational' = 'informational';
      let probability = 0.7; // Medium confidence for heuristics
      
      // Simple heuristics
      if (keywordLower.includes('buy') || keywordLower.includes('price') || keywordLower.includes('cost') || 
          keywordLower.includes('cheap') || keywordLower.includes('discount') || keywordLower.includes('deal') ||
          keywordLower.includes('order') || keywordLower.includes('purchase') || keywordLower.includes('shop')) {
        intent = 'transactional';
        probability = 0.8;
      } else if (keywordLower.includes('best') || keywordLower.includes('review') || keywordLower.includes('compare') ||
                 keywordLower.includes('vs') || keywordLower.includes('alternative') || keywordLower.includes('top') ||
                 keywordLower.includes('recommend')) {
        intent = 'commercial';
        probability = 0.75;
      } else if (keywordLower.includes('how to') || keywordLower.includes('what is') || keywordLower.includes('guide') ||
                 keywordLower.includes('tutorial') || keywordLower.includes('learn') || keywordLower.includes('explain')) {
        intent = 'informational';
        probability = 0.8;
      } else if (keywordLower.includes('.com') || keywordLower.includes('website') || keywordLower.includes('login')) {
        intent = 'navigational';
        probability = 0.7;
      }
      
      return { keyword: kw, intent, probability };
    });
    
    // Return DB results + heuristic results
    return [...results, ...heuristicResults];
  } catch (error) {
    console.error("Error classifying search intent:", error);
    throw new Error(`Failed to classify search intent: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Extracts People Also Ask (PAA) data from SERP response
 * Handles multiple possible response structures from DataForSEO API
 */
export function extractPeopleAlsoAsk(serpData: any): import("./keyword-types").PeopleAlsoAsk[] {
  const paaItems: import("./keyword-types").PeopleAlsoAsk[] = [];
  
  // Log full response structure for debugging if no items found
  let hasLoggedStructure = false;
  
  if (!serpData?.tasks || !Array.isArray(serpData.tasks)) {
    console.warn('[PAA Extraction] No tasks array found in response:', {
      hasSerpData: !!serpData,
      tasksType: typeof serpData?.tasks,
      keys: serpData ? Object.keys(serpData) : []
    });
    return paaItems;
  }
  
  for (const task of serpData.tasks) {
    // Check task status
    if (task.status_code && task.status_code !== 20000) {
      console.warn('[PAA Extraction] Task has error status:', {
        status_code: task.status_code,
        status_message: task.status_message
      });
      continue;
    }
    
    if (task.result && Array.isArray(task.result)) {
      for (const resultItem of task.result) {
        // Method 1: Direct items array
        if (resultItem.items && Array.isArray(resultItem.items)) {
          for (const item of resultItem.items) {
            // Check for People Also Ask items (type: "people_also_ask")
            if (item.type === 'people_also_ask' || item.type === 'people_also_ask_item') {
              const question = item.question || item.title || item.text;
              if (question) {
                paaItems.push({
                  question: String(question),
                  answer: item.answer || item.description || item.snippet || undefined,
                  url: item.url || item.link || undefined,
                });
              }
            }
            
            // Method 2: Nested people_also_ask_items array
            if (item.people_also_ask_items && Array.isArray(item.people_also_ask_items)) {
              for (const paaItem of item.people_also_ask_items) {
                const question = paaItem.question || paaItem.title || paaItem.text;
                if (question) {
                  paaItems.push({
                    question: String(question),
                    answer: paaItem.answer || paaItem.description || paaItem.snippet || undefined,
                    url: paaItem.url || paaItem.link || undefined,
                  });
                }
              }
            }
            
            // Method 3: Check if item itself contains PAA data (alternative structure)
            if (item.type === 'people_also_ask' && item.items && Array.isArray(item.items)) {
              for (const paaItem of item.items) {
                const question = paaItem.question || paaItem.title || paaItem.text;
                if (question) {
                  paaItems.push({
                    question: String(question),
                    answer: paaItem.answer || paaItem.description || paaItem.snippet || undefined,
                    url: paaItem.url || paaItem.link || undefined,
                  });
                }
              }
            }
          }
        }
        
        // Method 4: Check for people_also_ask directly in resultItem
        if (resultItem.people_also_ask && Array.isArray(resultItem.people_also_ask)) {
          for (const paaItem of resultItem.people_also_ask) {
            const question = paaItem.question || paaItem.title || paaItem.text;
            if (question) {
              paaItems.push({
                question: String(question),
                answer: paaItem.answer || paaItem.description || paaItem.snippet || undefined,
                url: paaItem.url || paaItem.link || undefined,
              });
            }
          }
        }
      }
    }
    
    // Method 5: Check task.result directly (if it's not an array but an object)
    if (task.result && !Array.isArray(task.result) && typeof task.result === 'object') {
      const result = task.result;
      
      // Check for items array in result object
      if (result.items && Array.isArray(result.items)) {
        for (const item of result.items) {
          if (item.type === 'people_also_ask' || item.type === 'people_also_ask_item') {
            const question = item.question || item.title || item.text;
            if (question) {
              paaItems.push({
                question: String(question),
                answer: item.answer || item.description || item.snippet || undefined,
                url: item.url || item.link || undefined,
              });
            }
          }
          
          if (item.people_also_ask_items && Array.isArray(item.people_also_ask_items)) {
            for (const paaItem of item.people_also_ask_items) {
              const question = paaItem.question || paaItem.title || paaItem.text;
              if (question) {
                paaItems.push({
                  question: String(question),
                  answer: paaItem.answer || paaItem.description || paaItem.snippet || undefined,
                  url: paaItem.url || paaItem.link || undefined,
                });
              }
            }
          }
        }
      }
    }
  }
  
  // Log structure for debugging if no items found (no warning - empty PAA is acceptable)
  if (paaItems.length === 0 && !hasLoggedStructure) {
    console.log('[PAA Extraction] No PAA items found (this is acceptable). Response structure:', {
      hasTasks: !!serpData.tasks,
      tasksLength: serpData.tasks?.length,
      firstTaskKeys: serpData.tasks?.[0] ? Object.keys(serpData.tasks[0]) : [],
      firstTaskResultType: typeof serpData.tasks?.[0]?.result,
      firstTaskResultIsArray: Array.isArray(serpData.tasks?.[0]?.result),
      sampleStructure: JSON.stringify(serpData.tasks?.[0]?.result?.[0] || {}, null, 2).substring(0, 500)
    });
  }
  
  // Remove duplicates based on question text
  const uniqueItems = paaItems.filter((item, index, self) => {
    if (!item || !item.question || typeof item.question !== 'string') return false;
    return index === self.findIndex(t => 
      t && t.question && typeof t.question === 'string' && 
      t.question.toLowerCase() === item.question.toLowerCase()
    );
  });
  
  return uniqueItems;
}

/**
 * Fetches SERP data and extracts People Also Ask questions
 * Returns both extracted items and raw response for debugging
 */
export async function fetchPeopleAlsoAsk(
  keyword: string,
  location: string = "United States",
  language: string = "en",
  depth: number = 10
): Promise<{
  items: import("./keyword-types").PeopleAlsoAsk[];
  rawResponse: any;
  extractionLog: string[];
}> {
  try {
    if (DISABLE_DATAFORSEO) {
      console.warn("[KeywordAPI] DataForSEO disabled – skipping People Also Ask fetch for keyword:", keyword);
      return { items: [], rawResponse: null, extractionLog: ["[PAA Fetch] DataForSEO disabled"] };
    }
    const MCP_API_BASE = import.meta.env.VITE_MCP_API_BASE || 
      (import.meta.env.DEV ? 'http://localhost:3001/api/mcp' : '/api/mcp');
    
    console.log('[People Also Ask] Fetching SERP data from:', `${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`);
    
    const response = await fetch(`${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: keyword,
        location_name: location,
        language_code: language, // ✅ Correct: using language_code, NOT language_name
        depth: depth,
        people_also_ask_click_depth: 4, // Get more PAA items (max 4 clicks for deeper results)
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[People Also Ask] Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const serpData = await response.json();
    console.log('[People Also Ask] SERP data received:', serpData);
    
    // Use the new dedicated extractor
    const { extractPeopleAlsoAskFromSerp } = await import('./paa-extractor');
    const extractionResult = extractPeopleAlsoAskFromSerp(serpData);
    
    // Log extraction details
    console.log('[People Also Ask] Extraction log:', extractionResult.extractionLog);
    console.log('[People Also Ask] Extracted', extractionResult.items.length, 'PAA items');
    
    return extractionResult;
  } catch (error) {
    console.error("Error fetching People Also Ask:", error);
    return {
      items: [],
      rawResponse: null,
      extractionLog: [`[PAA Fetch] Error: ${error instanceof Error ? error.message : String(error)}`],
    };
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
export function transformKeywordData(apiResponse: any): KeywordData {
  const rawKeyword = apiResponse.keyword || apiResponse.keyword_info?.keyword || "";
  return {
    keyword: formatKeyword(rawKeyword),
    difficulty: apiResponse.keyword_difficulty || apiResponse.keyword_info?.keyword_difficulty || 0,
    searchVolume: apiResponse.search_volume || apiResponse.keyword_info?.search_volume || 0,
    cpc: apiResponse.cpc || apiResponse.keyword_info?.cpc || 0,
    competition: (apiResponse.competition_level || apiResponse.keyword_info?.competition_level || "LOW") as 'LOW' | 'MEDIUM' | 'HIGH',
    intent: 'informational' as const, // Will be set separately
    relatedKeywords: [],
    serpFeatures: []
  };
}


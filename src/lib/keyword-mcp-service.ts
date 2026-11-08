/**
 * MCP Service for DataForSEO API calls
 * This service calls MCP tools directly for keyword research
 */

import { mcpPostInit, resolveMcpApiBase } from "@/lib/mcp-tools";
import { logger } from "@/lib/logger";
import type { KeywordData, KeywordResearchResult } from "./keyword-types";
import { loadDataForSEOApiKey } from "./api";
import { withDataForSeoLocationCode } from "./dataforseo-location-code";

// Location and language code mappings
const LOCATION_CODES: Record<string, number> = {
  "United States": 2840,
  "United Kingdom": 2826,
  "Canada": 2124,
  "Australia": 2036,
  // Add more as needed
};

const LANGUAGE_CODES: Record<string, number> = {
  "en": 1000,
  "es": 1014,
  "fr": 1015,
  "de": 1011,
  // Add more as needed
};

/** Labs keyword_overview looks up search queries, not title-case display strings. */
export function keywordsForLabsOverview(keywords: string[]): string[] {
  return keywords
    .filter((keyword) => typeof keyword === "string" && keyword.trim().length > 0)
    .map((keyword) => keyword.trim().toLowerCase());
}

/**
 * Calls MCP tool for keyword overview
 * Uses DataForSEO MCP tools directly via the MCP function interface
 */
export async function callMCPKeywordOverview(
  keywords: string[],
  location: string = "United States",
  language: string = "en"
): Promise<KeywordData[]> {
  const locationName = location;
  const languageCode = language;
  const labsKeywords = keywordsForLabsOverview(keywords);
  if (labsKeywords.length === 0) {
    return [];
  }

  try {
    
    const { mcp_DataForSEO_dataforseo_labs_google_keyword_overview } = await import('@/lib/mcp-tools');

    const result = await mcp_DataForSEO_dataforseo_labs_google_keyword_overview(
      withDataForSeoLocationCode({
        keywords: labsKeywords,
        location_name: locationName,
        language_code: languageCode,
      }),
    );
    

    const transformed = transformMCPKeywordData(result);
    return transformed;
  } catch (error) {
    logger.error("[MCP Service] Keyword overview error:", error);
    logger.error("[MCP Service] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(
      `Failed to get keyword overview: ${error instanceof Error ? error.message : "Unknown error"}. ` +
      `Please ensure MCP server is configured with DataForSEO credentials.`
    );
  }
}

/**
 * Calls MCP tool for semantic keyword suggestions
 */
export async function callMCPSemanticKeywords(
  keyword: string,
  location: string = "United States",
  language: string = "en",
  limit: number = 20
): Promise<KeywordData[]> {
  const locationName = location;
  const languageCode = language;

  try {
    const { mcp_DataForSEO_dataforseo_labs_google_keyword_ideas } = await import('@/lib/mcp-tools');

    const result = await mcp_DataForSEO_dataforseo_labs_google_keyword_ideas(
      withDataForSeoLocationCode({
        keywords: [keyword],
        location_name: locationName,
        language_code: languageCode,
        limit,
      }),
    );
    return transformMCPSemanticData(result);
  } catch (error) {
    logger.error("MCP semantic keywords error:", error);
    throw new Error(
      `Failed to get semantic keywords: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Search intent: classifySearchIntent in keyword-api.ts uses the AI classifier (keyword-intent-classify.ts)
// Competitor analysis removed - keeping it simple, just keyword data

/**
 * Transform MCP API response to KeywordData format
 */
interface McpKeywordInfo {
  keyword?: string;
  keyword_difficulty?: number;
  search_volume?: number;
  cpc?: number;
  competition_level?: string;
}

interface McpKeywordItem {
  keyword?: string;
  keyword_info?: McpKeywordInfo;
  keyword_properties?: { keyword_difficulty?: number };
  keyword_difficulty?: number;
  search_volume?: number;
  cpc?: number;
  competition_level?: string;
  items?: McpKeywordItem[] | null;
  items_count?: number;
  keyword_data?: McpKeywordItem | McpKeywordItem[];
  keyword_intent?: { label?: string; probability?: number };
  search_intent?: { intent?: string; probability?: number };
}

interface McpTask {
  status_code?: number;
  status_message?: string;
  result_count?: number;
  result?: McpKeywordItem | McpKeywordItem[];
}

interface McpApiResponse {
  tasks?: McpTask[];
}

function asMcpResponse(apiResponse: unknown): McpApiResponse {
  return apiResponse && typeof apiResponse === "object" ? (apiResponse as McpApiResponse) : {};
}

function transformMCPKeywordData(apiResponse: unknown): KeywordData[] {
  // Transform based on DataForSEO API response structure
  // Structure: tasks[].result[] where each result has { keyword, keyword_info }
  const response = asMcpResponse(apiResponse);

  if (!response.tasks || !Array.isArray(response.tasks)) {
    logger.warn('[Transform] No tasks array in response');
    return [];
  }

  const results: KeywordData[] = [];

  for (const task of response.tasks) {
    
    // Check for errors first
    if (task.status_code && task.status_code !== 20000) {
      logger.error('[Transform] Task error:', {
        status_code: task.status_code,
        status_message: task.status_message
      });
      continue;
    }
    
    if (task.result && Array.isArray(task.result)) {
      // DataForSEO keyword_overview returns: tasks[].result[] 
      // Each result item can have: { keyword, keyword_info } OR { items: [...] }
      for (const resultItem of task.result) {
        
        // Check if result has items array (when items_count > 0)
        if (resultItem.items && Array.isArray(resultItem.items) && resultItem.items.length > 0) {
          // Process items array
          for (const item of resultItem.items) {
            if (item.keyword_info) {
              const keywordInfo = item.keyword_info;
              const keywordData: KeywordData = {
                keyword: item.keyword || keywordInfo.keyword || "",
                difficulty: item.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
                searchVolume: keywordInfo.search_volume || 0,
                cpc: keywordInfo.cpc || 0,
                competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
                intent: 'informational' as const,
                relatedKeywords: [],
                serpFeatures: [],
              };
              results.push(keywordData);
            }
          }
        }
        // DataForSEO API structure: resultItem.keyword and resultItem.keyword_info (direct structure)
        else if (resultItem.keyword_info) {
          const keywordInfo = resultItem.keyword_info;
          const keywordData: KeywordData = {
            keyword: resultItem.keyword || keywordInfo.keyword || "",
            difficulty: resultItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
            searchVolume: keywordInfo.search_volume || 0,
            cpc: keywordInfo.cpc || 0,
            competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          };
          
          results.push(keywordData);
        } 
        else if (resultItem.items_count === 0 || resultItem.items === null) {
          // Labs found no volume rows for these queries. That is a valid empty result.
        }
        else if (resultItem.keyword) {
          // Fallback: if we have keyword but no keyword_info, create minimal entry
          logger.warn('[Transform] Item has keyword but no keyword_info:', resultItem.keyword);
          results.push({
            keyword: resultItem.keyword,
            difficulty: 0,
            searchVolume: 0,
            cpc: 0,
            competition: 'LOW' as const,
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          });
        }
      }
    } else if (task.result && typeof task.result === 'object' && !Array.isArray(task.result)) {
      // Handle case where result is a single object, not an array
      const resultItem = task.result;
      
      if (resultItem.keyword_info) {
        const keywordInfo = resultItem.keyword_info;
        results.push({
          keyword: resultItem.keyword || keywordInfo.keyword || "",
          difficulty: resultItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
          searchVolume: keywordInfo.search_volume || 0,
          cpc: keywordInfo.cpc || 0,
          competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
          intent: 'informational' as const,
          relatedKeywords: [],
          serpFeatures: [],
        });
      }
    }
  }

  return results;
}

/**
 * Transform MCP semantic keywords response (keyword_ideas endpoint)
 */
function transformMCPSemanticData(apiResponse: unknown): KeywordData[] {
  const response = asMcpResponse(apiResponse);
  if (!response.tasks || !Array.isArray(response.tasks)) {
    return [];
  }

  const results: KeywordData[] = [];

  for (const task of response.tasks) {
    if (task.status_code && task.status_code !== 20000) {
      logger.error('[Transform Semantic] Task error:', {
        status_code: task.status_code,
        status_message: task.status_message
      });
      continue;
    }
    
    if (task.result && Array.isArray(task.result)) {
      for (const item of task.result) {
        // keyword_ideas returns items with keyword_data array
        if (item.keyword_data && Array.isArray(item.keyword_data)) {
          for (const keywordData of item.keyword_data) {
            results.push({
              keyword: keywordData.keyword || "",
              difficulty: keywordData.keyword_difficulty || keywordData.keyword_info?.keyword_difficulty || 0,
              searchVolume: keywordData.search_volume || keywordData.keyword_info?.search_volume || 0,
              cpc: keywordData.cpc || keywordData.keyword_info?.cpc || 0,
              competition: mapCompetitionLevel(keywordData.competition_level || keywordData.keyword_info?.competition_level || "LOW"),
              intent: 'informational' as const,
              relatedKeywords: [],
              serpFeatures: [],
            });
          }
        }
        // Alternative structure: keyword_data as object (not array)
        else if (item.keyword_data && typeof item.keyword_data === 'object') {
          const kd = Array.isArray(item.keyword_data)
            ? item.keyword_data[0]
            : item.keyword_data;
          if (!kd) continue;
          results.push({
            keyword: kd.keyword || "",
            difficulty: kd.keyword_difficulty || kd.keyword_info?.keyword_difficulty || 0,
            searchVolume: kd.search_volume || kd.keyword_info?.search_volume || 0,
            cpc: kd.cpc || kd.keyword_info?.cpc || 0,
            competition: mapCompetitionLevel(kd.competition_level || kd.keyword_info?.competition_level || "LOW"),
            intent: 'informational' as const,
            relatedKeywords: [],
            serpFeatures: [],
          });
        }
        // Also check for items array (similar to keyword_overview)
        else if (item.items && Array.isArray(item.items) && item.items.length > 0) {
          for (const subItem of item.items) {
            if (subItem.keyword_info) {
              const keywordInfo = subItem.keyword_info;
              results.push({
                keyword: subItem.keyword || keywordInfo.keyword || "",
                difficulty: subItem.keyword_properties?.keyword_difficulty || keywordInfo.keyword_difficulty || 0,
                searchVolume: keywordInfo.search_volume || 0,
                cpc: keywordInfo.cpc || 0,
                competition: mapCompetitionLevel(keywordInfo.competition_level || "LOW"),
                intent: 'informational' as const,
                relatedKeywords: [],
                serpFeatures: [],
              });
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * Transform MCP search intent response
 * DataForSEO API returns: item.keyword_intent.label and item.keyword_intent.probability
 */
function transformMCPIntentData(apiResponse: unknown): { keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[] {
  const response = asMcpResponse(apiResponse);
  if (!response.tasks || !Array.isArray(response.tasks)) {
    return [];
  }

  const results: { keyword: string; intent: 'informational' | 'commercial' | 'transactional' | 'navigational'; probability: number }[] = [];

  for (const task of response.tasks) {
    if (task.result && Array.isArray(task.result)) {
      for (const item of task.result) {
        // DataForSEO API returns keyword_intent.label and keyword_intent.probability
        if (item.keyword && item.keyword_intent) {
          const intentLabel = item.keyword_intent.label || "informational";
          const probability = item.keyword_intent.probability || 0.5;
          
          results.push({
            keyword: item.keyword,
            intent: mapIntentType(intentLabel),
            probability: probability,
          });
        }
        // Fallback for older API format (if search_intent exists)
        else if (item.keyword && item.search_intent) {
          results.push({
            keyword: item.keyword,
            intent: mapIntentType(item.search_intent.intent || "informational"),
            probability: item.search_intent.probability || 0.5,
          });
        }
      }
    }
  }

  return results;
}

// Competitor analysis transformation removed - keeping it simple

/**
 * Map competition level string to our type
 */
function mapCompetitionLevel(level: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const upper = level.toUpperCase();
  if (upper.includes('HIGH') || upper.includes('VERY HIGH')) return 'HIGH';
  if (upper.includes('MEDIUM') || upper.includes('MODERATE')) return 'MEDIUM';
  return 'LOW';
}

/**
 * Map intent string to our type
 */
function mapIntentType(intent: string): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const lower = intent.toLowerCase();
  if (lower.includes('commercial')) return 'commercial';
  if (lower.includes('transactional') || lower.includes('transaction')) return 'transactional';
  if (lower.includes('navigational') || lower.includes('navigation')) return 'navigational';
  return 'informational';
}

/**
 * Calls page intersection API to find keywords that multiple pages rank for
 */
export async function callPageIntersection(
  pages: string[],
  location: string = "United States",
  language: string = "en",
  intersectionMode: 'intersect' | 'union' = 'intersect'
): Promise<unknown> {
  const MCP_API_BASE = resolveMcpApiBase();
  
  try {
    
    const response = await fetch(
      `${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_page_intersection`,
      mcpPostInit({
        pages: pages,
        location_name: location,
        language_code: language,
        intersection_mode: intersectionMode,
      }),
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Page Intersection] API error response:', errorText);
      throw new Error(`Page intersection API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    return result;
  } catch (error) {
    logger.error('[Page Intersection] Error:', error);
    throw new Error(
      `Failed to get page intersection data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}


import { logger } from "@/lib/logger";
export interface KeywordInfo {
  keyword?: string;
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
  keyword_difficulty?: number;
  low_top_of_page_bid?: number;
  high_top_of_page_bid?: number;
  last_updated_time?: string;
  monthly_searches?: Array<{ year?: number; month?: number; search_volume?: number }>;
  [key: string]: unknown;
}

interface KeywordApiItem {
  keyword?: string;
  keyword_info?: KeywordInfo;
}

interface KeywordApiResultItem {
  items?: KeywordApiItem[];
  keyword?: string;
  keyword_info?: KeywordInfo;
}

export interface RawKeywordApiData {
  tasks?: Array<{ result?: KeywordApiResultItem[] }>;
  keywordOverview?: RawKeywordApiData;
}

/**
 * Parse raw API data to extract keyword information
 * Handles both old format (direct) and new format (nested)
 */
export function parseRawApiData(rawApiData: unknown): Array<{ keyword: string; info: KeywordInfo }> {
  if (!rawApiData || typeof rawApiData !== "object") {
    return [];
  }
  const raw = rawApiData as RawKeywordApiData;
  if (!raw.tasks && !raw.keywordOverview) {
    return [];
  }

    // Handle both old format (direct) and new format (nested)
  const apiData = raw.keywordOverview || raw;
  
  
  const task = apiData?.tasks?.[0];
  const results: Array<{ keyword: string; info: KeywordInfo }> = [];

  // Extract keyword data from result - check if task exists and has result
  if (task && Array.isArray(task.result)) {
    task.result.forEach((resultItem) => {
      // Check if we have items array with keyword data
      if (resultItem.items && Array.isArray(resultItem.items) && resultItem.items.length > 0) {
        resultItem.items.forEach((item) => {
          if (item.keyword_info) {
            results.push({
              keyword: item.keyword || item.keyword_info.keyword || '',
              info: item.keyword_info
            });
          }
        });
      }
      // Also check direct keyword_info structure
      else if (resultItem.keyword_info) {
        results.push({
          keyword: resultItem.keyword || resultItem.keyword_info.keyword || '',
          info: resultItem.keyword_info
        });
      }
    });
  } else {
    logger.warn('[KeywordApiParser] No task or task.result array found:', {
      hasTask: !!task,
      taskResultType: task?.result ? typeof task.result : 'undefined',
      taskResultIsArray: Array.isArray(task?.result)
    });
  }
  
  
  return results;
}

/**
 * Validate API data structure
 */
export function validateApiDataStructure(apiData: unknown): boolean {
  if (!apiData || typeof apiData !== "object") return false;
  const data = apiData as RawKeywordApiData;

  // Check for either tasks array or keywordOverview
  if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
    const task = data.tasks[0];
    return !!task && Array.isArray(task.result);
  }

  if (data.keywordOverview) {
    return validateApiDataStructure(data.keywordOverview);
  }
  
  return false;
}


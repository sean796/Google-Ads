import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { logger } from "@/lib/logger";
import { DISABLE_DATAFORSEO } from "./keyword-api-cache";

/**
 * Extracts People Also Ask (PAA) data from SERP response
 * Handles multiple possible response structures from DataForSEO API
 */
interface PaaSerpItem {
  type?: string;
  question?: string;
  title?: string;
  text?: string;
  answer?: string;
  description?: string;
  snippet?: string;
  url?: string;
  link?: string;
  items?: PaaSerpItem[];
  people_also_ask_items?: PaaSerpItem[];
}

interface PaaSerpResult {
  items?: PaaSerpItem[];
  people_also_ask?: PaaSerpItem[];
}

interface PaaSerpTask {
  status_code?: number;
  status_message?: string;
  result?: PaaSerpResult | PaaSerpResult[];
}

export function extractPeopleAlsoAsk(serpData: unknown): import("./keyword-types").PeopleAlsoAsk[] {
  const paaItems: import("./keyword-types").PeopleAlsoAsk[] = [];

  // Log full response structure for debugging if no items found
  const hasLoggedStructure = false;
  const serp: { tasks?: PaaSerpTask[] } =
    serpData && typeof serpData === "object" ? (serpData as { tasks?: PaaSerpTask[] }) : {};

  if (!serp.tasks || !Array.isArray(serp.tasks)) {
    logger.warn('[PAA Extraction] No tasks array found in response:', {
      hasSerpData: !!serpData,
      tasksType: typeof serp.tasks,
      keys: serpData && typeof serpData === "object" ? Object.keys(serpData) : []
    });
    return paaItems;
  }

  for (const task of serp.tasks) {
    // Check task status
    if (task.status_code && task.status_code !== 20000) {
      logger.warn('[PAA Extraction] Task has error status:', {
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
  rawResponse: unknown;
  extractionLog: string[];
}> {
  try {
    if (DISABLE_DATAFORSEO) {
      logger.warn("[KeywordAPI] DataForSEO disabled – skipping People Also Ask fetch for keyword:", keyword);
      return { items: [], rawResponse: null, extractionLog: ["[PAA Fetch] DataForSEO disabled"] };
    }
    const MCP_API_BASE = resolveMcpApiBase();
    
    
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
      logger.error('[People Also Ask] Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const serpData = await response.json();
    
    // Use the new dedicated extractor
    const { extractPeopleAlsoAskFromSerp } = await import('./paa-extractor');
    const extractionResult = extractPeopleAlsoAskFromSerp(serpData);
    
    // Log extraction details
    
    return extractionResult;
  } catch (error) {
    logger.error("Error fetching People Also Ask:", error);
    return {
      items: [],
      rawResponse: null,
      extractionLog: [`[PAA Fetch] Error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

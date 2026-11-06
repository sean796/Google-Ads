import type { ResearchLink } from "./keyword-types";

/**
 * Extracts organic search result links from DataForSEO SERP response
 * Handles multiple response structures:
 * - organic type items
 * - url, title, description fields
 */
export interface SerpLinkItem {
  type?: string;
  url?: string;
  link?: string;
  title?: string;
  text?: string;
  description?: string;
  snippet?: string;
  items?: SerpLinkItem[];
  organic?: SerpLinkItem[];
}

export interface SerpResultItem {
  items?: SerpLinkItem[];
  organic?: SerpLinkItem[];
}

interface SerpTask {
  status_code?: number;
  status_message?: string;
  result?: SerpResultItem | SerpResultItem[];
}

interface SerpResponseShape {
  tasks?: SerpTask[];
}

function asSerpResponse(serpData: unknown): SerpResponseShape {
  return serpData && typeof serpData === "object" ? (serpData as SerpResponseShape) : {};
}

export function extractResearchLinksFromSerp(serpData: unknown): {
  items: ResearchLink[];
  rawResponse: unknown;
  extractionLog: string[];
} {
  const links: ResearchLink[] = [];
  const extractionLog: string[] = [];

  if (!serpData) {
    extractionLog.push('[Link Extractor] No serpData provided');
    return { items: [], rawResponse: serpData, extractionLog };
  }
  const serp = asSerpResponse(serpData);

  // Log initial structure
  extractionLog.push(`[Link Extractor] Starting extraction. Has tasks: ${!!serp.tasks}, tasks is array: ${Array.isArray(serp.tasks)}`);

  if (!serp.tasks || !Array.isArray(serp.tasks)) {
    extractionLog.push('[Link Extractor] No tasks array found in response');
    return { items: [], rawResponse: serpData, extractionLog };
  }

  for (const task of serp.tasks) {
    // Check task status
    if (task.status_code && task.status_code !== 20000) {
      extractionLog.push(`[Link Extractor] Task has error status: ${task.status_code} - ${task.status_message}`);
      continue;
    }
    
    if (!task.result) {
      extractionLog.push('[Link Extractor] Task has no result');
      continue;
    }

    // Handle result as array
    if (Array.isArray(task.result)) {
      extractionLog.push(`[Link Extractor] Processing ${task.result.length} result items`);
      
      for (const resultItem of task.result) {
        extractFromResultItem(resultItem, links, extractionLog);
      }
    } 
    // Handle result as single object
    else if (typeof task.result === 'object') {
      extractionLog.push('[Link Extractor] Processing single result object');
      extractFromResultItem(task.result, links, extractionLog);
    }
  }

  // Remove duplicates based on URL
  const uniqueItems = links.filter((item, index, self) => 
    index === self.findIndex(t => t.url.toLowerCase().trim() === item.url.toLowerCase().trim())
  );

  extractionLog.push(`[Link Extractor] Extracted ${links.length} total items, ${uniqueItems.length} unique after deduplication`);

  return {
    items: uniqueItems,
    rawResponse: serpData,
    extractionLog,
  };
}

/**
 * Extract links from a single result item
 */
function extractFromResultItem(
  resultItem: SerpResultItem,
  links: ResearchLink[],
  extractionLog: string[]
): void {
  // Method 1: Check for items array with organic results
  if (resultItem.items && Array.isArray(resultItem.items)) {
    extractionLog.push(`[Link Extractor] Found items array with ${resultItem.items.length} items`);
    
    for (const item of resultItem.items) {
      // Check for organic type
      if (item.type === 'organic' || item.type === 'organic_result') {
        const url = item.url || item.link;
        if (url) {
          const link: ResearchLink = {
            url: String(url).trim(),
            title: item.title || item.text || undefined,
            description: item.description || item.snippet || undefined,
            domain: extractDomain(url),
          };
          links.push(link);
          extractionLog.push(`[Link Extractor] Extracted organic link: "${link.url.substring(0, 50)}..."`);
        }
      }
      
      // Also check for nested organic items
      if (item.items && Array.isArray(item.items)) {
        for (const nestedItem of item.items) {
          if (nestedItem.type === 'organic' || nestedItem.type === 'organic_result') {
            const url = nestedItem.url || nestedItem.link;
            if (url) {
              const link: ResearchLink = {
                url: String(url).trim(),
                title: nestedItem.title || nestedItem.text || undefined,
                description: nestedItem.description || nestedItem.snippet || undefined,
                domain: extractDomain(url),
              };
              links.push(link);
              extractionLog.push(`[Link Extractor] Extracted nested organic link: "${link.url.substring(0, 50)}..."`);
            }
          }
        }
      }
    }
  }
  
  // Method 2: Check for organic array directly in resultItem
  if (resultItem.organic && Array.isArray(resultItem.organic)) {
    extractionLog.push(`[Link Extractor] Found organic array directly in resultItem with ${resultItem.organic.length} items`);
    
    for (const organicItem of resultItem.organic) {
      const url = organicItem.url || organicItem.link;
      if (url) {
        const link: ResearchLink = {
          url: String(url).trim(),
          title: organicItem.title || organicItem.text || undefined,
          description: organicItem.description || organicItem.snippet || undefined,
          domain: extractDomain(url),
        };
        links.push(link);
        extractionLog.push(`[Link Extractor] Extracted from resultItem.organic: "${link.url.substring(0, 50)}..."`);
      }
    }
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    // If URL parsing fails, try to extract domain manually
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^/]+)/);
    return match ? match[1] : url;
  }
}

/**
 * Extracts all organic result URLs from DataForSEO SERP response
 * Returns only URLs (no title/description) for use in page intersection analysis
 */
export function extractUrlsFromSerp(serpData: unknown): string[] {
  const urls: string[] = [];

  try {
    if (!serpData) {
      return urls;
    }
    const serp = asSerpResponse(serpData);

    if (!serp.tasks || !Array.isArray(serp.tasks)) {
      return urls;
    }

    for (const task of serp.tasks) {
      try {
        // Check task status
        if (task.status_code && task.status_code !== 20000) {
          continue;
        }
        
        if (!task.result) {
          continue;
        }
        
        // Handle result as array
        if (Array.isArray(task.result)) {
          for (const resultItem of task.result) {
            try {
              extractUrlsFromResultItem(resultItem, urls);
            } catch (itemError) {
              console.warn('[Link Extractor] Error extracting from result item:', itemError);
              continue;
            }
          }
        } 
        // Handle result as single object
        else if (typeof task.result === 'object') {
          try {
            extractUrlsFromResultItem(task.result, urls);
          } catch (itemError) {
            console.warn('[Link Extractor] Error extracting from result object:', itemError);
            continue;
          }
        }
      } catch (taskError) {
        console.warn('[Link Extractor] Error processing task:', taskError);
        continue;
      }
    }
    
    // Remove duplicates and return
    const uniqueUrls = Array.from(new Set(urls.map(url => {
      try {
        return url.toLowerCase().trim();
      } catch {
        return url;
      }
    })))
      .filter(url => {
        try {
          return url && (url.startsWith('http://') || url.startsWith('https://'));
        } catch {
          return false;
        }
      });
    
    return uniqueUrls;
  } catch (error) {
    console.error('[Link Extractor] Error in extractUrlsFromSerp:', error);
    return [];
  }
}

/**
 * Extract URLs from a single result item
 */
function extractUrlsFromResultItem(resultItem: SerpResultItem, urls: string[]): void {
  // Method 1: Check for items array with organic results
  if (resultItem.items && Array.isArray(resultItem.items)) {
    for (const item of resultItem.items) {
      // Check for organic type
      if (item.type === 'organic' || item.type === 'organic_result') {
        const url = item.url || item.link;
        if (url && typeof url === 'string') {
          urls.push(url.trim());
        }
      }
      
      // Also check for nested organic items
      if (item.items && Array.isArray(item.items)) {
        for (const nestedItem of item.items) {
          if (nestedItem.type === 'organic' || nestedItem.type === 'organic_result') {
            const url = nestedItem.url || nestedItem.link;
            if (url && typeof url === 'string') {
              urls.push(url.trim());
            }
          }
        }
      }
    }
  }
  
  // Method 2: Check for organic array directly in resultItem
  if (resultItem.organic && Array.isArray(resultItem.organic)) {
    for (const organicItem of resultItem.organic) {
      const url = organicItem.url || organicItem.link;
      if (url && typeof url === 'string') {
        urls.push(url.trim());
      }
    }
  }
}


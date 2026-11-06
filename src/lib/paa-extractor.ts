import type { PeopleAlsoAsk } from "./keyword-types";

/**
 * Extracts People Also Ask (PAA) data from DataForSEO SERP response
 * Handles multiple response structures:
 * - people_also_ask type items
 * - ai_overview_reference objects
 * - references arrays
 */
export interface PaaSerpNode {
  type?: string;
  question?: string;
  title?: string;
  text?: string;
  text_pre?: string;
  text_post?: string;
  answer?: string;
  description?: string;
  snippet?: string;
  url?: string;
  link?: string;
  items?: PaaSerpNode[];
  people_also_ask_items?: PaaSerpNode[];
  people_also_ask?: PaaSerpNode[];
  references?: PaaSerpNode[];
  [key: string]: unknown;
}

interface PaaSerpTask {
  status_code?: number;
  status_message?: string;
  result?: PaaSerpNode | PaaSerpNode[];
}

export function extractPeopleAlsoAskFromSerp(serpData: unknown): {
  items: PeopleAlsoAsk[];
  rawResponse: unknown;
  extractionLog: string[];
} {
  const paaItems: PeopleAlsoAsk[] = [];
  const extractionLog: string[] = [];
  const MAX_LOG_ITEMS = 15; // Limit log array to prevent excessive memory usage

  if (!serpData) {
    extractionLog.push('[PAA Extractor] No serpData provided');
    return { items: [], rawResponse: serpData, extractionLog };
  }
  const serp: { tasks?: PaaSerpTask[] } =
    typeof serpData === "object" ? (serpData as { tasks?: PaaSerpTask[] }) : {};

  // Log initial structure
  extractionLog.push(`[PAA Extractor] Starting extraction. Has tasks: ${!!serp.tasks}, tasks is array: ${Array.isArray(serp.tasks)}`);

  if (!serp.tasks || !Array.isArray(serp.tasks)) {
    extractionLog.push('[PAA Extractor] No tasks array found in response');
    return { items: [], rawResponse: serpData, extractionLog };
  }

  for (const task of serp.tasks) {
    // Check task status
    if (task.status_code && task.status_code !== 20000) {
      extractionLog.push(`[PAA Extractor] Task has error status: ${task.status_code} - ${task.status_message}`);
      continue;
    }
    
    if (!task.result) {
      extractionLog.push('[PAA Extractor] Task has no result');
      continue;
    }

    // Handle result as array
    if (Array.isArray(task.result)) {
      extractionLog.push(`[PAA Extractor] Processing ${task.result.length} result items`);
      
      for (const resultItem of task.result) {
        extractFromResultItem(resultItem, paaItems, extractionLog);
      }
    } 
    // Handle result as single object
    else if (typeof task.result === 'object') {
      extractionLog.push('[PAA Extractor] Processing single result object');
      extractFromResultItem(task.result, paaItems, extractionLog);
    }
  }

  // Remove duplicates based on question text
  const uniqueItems = paaItems.filter((item, index, self) => 
    index === self.findIndex(t => t.question.toLowerCase().trim() === item.question.toLowerCase().trim())
  );

  extractionLog.push(`[PAA Extractor] Extracted ${paaItems.length} total items, ${uniqueItems.length} unique after deduplication`);

  // Limit extraction log to prevent excessive memory usage
  const limitedLog = extractionLog.length > MAX_LOG_ITEMS 
    ? [
        ...extractionLog.slice(0, 5), // Keep first 5 entries (initial setup)
        `[PAA Extractor] ... (${extractionLog.length - MAX_LOG_ITEMS} log entries omitted) ...`,
        ...extractionLog.slice(-(MAX_LOG_ITEMS - 6)) // Keep last entries (final results)
      ]
    : extractionLog;

  return {
    items: uniqueItems,
    rawResponse: serpData,
    extractionLog: limitedLog,
  };
}

/**
 * Extract PAA data from a single result item
 * Recursively searches for PAA data in any structure
 */
function extractFromResultItem(
  resultItemInput: unknown,
  paaItems: PeopleAlsoAsk[],
  extractionLog: string[],
  depth: number = 0
): void {
  if (depth > 5) return; // Prevent infinite recursion

  if (!resultItemInput || typeof resultItemInput !== 'object') return;
  const resultItem = resultItemInput as PaaSerpNode;
  
  // Limit logging to prevent excessive array growth
  const MAX_LOG_ITEMS = 15;
  const canLog = () => extractionLog.length < MAX_LOG_ITEMS;

  // Method 1: Check if this item itself is a PAA item
  if (resultItem.type === 'people_also_ask' || resultItem.type === 'people_also_ask_item') {
    // Check if it has nested items
    if (resultItem.items && Array.isArray(resultItem.items)) {
      if (canLog()) extractionLog.push(`[PAA Extractor] Found people_also_ask with nested items array (${resultItem.items.length} items)`);
      for (const paaItem of resultItem.items) {
        const question = paaItem.question || paaItem.title || paaItem.text || paaItem.text_pre || paaItem.text_post;
        if (question) {
          paaItems.push({
            question: String(question).trim(),
            answer: paaItem.answer || paaItem.description || paaItem.snippet || paaItem.text || undefined,
            url: paaItem.url || paaItem.link || undefined,
          });
          if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from people_also_ask.items: "${String(question).substring(0, 50)}..."`);
        }
      }
    }
    
    // Check if it has people_also_ask_items
    if (resultItem.people_also_ask_items && Array.isArray(resultItem.people_also_ask_items)) {
      if (canLog()) extractionLog.push(`[PAA Extractor] Found people_also_ask_items array (${resultItem.people_also_ask_items.length} items)`);
      for (const paaItem of resultItem.people_also_ask_items) {
        const question = paaItem.question || paaItem.title || paaItem.text || paaItem.text_pre || paaItem.text_post;
        if (question) {
          paaItems.push({
            question: String(question).trim(),
            answer: paaItem.answer || paaItem.description || paaItem.snippet || paaItem.text || undefined,
            url: paaItem.url || paaItem.link || undefined,
          });
          if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from people_also_ask_items: "${String(question).substring(0, 50)}..."`);
        }
      }
    }
    
    // Check if question is directly on the item
    const question = resultItem.question || resultItem.title || resultItem.text || resultItem.text_pre || resultItem.text_post;
    if (question) {
      paaItems.push({
        question: String(question).trim(),
        answer: resultItem.answer || resultItem.description || resultItem.snippet || resultItem.text || undefined,
        url: resultItem.url || resultItem.link || undefined,
      });
      if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from people_also_ask item directly: "${String(question).substring(0, 50)}..."`);
    }
  }

  // Method 2: Check for items array and recursively search
  if (resultItem.items && Array.isArray(resultItem.items)) {
    if (canLog()) extractionLog.push(`[PAA Extractor] Found items array with ${resultItem.items.length} items (depth ${depth})`);
    
    for (const item of resultItem.items) {
      // Recursively search each item
      extractFromResultItem(item, paaItems, extractionLog, depth + 1);
      
      // Also check for people_also_ask_items directly
      if (item.people_also_ask_items && Array.isArray(item.people_also_ask_items)) {
        if (canLog()) extractionLog.push(`[PAA Extractor] Found people_also_ask_items in item (${item.people_also_ask_items.length} items)`);
        for (const paaItem of item.people_also_ask_items) {
          const question = paaItem.question || paaItem.title || paaItem.text || paaItem.text_pre || paaItem.text_post;
          if (question) {
            paaItems.push({
              question: String(question).trim(),
              answer: paaItem.answer || paaItem.description || paaItem.snippet || paaItem.text || undefined,
              url: paaItem.url || paaItem.link || undefined,
            });
            if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from item.people_also_ask_items: "${String(question).substring(0, 50)}..."`);
          }
        }
      }
    }
  }

  // Method 3: Check for references array (ai_overview_reference objects)
  if (resultItem.references && Array.isArray(resultItem.references)) {
    if (canLog()) extractionLog.push(`[PAA Extractor] Found references array with ${resultItem.references.length} items`);
    
    for (const ref of resultItem.references) {
      if (ref.type === 'ai_overview_reference' || ref.type === 'people_also_ask') {
        const question = ref.title || ref.text || ref.question || ref.text_pre || ref.text_post;
        if (question) {
          paaItems.push({
            question: String(question).trim(),
            answer: ref.text || ref.snippet || ref.description || ref.answer || undefined,
            url: ref.url || ref.link || undefined,
          });
          if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from reference: "${String(question).substring(0, 50)}..."`);
        }
      }
    }
  }
  
  // Method 4: Check for people_also_ask directly in resultItem
  if (resultItem.people_also_ask && Array.isArray(resultItem.people_also_ask)) {
    if (canLog()) extractionLog.push(`[PAA Extractor] Found people_also_ask array directly in resultItem with ${resultItem.people_also_ask.length} items`);
    
    for (const paaItem of resultItem.people_also_ask) {
      const question = paaItem.question || paaItem.title || paaItem.text || paaItem.text_pre || paaItem.text_post;
      if (question) {
        paaItems.push({
          question: String(question).trim(),
          answer: paaItem.answer || paaItem.description || paaItem.snippet || paaItem.text || undefined,
          url: paaItem.url || paaItem.link || undefined,
        });
        if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from resultItem.people_also_ask: "${String(question).substring(0, 50)}..."`);
      }
    }
  }

  // Method 5: Check for ai_overview_element (might contain references)
  if (resultItem.type === 'ai_overview_element' && resultItem.references && Array.isArray(resultItem.references)) {
    if (canLog()) extractionLog.push(`[PAA Extractor] Found ai_overview_element with references array`);
    
    for (const ref of resultItem.references) {
      if (ref.type === 'ai_overview_reference' || ref.type === 'people_also_ask') {
        const question = ref.title || ref.text || ref.question || ref.text_pre || ref.text_post;
        if (question) {
          paaItems.push({
            question: String(question).trim(),
            answer: ref.text || ref.snippet || ref.description || ref.answer || undefined,
            url: ref.url || ref.link || undefined,
          });
          if (canLog()) extractionLog.push(`[PAA Extractor] Extracted from ai_overview_element.references: "${String(question).substring(0, 50)}..."`);
        }
      }
    }
  }

  // Method 6: Recursively search all object properties for nested structures
  // Skip detailed logging for recursive searches to prevent log explosion
  if (depth < 3) {
    for (const key in resultItem) {
      if (Object.prototype.hasOwnProperty.call(resultItem, key) && typeof resultItem[key] === 'object' && resultItem[key] !== null) {
        if (Array.isArray(resultItem[key])) {
          // If it's an array, check each item
          for (const arrItem of resultItem[key]) {
            if (typeof arrItem === 'object' && arrItem !== null) {
              extractFromResultItem(arrItem, paaItems, extractionLog, depth + 1);
            }
          }
        } else {
          // If it's an object, recursively search it
          extractFromResultItem(resultItem[key], paaItems, extractionLog, depth + 1);
        }
      }
    }
  }
}


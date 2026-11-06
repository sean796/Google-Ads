/**
 * Wikipedia Search Module
 * Handles Wikipedia search and entity extraction
 */

import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_USING_AI_TO_SELECT_BEST_WIKIPEDIA_LIST_P, notifyUsingAiToExtractEntitiesFromWikipe } from "@/lib/notify-messages";
import {
  checkWikipediaPageExists,
  getWikipediaCategoryPages,
  getPagesInCategory,
  extractEntitiesFromWikipediaList,
  searchWikipediaPages,
  fetchWikipediaContent,
} from "@/lib/wikipedia-api";

/**
 * Finds Wikipedia list pages using AI
 */
export async function findWikipediaListPages(
  promptModifier: string,
  primaryCity: string | null,
  openRouterApiKey: string
): Promise<string[]> {
  const modifierLower = promptModifier.toLowerCase();
  const directPageChecks: string[] = [];
  
  // Check for common direct patterns
  if (modifierLower.includes('state capitals') && modifierLower.includes('united states')) {
    directPageChecks.push('List of capitals in the United States');
    directPageChecks.push('List of U.S. state capitals');
    directPageChecks.push('List of state capitals of the United States');
  } else if (modifierLower.includes('state capitals')) {
    directPageChecks.push('List of U.S. state capitals');
    directPageChecks.push('List of capitals in the United States');
  } else if (modifierLower.includes('capitals') && modifierLower.includes('united states')) {
    directPageChecks.push('List of capitals in the United States');
  }
  
  const allCategoryPages: string[] = [];
  
  // Check if these direct pages exist
  for (const pageTitle of directPageChecks) {
    const wikiCheck = await checkWikipediaPageExists(pageTitle);
    if (wikiCheck.exists) {
      allCategoryPages.push(pageTitle);
      console.log(`[Entity Generation] Found direct match: ${pageTitle}`);
    }
  }
  
  // Use AI to find similar Wikipedia list pages
  const findSimilarPagesPrompt = `I need to find Wikipedia list pages similar to this example:
Example: "List of capitals in the United States" (https://en.wikipedia.org/wiki/List_of_capitals_in_the_United_States)

User query: "${promptModifier}"

CRITICAL: The user's query "${promptModifier}" is the PRIMARY instruction. Follow it exactly.
${primaryCity ? `The location "${primaryCity}" is specified in the query - use it.` : 'Extract the location from the query if specified.'}

Your task:
1. Identify what type of list page would contain entities matching "${promptModifier}"
2. Extract the location/scope from "${promptModifier}" (e.g., "United States", "California", etc.)
3. Suggest 5-10 specific Wikipedia list page titles that EXACTLY match "${promptModifier}"
4. ${primaryCity ? `The location is "${primaryCity}" - use it in your suggestions` : 'If no location is specified, suggest general list pages'}
5. Prioritize pages that match the user's query exactly over generic pages

Return ONLY a JSON array of Wikipedia page titles that match "${promptModifier}", like:
${promptModifier.toLowerCase().includes('state capitals') && promptModifier.toLowerCase().includes('united states') ? '["List of capitals in the United States", "List of U.S. state capitals", "List of state capitals of the United States"]' : '["List of [entity type] in [location from query]"]'}

If you cannot find specific pages, suggest search patterns like:
["List of [entity type] in [location]", "List of [entity type] by [category]"]

Return ONLY the JSON array, no explanations.`;

  let similarPagesResponse = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: 'You are a Wikipedia expert. Find similar Wikipedia list pages based on user queries. Return only JSON arrays of page titles.'
      },
      {
        role: 'user',
        content: findSimilarPagesPrompt
      }
    ],
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    onContentChunk: (chunk) => {
      similarPagesResponse += chunk;
    }
  });

  similarPagesResponse = similarPagesResponse.trim();
  similarPagesResponse = similarPagesResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  
  try {
    const suggestedPages = JSON.parse(similarPagesResponse);
    if (Array.isArray(suggestedPages) && suggestedPages.length > 0) {
      console.log(`[Entity Generation] AI suggested ${suggestedPages.length} similar Wikipedia pages:`, suggestedPages);
      
      for (const pageTitle of suggestedPages) {
        if (pageTitle.includes('[') && pageTitle.includes(']')) {
          // It's a pattern, expand it
          const expandedPattern = pageTitle
            .replace(/\[entity type\]/gi, promptModifier.split(' ')[0] || 'entities')
            .replace(/\[location\]/gi, primaryCity || 'United States')
            .replace(/\[category\]/gi, 'state');
          
          const searchResults = await searchWikipediaPages(expandedPattern);
          allCategoryPages.push(...searchResults);
        } else {
          // It's an actual page title, check if it exists and add it
          const wikiCheck = await checkWikipediaPageExists(pageTitle);
          if (wikiCheck.exists) {
            allCategoryPages.push(pageTitle);
          } else {
            const searchResults = await searchWikipediaPages(pageTitle);
            allCategoryPages.push(...searchResults);
          }
        }
      }
    }
  } catch (parseError) {
    console.warn('[Entity Generation] Failed to parse AI suggestions, falling back to search');
  }
  
  // Also do a direct Wikipedia search as fallback
  const searchQuery = promptModifier;
  const searchResults = await searchWikipediaPages(searchQuery);
  allCategoryPages.push(...searchResults);
  console.log(`[Entity Generation] Found ${searchResults.length} pages from direct Wikipedia search: "${searchQuery}"`);
  
  return Array.from(new Set(allCategoryPages));
}

/**
 * Selects the best Wikipedia list page using AI
 */
export async function selectWikipediaPage(
  allCategoryPages: string[],
  promptModifier: string | undefined,
  primaryCity: string | null,
  openRouterApiKey: string
): Promise<string | null> {
  if (allCategoryPages.length === 0) {
    return null;
  }

  const categorySelectionPrompt = `User's explicit request: "${promptModifier || 'neighborhoods'}"

I found these Wikipedia category/list pages:
${allCategoryPages.slice(0, 50).map((p, i) => `${i + 1}. ${p}`).join('\n')}

CRITICAL INSTRUCTIONS:
1. The user's request "${promptModifier}" is the PRIMARY requirement - you MUST prioritize pages that match it
2. ${promptModifier && promptModifier.toLowerCase().includes('state capitals') && promptModifier.toLowerCase().includes('united states') ? 'The user wants "state capitals in the United States" - choose a page like "List of capitals in the United States" or "List of U.S. state capitals"' : `Choose a page that matches "${promptModifier || 'the request'}"`}
3. If you see a page that matches the user's request, choose it even if it's not in the list above (you can suggest it)
4. If no exact match exists in the list, choose the CLOSEST match to "${promptModifier || 'neighborhoods'}"
5. Do NOT choose pages for different locations (e.g., if user wants "United States", don't choose "Alberta" pages)
6. ${primaryCity ? `The location "${primaryCity}" is from the user's query - use it` : 'Extract location from the user query if specified'}

You MUST return a valid page title. Return ONLY the exact Wikipedia page title that matches "${promptModifier || 'neighborhoods'}". Do NOT say "none are suitable" - always pick the best match.`;

  notify.info(NOTIFY_USING_AI_TO_SELECT_BEST_WIKIPEDIA_LIST_P);
  let selectionResponse = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `You are a Wikipedia expert. The user's request "${promptModifier || 'neighborhoods'}" is the PRIMARY instruction. You MUST choose a Wikipedia list page that matches the user's request. If the user says "state capitals in the United States", choose "List of capitals in the United States" or similar. Never choose pages for different locations. Never say "none are suitable" - always pick the best match. Return only the exact page title.`
      },
      {
        role: 'user',
        content: categorySelectionPrompt
      }
    ],
    temperature: 0.3,
    maxTokens: 500,
    topP: 0.9,
    onContentChunk: (chunk) => {
      selectionResponse += chunk;
    }
  });

  selectionResponse = selectionResponse.trim();
  
  const negativePhrases = ['none', 'not suitable', 'no suitable', 'cannot find', 'unable to', 'no pages'];
  const hasNegativePhrase = negativePhrases.some(phrase => 
    selectionResponse.toLowerCase().includes(phrase)
  );
  
  const titleMatch = selectionResponse.match(/"([^"]+)"/) || 
                  selectionResponse.match(/^([^\n]+)/) ||
                  selectionResponse.match(/List of [^\n]+/i);
  
  let selectedPageTitle = '';
  if (titleMatch) {
    selectedPageTitle = titleMatch[1]?.trim() || titleMatch[0]?.trim() || '';
  }
  
  const isValidTitle = selectedPageTitle && 
                      selectedPageTitle.length > 3 &&
                      !hasNegativePhrase &&
                      !negativePhrases.some(phrase => selectedPageTitle.toLowerCase().includes(phrase));
  
  if (!isValidTitle) {
    // Fallback: try to find a valid page from the list
    let matchingPages: string[] = [];
    if (promptModifier) {
      const modifierKeywords = promptModifier.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      matchingPages = allCategoryPages.filter(p => {
        const pLower = p.toLowerCase();
        return modifierKeywords.some(keyword => pLower.includes(keyword)) &&
               p.length > 5 &&
               !p.toLowerCase().includes('category:');
      });
    }
    
    if (matchingPages.length > 0) {
      selectedPageTitle = matchingPages[0];
    } else {
      const listPages = allCategoryPages.filter(p => 
        p.toLowerCase().includes('list') && 
        p.length > 5 &&
        !p.toLowerCase().includes('category:')
      );
      
      if (listPages.length > 0) {
        selectedPageTitle = listPages[0];
      } else if (allCategoryPages.length > 0) {
        selectedPageTitle = allCategoryPages.find(p => !p.toLowerCase().includes('category:')) || allCategoryPages[0];
      }
    }
  }

  if (!selectedPageTitle || selectedPageTitle.length < 3) {
    return null;
  }

  // Verify the page exists
  const pageExistsCheck = await checkWikipediaPageExists(selectedPageTitle);
  if (!pageExistsCheck.exists) {
    const alternatives = allCategoryPages
      .filter(p => p.toLowerCase().includes('list') && !p.toLowerCase().includes('category:'))
      .slice(0, 5);
    
    for (const altPage of alternatives) {
      const altCheck = await checkWikipediaPageExists(altPage);
      if (altCheck.exists) {
        return altPage;
      }
    }
    
    return null;
  }
  
  return selectedPageTitle;
}

/**
 * Extracts entities from a Wikipedia list page
 */
export async function extractEntitiesFromWikipedia(
  selectedPageTitle: string,
  promptModifier: string | undefined,
  existingEntities: string[],
  openRouterApiKey: string
): Promise<string[]> {
  notify.info(notifyUsingAiToExtractEntitiesFromWikipe(selectedPageTitle));
  
  const rawWikipediaEntities = await extractEntitiesFromWikipediaList(selectedPageTitle);
  
  let wikipediaPageContent = '';
  try {
    const contentChunks = await fetchWikipediaContent(selectedPageTitle);
    wikipediaPageContent = contentChunks.map(chunk => chunk.text).join('\n\n').substring(0, 5000);
  } catch (error) {
    console.warn('[Entity Generation] Could not fetch full Wikipedia content, using extracted entities only');
  }

  const entityExtractionPrompt = `I need to extract ALL actual cities/entities from this Wikipedia list page: "${selectedPageTitle}"

**ABSOLUTELY FORBIDDEN - NEVER EXTRACT THESE AS ENTITIES**:
1. **NEVER extract years or dates** - Entities CANNOT be years (e.g., "2024", "2023", "2025") or dates (e.g., "January 2024", "2024-01-01") of ANY kind. If you see a year or date, IGNORE it completely.
2. **NEVER extract personal entities** - Entities CANNOT be personal possessive phrases like "Your Home", "My Home", "The Home", "Your House", "My House", "Your Big Day", "My Big Day", "Your Special Day", "My Event", "Your Business", "My Business", or ANY phrase starting with "Your", "My", or "The" followed by a generic term. These are NOT geographic locations.
3. **NEVER extract numbers-only entities** - Entities CANNOT be just numbers (e.g., "2024", "123", "456"). These are rejected.

${wikipediaPageContent ? `Page content preview:\n${wikipediaPageContent.substring(0, 2000)}...` : ''}

${rawWikipediaEntities.length > 0 ? `\nRaw extracted entities (may include non-entities):\n${rawWikipediaEntities.slice(0, 100).map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

${existingEntities.length > 0 ? `\nExisting entities on the site (avoid exact matches):\n${existingEntities.slice(0, 30).join(', ')}` : ''}

Your task:
1. Extract ALL actual cities, locations, or geographic entities from this Wikipedia list page
   ${promptModifier ? `Note: User query "${promptModifier}" mentions "${selectedPageTitle}" - extract ALL entities from this list page. We will validate criteria later using individual Wikipedia pages.` : 'Extract any geographic entities (cities, towns, neighborhoods, districts, etc.)'}
2. Filter out non-entities (table headers, metadata, "See also" links, etc.)
3. ${existingEntities.length > 0 ? `Exclude entities that exactly match existing ones (case-insensitive comparison)` : 'Include all valid entities'}
4. Return clean entity names (remove extra formatting, parentheses with notes, etc.)
5. DO NOT filter by criteria like "high income", "south", etc. - extract ALL entities. Criteria validation will happen later.
6. **CRITICAL**: Before including any entity, verify it is NOT a year, date, or personal entity. If it is, EXCLUDE it.

Return ONLY a JSON array of entity names. NO explanations, NO other text.
Example: ["Sacramento", "Los Angeles", "San Francisco", "San Diego", "Oakland"]`;

  let extractionResponse = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: 'You are a Wikipedia expert. Extract actual cities, locations, or geographic entities from Wikipedia list pages. Return only JSON arrays of entity names.'
      },
      {
        role: 'user',
        content: entityExtractionPrompt
      }
    ],
    temperature: 0.4,
    maxTokens: 4000,
    topP: 0.9,
    onContentChunk: (chunk) => {
      extractionResponse += chunk;
    }
  });

  extractionResponse = extractionResponse.trim();
  extractionResponse = extractionResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  
  let validatedEntities: string[] = [];
  try {
    validatedEntities = JSON.parse(extractionResponse);
  } catch (parseError) {
    const jsonMatch = extractionResponse.match(/\[.*\]/s);
    if (jsonMatch) {
      validatedEntities = JSON.parse(jsonMatch[0]);
    } else {
      console.warn('[Entity Generation] Failed to parse AI extraction response, using raw entities');
      validatedEntities = rawWikipediaEntities;
    }
  }
  
  if (!Array.isArray(validatedEntities)) {
    console.warn('[Entity Generation] AI extraction response is not an array, using raw entities');
    validatedEntities = rawWikipediaEntities;
  }

  if (validatedEntities.length === 0 && rawWikipediaEntities.length > 0) {
    console.warn('[Entity Generation] AI extraction returned no entities, using raw entities');
    validatedEntities = rawWikipediaEntities.slice(0, 100);
  }

  // CRITICAL: Post-process validation - filter out dates, personal entities, and numbers-only entities
  const { isValidEntity } = await import('@/components/integrations/entity-generation/validation/entityValidator');
  const filteredEntities = validatedEntities
    .filter((e: string) => e && typeof e === 'string' && e.trim().length > 2)
    .filter((e: string) => {
      const isValid = isValidEntity(e.trim());
      if (!isValid) {
        console.log(`[Entity Generation] Filtered out invalid entity from Wikipedia: "${e}"`);
      }
      return isValid;
    });

  console.log(`[Entity Generation] Filtered Wikipedia entities: ${filteredEntities.length} valid (from ${validatedEntities.length} total)`);
  return filteredEntities;
}

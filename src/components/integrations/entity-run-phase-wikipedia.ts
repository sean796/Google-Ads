
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_SELECT_A_WIKIPEDIA_LIST_PAGE_P, NOTIFY_GETTING_PAGES_FROM_WIKIPEDIA_CATEGORIES, NOTIFY_USING_AI_TO_SELECT_BEST_WIKIPEDIA_LIST_P, notifyFindingWikipediaCategoryPagesForXP, notifyNoWikipediaPagesFoundForXTryAddin, notifyUsingAiToExtractEntitiesFromWikipe, notifyUsingAiToFindSimilarWikipediaList, notifyWikipediaPageXNotFoundPleaseTryA } from "@/lib/notify-messages";
import { streamChatCompletion } from "@/lib/api";
import { checkWikipediaPageExists, getWikipediaCategoryPages, getPagesInCategory, extractEntitiesFromWikipediaList, searchWikipediaPages, fetchWikipediaContent } from "@/lib/wikipedia-api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { logger } from "@/lib/logger";

export async function runEntityPhaseWikipedia(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// Wikipedia fallback path - only runs if we DON'T have Google entities
if (c.promptModifier && c.promptModifier.trim()) {
  notify.info(notifyUsingAiToFindSimilarWikipediaList(c.promptModifier));
  
  // First, check for common direct patterns that match the modifier
  const modifierLower = c.promptModifier.toLowerCase();
  const directPageChecks: string[] = [];
  
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
  
  // Check if these direct pages exist
  for (const pageTitle of directPageChecks) {
    const wikiCheck = await checkWikipediaPageExists(pageTitle);
    if (wikiCheck.exists) {
      c.allCategoryPages.push(pageTitle);
    }
  }
  
  // Use AI to find similar Wikipedia list pages based on the modifier
  const findSimilarPagesPrompt = `I need to find Wikipedia list pages similar to this example:
Example: "List of capitals in the United States" (https://en.wikipedia.org/wiki/List_of_capitals_in_the_United_States)

User query: "${c.promptModifier}"

CRITICAL: The user's query "${c.promptModifier}" is the PRIMARY instruction. Follow it exactly.
${c.primaryCity ? `The location "${c.primaryCity}" is specified in the query - use it.` : 'Extract the location from the query if specified.'}

Your task:
1. Identify what type of list page would contain entities matching "${c.promptModifier}"
2. Extract the location/scope from "${c.promptModifier}" (e.g., "United States", "California", etc.)
3. Suggest 5-10 specific Wikipedia list page titles that EXACTLY match "${c.promptModifier}"
4. ${c.primaryCity ? `The location is "${c.primaryCity}" - use it in your suggestions` : 'If no location is specified, suggest general list pages'}
5. Prioritize pages that match the user's query exactly over generic pages

Return ONLY a JSON array of Wikipedia page titles that match "${c.promptModifier}", like:
${c.promptModifier.toLowerCase().includes('state capitals') && c.promptModifier.toLowerCase().includes('united states') ? '["List of capitals in the United States", "List of U.S. state capitals", "List of state capitals of the United States"]' : '["List of [entity type] in [location from query]"]'}

If you cannot find specific pages, suggest search patterns like:
["List of [entity type] in [location]", "List of [entity type] by [category]"]

Return ONLY the JSON array, no explanations.`;

  let similarPagesResponse = '';
  await streamChatCompletion({
    apiKey: c.openRouterApiKey,
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
      
      // Search for these specific pages
      for (const pageTitle of suggestedPages) {
        // Check if it's a pattern or actual page title
        if (pageTitle.includes('[') && pageTitle.includes(']')) {
          // It's a pattern, expand it
          const expandedPattern = pageTitle
            .replace(/\[entity type\]/gi, c.promptModifier.split(' ')[0] || 'entities')
            .replace(/\[location\]/gi, c.primaryCity || 'United States')
            .replace(/\[category\]/gi, 'state');
          
          const searchResults = await searchWikipediaPages(expandedPattern);
          c.allCategoryPages.push(...searchResults);
        } else {
          // It's an actual page title, check if it exists and add it
          const wikiCheck = await checkWikipediaPageExists(pageTitle);
          if (wikiCheck.exists) {
            c.allCategoryPages.push(pageTitle);
          } else {
            // Try searching for it
            const searchResults = await searchWikipediaPages(pageTitle);
            c.allCategoryPages.push(...searchResults);
          }
        }
      }
    }
  } catch (parseError) {
    logger.warn('[Entity Generation] Failed to parse AI suggestions, falling back to search');
  }
  
  // Also do a direct Wikipedia search as fallback - use the modifier directly
  const searchQuery = c.promptModifier; // Use modifier directly, don't append city
  const searchResults = await searchWikipediaPages(searchQuery);
  c.allCategoryPages.push(...searchResults);
}

// Step 1b: Find Wikipedia category pages (only if no modifier or modifier doesn't specify location)
// If modifier specifies a location, skip category search to avoid conflicting results
if (!c.modifierLocation) {
  notify.info(notifyFindingWikipediaCategoryPagesForXP(c.primaryCity, c.promptModifier || undefined));
  c.categoryPages = await getWikipediaCategoryPages(c.primaryCity, c.promptModifier);
} else {
  /* modifier location set, category search skipped */
}

// Fallback to Wikipedia category/list page approach
if (c.categoryPages.length === 0 && c.allCategoryPages.length === 0 && !c.promptModifier) {
  notify.error(notifyNoWikipediaPagesFoundForXTryAddin(c.primaryCity));
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}


// Step 2: Get pages in each category
if (c.categoryPages.length > 0) {
  notify.info(NOTIFY_GETTING_PAGES_FROM_WIKIPEDIA_CATEGORIES);
  for (const category of c.categoryPages) {
    const pages = await getPagesInCategory(category);
    c.allCategoryPages.push(...pages);
  }
}

// Remove duplicates
c.allCategoryPages = Array.from(new Set(c.allCategoryPages));


// Step 3: Use AI to choose which category/list page to use
const urlsList = c.parseResult.urls.slice(0, 20).join('\n');

const categorySelectionPrompt = `User's explicit request: "${c.promptModifier || 'neighborhoods'}"

I found these Wikipedia category/list pages:
${c.allCategoryPages.slice(0, 50).map((p, i) => `${i + 1}. ${p}`).join('\n')}

CRITICAL INSTRUCTIONS:
1. The user's request "${c.promptModifier}" is the PRIMARY requirement - you MUST prioritize pages that match it
2. ${c.promptModifier && c.promptModifier.toLowerCase().includes('state capitals') && c.promptModifier.toLowerCase().includes('united states') ? 'The user wants "state capitals in the United States" - choose a page like "List of capitals in the United States" or "List of U.S. state capitals"' : `Choose a page that matches "${c.promptModifier || 'the request'}"`}
3. If you see a page that matches the user's request, choose it even if it's not in the list above (you can suggest it)
4. If no exact match exists in the list, choose the CLOSEST match to "${c.promptModifier || 'neighborhoods'}"
5. Do NOT choose pages for different locations (e.g., if user wants "United States", don't choose "Alberta" pages)
6. ${c.primaryCity ? `The location "${c.primaryCity}" is from the user's query - use it` : 'Extract location from the user query if specified'}

You MUST return a valid page title. Return ONLY the exact Wikipedia page title that matches "${c.promptModifier || 'neighborhoods'}". Do NOT say "none are suitable" - always pick the best match.`;

notify.info(NOTIFY_USING_AI_TO_SELECT_BEST_WIKIPEDIA_LIST_P);
let selectionResponse = '';
await streamChatCompletion({
  apiKey: c.openRouterApiKey,
  model: getResearchModel(),
  messages: [
    {
      role: 'system',
      content: `You are a Wikipedia expert. The user's request "${c.promptModifier || 'neighborhoods'}" is the PRIMARY instruction. You MUST choose a Wikipedia list page that matches the user's request. If the user says "state capitals in the United States", choose "List of capitals in the United States" or similar. Never choose pages for different locations. Never say "none are suitable" - always pick the best match. Return only the exact page title.`
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

// Check if AI said "none are suitable" or similar
const negativePhrases = ['none', 'not suitable', 'no suitable', 'cannot find', 'unable to', 'no pages'];
const hasNegativePhrase = negativePhrases.some(phrase => 
  selectionResponse.toLowerCase().includes(phrase)
);

// Try to extract the page title
const titleMatch = selectionResponse.match(/"([^"]+)"/) || 
                selectionResponse.match(/^([^\n]+)/) ||
                selectionResponse.match(/List of [^\n]+/i);

if (titleMatch) {
  c.selectedPageTitle = titleMatch[1]?.trim() || titleMatch[0]?.trim() || '';
}

// Validate the selected page title
const isValidTitle = c.selectedPageTitle && 
                    c.selectedPageTitle.length > 3 &&
                    !hasNegativePhrase &&
                    !negativePhrases.some(phrase => c.selectedPageTitle.toLowerCase().includes(phrase));

if (!isValidTitle) {
  // Fallback: try to find a valid page from the list that matches the modifier
  logger.warn('[Entity Generation] AI returned invalid page title, using fallback');
  
  // First, try to find pages that match the modifier keywords
  let matchingPages: string[] = [];
  if (c.promptModifier) {
    const modifierKeywords = c.promptModifier.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    matchingPages = c.allCategoryPages.filter(p => {
      const pLower = p.toLowerCase();
      return modifierKeywords.some(keyword => pLower.includes(keyword)) &&
             p.length > 5 &&
             !p.toLowerCase().includes('category:');
    });
  }
  
  if (matchingPages.length > 0) {
    c.selectedPageTitle = matchingPages[0];
  } else {
    // Try to find pages with "List of" in the title
    const listPages = c.allCategoryPages.filter(p => 
      p.toLowerCase().includes('list') && 
      p.length > 5 &&
      !p.toLowerCase().includes('category:')
    );
    
    if (listPages.length > 0) {
      c.selectedPageTitle = listPages[0];
    } else if (c.allCategoryPages.length > 0) {
      // Use any available page
      c.selectedPageTitle = c.allCategoryPages.find(p => !p.toLowerCase().includes('category:')) || c.allCategoryPages[0];
    }
  }
}

if (!c.selectedPageTitle || c.selectedPageTitle.length < 3) {
  notify.error(NOTIFY_COULD_NOT_SELECT_A_WIKIPEDIA_LIST_PAGE_P);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

// Verify the page exists before proceeding
const pageExistsCheck = await checkWikipediaPageExists(c.selectedPageTitle);
if (!pageExistsCheck.exists) {
  logger.warn(`[Entity Generation] Selected page doesn't exist, trying alternatives...`);
  
  // Try alternative pages
  const alternatives = c.allCategoryPages
    .filter(p => p.toLowerCase().includes('list') && !p.toLowerCase().includes('category:'))
    .slice(0, 5);
  
  for (const altPage of alternatives) {
    const altCheck = await checkWikipediaPageExists(altPage);
    if (altCheck.exists) {
      c.selectedPageTitle = altPage;
      break;
    }
  }
  
  // Final check
  const finalCheck = await checkWikipediaPageExists(c.selectedPageTitle);
  if (!finalCheck.exists) {
    notify.error(notifyWikipediaPageXNotFoundPleaseTryA(c.selectedPageTitle));
    s.setIsGeneratingEntities(prev => {
      const updated = { ...prev };
      delete updated[c.generatingKey];
      return updated;
    });
    return false;
  }
}

// Step 4: Extract entities from the selected Wikipedia list page using AI
notify.info(notifyUsingAiToExtractEntitiesFromWikipe(c.selectedPageTitle));

// First, get the raw Wikipedia content to help AI extract entities
const rawWikipediaEntities = await extractEntitiesFromWikipediaList(c.selectedPageTitle);

// Also fetch the page content for AI analysis
let wikipediaPageContent = '';
try {
  const contentChunks = await fetchWikipediaContent(c.selectedPageTitle);
  wikipediaPageContent = contentChunks.map(chunk => chunk.text).join('\n\n').substring(0, 5000); // Limit to first 5000 chars
} catch (error) {
  logger.warn('[Entity Generation] Could not fetch full Wikipedia content, using extracted entities only');
}

// Use AI to extract ALL actual cities/entities from the Wikipedia list page
// DO NOT filter by criteria here - we'll validate criteria later using individual Wikipedia pages
const entityExtractionPrompt = `I need to extract ALL actual cities/entities from this Wikipedia list page: "${c.selectedPageTitle}"

${wikipediaPageContent ? `Page content preview:\n${wikipediaPageContent.substring(0, 2000)}...` : ''}

${rawWikipediaEntities.length > 0 ? `\nRaw extracted entities (may include non-entities):\n${rawWikipediaEntities.slice(0, 100).map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

${c.existingEntities.length > 0 ? `\nExisting entities on the c.site (avoid exact matches):\n${c.existingEntities.slice(0, 30).join(', ')}` : ''}

Your task:
1. Extract ALL actual cities, locations, or entities from this Wikipedia list page
${c.promptModifier ? `Note: User query "${c.promptModifier}" mentions "${c.selectedPageTitle}" - extract ALL entities from this list page. We will validate criteria later using individual Wikipedia pages.` : 'Extract any geographic entities (cities, towns, neighborhoods, districts, etc.)'}
2. Filter out non-entities (table headers, metadata, "See also" links, etc.)
3. ${c.existingEntities.length > 0 ? `Exclude entities that exactly match existing ones (case-insensitive comparison)` : 'Include all valid entities'}
4. Return clean entity names (remove extra formatting, parentheses with notes, etc.)
5. DO NOT filter by criteria like "high income", "south", etc. - extract ALL entities. Criteria validation will happen later.

Return ONLY a JSON array of entity names. NO explanations, NO other text.
Example: ["Sacramento", "Los Angeles", "San Francisco", "San Diego", "Oakland"]`;

let extractionResponse = '';
await streamChatCompletion({
  apiKey: c.openRouterApiKey,
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

try {
  c.validatedEntities = JSON.parse(extractionResponse);
} catch (parseError) {
  const jsonMatch = extractionResponse.match(/\[.*\]/s);
  if (jsonMatch) {
    c.validatedEntities = JSON.parse(jsonMatch[0]);
  } else {
    logger.warn('[Entity Generation] Failed to parse AI extraction response, using raw entities');
    c.validatedEntities = rawWikipediaEntities;
  }
}

if (!Array.isArray(c.validatedEntities)) {
  logger.warn('[Entity Generation] AI extraction response is not an array, using raw entities');
  c.validatedEntities = rawWikipediaEntities;
}

// If no entities found, try raw extraction as fallback
if (c.validatedEntities.length === 0 && rawWikipediaEntities.length > 0) {
  logger.warn('[Entity Generation] AI extraction returned no entities, using raw entities');
  c.validatedEntities = rawWikipediaEntities.slice(0, 100); // Limit raw entities
}

if (c.validatedEntities.length === 0) {
  // Try to get more information about why
  let errorMessage = `No entities found in Wikipedia page: "${c.selectedPageTitle}"`;
  
  if (rawWikipediaEntities.length === 0) {
    errorMessage += '\n\nThe page may not contain extractable list data. Try:';
    errorMessage += '\n- A different prompt modifier';
    errorMessage += '\n- A more specific query (e.g., "cities in California" instead of "cities in states")';
    errorMessage += '\n- Checking if the Wikipedia page actually contains a list';
  } else {
    errorMessage += `\n\nFound ${rawWikipediaEntities.length} raw entities but AI validation filtered them all out.`;
    errorMessage += '\nTry a different prompt modifier or check the page content.';
  }
  
  notifyHeaderError("Entity generation failed", errorMessage);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

  return true;
}

import { resolveMcpApiBase } from "@/lib/mcp-tools";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_DATAFORSEO_SEARCH_FAILED_FALLING_BACK_TO, notifySearchingGoogleForX, notifyUsingDataforseoToSearchGoogleForEn } from "@/lib/notify-messages";
import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { logger } from "@/lib/logger";

export async function runEntityPhaseGoogle(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// Step 1a: If prompt modifier exists, use DataForSEO to search Google for entities
// This is more accurate than Wikipedia category pages for specific criteria
c.entitiesFromGoogle = [];
c.researchQuestion = ''; // Declare in outer scope for use in retry logic
c.mcpApiBase = resolveMcpApiBase();
// searchLocation will be set after location extraction

if (c.promptModifier && c.promptModifier.trim()) {
  notify.info(notifyUsingDataforseoToSearchGoogleForEn(c.promptModifier));
  
  try {
    // First, generate a research-style question using AI, considering existing entities from sitemap
    // CRITICAL: c.primaryCity has been set from the modifier location extraction above, so it should be the correct location
    const researchQuestionPrompt = `Generate a Google search question to find entities matching: "${c.promptModifier}"

CRITICAL: The user's modifier "${c.promptModifier}" specifies the location: "${c.primaryCity}"
- You MUST use "${c.primaryCity}" in the search question
- DO NOT use any other location
- The modifier "${c.promptModifier}" is the source of truth - use it exactly

Existing entities already on the site (DO NOT suggest these):
${c.existingEntities.slice(0, 50).join(', ')}

Your task:
1. Create a natural Google search question that would return a list of entities matching "${c.promptModifier}"
2. The location MUST be "${c.primaryCity}" (extracted from the modifier)
3. Format it as a question people would actually search on Google
4. Make sure the question would return actual entity names (${c.promptModifier.toLowerCase().includes('street') ? 'street names' : c.promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhood names' : 'entity names'}) not just general information
5. Include "${c.primaryCity}" in the question to ensure results are location-specific

Return ONLY the search question, nothing else. Make it natural and searchable.
${c.promptModifier.toLowerCase().includes('street') && c.primaryCity ? `Example for "streets in ${c.primaryCity}": "list of streets in ${c.primaryCity}" or "streets in ${c.primaryCity}"` : c.promptModifier.toLowerCase().includes('neighborhood') && c.primaryCity ? `Example for "neighborhoods in ${c.primaryCity}": "list of neighborhoods in ${c.primaryCity}"` : `Example: "list of ${c.promptModifier} in ${c.primaryCity}"`}`;

    let researchQuestionResponse = '';
    await streamChatCompletion({
      apiKey: c.openRouterApiKey,
      model: getResearchModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a search query expert. Generate natural Google search questions that return lists of entities. Return only the search question.'
        },
        {
          role: 'user',
          content: researchQuestionPrompt
        }
      ],
      temperature: 0.5,
      maxTokens: 200,
      topP: 0.9,
      onContentChunk: (chunk) => {
        researchQuestionResponse += chunk;
      }
    });

    c.researchQuestion = researchQuestionResponse.trim().replace(/^["']|["']$/g, '').trim();

    if (c.researchQuestion && c.researchQuestion.length > 10) {
      // Use DataForSEO to search Google with this question
      // Use the location from modifier (c.primaryCity has been updated above if modifier specified location)
      const searchLocationForQuery = c.primaryCity || "United States";
      
      notify.info(notifySearchingGoogleForX(c.researchQuestion));
      
      const serpResponse = await fetch(`${c.mcpApiBase}/DataForSEO_serp_organic_live_advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: c.researchQuestion,
          location_name: searchLocationForQuery, // Use the location from modifier (e.g., "Wisconsin" for "streets in wisconsin")
          language_code: "en",
          depth: 20, // Get more results
          people_also_ask_click_depth: 4, // Get maximum PAA questions (4 clicks deep)
        }),
      });

      if (serpResponse.ok) {
        const serpData = await serpResponse.json();

        // Extract organic results from SERP
        const organicResults: Array<{ title: string; description?: string; url?: string }> = [];
        
        if (serpData.tasks && serpData.tasks[0] && serpData.tasks[0].result) {
          const result = serpData.tasks[0].result;
          const items = Array.isArray(result) ? result : (result.items || [result]);
          
          for (const item of items) {
            if (item.type === 'organic' || !item.type) {
              organicResults.push({
                title: item.title || '',
                description: item.description || item.snippet || '',
                url: item.url || item.link || ''
              });
            }
            
            // Also check items array if present
            if (item.items && Array.isArray(item.items)) {
              for (const subItem of item.items) {
                if (subItem.type === 'organic' || !subItem.type) {
                  organicResults.push({
                    title: subItem.title || '',
                    description: subItem.description || subItem.snippet || '',
                    url: subItem.url || subItem.link || ''
                  });
                }
              }
            }
          }
        }


        if (organicResults.length > 0) {
          // Use AI to extract entities from SERP results
          const serpContent = organicResults.slice(0, 30).map((r, i) => 
            `${i + 1}. Title: ${r.title}\n   Description: ${r.description || 'N/A'}\n   URL: ${r.url || 'N/A'}`
          ).join('\n\n');

          const entityExtractionPrompt = `Extract entity names from these Google search results for: "${c.promptModifier}"

**ABSOLUTELY FORBIDDEN - NEVER EXTRACT THESE AS ENTITIES**:
1. **NEVER extract years or dates** - Entities CANNOT be years (e.g., "2024", "2023", "2025") or dates (e.g., "January 2024", "2024-01-01") of ANY kind. If you see a year or date, IGNORE it completely.
2. **NEVER extract personal entities** - Entities CANNOT be personal possessive phrases like "Your Home", "My Home", "The Home", "Your House", "My House", "Your Big Day", "My Big Day", "Your Special Day", "My Event", "Your Business", "My Business", or ANY phrase starting with "Your", "My", or "The" followed by a generic term. These are NOT geographic locations.
3. **NEVER extract numbers-only entities** - Entities CANNOT be just numbers (e.g., "2024", "123", "456"). These are rejected.

CRITICAL LOCATION REQUIREMENT: The user requested "${c.promptModifier}" which specifies location: "${searchLocationForQuery}"
- ONLY extract entities that are IN or FROM "${searchLocationForQuery}" 
- DO NOT extract entities from other cities/locations/states
- Example: If searching for "streets in Wisconsin", ONLY extract Wisconsin streets, NOT from other states
- Example: If searching for "streets in Calgary", ONLY extract Calgary streets, NOT Edmonton, Toronto, or any other city
- If search results mention entities from other locations, IGNORE them completely

Entity type requested: ${c.promptModifier.toLowerCase().includes('street') ? 'streets' : c.promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhoods' : 'locations/entities'}

Search Results:
${serpContent}

Existing entities already on the site (DO NOT extract these):
${c.existingEntities.slice(0, 30).join(', ')}

Your task:
1. Extract ONLY geographic location entities from "${searchLocationForQuery}" (e.g., ${c.promptModifier.toLowerCase().includes('street') ? `${searchLocationForQuery} street names` : c.promptModifier.toLowerCase().includes('neighborhood') ? `${searchLocationForQuery} neighborhoods` : `${searchLocationForQuery} entities`})
2. Focus on entities that match "${c.promptModifier}" and are located in "${searchLocationForQuery}"
3. Exclude entities that exactly match existing ones (case-insensitive)
4. Extract clean entity names (remove extra formatting, "street", "avenue", "neighborhood of", "area of", location names, etc.)
5. Return only entity names from "${searchLocationForQuery}", not descriptions or URLs
6. **CRITICAL**: Before including any entity, verify it is NOT a year, date, or personal entity. If it is, EXCLUDE it.

Return ONLY a JSON array of entity names from "${searchLocationForQuery}". NO explanations, NO other text.
Example for "streets in Wisconsin": ["State Street", "Milwaukee Street", "Main Street"]
Example for "streets in Calgary": ["17th Avenue SW", "Stephen Avenue", "Kensington Road"]
Example for "neighborhoods in Calgary": ["Beltline", "Kensington", "Inglewood"]`;

          let entityExtractionResponse = '';
          await streamChatCompletion({
            apiKey: c.openRouterApiKey,
            model: getResearchModel(),
            messages: [
              {
                role: 'system',
                content: 'You are an entity extraction expert. Extract entity names from search results. Return only JSON arrays.'
              },
              {
                role: 'user',
                content: entityExtractionPrompt
              }
            ],
            temperature: 0.3,
            maxTokens: 2000,
            topP: 0.9,
            onContentChunk: (chunk) => {
              entityExtractionResponse += chunk;
            }
          });

          entityExtractionResponse = entityExtractionResponse.trim();
          entityExtractionResponse = entityExtractionResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
          
          try {
            const extracted = JSON.parse(entityExtractionResponse);
            if (Array.isArray(extracted) && extracted.length > 0) {
              // Import validation function
              const { isValidEntity } = await import('@/components/integrations/entity-generation/validation/entityValidator');
              
              // Filter entities: must be valid strings AND pass entity validation
              c.entitiesFromGoogle = extracted
                .filter((e: string) => e && typeof e === 'string' && e.trim().length > 2)
                .filter((e: string) => {
                  const isValid = isValidEntity(e.trim());
                  return isValid;
                });
              
            }
          } catch (parseError) {
            logger.warn('[Entity Generation] Failed to parse entity extraction response:', parseError);
            // Try to extract JSON array from response
            const jsonMatch = entityExtractionResponse.match(/\[.*\]/s);
            if (jsonMatch) {
              try {
                c.entitiesFromGoogle = JSON.parse(jsonMatch[0]);
              } catch (e) {
                logger.warn('[Entity Generation] Could not parse extracted JSON');
              }
            }
          }
        }
      } else {
        logger.warn('[Entity Generation] SERP request failed:', await serpResponse.text());
      }
    }
  } catch (error) {
    logger.warn('[Entity Generation] Error using DataForSEO search:', error);
    notify.error(NOTIFY_DATAFORSEO_SEARCH_FAILED_FALLING_BACK_TO);
  }
}
  return true;
}

import type { EntityWithCriteria } from "@/components/integrations/entity-run-ctx";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS, NOTIFY_SEARCHING_FOR_MORE_ENTITIES_WITH_ALTERNA, notifyAllEntitiesWereFilteredOutXConflic, notifyAllXValidatedEntitiesWereFilteredO, notifyValidatingEntitiesWithWikipediaPromp, notifyValidatingXAgainstCriteria } from "@/lib/notify-messages";
import { streamChatCompletion } from "@/lib/api";
import { getScheduledPosts } from "@/lib/wordpress-api";
import { checkConflicts } from "@/components/integrations/entity-generation/filtering/conflictChecker";
import { checkWikipediaPageExists } from "@/lib/wikipedia-api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { logger } from "@/lib/logger";

export async function runEntityPhaseValidate(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// Step 5.5: Check for conflicts with scheduled posts
let scheduledPostTitles: string[] = [];
try {
  notify.info(NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS);
  const scheduledResult = await getScheduledPosts(
    c.site.siteUrl,
    c.site.username,
    c.site.appPassword,
    undefined,
    undefined,
    true // Get all scheduled posts
  );
  if (scheduledResult.posts && scheduledResult.posts.length > 0) {
    scheduledPostTitles = scheduledResult.posts.map(post => post.title?.toLowerCase() || '');
  }
} catch (error) {
  logger.warn('[Entity Generation] Could not fetch scheduled posts for conflict checking:', error);
}

// Step 6: Filter out conflicts with existing entities (sitemap + Origin ACF); uses prefix/substring match so e.g. "Garden City" excludes "Garden City, Winnipeg"
const conflictResult = checkConflicts(c.validatedEntities, c.existingEntities, scheduledPostTitles);
const nonConflictingEntities = conflictResult.nonConflictingEntities;
const conflictWithExistingCount = conflictResult.conflictStats.conflictWithExistingCount;
const conflictWithPostsCount = conflictResult.conflictStats.conflictWithPostsCount;


// Step 6.5: Validate entities are NOT in sitemap (filter out existing ones)
let sitemapFilteredCount = 0;
const entitiesNotInSitemap = nonConflictingEntities.filter(entity => {
  const notInSitemap = v.validateEntityNotInSitemap(entity, c.parseResult.urls);
  if (!notInSitemap) {
    sitemapFilteredCount++;
  }
  return notInSitemap;
});


if (entitiesNotInSitemap.length === 0) {
  notify.error(notifyAllEntitiesWereFilteredOutXConflic(conflictWithExistingCount, conflictWithPostsCount, sitemapFilteredCount));
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

// Step 7: Select entities for Wikipedia validation
// We need to select more entities than needed because:
// 1. Some may not have Wikipedia pages
// 2. Some may not match criteria after Wikipedia validation
let selectedEntities = entitiesNotInSitemap;

// Select 2-3x the requested count to account for filtering
const selectionMultiplier = c.promptModifier ? 3 : 2; // More entities needed if we're filtering by criteria
if (entitiesNotInSitemap.length > c.count * selectionMultiplier) {
  // Randomly shuffle and select
  const shuffled = [...entitiesNotInSitemap].sort(() => Math.random() - 0.5);
  selectedEntities = shuffled.slice(0, c.count * selectionMultiplier);
} else {
  // Use all available entities
  selectedEntities = entitiesNotInSitemap;
}

// Format entities (add city if needed)
const filteredWikipediaEntities = selectedEntities
  .map(entity => {
    // Format: add city if not present and c.primaryCity exists
    if (c.primaryCity && !entity.toLowerCase().includes(c.primaryCity.toLowerCase())) {
      return `${entity} ${c.primaryCity}`;
    }
    return entity;
  });

if (filteredWikipediaEntities.length === 0) {
  notify.error(notifyAllXValidatedEntitiesWereFilteredO(c.validatedEntities.length, conflictWithExistingCount, conflictWithPostsCount));
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

// Step 7.5: Validate entities have Wikipedia pages and validate by criteria
// Keep retrying until we have enough matching entities
c.entitiesWithWikipedia = [];
c.storageKey = `${c.site.id}-${c.entitySitemapUrl}`;
c.processedEntityNames = new Set<string>(); // Track processed entities to avoid duplicates
c.candidatePool = [...entitiesNotInSitemap]; // Pool of candidates to validate
let currentBatch = filteredWikipediaEntities;
const maxRetries = 10; // Maximum number of retry batches
c.retryCount = 0;

// Store general criteria info
if (c.promptModifier) {
  s.setGeneralCriteriaInfo(prev => ({
    ...prev,
    [c.storageKey]: c.promptModifier
  }));
}

// Retry loop: keep validating until we have enough matching entities
while (c.entitiesWithWikipedia.length < c.count && c.retryCount < maxRetries) {
  const batchStartCount = c.entitiesWithWikipedia.length;
  notify.info(
    notifyValidatingEntitiesWithWikipediaPromp(
      c.entitiesWithWikipedia.length,
      c.count,
      c.promptModifier || undefined
    )
  );
  
  // Process current batch
  for (const entity of currentBatch) {
    if (c.entitiesWithWikipedia.length >= c.count) break;
    
    const entityKey = entity.toLowerCase().trim();
    if (c.processedEntityNames.has(entityKey)) {
      continue; // Skip already processed entities
    }
    c.processedEntityNames.add(entityKey);
    
    // CRITICAL: Validate entity before processing (reject "Your Home" type entities, allow "hunter douglas")
    if (!v.isValidEntity(entity)) {
      continue; // Skip invalid entities
    }
    
    try {
      let validatedEntity: string = entity;
      let wikiCheck = await checkWikipediaPageExists(entity);
      
      if (!wikiCheck.exists || !wikiCheck.url) {
        // Try without city
        if (c.primaryCity) {
          const withoutCity = entity.replace(new RegExp(`\\s+${c.primaryCity}$`, 'i'), '').trim();
          if (withoutCity && withoutCity !== entity) {
            wikiCheck = await checkWikipediaPageExists(withoutCity);
            if (wikiCheck.exists && wikiCheck.url) {
              validatedEntity = withoutCity;
            }
          }
        }
      }
      
      if (wikiCheck.exists && wikiCheck.url) {
        let criteriaData: EntityWithCriteria['criteriaData'] | undefined;
        
        // If modifier has criteria, validate entity by criteria using AI + Wikipedia data
        if (c.promptModifier && c.promptModifier.trim()) {
          try {
            notify.info(notifyValidatingXAgainstCriteria(validatedEntity));
            const validationResult = await v.validateEntityByCriteria(
              validatedEntity,
              c.promptModifier,
              c.openRouterApiKey
            );
            
            criteriaData = {
              matches: validationResult.matches,
              confidence: validationResult.confidence,
              extractedData: validationResult.extractedData || {},
              rankingValue: validationResult.rankingValue
            };
            
            // Store criteria info (store even rejected ones for UI display purposes, but don't include them)
            s.setCriteriaInfo(prev => ({
              ...prev,
              [c.storageKey]: {
                ...(prev[c.storageKey] || {}),
                [validatedEntity]: criteriaData
              }
            }));
            
            // CRITICAL: ONLY include entities where matches === true (STRICT validation)
            if (validationResult.matches !== true) {
              continue; // Skip this entity completely - will search for replacement
            }
            
            
            // Only push to c.entitiesWithWikipedia if it matches
            c.entitiesWithWikipedia.push({
              entity: validatedEntity,
              wikipediaUrl: wikiCheck.url,
              wikipediaTitle: wikiCheck.title,
              criteriaData
            });
          } catch (error) {
            logger.warn(`[Entity Generation] Error validating "${validatedEntity}" by criteria:`, error);
            // If validation fails and we have criteria, skip it (don't include uncertain entities)
            continue; // Skip this entity
          }
        } else {
          // No criteria specified - include all entities with Wikipedia pages
          c.entitiesWithWikipedia.push({
            entity: validatedEntity,
            wikipediaUrl: wikiCheck.url,
            wikipediaTitle: wikiCheck.title,
            criteriaData: undefined
          });
        }
      } else {
        // Entity doesn't have Wikipedia page - skip it
      }
    } catch (error) {
      logger.warn(`[Entity Generation] Error checking Wikipedia for "${entity}":`, error);
    }
  }
  
  // If we have enough matching entities, break
  if (c.entitiesWithWikipedia.length >= c.count) {
    break;
  }
  
  // If we didn't get any new matching entities this batch and we still need more, try to get more candidates
  if (c.entitiesWithWikipedia.length === batchStartCount && c.entitiesWithWikipedia.length < c.count) {
    c.retryCount++;
    
    // Remove already processed entities from candidate pool
    const remainingCandidates = c.candidatePool.filter(e => {
      const entityKey = e.toLowerCase().trim();
      return !c.processedEntityNames.has(entityKey) &&
             !c.entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
    });
    
    if (remainingCandidates.length === 0) {
      logger.warn(`[Entity Generation] No more candidates available from initial pool. Found ${c.entitiesWithWikipedia.length}/${c.count} matching entities.`);
      
      // If we haven't exhausted retries and we have Google entities, try getting more from Google
      if (c.retryCount < maxRetries && c.entitiesFromGoogle.length > 0 && c.promptModifier && c.researchQuestion) {
        
        // Try a different search query variant
        try {
          const alternativeSearchPrompt = `Generate a different Google search question to find MORE entities matching: "${c.promptModifier}"

Previous search may have returned limited results. Generate an alternative search query that would find additional entities.
Location: "${c.primaryCity}"
Entity type: ${c.promptModifier.toLowerCase().includes('street') ? 'streets' : c.promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhoods' : 'entities'}

Return ONLY the search question, nothing else.`;

          let altSearchResponse = '';
          await streamChatCompletion({
            apiKey: c.openRouterApiKey,
            model: getResearchModel(),
            messages: [
              {
                role: 'system',
                content: 'You are a search query expert. Generate alternative Google search questions. Return only the search question.'
              },
              {
                role: 'user',
                content: alternativeSearchPrompt
              }
            ],
            temperature: 0.7,
            maxTokens: 100,
            topP: 0.9,
            onContentChunk: (chunk) => {
              altSearchResponse += chunk;
            }
          });

          const altSearchQuestion = altSearchResponse.trim().replace(/^["']|["']$/g, '').trim();
          if (altSearchQuestion && altSearchQuestion.length > 10 && altSearchQuestion !== c.researchQuestion) {
            notify.info(NOTIFY_SEARCHING_FOR_MORE_ENTITIES_WITH_ALTERNA);
            
            // Search again with alternative query - use c.primaryCity which has the correct location from modifier
            const altSearchLocation = c.primaryCity || "United States";
            const altSerpResponse = await fetch(`${c.mcpApiBase}/DataForSEO_serp_organic_live_advanced`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword: altSearchQuestion,
                location_name: altSearchLocation,
                language_code: "en",
                depth: 20,
                people_also_ask_click_depth: 4, // Get maximum PAA questions (4 clicks deep)
              }),
            });

            if (altSerpResponse.ok) {
              const altSerpData = await altSerpResponse.json();
              const altOrganicResults: Array<{ title: string; description?: string; url?: string }> = [];
              
              if (altSerpData.tasks && altSerpData.tasks[0] && altSerpData.tasks[0].result) {
                const result = altSerpData.tasks[0].result;
                const items = Array.isArray(result) ? result : (result.items || [result]);
                
                for (const item of items) {
                  if (item.type === 'organic' || !item.type) {
                    altOrganicResults.push({
                      title: item.title || '',
                      description: item.description || item.snippet || '',
                      url: item.url || item.link || ''
                    });
                  }
                  if (item.items && Array.isArray(item.items)) {
                    for (const subItem of item.items) {
                      if (subItem.type === 'organic' || !subItem.type) {
                        altOrganicResults.push({
                          title: subItem.title || '',
                          description: subItem.description || subItem.snippet || '',
                          url: subItem.url || subItem.link || ''
                        });
                      }
                    }
                  }
                }
              }

              if (altOrganicResults.length > 0) {
                // Extract entities from alternative search
                const altSerpContent = altOrganicResults.slice(0, 30).map((r, i) => 
                  `${i + 1}. Title: ${r.title}\n   Description: ${r.description || 'N/A'}\n   URL: ${r.url || 'N/A'}`
                ).join('\n\n');

                const altExtractionPrompt = `Extract entity names from these Google search results for: "${c.promptModifier}"

CRITICAL: Only extract entities from "${altSearchLocation}". Ignore entities from other locations.

Search Results:
${altSerpContent}

Return ONLY a JSON array of entity names from "${altSearchLocation}".`;

                let altExtractionResponse = '';
                await streamChatCompletion({
                  apiKey: c.openRouterApiKey,
                  model: getResearchModel(),
                  messages: [
                    {
                      role: 'system',
                      content: 'Extract entity names. Return only JSON arrays.'
                    },
                    {
                      role: 'user',
                      content: altExtractionPrompt
                    }
                  ],
                  temperature: 0.3,
                  maxTokens: 2000,
                  topP: 0.9,
                  onContentChunk: (chunk) => {
                    altExtractionResponse += chunk;
                  }
                });

                altExtractionResponse = altExtractionResponse.trim();
                altExtractionResponse = altExtractionResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
                
                try {
                  const altExtracted = JSON.parse(altExtractionResponse);
                  if (Array.isArray(altExtracted) && altExtracted.length > 0) {
                    const newCandidates = altExtracted.filter((e: string) => {
                      const entityKey = e.toLowerCase().trim();
                      return e && e.trim().length > 2 && 
                             !c.processedEntityNames.has(entityKey) &&
                             !c.entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey) &&
                             !c.existingEntities.some(existing => existing.toLowerCase().trim() === entityKey);
                    });
                    
                    if (newCandidates.length > 0) {
                      c.candidatePool.push(...newCandidates);
                    }
                  }
                } catch (parseError) {
                  logger.warn('[Entity Generation] Failed to parse alternative extraction response');
                }
              }
            }
          }
        } catch (error) {
          logger.warn('[Entity Generation] Error getting alternative search results:', error);
        }
        
        // If we still have no candidates after trying alternative search, break
        const stillRemaining = c.candidatePool.filter(e => {
          const entityKey = e.toLowerCase().trim();
          return !c.processedEntityNames.has(entityKey) &&
                 !c.entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
        });
        
        if (stillRemaining.length === 0) {
          logger.warn(`[Entity Generation] Exhausted all candidate sources. Found ${c.entitiesWithWikipedia.length}/${c.count} matching entities.`);
          break;
        }
        
        // Use the newly added candidates
        const nextBatchSize = Math.min(c.count * 2, stillRemaining.length);
        const shuffled = [...stillRemaining].sort(() => Math.random() - 0.5);
        currentBatch = shuffled.slice(0, nextBatchSize)
          .map(entity => {
            if (c.primaryCity && !entity.toLowerCase().includes(c.primaryCity.toLowerCase())) {
              return `${entity} ${c.primaryCity}`;
            }
            return entity;
          });
        continue; // Continue with the new batch
      }
      
      break; // No more candidates available
    }
    
    // Get next batch from remaining candidates
    const nextBatchSize = Math.min(c.count * 2, remainingCandidates.length);
    const shuffled = [...remainingCandidates].sort(() => Math.random() - 0.5);
    currentBatch = shuffled.slice(0, nextBatchSize)
      .map(entity => {
        // Format: add city if not present and c.primaryCity exists
        if (c.primaryCity && !entity.toLowerCase().includes(c.primaryCity.toLowerCase())) {
          return `${entity} ${c.primaryCity}`;
        }
        return entity;
      });
    
  } else {
    // We got some matches, continue with remaining candidates
    const remainingInBatch = currentBatch.filter(e => {
      const entityKey = e.toLowerCase().trim();
      return !c.processedEntityNames.has(entityKey);
    });
    if (remainingInBatch.length === 0) {
      // Get more from candidate pool
      const remainingCandidates = c.candidatePool.filter(e => {
        const entityKey = e.toLowerCase().trim();
        return !c.processedEntityNames.has(entityKey) &&
               !c.entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
      });
      if (remainingCandidates.length === 0) {
        break;
      }
      const nextBatchSize = Math.min(c.count * 2, remainingCandidates.length);
      const shuffled = [...remainingCandidates].sort(() => Math.random() - 0.5);
      currentBatch = shuffled.slice(0, nextBatchSize)
        .map(entity => {
          if (c.primaryCity && !entity.toLowerCase().includes(c.primaryCity.toLowerCase())) {
            return `${entity} ${c.primaryCity}`;
          }
          return entity;
        });
    } else {
      currentBatch = remainingInBatch;
    }
  }
}
  return true;
}

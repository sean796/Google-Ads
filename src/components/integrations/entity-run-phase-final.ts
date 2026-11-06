
import { notify } from "@/lib/app-notifications";
import { notifyFoundXXEntitiesMatchingCriteriaTri, notifyGeneratedXEntities } from "@/lib/notify-messages";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";

export async function runEntityPhaseFinal(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// CRITICAL: Filter entities that match criteria (if criteria specified)
// STRICT: Only include entities where matches === true (no exceptions, no undefined, no false)
const entitiesMatchingCriteria = c.promptModifier 
  ? c.entitiesWithWikipedia.filter(e => {
      // STRICT: If criteria is specified, criteriaData must exist AND matches must be exactly true
      if (!e.criteriaData) {
        console.warn(`[Entity Generation] Entity "${e.entity}" has no criteriaData but criteria was specified - EXCLUDING`);
        return false;
      }
      if (e.criteriaData.matches !== true) {
        console.warn(`[Entity Generation] Entity "${e.entity}" does not match (matches: ${e.criteriaData.matches}) - EXCLUDING`);
        return false;
      }
      return true; // Only explicit matches
    })
  : c.entitiesWithWikipedia;

console.log(`[Entity Generation] Found ${c.entitiesWithWikipedia.length} entities with Wikipedia pages${c.promptModifier ? `, ${entitiesMatchingCriteria.length} matching criteria "${c.promptModifier}"` : ''}`);

// Sort by ranking value if criteria validation provided ranking
if (c.promptModifier && entitiesMatchingCriteria.some(e => e.criteriaData?.rankingValue !== undefined)) {
  entitiesMatchingCriteria.sort((a, b) => {
    const rankA = a.criteriaData?.rankingValue ?? 0;
    const rankB = b.criteriaData?.rankingValue ?? 0;
    return rankB - rankA; // Sort descending (highest first)
  });
  console.log(`[Entity Generation] Sorted entities by ranking value`);
} else if (entitiesMatchingCriteria.length > c.count) {
  // If no ranking, sort by confidence (if available) or randomly
  entitiesMatchingCriteria.sort((a, b) => {
    const confA = a.criteriaData?.confidence ?? 50;
    const confB = b.criteriaData?.confidence ?? 50;
    return confB - confA; // Sort descending (highest confidence first)
  });
}

// Take exactly the requested count (or all available if less)
const finalEntities = entitiesMatchingCriteria.slice(0, c.count);

if (finalEntities.length === 0) {
  const entitiesWithWiki = c.entitiesWithWikipedia.length;
  const entitiesMatching = c.promptModifier ? entitiesMatchingCriteria.length : entitiesWithWiki;
  
  let errorMsg = `No entities found`;
  if (c.promptModifier) {
    errorMsg += ` matching criteria "${c.promptModifier}"`;
    if (entitiesWithWiki > 0) {
      errorMsg += `. Found ${entitiesWithWiki} entities with Wikipedia pages, but none matched the criteria after ${c.retryCount} retries.`;
      errorMsg += ` Try a broader criteria or check that the Wikipedia pages contain relevant demographic/location data.`;
    } else {
      errorMsg += `. Validated ${c.processedEntityNames.size} entities but none had Wikipedia pages.`;
    }
  } else {
    errorMsg += `. Validated ${c.processedEntityNames.size} entities but none had Wikipedia pages.`;
  }
  
  console.error(`[Entity Generation] ${errorMsg}`);
  console.error(`[Entity Generation] Entities processed:`, Array.from(c.processedEntityNames).slice(0, 10));
  notify.error(errorMsg);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

// If we don't have enough matching entities after retries, show a warning but continue with what we have
if (finalEntities.length < c.count && c.promptModifier) {
  console.warn(`[Entity Generation] Only found ${finalEntities.length}/${c.count} entities matching criteria "${c.promptModifier}" after ${c.retryCount} retries. Continuing with available matches.`);
  notify.error(notifyFoundXXEntitiesMatchingCriteriaTri(finalEntities.length, c.count, c.processedEntityNames.size));
} else if (finalEntities.length === c.count) {
  console.log(`[Entity Generation] Successfully found ${finalEntities.length}/${c.count} entities${c.promptModifier ? ` matching criteria "${c.promptModifier}"` : ''}${c.retryCount > 0 ? ` after ${c.retryCount} retries` : ''}`);
}

// Store generated entities (c.storageKey already defined earlier)
s.setGeneratedEntities(prev => ({
  ...prev,
  [c.storageKey]: finalEntities.map(e => e.entity)
}));

// Store Wikipedia links separately
s.setWikipediaLinks(prev => ({
  ...prev,
  [c.storageKey]: finalEntities.reduce((acc, e) => {
    if (e.wikipediaUrl) {
      acc[e.entity] = e.wikipediaUrl;
    }
    return acc;
  }, {} as Record<string, string>)
}));

// Store suggested title format for bulk import
localStorage.setItem(`entity-title-format-${c.storageKey}`, c.suggestedTitleFormat);

notify.success(notifyGeneratedXEntities(finalEntities.length));
s.setEntityGenerationDialogOpen(true);
s.setPendingEntitySite(c.site);
s.setPendingEntitySitemap(c.entitySitemapUrl);

// Auto-select first entity to show its criteria info
if (finalEntities.length > 0) {
  s.setSelectedEntity(finalEntities[0].entity);
}

// Clear the count input for next time
  return true;
}

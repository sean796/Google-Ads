import { useCallback } from "react";

import { notifyEntityGenerationFailedForBlindswest, notifyEntityGenerationFailedForBlindswest2 } from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import type { WordPressSite } from "@/components/integrations/types";
import type { EntityGenerationState } from "@/components/integrations/use-entity-generation-state";
import type { EntityValidators } from "@/components/integrations/use-entity-validators";
import { createEntityRunCtx, type EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { runEntityPhaseSitemap } from "@/components/integrations/entity-run-phase-sitemap";
import { runEntityPhaseGeo } from "@/components/integrations/entity-run-phase-geo";
import { runEntityPhaseTitle } from "@/components/integrations/entity-run-phase-title";
import { runEntityPhaseGoogle } from "@/components/integrations/entity-run-phase-google";
import { runEntityPhaseWikipedia } from "@/components/integrations/entity-run-phase-wikipedia";
import { runEntityPhaseValidate } from "@/components/integrations/entity-run-phase-validate";
import { runEntityPhaseFinal } from "@/components/integrations/entity-run-phase-final";

export function useEntityGenerationRun(s: EntityGenerationState, v: EntityValidators) {
  const handleGenerateEntities = useCallback(
    async (site: WordPressSite, sitemapUrl: string, count: number, promptModifier?: string) => {
      const c = createEntityRunCtx(site, sitemapUrl, count, promptModifier);
      const d: EntityRunDeps = { s, v, c };
      try {
        if (!(await runEntityPhaseSitemap(d))) return;
        if (!(await runEntityPhaseGeo(d))) return;
        if (!(await runEntityPhaseTitle(d))) return;
        if (!(await runEntityPhaseGoogle(d))) return;
        if (c.entitiesFromGoogle.length > 0) {
          console.log(`[Entity Generation] ✓ Using ${c.entitiesFromGoogle.length} entities from Google search - COMPLETELY SKIPPING Wikipedia category/search (we already have the data!)`);
          c.validatedEntities = c.entitiesFromGoogle;
          c.selectedPageTitle = `Google search results for "${c.promptModifier}"`;
        } else {
          if (!(await runEntityPhaseWikipedia(d))) return;
        }
        if (!(await runEntityPhaseValidate(d))) return;
        if (!(await runEntityPhaseFinal(d))) return;
      } catch (error) {
      
// Enhanced error logging for entity generation
const errorDetails = {
  siteId: c.site.id,
  siteUrl: c.site.siteUrl,
  sitemapUrl: c.entitySitemapUrl,
  hasEntitySitemapUrl: !!c.site.entitySitemapUrl,
  errorMessage: error instanceof Error ? error.message : String(error),
  errorName: error instanceof Error ? error.name : 'Unknown',
  errorStack: error instanceof Error ? error.stack : undefined,
  timestamp: new Date().toISOString()
};

console.error('[Entity Generation] Error generating entities:', errorDetails);

// Site-specific error handling for blindswest.ca
if (c.site.siteUrl && c.site.siteUrl.includes('blindswest.ca')) {
  console.warn('[Entity Generation] blindswest.ca specific error detected:', errorDetails);
  
  // Check for common issues
  if (error instanceof Error) {
    if (error.message.includes('Attribute without value')) {
      notify.error(
        `XML parsing error for blindswest.ca sitemap.\n\n` +
        `The sitemap at ${c.entitySitemapUrl} contains malformed XML attributes.\n\n` +
        `Please check the sitemap file and ensure all attributes have values.`
      );
    } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
      notify.error(
        `Server error while parsing sitemap for blindswest.ca.\n\n` +
        `The backend server encountered an error processing ${c.entitySitemapUrl}.\n\n` +
        `Check server logs for details.`
      );
    } else {
      notify.error(notifyEntityGenerationFailedForBlindswest(error.message));
    }
  } else {
    notify.error(notifyEntityGenerationFailedForBlindswest2(String(error)));
  }
} else {
  notify.error(error instanceof Error ? error.message : "Failed to generate entities");
}

s.setIsGeneratingEntities(prev => {
  const updated = { ...prev };
  delete updated[`${c.site.id}-${c.entitySitemapUrl}`];
  return updated;
});
      }
    },
    [s, v],
  );

  return { handleGenerateEntities };
}


import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_DETERMINE_GEOGRAPHIC_AREA_FROM } from "@/lib/notify-messages";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";

export async function runEntityPhaseTitle(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// Analyze title format from existing URLs
c.suggestedTitleFormat = '';
if (c.parseResult.urls.length > 0 && c.existingEntities.length > 0) {
  const serviceName = c.site.name;
  
  // Common patterns: "[Service] Near [Location]", "[Service] in [Location]", "[Service] [Location]"
  if (c.parseResult.urls.some(url => url.toLowerCase().includes('near'))) {
    c.suggestedTitleFormat = `${serviceName} Near {entity}`;
  } else if (c.parseResult.urls.some(url => url.toLowerCase().includes('in'))) {
    c.suggestedTitleFormat = `${serviceName} in {entity}`;
  } else {
    // Default pattern based on common SEO practices
    c.suggestedTitleFormat = `${serviceName} Near {entity}`;
  }
} else {
  // Fallback default
  c.suggestedTitleFormat = `${c.site.name} Near {entity}`;
}

// Step 1: Find Wikipedia category pages for the geographic area
if (!c.primaryCity) {
  notify.error(NOTIFY_COULD_NOT_DETERMINE_GEOGRAPHIC_AREA_FROM);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}
  return true;
}

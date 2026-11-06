
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_URLS_FOUND_IN_SITEMAP, notifyFoundXUrlsAnalyzingWithAi, notifyParsingSitemapX } from "@/lib/notify-messages";
import { parseSitemap } from "@/lib/wordpress-api";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { logger } from "@/lib/logger";

export async function runEntityPhaseSitemap(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// CRITICAL: Use c.site.entitySitemapUrl if available (user has set entity sitemap)
// This ensures we use the correct entity sitemap instead of hardcoded URLs
c.entitySitemapUrl = c.site.entitySitemapUrl || c.sitemapUrl;

c.generatingKey = `${c.site.id}-${c.entitySitemapUrl}`;
c.storageKey = `${c.site.id}-${c.entitySitemapUrl}`;

// Clear any cached entities for this sitemap to force fresh generation
s.setGeneratedEntities(prev => {
const updated = { ...prev };
delete updated[c.storageKey];
return updated;
});

s.setIsGeneratingEntities(prev => ({ ...prev, [c.generatingKey]: true }));
s.setEntityGenerationDialogOpen(false);

notify.info(notifyParsingSitemapX(c.entitySitemapUrl));

      
// Parse the sitemap to get URLs

try {
          
  c.parseResult = await parseSitemap(
    c.site.siteUrl,
    c.entitySitemapUrl,
    c.site.username,
    c.site.appPassword
  );
  
        } catch (parseError) {
          
  // Enhanced error handling for entity generation
  const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
  const errorDetails = (parseError as { details?: { possibleReasons?: unknown } } | null)?.details;
  const errorSuggestion = (parseError as { suggestion?: string } | null)?.suggestion;
  
  // Check if it's an HTML response instead of XML
  if (errorMessage.includes('HTML instead of XML') || (errorDetails && errorDetails.possibleReasons)) {
    const detailedError = `Sitemap URL returned HTML instead of XML:\n\n${c.entitySitemapUrl}\n\n${errorSuggestion || 'The sitemap may require authentication or the URL may be incorrect.'}`;
    logger.error('[Entity Generation] HTML response error:', {
      siteUrl: c.site.siteUrl,
      sitemapUrl: c.entitySitemapUrl,
      error: errorMessage,
      details: errorDetails
    });
    notify.error(detailedError, { duration: 10000 });
    s.setIsGeneratingEntities(prev => {
      const updated = { ...prev };
      delete updated[c.generatingKey];
      return updated;
    });
    return false;
  }
  
  // Check if it's an invalid sitemap format error
  if (errorMessage.includes('Invalid sitemap format') || errorMessage.includes('does not appear to be a valid sitemap')) {
    const detailedError = `Invalid sitemap format for ${c.entitySitemapUrl}:\n\n${errorMessage}\n\n${errorSuggestion || 'Please verify the sitemap URL is correct and accessible.'}`;
    logger.error('[Entity Generation] Invalid sitemap format:', {
      siteUrl: c.site.siteUrl,
      sitemapUrl: c.entitySitemapUrl,
      error: errorMessage,
      details: errorDetails
    });
    notify.error(detailedError, { duration: 10000 });
    s.setIsGeneratingEntities(prev => {
      const updated = { ...prev };
      delete updated[c.generatingKey];
      return updated;
    });
    return false;
  }
  
  // Check if it's an XML parsing error
  if (errorMessage.includes('Attribute without value') || errorMessage.includes('XML')) {
    const detailedError = `Sitemap parsing failed for ${c.entitySitemapUrl}:\n\n${errorMessage}\n\nThis usually means the sitemap XML has malformed attributes. Please check the sitemap file.`;
    logger.error('[Entity Generation] XML parsing error:', {
      siteUrl: c.site.siteUrl,
      sitemapUrl: c.entitySitemapUrl,
      error: errorMessage,
      errorDetails: parseError instanceof Error ? parseError.stack : undefined
    });
    notify.error(detailedError);
    s.setIsGeneratingEntities(prev => {
      const updated = { ...prev };
      delete updated[c.generatingKey];
      return updated;
    });
    return false;
  }
  
  // Re-throw other errors
  throw parseError;
}

if (!c.parseResult.urls || c.parseResult.urls.length === 0) {
  notify.error(NOTIFY_NO_URLS_FOUND_IN_SITEMAP);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

notify.info(notifyFoundXUrlsAnalyzingWithAi(c.parseResult.urls.length));
  return true;
}

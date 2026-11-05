import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS, NOTIFY_COULD_NOT_DETERMINE_GEOGRAPHIC_AREA_FROM, NOTIFY_COULD_NOT_SELECT_A_WIKIPEDIA_LIST_PAGE_P, NOTIFY_DATAFORSEO_SEARCH_FAILED_FALLING_BACK_TO, NOTIFY_FAILED_TO_COPY, NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD, NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION, NOTIFY_GETTING_PAGES_FROM_WIKIPEDIA_CATEGORIES, NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI, NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM, NOTIFY_NO_URLS_FOUND_IN_SITEMAP, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE, NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD, NOTIFY_ORIGIN_COPIED, NOTIFY_SEARCHING_FOR_MORE_ENTITIES_WITH_ALTERNA, NOTIFY_SERVER_ERROR_WHILE_PARSING_SITEMAP_FOR_B, NOTIFY_TITLE_TEMPLATE_SUGGESTED, NOTIFY_USING_AI_TO_SELECT_BEST_WIKIPEDIA_LIST_P, NOTIFY_XML_PARSING_ERROR_FOR_BLINDSWEST_CA_SITE, notifyAllEntitiesWereFilteredOutXConflic, notifyAllXValidatedEntitiesWereFilteredO, notifyCopiedXToClipboard, notifyCsvTemplateWithXEntitiesDownloaded, notifyEntityGenerationFailedForBlindswest, notifyEntityGenerationFailedForBlindswest2, notifyFailedToGenerateTitleSuggestionX, notifyFindingWikipediaCategoryPagesForXP, notifyFoundXUrlsAnalyzingWithAi, notifyFoundXXEntitiesMatchingCriteriaTri, notifyGeneratedXEntities, notifyNoWikipediaPagesFoundForXTryAddin, notifyParsingSitemapX, notifySearchingGoogleForX, notifyUsingAiToExtractEntitiesFromWikipe, notifyUsingAiToFindSimilarWikipediaList, notifyUsingDataforseoToSearchGoogleForEn, notifyValidatingEntitiesWithWikipediaPromp, notifyValidatingXAgainstCriteria, notifyWikipediaPageXNotFoundPleaseTryA } from "@/lib/notify-messages";
import { ExternalLink, Copy, Download, Sparkles, Bot } from "lucide-react";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { parseSitemap, getScheduledPosts } from "@/lib/wordpress-api";
import { checkConflicts } from "@/components/integrations/entity-generation/filtering/conflictChecker";
import { 
  checkWikipediaPageExists, 
  getWikipediaCategoryPages, 
  getPagesInCategory, 
  extractEntitiesFromWikipediaList, 
  searchWikipediaPages,
  fetchWikipediaContent,
  extractStructuredDataFromWikipedia
} from "@/lib/wikipedia-api";
import { type WordPressSite } from "./types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { Button, Field, SelectField } from "@/ui";

export interface EntityGenerationFeatureRef {
  openDialog: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities: Record<string, boolean>;
}

interface EntityGenerationFeatureProps {
  onRef?: (ref: EntityGenerationFeatureRef) => void;
}

interface EntityWithCriteria {
  entity: string;
  wikipediaUrl: string;
  wikipediaTitle?: string;
  criteriaData?: {
    matches: boolean;
    confidence: number;
    extractedData: Record<string, any>;
    rankingValue?: number;
  };
}

export const EntityGenerationFeature: React.FC<EntityGenerationFeatureProps> = ({ onRef }) => {
  const [isGeneratingEntities, setIsGeneratingEntities] = useState<Record<string, boolean>>({});
  const [generatedEntities, setGeneratedEntities] = useState<Record<string, string[]>>({});
  const [wikipediaLinks, setWikipediaLinks] = useState<Record<string, Record<string, string>>>({});
  const [criteriaInfo, setCriteriaInfo] = useState<Record<string, Record<string, EntityWithCriteria['criteriaData']>>>({});
  const [generalCriteriaInfo, setGeneralCriteriaInfo] = useState<Record<string, string>>({});
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [entityGenerationDialogOpen, setEntityGenerationDialogOpen] = useState(false);
  const [pendingEntitySite, setPendingEntitySite] = useState<WordPressSite | null>(null);
  const [pendingEntitySitemap, setPendingEntitySitemap] = useState<string | null>(null);
  const [entityCount, setEntityCount] = useState<number>(5);
  const [entityPromptModifier, setEntityPromptModifier] = useState<string>('');
  const [csvTemplateDialogOpen, setCsvTemplateDialogOpen] = useState(false);
  const [csvTitleFormat, setCsvTitleFormat] = useState<string>('');
  const [csvKeyword, setCsvKeyword] = useState<string>('');
  const [csvFeaturedImage, setCsvFeaturedImage] = useState<string>('y');
  const [csvOptionalModifier, setCsvOptionalModifier] = useState<string>('');
  const [isGeneratingTitleSuggestion, setIsGeneratingTitleSuggestion] = useState<boolean>(false);

  const handleOpenEntityGenerationDialog = useCallback((site: WordPressSite, sitemapUrl: string) => {
    const storageKey = `${site.id}-${sitemapUrl}`;
    // ALWAYS clear cached entities when opening dialog - force fresh generation
    setGeneratedEntities(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setWikipediaLinks(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setGeneralCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setSelectedEntity(null);
    setPendingEntitySite(site);
    setPendingEntitySitemap(sitemapUrl);
    setEntityCount(5);
    setEntityGenerationDialogOpen(true);
  }, []);

  // Expose ref to parent - update whenever isGeneratingEntities changes
  React.useEffect(() => {
    if (onRef) {
      onRef({
        openDialog: handleOpenEntityGenerationDialog,
        isGeneratingEntities,
      });
    }
  }, [onRef, handleOpenEntityGenerationDialog, isGeneratingEntities]);

  /**
   * Validates if an entity matches criteria by extracting data from Wikipedia
   */
  const validateEntityByCriteria = useCallback(async (
    entity: string,
    criteria: string,
    openRouterApiKey: string
  ): Promise<{
    matches: boolean;
    confidence: number;
    extractedData?: Record<string, any>;
    rankingValue?: number;
  }> => {
    try {
      const result = await extractStructuredDataFromWikipedia(entity, criteria, openRouterApiKey);
      return {
        matches: result.matches || false,
        confidence: result.confidence || 0,
        extractedData: result.extractedData || {},
        rankingValue: result.rankingValue
      };
    } catch (error) {
      console.warn(`[Entity Generation] Error validating entity "${entity}" by criteria:`, error);
      return {
        matches: false,
        confidence: 0,
        extractedData: {},
        rankingValue: 0
      };
    }
  }, []);

  /**
   * Validates that an entity does NOT exist in sitemap URLs
   */
  const validateEntityNotInSitemap = useCallback((
    entity: string,
    sitemapUrls: string[]
  ): boolean => {
    const entityLower = entity.toLowerCase().trim();
    
    for (const url of sitemapUrls) {
      try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
        
        // Check if entity appears in any path segment
        for (const segment of pathSegments) {
          const segmentLower = segment
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .toLowerCase();
          
          // Normalize entity name (remove city suffix if present)
          const entityName = entityLower.split(' ').slice(0, -1).join(' '); // Remove last word (city name)
          const entityNameFull = entityLower;
          
          // Check for matches
          if (segmentLower.includes(entityName) || 
              segmentLower.includes(entityNameFull) ||
              entityName.includes(segmentLower) ||
              entityNameFull.includes(segmentLower)) {
            return false; // Entity found in sitemap
          }
        }
      } catch (error) {
        // Skip invalid URLs
        continue;
      }
    }
    
    return true; // Entity not found in sitemap
  }, []);

  /**
   * Validates if an entity should be accepted or rejected
   * - Rejects years and dates (entities cannot be years or dates of any kind)
   * - Rejects generic entities like "Your Home", "My Home", "The Home"
   * - Rejects personal entities like "Your Big Day", "My Big Day", "Your Special Day"
   * - Rejects generic personal possessive phrases (Your/My/The + generic term)
   * - Allows hardcoded competitors like "hunter douglas"
   */
  const isValidEntity = useCallback((entity: string): boolean => {
    const entityLower = entity.toLowerCase().trim();
    
    // Hardcoded allowed competitors (OK to target)
    const allowedCompetitors = [
      'hunter douglas',
      'hunterdouglas'
    ];
    
    // Check if entity is an allowed competitor
    for (const allowed of allowedCompetitors) {
      if (entityLower === allowed || entityLower.includes(allowed)) {
        console.log(`[Entity Validation] ✓ Entity "${entity}" is an allowed competitor - ACCEPTED`);
        return true;
      }
    }
    
    // Reject years and dates (entities cannot be years or dates of any kind)
    // Check for 4-digit years (1900-2099)
    const yearPattern = /^(19|20)\d{2}$/;
    if (yearPattern.test(entityLower)) {
      console.log(`[Entity Validation] ✗ Entity "${entity}" is a year - REJECTED`);
      return false;
    }
    
    // Check for date patterns (YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, etc.)
    const datePatterns = [
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,  // YYYY-MM-DD, YYYY/MM/DD
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,  // MM/DD/YYYY, DD-MM-YYYY
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/,  // MM/DD/YY, DD-MM-YY
      /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i,  // Month Year
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i,  // Month abbreviation Year
      /^\d{4}\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i,  // Year Month
      /^\d{4}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i  // Year Month abbreviation
    ];
    
    for (const pattern of datePatterns) {
      if (pattern.test(entityLower)) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" is a date - REJECTED`);
        return false;
      }
    }
    
    // Check if entity contains a year pattern (4-digit number 1900-2099)
    const containsYearPattern = /\b(19|20)\d{2}\b/;
    if (containsYearPattern.test(entityLower)) {
      // Allow if it's part of a legitimate location name (e.g., "Route 2024" is unlikely but could be valid)
      // But reject if it's clearly a date/year reference
      const dateKeywords = ['year', 'date', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const hasDateKeyword = dateKeywords.some(keyword => entityLower.includes(keyword));
      if (hasDateKeyword || /^\d{4}/.test(entityLower) || /\d{4}$/.test(entityLower)) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" contains a year/date - REJECTED`);
        return false;
      }
    }
    
    // Reject generic home-related entities
    const rejectedPatterns = [
      /^your\s+home$/i,
      /^my\s+home$/i,
      /^the\s+home$/i,
      /^home$/i,
      /^your\s+house$/i,
      /^my\s+house$/i,
      /^the\s+house$/i,
      /^house$/i,
      /^your\s+place$/i,
      /^my\s+place$/i,
      /^the\s+place$/i,
      /^place$/i
    ];
    
    for (const pattern of rejectedPatterns) {
      if (pattern.test(entityLower)) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" matches rejected pattern - REJECTED`);
        return false;
      }
    }
    
    // Reject personal entities (generic personal possessive phrases)
    // Examples: "Your Big Day", "My Big Day", "Your Special Day", "My Special Day", etc.
    const personalEntityPatterns = [
      /^your\s+big\s+day$/i,
      /^my\s+big\s+day$/i,
      /^the\s+big\s+day$/i,
      /^your\s+special\s+day$/i,
      /^my\s+special\s+day$/i,
      /^the\s+special\s+day$/i,
      /^your\s+day$/i,
      /^my\s+day$/i,
      /^the\s+day$/i,
      /^your\s+event$/i,
      /^my\s+event$/i,
      /^the\s+event$/i,
      /^your\s+space$/i,
      /^my\s+space$/i,
      /^the\s+space$/i,
      /^your\s+room$/i,
      /^my\s+room$/i,
      /^the\s+room$/i
    ];
    
    for (const pattern of personalEntityPatterns) {
      if (pattern.test(entityLower)) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" is a personal entity - REJECTED`);
        return false;
      }
    }
    
    // AGGRESSIVE FILTER: Reject ANY entity starting with "Your", "My", or "The" 
    // unless it's clearly a geographic location (which would be unusual for these prefixes)
    // This catches ALL personal/business possessive phrases
    const personalPrefixMatch = entityLower.match(/^(your|my|the)\s+(.+)$/);
    if (personalPrefixMatch) {
      const restOfEntity = personalPrefixMatch[2].trim();
      
      // Generic personal/business terms that should always be rejected
      const genericPersonalTerms = [
        'home', 'house', 'place', 'day', 'big day', 'special day', 'event', 'space', 'room',
        'wedding', 'party', 'celebration', 'occasion', 'moment', 'time', 'life', 'world',
        // Business-related terms
        'business', 'new business', 'company', 'new company', 'organization', 'firm', 'enterprise',
        'office', 'workplace', 'store', 'shop', 'location', 'area', 'region', 'neighborhood',
        // Personal possessive terms
        'property', 'apartment', 'condo', 'townhome', 'residence', 'dwelling'
      ];
      
      // Check if rest matches generic terms
      const matchesGenericTerm = genericPersonalTerms.some(term => {
        return restOfEntity === term || 
               restOfEntity.startsWith(term + ' ') || 
               restOfEntity.endsWith(' ' + term) ||
               restOfEntity.includes(' ' + term + ' ');
      });
      
      if (matchesGenericTerm) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" is a personal/business generic entity - REJECTED`);
        return false;
      }
      
      // AGGRESSIVE: Also reject if it doesn't look like a geographic location
      // Geographic locations typically have patterns like: city names, street names, etc.
      // If it doesn't match known geographic patterns, reject it
      const looksLikeLocation = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+/.test(entity) || // "City, State" pattern
                                /^(north|south|east|west|northwest|northeast|southwest|southeast)\s/.test(entityLower) || // Directional
                                /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|place|pl)\b/i.test(entity); // Street types
      
      if (!looksLikeLocation) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" starts with personal possessive prefix but doesn't look like a geographic location - REJECTED`);
        return false;
      }
    }
    
    // Additional check: reject if entity is just "Your Home" or similar generic phrases
    const genericPhrases = [
      'your home',
      'my home',
      'the home',
      'your house',
      'my house',
      'the house',
      'your place',
      'my place',
      'the place',
      'your big day',
      'my big day',
      'the big day',
      'your special day',
      'my special day',
      'the special day',
      // Business-related generic phrases
      'your new business',
      'my new business',
      'the new business',
      'your business',
      'my business',
      'the business',
      'your company',
      'my company',
      'the company',
      'your new company',
      'my new company',
      'the new company',
      'your organization',
      'my organization',
      'the organization'
    ];
    
    // Check if entity exactly matches or starts with a generic phrase
    for (const phrase of genericPhrases) {
      if (entityLower === phrase || entityLower.startsWith(phrase + ' ')) {
        console.log(`[Entity Validation] ✗ Entity "${entity}" is a generic phrase - REJECTED`);
        return false;
      }
    }
    
    return true; // Entity is valid
  }, []);

  const handleGenerateEntities = useCallback(async (site: WordPressSite, sitemapUrl: string, count: number, promptModifier?: string) => {
    // CRITICAL: Use site.entitySitemapUrl if available (user has set entity sitemap)
    // This ensures we use the correct entity sitemap instead of hardcoded URLs
    const entitySitemapUrl = site.entitySitemapUrl || sitemapUrl;
    
    const generatingKey = `${site.id}-${entitySitemapUrl}`;
    const storageKey = `${site.id}-${entitySitemapUrl}`;
    
    // Clear any cached entities for this sitemap to force fresh generation
    setGeneratedEntities(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    
    setIsGeneratingEntities(prev => ({ ...prev, [generatingKey]: true }));
    setEntityGenerationDialogOpen(false);

    try {
      notify.info(notifyParsingSitemapX(entitySitemapUrl));
      
            
      // Parse the sitemap to get URLs
      let parseResult;
      try {
                
        parseResult = await parseSitemap(
          site.siteUrl,
          entitySitemapUrl,
          site.username,
          site.appPassword
        );
        
              } catch (parseError) {
                
        // Enhanced error handling for entity generation
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        const errorDetails = (parseError as any)?.details;
        const errorSuggestion = (parseError as any)?.suggestion;
        
        // Check if it's an HTML response instead of XML
        if (errorMessage.includes('HTML instead of XML') || (errorDetails && errorDetails.possibleReasons)) {
          const detailedError = `Sitemap URL returned HTML instead of XML:\n\n${entitySitemapUrl}\n\n${errorSuggestion || 'The sitemap may require authentication or the URL may be incorrect.'}`;
          console.error('[Entity Generation] HTML response error:', {
            siteUrl: site.siteUrl,
            sitemapUrl: entitySitemapUrl,
            error: errorMessage,
            details: errorDetails
          });
          notify.error(detailedError, { duration: 10000 });
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }
        
        // Check if it's an invalid sitemap format error
        if (errorMessage.includes('Invalid sitemap format') || errorMessage.includes('does not appear to be a valid sitemap')) {
          const detailedError = `Invalid sitemap format for ${entitySitemapUrl}:\n\n${errorMessage}\n\n${errorSuggestion || 'Please verify the sitemap URL is correct and accessible.'}`;
          console.error('[Entity Generation] Invalid sitemap format:', {
            siteUrl: site.siteUrl,
            sitemapUrl: entitySitemapUrl,
            error: errorMessage,
            details: errorDetails
          });
          notify.error(detailedError, { duration: 10000 });
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }
        
        // Check if it's an XML parsing error
        if (errorMessage.includes('Attribute without value') || errorMessage.includes('XML')) {
          const detailedError = `Sitemap parsing failed for ${entitySitemapUrl}:\n\n${errorMessage}\n\nThis usually means the sitemap XML has malformed attributes. Please check the sitemap file.`;
          console.error('[Entity Generation] XML parsing error:', {
            siteUrl: site.siteUrl,
            sitemapUrl: entitySitemapUrl,
            error: errorMessage,
            errorDetails: parseError instanceof Error ? parseError.stack : undefined
          });
          notify.error(detailedError);
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }
        
        // Re-throw other errors
        throw parseError;
      }

      if (!parseResult.urls || parseResult.urls.length === 0) {
        notify.error(NOTIFY_NO_URLS_FOUND_IN_SITEMAP);
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }

      notify.info(notifyFoundXUrlsAnalyzingWithAi(parseResult.urls.length));
      
      // Extract existing entities, geographic area, and title format from URLs
      const existingEntities: string[] = [];
      const cityNames = new Set<string>();
      const areaKeywords = new Set<string>();
      
      for (const url of parseResult.urls) {
        try {
          const urlObj = new URL(url);
          const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
          const serviceAreaIndex = pathSegments.findIndex(seg => 
            seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
          );
          
          if (serviceAreaIndex >= 0 && serviceAreaIndex < pathSegments.length - 1) {
            const locationSegments = pathSegments.slice(serviceAreaIndex + 1);
            if (locationSegments.length > 0) {
              const locationSlug = locationSegments.join('-');
              const readableLocation = locationSlug
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              if (readableLocation && !existingEntities.includes(readableLocation)) {
                existingEntities.push(readableLocation);
              }
              
              // Extract city names (common city names in location slugs)
              const commonCities = ['edmonton', 'calgary', 'vancouver', 'toronto', 'montreal', 'ottawa', 'winnipeg', 'halifax', 'victoria', 'saskatoon', 'regina'];
              for (const city of commonCities) {
                if (locationSlug.toLowerCase().includes(city)) {
                  cityNames.add(city.charAt(0).toUpperCase() + city.slice(1));
                }
              }
              
              // Extract area keywords (neighborhood, street, area indicators)
              const words = locationSlug.split('-');
              for (const word of words) {
                const lower = word.toLowerCase();
                if (['street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'neighborhood', 'area', 'district', 'towne', 'town'].includes(lower)) {
                  areaKeywords.add(word);
                }
              }
            }
          } else if (pathSegments.length > 0) {
            // Fallback: use last segment
            const lastSegment = pathSegments[pathSegments.length - 1];
            if (lastSegment && !lastSegment.includes('.xml') && !lastSegment.includes('.html')) {
              const readableLocation = lastSegment
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              if (readableLocation && !existingEntities.includes(readableLocation)) {
                existingEntities.push(readableLocation);
              }
            }
          }
        } catch (error) {
          // Skip invalid URLs
        }
      }
      
      // Determine primary geographic area
      let primaryCity = cityNames.size > 0 ? Array.from(cityNames)[0] : null;
      
      // Use site's default location if available and no city found from URLs
      if (!primaryCity && site.locations && site.locations.length > 0) {
        const defaultLocation = site.locations.find(loc => loc.isDefault) || site.locations[0];
        if (defaultLocation.city && defaultLocation.state) {
          primaryCity = `${defaultLocation.city}, ${defaultLocation.state}`;
          console.log(`[Entity Generation] Using site default location: "${primaryCity}"`);
        } else if (defaultLocation.city) {
          primaryCity = defaultLocation.city;
          console.log(`[Entity Generation] Using site default city: "${primaryCity}"`);
        } else if (defaultLocation.state) {
          primaryCity = defaultLocation.state;
          console.log(`[Entity Generation] Using site default state: "${primaryCity}"`);
        }
      }
      
      // Get OpenRouter API key FIRST (needed for location extraction)
      const openRouterApiKey = loadApiKey();
      if (!openRouterApiKey) {
        notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE);
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }
      
      // Step -1: If no city found from simple pattern matching, try extracting from URLs using AI and regex
      // If still no location found, try extracting from URLs
      if (!primaryCity) {
        console.log('[Entity Generation] No city found from simple patterns or site location, trying AI extraction from URLs...');
        
        // First try regex patterns to extract "Near [City], [State]" or "Near [City]" from URL slugs
        const urlLocationMatches: string[] = [];
        for (const url of parseResult.urls) {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
            
            // Join all path segments to get full URL slug
            const fullSlug = pathSegments.join('-');
            const decodedSlug = decodeURIComponent(fullSlug);
            
            // Try pattern: "near-[city]-[state]" or "near-[city]"
            // Handle variations like: "near-opa-locka-florida", "near-opa-locka", "near-opalocka-florida"
            const nearPattern1 = /near[-_]?([a-z]+(?:[-_][a-z]+)*)[-_,]?([a-z]+)?/i;
            const nearMatch1 = decodedSlug.match(nearPattern1);
            
            if (nearMatch1) {
              const cityPart = nearMatch1[1].replace(/[-_]/g, ' ').trim();
              const statePart = nearMatch1[2] ? nearMatch1[2].replace(/[-_]/g, ' ').trim() : '';
              
              // Capitalize properly
              const city = cityPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              if (city && city.length > 2) {
                urlLocationMatches.push(statePart ? `${city}, ${statePart.charAt(0).toUpperCase() + statePart.slice(1).toLowerCase()}` : city);
              }
            }
            
            // Also check URL path segments individually for "near" keyword
            const serviceAreaIndex = pathSegments.findIndex(seg => 
              seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
            );
            
            if (serviceAreaIndex >= 0 && serviceAreaIndex < pathSegments.length - 1) {
              const locationSegments = pathSegments.slice(serviceAreaIndex + 1);
              const locationSlug = locationSegments.join('-');
              
              // Look for "near" in location segments
              for (let i = 0; i < locationSegments.length; i++) {
                if (locationSegments[i].toLowerCase().includes('near')) {
                  // Get segments after "near"
                  const afterNear = locationSegments.slice(i + 1);
                  if (afterNear.length > 0) {
                    const locationText = afterNear.join('-').replace(/[-_]/g, ' ');
                    const locationParts = locationText.split(/\s+/);
                    
                    // Try to identify city and state (last word might be state if 2+ chars)
                    if (locationParts.length >= 2) {
                      const possibleCity = locationParts.slice(0, -1).join(' ');
                      const possibleState = locationParts[locationParts.length - 1];
                      const city = possibleCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                      urlLocationMatches.push(possibleState.length >= 2 ? `${city}, ${possibleState.charAt(0).toUpperCase() + possibleState.slice(1).toLowerCase()}` : city);
                    } else if (locationParts.length === 1) {
                      const city = locationParts[0].charAt(0).toUpperCase() + locationParts[0].slice(1).toLowerCase();
                      urlLocationMatches.push(city);
                    }
                  }
                  break;
                }
              }
            }
          } catch (error) {
            // Skip invalid URLs
          }
        }
        
        // Use the first regex match if found
        if (urlLocationMatches.length > 0) {
          primaryCity = urlLocationMatches[0];
          console.log(`[Entity Generation] Regex extracted location from URLs: "${primaryCity}"`);
        } else {
          // If regex didn't work, use AI to extract location from URL slugs
          console.log('[Entity Generation] Regex patterns failed, using AI to extract location from URLs...');
          
          // Collect URL slugs for AI analysis
          const urlSlugsForAnalysis: string[] = [];
          for (const url of parseResult.urls.slice(0, 10)) { // Limit to first 10 URLs
            try {
              const urlObj = new URL(url);
              const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
              const serviceAreaIndex = pathSegments.findIndex(seg => 
                seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
              );
              
              if (serviceAreaIndex >= 0 && serviceAreaIndex < pathSegments.length - 1) {
                const locationSegments = pathSegments.slice(serviceAreaIndex + 1);
                if (locationSegments.length > 0) {
                  const locationSlug = locationSegments.join('-');
                  // Decode and clean up the slug
                  const readableSlug = decodeURIComponent(locationSlug)
                    .replace(/[-_]/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                  urlSlugsForAnalysis.push(readableSlug);
                }
              } else if (pathSegments.length > 0) {
                const lastSegment = pathSegments[pathSegments.length - 1];
                if (lastSegment && !lastSegment.includes('.xml') && !lastSegment.includes('.html')) {
                  const readableSlug = decodeURIComponent(lastSegment)
                    .replace(/[-_]/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                  urlSlugsForAnalysis.push(readableSlug);
                }
              }
            } catch (error) {
              // Skip invalid URLs
            }
          }
          
          if (urlSlugsForAnalysis.length > 0) {
            try {
              const urlAnalysisPrompt = `Extract the location (city, state, or geographic area) from these service-area URL slugs:

${urlSlugsForAnalysis.slice(0, 5).map((slug, i) => `${i + 1}. ${slug}`).join('\n')}

These URLs are from a service-area sitemap. They typically contain patterns like:
- "Window Treatments, Blinds, and Shades Near Opa-locka, Florida"
- "[Service] Near [City], [State]"
- "[Service] Near [City]"

Extract ONLY the location name (city, state, or geographic area). Look for:
- City names followed by state names (e.g., "Opa-locka, Florida" → "Opa-locka, Florida" or "Opa-locka")
- City names alone (e.g., "Calgary", "Edmonton")
- State names if no city is found (e.g., "Florida", "California")

Return ONLY the location name (properly capitalized) or "none" if no location can be determined.
Examples:
- "Window Treatments Near Opa-locka, Florida" → "Opa-locka, Florida" or "Opa-locka"
- "Service Near Miami, Florida" → "Miami, Florida" or "Miami"
- "Service Near Calgary" → "Calgary"

Return ONLY the location name or "none", nothing else.`;

              let aiLocationResponse = '';
              await streamChatCompletion({
                apiKey: openRouterApiKey,
                model: getResearchModel(),
                messages: [
                  {
                    role: 'system',
                    content: 'You are a location extraction expert. Extract city/location names from URL slugs. Return only the location name (capitalized) or "none".'
                  },
                  {
                    role: 'user',
                    content: urlAnalysisPrompt
                  }
                ],
                temperature: 0.2,
                maxTokens: 50,
                topP: 0.9,
                onContentChunk: (chunk) => {
                  aiLocationResponse += chunk;
                }
              });

              aiLocationResponse = aiLocationResponse.trim().toLowerCase();
              aiLocationResponse = aiLocationResponse.replace(/^["']|["']$/g, '');
              
              if (aiLocationResponse && aiLocationResponse !== 'none' && aiLocationResponse.length > 1) {
                // Capitalize properly (handle multi-word cities like "New York", "Opa-locka")
                primaryCity = aiLocationResponse
                  .split(' ')
                  .map(word => {
                    // Handle hyphenated cities like "Opa-locka"
                    if (word.includes('-')) {
                      return word.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
                    }
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                  })
                  .join(' ');
                
                console.log(`[Entity Generation] AI extracted location from URLs: "${primaryCity}"`);
              } else {
                console.warn('[Entity Generation] AI could not extract location from URLs');
              }
            } catch (error) {
              console.warn('[Entity Generation] Error extracting location from URLs with AI:', error);
            }
          }
        }
      }
      
      // Step 0: Extract location from prompt modifier if it specifies one (user's explicit instruction takes ABSOLUTE priority)
      let modifierLocation: string | null = null;
      if (promptModifier) {
        // Extract location from modifier - look for patterns like "in calgary", "in Wisconsin", "streets in wisconsin", etc.
        // Use AI to extract location to handle various formats (cities, states, provinces, countries, regions)
        const locationExtractionPrompt = `Extract the location name from this user query: "${promptModifier}"

The query may contain:
- A specific location: city (e.g., "calgary", "Edmonton", "Toronto", "New York"), state/province (e.g., "Wisconsin", "California", "Ontario", "Alberta"), country (e.g., "United States", "Canada"), or region
- Entity type (e.g., "streets", "neighborhoods", "areas", "cities")
- Criteria (e.g., "high income", "south", "downtown")

Examples:
- "streets in calgary" → "Calgary"
- "streets in wisconsin" → "Wisconsin"
- "high income neighborhoods in Edmonton" → "Edmonton"  
- "neighborhoods in Toronto" → "Toronto"
- "areas in New York" → "New York"
- "cities in California" → "California"
- "streets in United States" → "United States"
- "calgary streets" → "Calgary"
- "streets calgary" → "Calgary"
- "wisconsin streets" → "Wisconsin"

Extract ONLY the location name (city, state, province, country, or region). If no location is found, return "none".
Return ONLY the location name (properly capitalized) or "none", nothing else.`;

        try {
          let locationResponse = '';
          await streamChatCompletion({
            apiKey: openRouterApiKey,
            model: getResearchModel(),
            messages: [
              {
                role: 'system',
                content: 'You are a location extraction expert. Extract city/location names from user queries. Return only the location name (capitalized) or "none".'
              },
              {
                role: 'user',
                content: locationExtractionPrompt
              }
            ],
            temperature: 0.2,
            maxTokens: 50,
            topP: 0.9,
            onContentChunk: (chunk) => {
              locationResponse += chunk;
            }
          });

          locationResponse = locationResponse.trim().toLowerCase();
          locationResponse = locationResponse.replace(/^["']|["']$/g, '');
          
          if (locationResponse && locationResponse !== 'none' && locationResponse.length > 1) {
            // Capitalize properly (handle multi-word cities like "New York")
            modifierLocation = locationResponse
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            
            console.log(`[Entity Generation] AI extracted location from modifier: "${modifierLocation}"`);
          }
        } catch (error) {
          console.warn('[Entity Generation] Error extracting location from modifier with AI, trying regex fallback:', error);
          // Fallback to regex patterns - check for common city names first
          const cityPatterns = [
            /\bcalgary\b/i,
            /\bedmonton\b/i,
            /\btoronto\b/i,
            /\bvancouver\b/i,
            /\bmontreal\b/i,
            /\bottawa\b/i,
            /\bwinnipeg\b/i,
            /\bhalifax\b/i,
            /\bvictoria\b/i,
            /\bsaskatoon\b/i,
            /\bregina\b/i,
          ];
          
          // Try "in [location]" pattern first - this catches "in wisconsin", "in calgary", etc.
          const inLocationPattern = /\bin\s+((?:the\s+)?(?:United\s+States|US|USA|Canada|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))\b/i;
          const inMatch = promptModifier.match(inLocationPattern);
          
          if (inMatch && inMatch[1]) {
            modifierLocation = inMatch[1].trim();
            // Normalize common variations
            if (modifierLocation.toLowerCase().includes('united states') || 
                modifierLocation.toLowerCase() === 'us' || 
                modifierLocation.toLowerCase() === 'usa') {
              modifierLocation = 'United States';
            } else if (modifierLocation.toLowerCase() === 'canada') {
              modifierLocation = 'Canada';
            } else {
              // Capitalize properly (handle multi-word like "New York", "Wisconsin")
              modifierLocation = modifierLocation
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            }
            console.log(`[Entity Generation] Regex extracted location from "in" pattern: "${modifierLocation}"`);
          } else {
            // Try direct location mentions - check for all US states, Canadian provinces, major cities
            const allStatesAndProvinces = /(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|Alberta|British\s+Columbia|Manitoba|New\s+Brunswick|Newfoundland|Nova\s+Scotia|Ontario|Prince\s+Edward\s+Island|Quebec|Saskatchewan|Calgary|Edmonton|Toronto|Vancouver|Montreal|Ottawa|Winnipeg|Halifax|Victoria|Saskatoon|Regina)/i;
            const locationMatch = promptModifier.match(allStatesAndProvinces);
            
            if (locationMatch && locationMatch[0]) {
              modifierLocation = locationMatch[0]
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              console.log(`[Entity Generation] Regex extracted location from direct mention: "${modifierLocation}"`);
            } else {
              // Try city patterns as last resort
              for (const pattern of cityPatterns) {
                const match = promptModifier.match(pattern);
                if (match) {
                  modifierLocation = match[0];
                  modifierLocation = modifierLocation.charAt(0).toUpperCase() + modifierLocation.slice(1).toLowerCase();
                  console.log(`[Entity Generation] Regex extracted city name: "${modifierLocation}"`);
                  break;
                }
              }
            }
          }
        }
        
        // CRITICAL: If modifier specifies a location, use that instead of detected city - ABSOLUTE PRIORITY
        if (modifierLocation && modifierLocation !== 'none') {
          const originalCity = primaryCity;
          console.log(`[Entity Generation] ✓ User specified location in modifier: "${modifierLocation}" - OVERRIDING detected city: "${originalCity}" (ABSOLUTE PRIORITY)`);
          primaryCity = modifierLocation;
        } else {
          // Check if modifier clearly mentions a location but we failed to extract it
          const hasLocationKeywords = /\b(calgary|edmonton|toronto|vancouver|montreal|ottawa|winnipeg|halifax|victoria|saskatoon|regina|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas)\b/i.test(promptModifier);
          if (hasLocationKeywords) {
            console.warn(`[Entity Generation] WARNING: Modifier "${promptModifier}" appears to mention a location but extraction failed. Using sitemap-detected city: "${primaryCity}"`);
          } else {
            console.log(`[Entity Generation] No location found in modifier: "${promptModifier}", using sitemap-detected city: "${primaryCity}"`);
          }
        }
      }
      
      // Analyze title format from existing URLs
      let suggestedTitleFormat = '';
      if (parseResult.urls.length > 0 && existingEntities.length > 0) {
        const serviceName = site.name;
        
        // Common patterns: "[Service] Near [Location]", "[Service] in [Location]", "[Service] [Location]"
        if (parseResult.urls.some(url => url.toLowerCase().includes('near'))) {
          suggestedTitleFormat = `${serviceName} Near {entity}`;
        } else if (parseResult.urls.some(url => url.toLowerCase().includes('in'))) {
          suggestedTitleFormat = `${serviceName} in {entity}`;
        } else {
          // Default pattern based on common SEO practices
          suggestedTitleFormat = `${serviceName} Near {entity}`;
        }
      } else {
        // Fallback default
        suggestedTitleFormat = `${site.name} Near {entity}`;
      }

      // Step 1: Find Wikipedia category pages for the geographic area
      if (!primaryCity) {
        notify.error(NOTIFY_COULD_NOT_DETERMINE_GEOGRAPHIC_AREA_FROM);
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }

      // Step 1a: If prompt modifier exists, use DataForSEO to search Google for entities
      // This is more accurate than Wikipedia category pages for specific criteria
      let entitiesFromGoogle: string[] = [];
      let researchQuestion = ''; // Declare in outer scope for use in retry logic
      const MCP_API_BASE = import.meta.env.VITE_MCP_API_BASE || 
        (import.meta.env.DEV ? 'http://localhost:3001/api/mcp' : '/api/mcp');
      // searchLocation will be set after location extraction
      
      if (promptModifier && promptModifier.trim()) {
        notify.info(notifyUsingDataforseoToSearchGoogleForEn(promptModifier));
        
        try {
          // First, generate a research-style question using AI, considering existing entities from sitemap
          // CRITICAL: primaryCity has been set from the modifier location extraction above, so it should be the correct location
          const researchQuestionPrompt = `Generate a Google search question to find entities matching: "${promptModifier}"

CRITICAL: The user's modifier "${promptModifier}" specifies the location: "${primaryCity}"
- You MUST use "${primaryCity}" in the search question
- DO NOT use any other location
- The modifier "${promptModifier}" is the source of truth - use it exactly

Existing entities already on the site (DO NOT suggest these):
${existingEntities.slice(0, 50).join(', ')}

Your task:
1. Create a natural Google search question that would return a list of entities matching "${promptModifier}"
2. The location MUST be "${primaryCity}" (extracted from the modifier)
3. Format it as a question people would actually search on Google
4. Make sure the question would return actual entity names (${promptModifier.toLowerCase().includes('street') ? 'street names' : promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhood names' : 'entity names'}) not just general information
5. Include "${primaryCity}" in the question to ensure results are location-specific

Return ONLY the search question, nothing else. Make it natural and searchable.
${promptModifier.toLowerCase().includes('street') && primaryCity ? `Example for "streets in ${primaryCity}": "list of streets in ${primaryCity}" or "streets in ${primaryCity}"` : promptModifier.toLowerCase().includes('neighborhood') && primaryCity ? `Example for "neighborhoods in ${primaryCity}": "list of neighborhoods in ${primaryCity}"` : `Example: "list of ${promptModifier} in ${primaryCity}"`}`;

          let researchQuestionResponse = '';
          await streamChatCompletion({
            apiKey: openRouterApiKey,
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

          researchQuestion = researchQuestionResponse.trim().replace(/^["']|["']$/g, '').trim();
          console.log(`[Entity Generation] Generated research question: "${researchQuestion}"`);

          if (researchQuestion && researchQuestion.length > 10) {
            // Use DataForSEO to search Google with this question
            // Use the location from modifier (primaryCity has been updated above if modifier specified location)
            const searchLocationForQuery = primaryCity || "United States";
            console.log(`[Entity Generation] Searching Google with location: "${searchLocationForQuery}" for question: "${researchQuestion}"`);
            
            notify.info(notifySearchingGoogleForX(researchQuestion));
            
            const serpResponse = await fetch(`${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keyword: researchQuestion,
                location_name: searchLocationForQuery, // Use the location from modifier (e.g., "Wisconsin" for "streets in wisconsin")
                language_code: "en",
                depth: 20, // Get more results
                people_also_ask_click_depth: 4, // Get maximum PAA questions (4 clicks deep)
              }),
            });

            if (serpResponse.ok) {
              const serpData = await serpResponse.json();
              console.log('[Entity Generation] SERP data received:', serpData);

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

              console.log(`[Entity Generation] Found ${organicResults.length} organic search results`);

              if (organicResults.length > 0) {
                // Use AI to extract entities from SERP results
                const serpContent = organicResults.slice(0, 30).map((r, i) => 
                  `${i + 1}. Title: ${r.title}\n   Description: ${r.description || 'N/A'}\n   URL: ${r.url || 'N/A'}`
                ).join('\n\n');

                const entityExtractionPrompt = `Extract entity names from these Google search results for: "${promptModifier}"

**ABSOLUTELY FORBIDDEN - NEVER EXTRACT THESE AS ENTITIES**:
1. **NEVER extract years or dates** - Entities CANNOT be years (e.g., "2024", "2023", "2025") or dates (e.g., "January 2024", "2024-01-01") of ANY kind. If you see a year or date, IGNORE it completely.
2. **NEVER extract personal entities** - Entities CANNOT be personal possessive phrases like "Your Home", "My Home", "The Home", "Your House", "My House", "Your Big Day", "My Big Day", "Your Special Day", "My Event", "Your Business", "My Business", or ANY phrase starting with "Your", "My", or "The" followed by a generic term. These are NOT geographic locations.
3. **NEVER extract numbers-only entities** - Entities CANNOT be just numbers (e.g., "2024", "123", "456"). These are rejected.

CRITICAL LOCATION REQUIREMENT: The user requested "${promptModifier}" which specifies location: "${searchLocationForQuery}"
- ONLY extract entities that are IN or FROM "${searchLocationForQuery}" 
- DO NOT extract entities from other cities/locations/states
- Example: If searching for "streets in Wisconsin", ONLY extract Wisconsin streets, NOT from other states
- Example: If searching for "streets in Calgary", ONLY extract Calgary streets, NOT Edmonton, Toronto, or any other city
- If search results mention entities from other locations, IGNORE them completely

Entity type requested: ${promptModifier.toLowerCase().includes('street') ? 'streets' : promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhoods' : 'locations/entities'}

Search Results:
${serpContent}

Existing entities already on the site (DO NOT extract these):
${existingEntities.slice(0, 30).join(', ')}

Your task:
1. Extract ONLY geographic location entities from "${searchLocationForQuery}" (e.g., ${promptModifier.toLowerCase().includes('street') ? `${searchLocationForQuery} street names` : promptModifier.toLowerCase().includes('neighborhood') ? `${searchLocationForQuery} neighborhoods` : `${searchLocationForQuery} entities`})
2. Focus on entities that match "${promptModifier}" and are located in "${searchLocationForQuery}"
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
                  apiKey: openRouterApiKey,
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
                    entitiesFromGoogle = extracted
                      .filter((e: string) => e && typeof e === 'string' && e.trim().length > 2)
                      .filter((e: string) => {
                        const isValid = isValidEntity(e.trim());
                        if (!isValid) {
                          console.log(`[Entity Generation] Filtered out invalid entity: "${e}"`);
                        }
                        return isValid;
                      });
                    
                    console.log(`[Entity Generation] Extracted ${entitiesFromGoogle.length} valid entities from Google search results (filtered from ${extracted.length} total)`);
                  }
                } catch (parseError) {
                  console.warn('[Entity Generation] Failed to parse entity extraction response:', parseError);
                  // Try to extract JSON array from response
                  const jsonMatch = entityExtractionResponse.match(/\[.*\]/s);
                  if (jsonMatch) {
                    try {
                      entitiesFromGoogle = JSON.parse(jsonMatch[0]);
                    } catch (e) {
                      console.warn('[Entity Generation] Could not parse extracted JSON');
                    }
                  }
                }
              }
            } else {
              console.warn('[Entity Generation] SERP request failed:', await serpResponse.text());
            }
          }
        } catch (error) {
          console.warn('[Entity Generation] Error using DataForSEO search:', error);
          notify.error(NOTIFY_DATAFORSEO_SEARCH_FAILED_FALLING_BACK_TO);
        }
      }

      // Step 2: If we have entities from Google, USE THEM DIRECTLY - NO WIKIPEDIA SEARCH AT ALL
      let allCategoryPages: string[] = [];
      let validatedEntities: string[] = [];
      let selectedPageTitle = '';
      let categoryPages: string[] = [];
      
      if (entitiesFromGoogle.length > 0) {
        console.log(`[Entity Generation] ✓ Using ${entitiesFromGoogle.length} entities from Google search - COMPLETELY SKIPPING Wikipedia category/search (we already have the data!)`);
        validatedEntities = entitiesFromGoogle;
        selectedPageTitle = `Google search results for "${promptModifier}"`;
        // DO NOT search Wikipedia at all - we have entities from Google!
      } else {
        // Wikipedia fallback path - only runs if we DON'T have Google entities
        if (promptModifier && promptModifier.trim()) {
          notify.info(notifyUsingAiToFindSimilarWikipediaList(promptModifier));
          
          // First, check for common direct patterns that match the modifier
          const modifierLower = promptModifier.toLowerCase();
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
              allCategoryPages.push(pageTitle);
              console.log(`[Entity Generation] Found direct match: ${pageTitle}`);
            }
          }
          
          // Use AI to find similar Wikipedia list pages based on the modifier
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
              
              // Search for these specific pages
              for (const pageTitle of suggestedPages) {
                // Check if it's a pattern or actual page title
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
                    // Try searching for it
                    const searchResults = await searchWikipediaPages(pageTitle);
                    allCategoryPages.push(...searchResults);
                  }
                }
              }
            }
          } catch (parseError) {
            console.warn('[Entity Generation] Failed to parse AI suggestions, falling back to search');
          }
          
          // Also do a direct Wikipedia search as fallback - use the modifier directly
          const searchQuery = promptModifier; // Use modifier directly, don't append city
          const searchResults = await searchWikipediaPages(searchQuery);
          allCategoryPages.push(...searchResults);
          console.log(`[Entity Generation] Found ${searchResults.length} pages from direct Wikipedia search: "${searchQuery}"`);
        }

        // Step 1b: Find Wikipedia category pages (only if no modifier or modifier doesn't specify location)
        // If modifier specifies a location, skip category search to avoid conflicting results
        if (!modifierLocation) {
          notify.info(notifyFindingWikipediaCategoryPagesForXP(primaryCity, promptModifier || undefined));
          categoryPages = await getWikipediaCategoryPages(primaryCity, promptModifier);
        } else {
          console.log(`[Entity Generation] Skipping category search - modifier specifies location: "${modifierLocation}"`);
        }
        
        // Fallback to Wikipedia category/list page approach
        if (categoryPages.length === 0 && allCategoryPages.length === 0 && !promptModifier) {
          notify.error(notifyNoWikipediaPagesFoundForXTryAddin(primaryCity));
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }

        console.log(`[Entity Generation] Found ${categoryPages.length} Wikipedia categories:`, categoryPages);

        // Step 2: Get pages in each category
        if (categoryPages.length > 0) {
          notify.info(NOTIFY_GETTING_PAGES_FROM_WIKIPEDIA_CATEGORIES);
          for (const category of categoryPages) {
            const pages = await getPagesInCategory(category);
            allCategoryPages.push(...pages);
          }
        }

        // Remove duplicates
        allCategoryPages = Array.from(new Set(allCategoryPages));

        console.log(`[Entity Generation] Found ${allCategoryPages.length} total pages from categories and search`);

        // Step 3: Use AI to choose which category/list page to use
        const urlsList = parseResult.urls.slice(0, 20).join('\n');
      
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
        
        // Check if AI said "none are suitable" or similar
        const negativePhrases = ['none', 'not suitable', 'no suitable', 'cannot find', 'unable to', 'no pages'];
        const hasNegativePhrase = negativePhrases.some(phrase => 
          selectionResponse.toLowerCase().includes(phrase)
        );
        
        // Try to extract the page title
        let titleMatch = selectionResponse.match(/"([^"]+)"/) || 
                        selectionResponse.match(/^([^\n]+)/) ||
                        selectionResponse.match(/List of [^\n]+/i);
        
        if (titleMatch) {
          selectedPageTitle = titleMatch[1]?.trim() || titleMatch[0]?.trim() || '';
        }
        
        // Validate the selected page title
        const isValidTitle = selectedPageTitle && 
                            selectedPageTitle.length > 3 &&
                            !hasNegativePhrase &&
                            !negativePhrases.some(phrase => selectedPageTitle.toLowerCase().includes(phrase));
        
        if (!isValidTitle) {
          // Fallback: try to find a valid page from the list that matches the modifier
          console.warn('[Entity Generation] AI returned invalid page title, using fallback');
          
          // First, try to find pages that match the modifier keywords
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
            console.log(`[Entity Generation] Using modifier-matching fallback page: ${selectedPageTitle}`);
          } else {
            // Try to find pages with "List of" in the title
            const listPages = allCategoryPages.filter(p => 
              p.toLowerCase().includes('list') && 
              p.length > 5 &&
              !p.toLowerCase().includes('category:')
            );
            
            if (listPages.length > 0) {
              selectedPageTitle = listPages[0];
              console.log(`[Entity Generation] Using fallback page: ${selectedPageTitle}`);
            } else if (allCategoryPages.length > 0) {
              // Use any available page
              selectedPageTitle = allCategoryPages.find(p => !p.toLowerCase().includes('category:')) || allCategoryPages[0];
              console.log(`[Entity Generation] Using first available page: ${selectedPageTitle}`);
            }
          }
        }

        if (!selectedPageTitle || selectedPageTitle.length < 3) {
          notify.error(NOTIFY_COULD_NOT_SELECT_A_WIKIPEDIA_LIST_PAGE_P);
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }

        // Verify the page exists before proceeding
        console.log(`[Entity Generation] Selected Wikipedia page: ${selectedPageTitle}`);
        const pageExistsCheck = await checkWikipediaPageExists(selectedPageTitle);
        if (!pageExistsCheck.exists) {
          console.warn(`[Entity Generation] Selected page doesn't exist, trying alternatives...`);
          
          // Try alternative pages
          const alternatives = allCategoryPages
            .filter(p => p.toLowerCase().includes('list') && !p.toLowerCase().includes('category:'))
            .slice(0, 5);
          
          for (const altPage of alternatives) {
            const altCheck = await checkWikipediaPageExists(altPage);
            if (altCheck.exists) {
              selectedPageTitle = altPage;
              console.log(`[Entity Generation] Using alternative page: ${selectedPageTitle}`);
              break;
            }
          }
          
          // Final check
          const finalCheck = await checkWikipediaPageExists(selectedPageTitle);
          if (!finalCheck.exists) {
            notify.error(notifyWikipediaPageXNotFoundPleaseTryA(selectedPageTitle));
            setIsGeneratingEntities(prev => {
              const updated = { ...prev };
              delete updated[generatingKey];
              return updated;
            });
            return;
          }
        }

        // Step 4: Extract entities from the selected Wikipedia list page using AI
        notify.info(notifyUsingAiToExtractEntitiesFromWikipe(selectedPageTitle));
        
        // First, get the raw Wikipedia content to help AI extract entities
        const rawWikipediaEntities = await extractEntitiesFromWikipediaList(selectedPageTitle);
      
        // Also fetch the page content for AI analysis
        let wikipediaPageContent = '';
        try {
          const contentChunks = await fetchWikipediaContent(selectedPageTitle);
          wikipediaPageContent = contentChunks.map(chunk => chunk.text).join('\n\n').substring(0, 5000); // Limit to first 5000 chars
        } catch (error) {
          console.warn('[Entity Generation] Could not fetch full Wikipedia content, using extracted entities only');
        }

        // Use AI to extract ALL actual cities/entities from the Wikipedia list page
        // DO NOT filter by criteria here - we'll validate criteria later using individual Wikipedia pages
        const entityExtractionPrompt = `I need to extract ALL actual cities/entities from this Wikipedia list page: "${selectedPageTitle}"

${wikipediaPageContent ? `Page content preview:\n${wikipediaPageContent.substring(0, 2000)}...` : ''}

${rawWikipediaEntities.length > 0 ? `\nRaw extracted entities (may include non-entities):\n${rawWikipediaEntities.slice(0, 100).map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

${existingEntities.length > 0 ? `\nExisting entities on the site (avoid exact matches):\n${existingEntities.slice(0, 30).join(', ')}` : ''}

Your task:
1. Extract ALL actual cities, locations, or entities from this Wikipedia list page
   ${promptModifier ? `Note: User query "${promptModifier}" mentions "${selectedPageTitle}" - extract ALL entities from this list page. We will validate criteria later using individual Wikipedia pages.` : 'Extract any geographic entities (cities, towns, neighborhoods, districts, etc.)'}
2. Filter out non-entities (table headers, metadata, "See also" links, etc.)
3. ${existingEntities.length > 0 ? `Exclude entities that exactly match existing ones (case-insensitive comparison)` : 'Include all valid entities'}
4. Return clean entity names (remove extra formatting, parentheses with notes, etc.)
5. DO NOT filter by criteria like "high income", "south", etc. - extract ALL entities. Criteria validation will happen later.

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

        // If no entities found, try raw extraction as fallback
        if (validatedEntities.length === 0 && rawWikipediaEntities.length > 0) {
          console.warn('[Entity Generation] AI extraction returned no entities, using raw entities');
          validatedEntities = rawWikipediaEntities.slice(0, 100); // Limit raw entities
        }

        if (validatedEntities.length === 0) {
          // Try to get more information about why
          let errorMessage = `No entities found in Wikipedia page: "${selectedPageTitle}"`;
          
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
          setIsGeneratingEntities(prev => {
            const updated = { ...prev };
            delete updated[generatingKey];
            return updated;
          });
          return;
        }

        console.log(`[Entity Generation] Extracted ${validatedEntities.length} entities from Wikipedia page "${selectedPageTitle}"`);
        console.log(`[Entity Generation] Note: Criteria validation (e.g., "${promptModifier}") will happen later using individual Wikipedia pages`);
      }

      // Step 5.5: Check for conflicts with scheduled posts
      let scheduledPostTitles: string[] = [];
      try {
        notify.info(NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS);
        const scheduledResult = await getScheduledPosts(
          site.siteUrl,
          site.username,
          site.appPassword,
          undefined,
          undefined,
          true // Get all scheduled posts
        );
        if (scheduledResult.posts && scheduledResult.posts.length > 0) {
          scheduledPostTitles = scheduledResult.posts.map(post => post.title?.toLowerCase() || '');
          console.log(`[Entity Generation] Checking against ${scheduledPostTitles.length} scheduled posts`);
        }
      } catch (error) {
        console.warn('[Entity Generation] Could not fetch scheduled posts for conflict checking:', error);
      }

      // Step 6: Filter out conflicts with existing entities (sitemap + Origin ACF); uses prefix/substring match so e.g. "Garden City" excludes "Garden City, Winnipeg"
      const conflictResult = checkConflicts(validatedEntities, existingEntities, scheduledPostTitles);
      const nonConflictingEntities = conflictResult.nonConflictingEntities;
      const conflictWithExistingCount = conflictResult.conflictStats.conflictWithExistingCount;
      const conflictWithPostsCount = conflictResult.conflictStats.conflictWithPostsCount;

      console.log(`[Entity Generation] After conflict filtering: ${nonConflictingEntities.length} entities remain (${conflictWithExistingCount} conflicted with existing, ${conflictWithPostsCount} conflicted with scheduled posts)`);

      // Step 6.5: Validate entities are NOT in sitemap (filter out existing ones)
      let sitemapFilteredCount = 0;
      const entitiesNotInSitemap = nonConflictingEntities.filter(entity => {
        const notInSitemap = validateEntityNotInSitemap(entity, parseResult.urls);
        if (!notInSitemap) {
          sitemapFilteredCount++;
        }
        return notInSitemap;
      });

      console.log(`[Entity Generation] After sitemap validation: ${entitiesNotInSitemap.length} entities remain (${sitemapFilteredCount} filtered out as they exist in sitemap)`);

      if (entitiesNotInSitemap.length === 0) {
        notify.error(notifyAllEntitiesWereFilteredOutXConflic(conflictWithExistingCount, conflictWithPostsCount, sitemapFilteredCount));
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }

      // Step 7: Select entities for Wikipedia validation
      // We need to select more entities than needed because:
      // 1. Some may not have Wikipedia pages
      // 2. Some may not match criteria after Wikipedia validation
      let selectedEntities = entitiesNotInSitemap;
      
      // Select 2-3x the requested count to account for filtering
      const selectionMultiplier = promptModifier ? 3 : 2; // More entities needed if we're filtering by criteria
      if (entitiesNotInSitemap.length > count * selectionMultiplier) {
        // Randomly shuffle and select
        const shuffled = [...entitiesNotInSitemap].sort(() => Math.random() - 0.5);
        selectedEntities = shuffled.slice(0, count * selectionMultiplier);
        console.log(`[Entity Generation] Selected ${selectedEntities.length} entities from ${entitiesNotInSitemap.length} available for Wikipedia validation`);
      } else {
        // Use all available entities
        selectedEntities = entitiesNotInSitemap;
        console.log(`[Entity Generation] Using all ${selectedEntities.length} entities for Wikipedia validation`);
      }

      // Format entities (add city if needed)
      const filteredWikipediaEntities = selectedEntities
        .map(entity => {
          // Format: add city if not present and primaryCity exists
          if (primaryCity && !entity.toLowerCase().includes(primaryCity.toLowerCase())) {
            return `${entity} ${primaryCity}`;
          }
          return entity;
        });

      if (filteredWikipediaEntities.length === 0) {
        notify.error(notifyAllXValidatedEntitiesWereFilteredO(validatedEntities.length, conflictWithExistingCount, conflictWithPostsCount));
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }

      // Step 7.5: Validate entities have Wikipedia pages and validate by criteria
      // Keep retrying until we have enough matching entities
      const entitiesWithWikipedia: EntityWithCriteria[] = [];
      const storageKey = `${site.id}-${entitySitemapUrl}`;
      const processedEntityNames = new Set<string>(); // Track processed entities to avoid duplicates
      let candidatePool = [...entitiesNotInSitemap]; // Pool of candidates to validate
      let currentBatch = filteredWikipediaEntities;
      const maxRetries = 10; // Maximum number of retry batches
      let retryCount = 0;
      
      // Store general criteria info
      if (promptModifier) {
        setGeneralCriteriaInfo(prev => ({
          ...prev,
          [storageKey]: promptModifier
        }));
      }
      
      // Retry loop: keep validating until we have enough matching entities
      while (entitiesWithWikipedia.length < count && retryCount < maxRetries) {
        const batchStartCount = entitiesWithWikipedia.length;
        notify.info(
          notifyValidatingEntitiesWithWikipediaPromp(
            entitiesWithWikipedia.length,
            count,
            promptModifier || undefined
          )
        );
        
        // Process current batch
        for (const entity of currentBatch) {
          if (entitiesWithWikipedia.length >= count) break;
          
          const entityKey = entity.toLowerCase().trim();
          if (processedEntityNames.has(entityKey)) {
            continue; // Skip already processed entities
          }
          processedEntityNames.add(entityKey);
          
          // CRITICAL: Validate entity before processing (reject "Your Home" type entities, allow "hunter douglas")
          if (!isValidEntity(entity)) {
            console.log(`[Entity Generation] ✗ Entity "${entity}" failed validation - REJECTED. Continuing search...`);
            continue; // Skip invalid entities
          }
          
          try {
            let validatedEntity: string = entity;
            let wikiCheck = await checkWikipediaPageExists(entity);
            
            if (!wikiCheck.exists || !wikiCheck.url) {
              // Try without city
              if (primaryCity) {
                const withoutCity = entity.replace(new RegExp(`\\s+${primaryCity}$`, 'i'), '').trim();
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
              if (promptModifier && promptModifier.trim()) {
                try {
                  notify.info(notifyValidatingXAgainstCriteria(validatedEntity));
                  const validationResult = await validateEntityByCriteria(
                    validatedEntity,
                    promptModifier,
                    openRouterApiKey
                  );
                  
                  criteriaData = {
                    matches: validationResult.matches,
                    confidence: validationResult.confidence,
                    extractedData: validationResult.extractedData || {},
                    rankingValue: validationResult.rankingValue
                  };
                  
                  // Store criteria info (store even rejected ones for UI display purposes, but don't include them)
                  setCriteriaInfo(prev => ({
                    ...prev,
                    [storageKey]: {
                      ...(prev[storageKey] || {}),
                      [validatedEntity]: criteriaData
                    }
                  }));
                  
                  // CRITICAL: ONLY include entities where matches === true (STRICT validation)
                  if (validationResult.matches !== true) {
                    console.log(`[Entity Generation] ✗ Entity "${validatedEntity}" does NOT match criteria (matches: ${validationResult.matches}, confidence: ${validationResult.confidence}%) - REJECTED. Continuing search for matching entities...`);
                    continue; // Skip this entity completely - will search for replacement
                  }
                  
                  console.log(`[Entity Generation] ✓ Entity "${validatedEntity}" MATCHES criteria (confidence: ${validationResult.confidence}%) - ACCEPTED [${entitiesWithWikipedia.length + 1}/${count}]`);
                  
                  // Only push to entitiesWithWikipedia if it matches
                  entitiesWithWikipedia.push({
                    entity: validatedEntity,
                    wikipediaUrl: wikiCheck.url,
                    wikipediaTitle: wikiCheck.title,
                    criteriaData
                  });
                } catch (error) {
                  console.warn(`[Entity Generation] Error validating "${validatedEntity}" by criteria:`, error);
                  // If validation fails and we have criteria, skip it (don't include uncertain entities)
                  console.log(`[Entity Generation] ✗ Entity "${validatedEntity}" validation failed - REJECTED. Continuing search...`);
                  continue; // Skip this entity
                }
              } else {
                // No criteria specified - include all entities with Wikipedia pages
                entitiesWithWikipedia.push({
                  entity: validatedEntity,
                  wikipediaUrl: wikiCheck.url,
                  wikipediaTitle: wikiCheck.title,
                  criteriaData: undefined
                });
              }
            } else {
              // Entity doesn't have Wikipedia page - skip it
              console.log(`[Entity Generation] Entity "${entity}" has no Wikipedia page - skipping`);
            }
          } catch (error) {
            console.warn(`[Entity Generation] Error checking Wikipedia for "${entity}":`, error);
          }
        }
        
        // If we have enough matching entities, break
        if (entitiesWithWikipedia.length >= count) {
          break;
        }
        
        // If we didn't get any new matching entities this batch and we still need more, try to get more candidates
        if (entitiesWithWikipedia.length === batchStartCount && entitiesWithWikipedia.length < count) {
          retryCount++;
          
          // Remove already processed entities from candidate pool
          const remainingCandidates = candidatePool.filter(e => {
            const entityKey = e.toLowerCase().trim();
            return !processedEntityNames.has(entityKey) &&
                   !entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
          });
          
          if (remainingCandidates.length === 0) {
            console.warn(`[Entity Generation] No more candidates available from initial pool. Found ${entitiesWithWikipedia.length}/${count} matching entities.`);
            
            // If we haven't exhausted retries and we have Google entities, try getting more from Google
            if (retryCount < maxRetries && entitiesFromGoogle.length > 0 && promptModifier && researchQuestion) {
              console.log(`[Entity Generation] Attempting to get more entities from Google search...`);
              
              // Try a different search query variant
              try {
                const alternativeSearchPrompt = `Generate a different Google search question to find MORE entities matching: "${promptModifier}"

Previous search may have returned limited results. Generate an alternative search query that would find additional entities.
Location: "${primaryCity}"
Entity type: ${promptModifier.toLowerCase().includes('street') ? 'streets' : promptModifier.toLowerCase().includes('neighborhood') ? 'neighborhoods' : 'entities'}

Return ONLY the search question, nothing else.`;

                let altSearchResponse = '';
                await streamChatCompletion({
                  apiKey: openRouterApiKey,
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
                if (altSearchQuestion && altSearchQuestion.length > 10 && altSearchQuestion !== researchQuestion) {
                  console.log(`[Entity Generation] Trying alternative search: "${altSearchQuestion}"`);
                  notify.info(NOTIFY_SEARCHING_FOR_MORE_ENTITIES_WITH_ALTERNA);
                  
                  // Search again with alternative query - use primaryCity which has the correct location from modifier
                  const altSearchLocation = primaryCity || "United States";
                  const altSerpResponse = await fetch(`${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`, {
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

                      const altExtractionPrompt = `Extract entity names from these Google search results for: "${promptModifier}"

CRITICAL: Only extract entities from "${altSearchLocation}". Ignore entities from other locations.

Search Results:
${altSerpContent}

Return ONLY a JSON array of entity names from "${altSearchLocation}".`;

                      let altExtractionResponse = '';
                      await streamChatCompletion({
                        apiKey: openRouterApiKey,
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
                                   !processedEntityNames.has(entityKey) &&
                                   !entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey) &&
                                   !existingEntities.some(existing => existing.toLowerCase().trim() === entityKey);
                          });
                          
                          if (newCandidates.length > 0) {
                            candidatePool.push(...newCandidates);
                            console.log(`[Entity Generation] Added ${newCandidates.length} new candidates from alternative search`);
                          }
                        }
                      } catch (parseError) {
                        console.warn('[Entity Generation] Failed to parse alternative extraction response');
                      }
                    }
                  }
                }
              } catch (error) {
                console.warn('[Entity Generation] Error getting alternative search results:', error);
              }
              
              // If we still have no candidates after trying alternative search, break
              const stillRemaining = candidatePool.filter(e => {
                const entityKey = e.toLowerCase().trim();
                return !processedEntityNames.has(entityKey) &&
                       !entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
              });
              
              if (stillRemaining.length === 0) {
                console.warn(`[Entity Generation] Exhausted all candidate sources. Found ${entitiesWithWikipedia.length}/${count} matching entities.`);
                break;
              }
              
              // Use the newly added candidates
              const nextBatchSize = Math.min(count * 2, stillRemaining.length);
              const shuffled = [...stillRemaining].sort(() => Math.random() - 0.5);
              currentBatch = shuffled.slice(0, nextBatchSize)
                .map(entity => {
                  if (primaryCity && !entity.toLowerCase().includes(primaryCity.toLowerCase())) {
                    return `${entity} ${primaryCity}`;
                  }
                  return entity;
                });
              continue; // Continue with the new batch
            }
            
            break; // No more candidates available
          }
          
          // Get next batch from remaining candidates
          const nextBatchSize = Math.min(count * 2, remainingCandidates.length);
          const shuffled = [...remainingCandidates].sort(() => Math.random() - 0.5);
          currentBatch = shuffled.slice(0, nextBatchSize)
            .map(entity => {
              // Format: add city if not present and primaryCity exists
              if (primaryCity && !entity.toLowerCase().includes(primaryCity.toLowerCase())) {
                return `${entity} ${primaryCity}`;
              }
              return entity;
            });
          
          console.log(`[Entity Generation] Retry ${retryCount}: Validating ${currentBatch.length} more candidates to find ${count - entitiesWithWikipedia.length} more matching entities`);
        } else {
          // We got some matches, continue with remaining candidates
          const remainingInBatch = currentBatch.filter(e => {
            const entityKey = e.toLowerCase().trim();
            return !processedEntityNames.has(entityKey);
          });
          if (remainingInBatch.length === 0) {
            // Get more from candidate pool
            const remainingCandidates = candidatePool.filter(e => {
              const entityKey = e.toLowerCase().trim();
              return !processedEntityNames.has(entityKey) &&
                     !entitiesWithWikipedia.some(existing => existing.entity.toLowerCase().trim() === entityKey);
            });
            if (remainingCandidates.length === 0) {
              break;
            }
            const nextBatchSize = Math.min(count * 2, remainingCandidates.length);
            const shuffled = [...remainingCandidates].sort(() => Math.random() - 0.5);
            currentBatch = shuffled.slice(0, nextBatchSize)
              .map(entity => {
                if (primaryCity && !entity.toLowerCase().includes(primaryCity.toLowerCase())) {
                  return `${entity} ${primaryCity}`;
                }
                return entity;
              });
          } else {
            currentBatch = remainingInBatch;
          }
        }
      }

      // CRITICAL: Filter entities that match criteria (if criteria specified)
      // STRICT: Only include entities where matches === true (no exceptions, no undefined, no false)
      const entitiesMatchingCriteria = promptModifier 
        ? entitiesWithWikipedia.filter(e => {
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
        : entitiesWithWikipedia;
      
      console.log(`[Entity Generation] Found ${entitiesWithWikipedia.length} entities with Wikipedia pages${promptModifier ? `, ${entitiesMatchingCriteria.length} matching criteria "${promptModifier}"` : ''}`);
      
      // Sort by ranking value if criteria validation provided ranking
      if (promptModifier && entitiesMatchingCriteria.some(e => e.criteriaData?.rankingValue !== undefined)) {
        entitiesMatchingCriteria.sort((a, b) => {
          const rankA = a.criteriaData?.rankingValue ?? 0;
          const rankB = b.criteriaData?.rankingValue ?? 0;
          return rankB - rankA; // Sort descending (highest first)
        });
        console.log(`[Entity Generation] Sorted entities by ranking value`);
      } else if (entitiesMatchingCriteria.length > count) {
        // If no ranking, sort by confidence (if available) or randomly
        entitiesMatchingCriteria.sort((a, b) => {
          const confA = a.criteriaData?.confidence ?? 50;
          const confB = b.criteriaData?.confidence ?? 50;
          return confB - confA; // Sort descending (highest confidence first)
        });
      }
      
      // Take exactly the requested count (or all available if less)
      const finalEntities = entitiesMatchingCriteria.slice(0, count);
      
      if (finalEntities.length === 0) {
        const entitiesWithWiki = entitiesWithWikipedia.length;
        const entitiesMatching = promptModifier ? entitiesMatchingCriteria.length : entitiesWithWiki;
        
        let errorMsg = `No entities found`;
        if (promptModifier) {
          errorMsg += ` matching criteria "${promptModifier}"`;
          if (entitiesWithWiki > 0) {
            errorMsg += `. Found ${entitiesWithWiki} entities with Wikipedia pages, but none matched the criteria after ${retryCount} retries.`;
            errorMsg += ` Try a broader criteria or check that the Wikipedia pages contain relevant demographic/location data.`;
          } else {
            errorMsg += `. Validated ${processedEntityNames.size} entities but none had Wikipedia pages.`;
          }
        } else {
          errorMsg += `. Validated ${processedEntityNames.size} entities but none had Wikipedia pages.`;
        }
        
        console.error(`[Entity Generation] ${errorMsg}`);
        console.error(`[Entity Generation] Entities processed:`, Array.from(processedEntityNames).slice(0, 10));
        notify.error(errorMsg);
        setIsGeneratingEntities(prev => {
          const updated = { ...prev };
          delete updated[generatingKey];
          return updated;
        });
        return;
      }
      
      // If we don't have enough matching entities after retries, show a warning but continue with what we have
      if (finalEntities.length < count && promptModifier) {
        console.warn(`[Entity Generation] Only found ${finalEntities.length}/${count} entities matching criteria "${promptModifier}" after ${retryCount} retries. Continuing with available matches.`);
        notify.error(notifyFoundXXEntitiesMatchingCriteriaTri(finalEntities.length, count, processedEntityNames.size));
      } else if (finalEntities.length === count) {
        console.log(`[Entity Generation] Successfully found ${finalEntities.length}/${count} entities${promptModifier ? ` matching criteria "${promptModifier}"` : ''}${retryCount > 0 ? ` after ${retryCount} retries` : ''}`);
      }

      // Store generated entities (storageKey already defined earlier)
      setGeneratedEntities(prev => ({
        ...prev,
        [storageKey]: finalEntities.map(e => e.entity)
      }));
      
      // Store Wikipedia links separately
      setWikipediaLinks(prev => ({
        ...prev,
        [storageKey]: finalEntities.reduce((acc, e) => {
          if (e.wikipediaUrl) {
            acc[e.entity] = e.wikipediaUrl;
          }
          return acc;
        }, {} as Record<string, string>)
      }));
      
      // Store suggested title format for bulk import
      localStorage.setItem(`entity-title-format-${storageKey}`, suggestedTitleFormat);

      notify.success(notifyGeneratedXEntities(finalEntities.length));
      setEntityGenerationDialogOpen(true);
      setPendingEntitySite(site);
      setPendingEntitySitemap(entitySitemapUrl);
      
      // Auto-select first entity to show its criteria info
      if (finalEntities.length > 0) {
        setSelectedEntity(finalEntities[0].entity);
      }
      
      // Clear the count input for next time
      setEntityCount(5);
    } catch (error) {
            
      // Enhanced error logging for entity generation
      const errorDetails = {
        siteId: site.id,
        siteUrl: site.siteUrl,
        sitemapUrl: entitySitemapUrl,
        hasEntitySitemapUrl: !!site.entitySitemapUrl,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
      
      console.error('[Entity Generation] Error generating entities:', errorDetails);
      
      // Site-specific error handling for blindswest.ca
      if (site.siteUrl && site.siteUrl.includes('blindswest.ca')) {
        console.warn('[Entity Generation] blindswest.ca specific error detected:', errorDetails);
        
        // Check for common issues
        if (error instanceof Error) {
          if (error.message.includes('Attribute without value')) {
            notify.error(
              `XML parsing error for blindswest.ca sitemap.\n\n` +
              `The sitemap at ${entitySitemapUrl} contains malformed XML attributes.\n\n` +
              `Please check the sitemap file and ensure all attributes have values.`
            );
          } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
            notify.error(
              `Server error while parsing sitemap for blindswest.ca.\n\n` +
              `The backend server encountered an error processing ${entitySitemapUrl}.\n\n` +
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
      
      setIsGeneratingEntities(prev => {
        const updated = { ...prev };
        delete updated[`${site.id}-${entitySitemapUrl}`];
        return updated;
      });
    }
  }, []);

  // Helper function to replace template variables
  const generateAITitleSuggestion = useCallback(async () => {
    if (!pendingEntitySite || !pendingEntitySitemap) return;
    
    const entities = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`];
    if (!entities || entities.length === 0) {
      notify.error(NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI);
      return;
    }

    const apiKey = loadApiKey();
    if (!apiKey || !apiKey.trim()) {
      notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE);
      return;
    }

    setIsGeneratingTitleSuggestion(true);
    
    try {
      const model = getResearchModel();
      const siteName = pendingEntitySite.name || 'Service';
      const sampleEntities = entities.slice(0, 5).join(', ');
      
      const systemPrompt = `You are an expert SEO content strategist. Your task is to suggest an optimal title template for bulk blog post generation.

The title template should:
- Use variables: {entity}, {keyword}
- ALWAYS include the word "Near" before {entity}
- NEVER include the site/business name in the template
- Be SEO-friendly and natural
- Work well for local business content

Respond with ONLY the title template, nothing else. Do not include explanations, markdown, or code blocks.`;

      const userPrompt = `Generate a title template for local SEO blog posts.

Sample entities: ${sampleEntities}
Total entities: ${entities.length}

CRITICAL REQUIREMENTS:
1. MUST include "Near" before {entity} (e.g., "Near {entity}")
2. MUST NOT include the site/business name "${siteName}"
3. Can optionally use {keyword} variable
4. Must be optimized for local SEO

Examples of good templates:
- "{keyword} Near {entity}"
- "Services Near {entity}"
- "Near {entity}"

Generate the best title template (must include "Near" and must NOT include "${siteName}"):`;

      let suggestedTemplate = '';
      
      await streamChatCompletion({
        apiKey,
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        onContentChunk: (chunk) => {
          suggestedTemplate += chunk;
        }
      });

      // Clean up the response - remove markdown, quotes, etc.
      suggestedTemplate = suggestedTemplate
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/^```[\w]*\n?|\n?```$/g, '') // Remove code blocks
        .trim();

      if (suggestedTemplate) {
        setCsvTitleFormat(suggestedTemplate);
        notify.success(NOTIFY_TITLE_TEMPLATE_SUGGESTED);
      } else {
        notify.error(NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION);
      }
    } catch (error) {
      console.error('[Title Suggestion] Error:', error);
      notify.error(notifyFailedToGenerateTitleSuggestionX(error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGeneratingTitleSuggestion(false);
    }
  }, [pendingEntitySite, pendingEntitySitemap, generatedEntities]);

  const replaceTemplateVariables = useCallback((
    template: string,
    entity: string,
    keyword: string = ''
  ): string => {
    let result = template;
    result = result.replace(/{entity}/g, entity);
    result = result.replace(/{keyword}/g, keyword);
    return result;
  }, []);

  // Generate CSV template from entities
  const generateCSVTemplate = useCallback(() => {
    if (!pendingEntitySite || !pendingEntitySitemap) return;
    
    const entities = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] || [];
    if (entities.length === 0) {
      notify.error(NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM);
      return;
    }

    // Generate CSV rows
    const csvRows = entities.map((entity) => {
      const title = csvTitleFormat 
        ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword)
        : entity;
      
      return {
        keyword: csvKeyword || '',
        entity: entity,
        title: title,
        optionalModifier: csvOptionalModifier || '',
        featuredImage: csvFeaturedImage
      };
    });

    // Convert to CSV
    const headers = ['keyword', 'entity', 'title', 'optionalModifier', 'featuredImage'];
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => [
        row.keyword ? `"${row.keyword.replace(/"/g, '""')}"` : '',
        `"${row.entity.replace(/"/g, '""')}"`,
        `"${row.title.replace(/"/g, '""')}"`,
        row.optionalModifier ? `"${row.optionalModifier.replace(/"/g, '""')}"` : '',
        row.featuredImage
      ].join(','))
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entities-template-${pendingEntitySite.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notify.success(notifyCsvTemplateWithXEntitiesDownloaded(entities.length));
    setCsvTemplateDialogOpen(false);
  }, [pendingEntitySite, pendingEntitySitemap, generatedEntities, csvTitleFormat, csvKeyword, csvOptionalModifier, csvFeaturedImage, replaceTemplateVariables]);

  return (
    <>
      {/* Generate Entities Dialog */}
      <Dialog open={entityGenerationDialogOpen} onOpenChange={setEntityGenerationDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Generate Origins</DialogTitle>
            <DialogDescription>
              {pendingEntitySite && pendingEntitySitemap && (
                <>
                  Generate location origins for {pendingEntitySite.name} based on service-area sitemap analysis.
                  <br />
                  <span className="text-xs text-muted-foreground">Sitemap: {pendingEntitySitemap}</span>
                  {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length > 0 && (
                    <span className="block mt-2 text-primary">
                      {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length} origins generated!
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1">
          {pendingEntitySite && pendingEntitySitemap && !generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                
                <Field
                  placeholder="Number of origins to generate"
                  id="entityCount"
                  type="number"
                  min="1"
                  value={entityCount}
                  onChange={(e) => setEntityCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <p className="text-xs text-muted-foreground">
                  Enter how many location origins to generate (minimum 1).
                </p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="entityPromptModifier">Optional Prompt Modifier</label>
                <Field
                  id="entityPromptModifier"
                  type="text"
                  value={entityPromptModifier}
                  onChange={(e) => setEntityPromptModifier(e.target.value)}
                  placeholder="e.g., high income neighborhoods in edmonton, streets in calgary"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Add specific criteria to guide origin generation (e.g., "high income neighborhoods in edmonton", "streets in calgary")
                </p>
              </div>
            </div>
          )}

          {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
            <div className="flex-1 grid grid-cols-2 gap-4 py-4 overflow-hidden">
              {/* Left Column: Entity List */}
              <div className="flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold block">Generated Origins (with Wikipedia pages):</label>
                  <Button
                    onClick={() => {
                      const entitiesText = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].join('\n');
                      navigator.clipboard.writeText(entitiesText).then(() => {
                        notify.success(NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD);
                      }).catch(() => {
                        notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD);
                      });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy All
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  <ul className="space-y-1">
                    {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].map((entity, index) => {
                      const storageKey = `${pendingEntitySite.id}-${pendingEntitySitemap}`;
                      const wikiUrl = wikipediaLinks[storageKey]?.[entity];
                      const isSelected = selectedEntity === entity;
                      return (
                        <li 
                          key={index} 
                          className={`text-sm text-foreground py-2 px-2 rounded flex items-center justify-between group cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/20 border border-primary' : 'hover:bg-accent'
                          }`}
                          onClick={() => setSelectedEntity(entity)}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className={isSelected ? 'font-semibold' : ''}>{entity}</span>
                            {wikiUrl && (
                              <a
                                href={wikiUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline"
                                title="View Wikipedia page"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <Button
                            variant="quiet"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(entity).then(() => {
                                notify.success(NOTIFY_ORIGIN_COPIED);
                              }).catch(() => {
                                notify.error(NOTIFY_FAILED_TO_COPY);
                              });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Right Column: Criteria Information */}
              <div className="flex flex-col overflow-hidden">
                <label className="text-sm font-semibold block mb-2">Criteria Information:</label>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  {selectedEntity ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Selected Origin</div>
                        <div className="font-semibold text-sm">{selectedEntity}</div>
                      </div>
                      {(() => {
                        const storageKey = `${pendingEntitySite.id}-${pendingEntitySitemap}`;
                        const wikiUrl = wikipediaLinks[storageKey]?.[selectedEntity];
                        const criteriaData = criteriaInfo[storageKey]?.[selectedEntity];
                        const generalInfo = generalCriteriaInfo[storageKey];
                        
                        return (
                          <>
                            {wikiUrl && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Wikipedia</div>
                                <a
                                  href={wikiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-sm flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View Wikipedia page
                                </a>
                              </div>
                            )}
                            {generalInfo && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">General Criteria</div>
                                <div className="text-sm">{generalInfo}</div>
                              </div>
                            )}
                            {criteriaData && (
                              <>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Validation Status</div>
                                  <div className="text-sm">
                                    <span className={criteriaData.matches ? 'text-primary font-semibold' : 'text-ui-danger'}>
                                      {criteriaData.matches ? '✓ Matches Criteria' : '✗ Does Not Match'}
                                    </span>
                                  </div>
                                </div>
                                {criteriaData.confidence > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                                    <div className="text-sm">{criteriaData.confidence}%</div>
                                  </div>
                                )}
                                {criteriaData.rankingValue !== undefined && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Ranking Value</div>
                                    <div className="text-sm">{criteriaData.rankingValue}</div>
                                  </div>
                                )}
                                {criteriaData.extractedData && Object.keys(criteriaData.extractedData).length > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Extracted Data</div>
                                    <div className="text-sm space-y-1">
                                      {Object.entries(criteriaData.extractedData).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                          <span className="font-medium">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            {!criteriaData && generalInfo && (
                              <div className="text-xs text-muted-foreground italic">
                                No specific validation data available for this origin.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      Select an origin from the list to view its criteria information.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setEntityGenerationDialogOpen(false);
                setPendingEntitySite(null);
                setPendingEntitySitemap(null);
                setSelectedEntity(null);
              }}
            >
              {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] ? 'Close' : 'Cancel'}
            </Button>
            {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
              <Button
                variant="run"
                onClick={() => {
                  // Initialize with default values only if not already set
                  if (csvFeaturedImage !== 'y' && csvFeaturedImage !== 'n' && csvFeaturedImage !== 'google-maps') {
                    setCsvFeaturedImage('y');
                  }
                  setCsvTemplateDialogOpen(true);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Generate CSV Template
              </Button>
            )}
            {pendingEntitySite && pendingEntitySitemap && !generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
              <Button
                variant="run"
                onClick={() => {
                  if (pendingEntitySite && pendingEntitySitemap) {
                    handleGenerateEntities(pendingEntitySite, pendingEntitySitemap, entityCount, entityPromptModifier.trim() || undefined);
                  }
                }}
                disabled={!entityCount || entityCount < 1}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Origins
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Template Configuration Dialog */}
      <Dialog open={csvTemplateDialogOpen} onOpenChange={setCsvTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate CSV Template</DialogTitle>
            <DialogDescription>
              Configure the CSV template with title format and optional fields for bulk generation.
            </DialogDescription>
          </DialogHeader>
          
          {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="csvTitleFormat">Title Format</label>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={generateAITitleSuggestion}
                    disabled={isGeneratingTitleSuggestion}
                    title="AI Suggest Title Template"
                  >
                    {isGeneratingTitleSuggestion ? (
                      <>
                        
                        Generating...
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Field
                    id="csvTitleFormat"
                    value={csvTitleFormat}
                    onChange={(e) => setCsvTitleFormat(e.target.value)}
                    placeholder="e.g., {keyword} Near {entity}"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Use variables:</span>
                  {[
                    { entity: '{entity}' },
                    { keyword: '{keyword}' }
                  ].map((vars, idx) => {
                    const [key, value] = Object.entries(vars)[0];
                    return (
                      <React.Fragment key={key}>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(value).then(() => {
                              notify.success(notifyCopiedXToClipboard(value));
                            }).catch(() => {
                              notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD);
                            });
                          }}
                          title={`Click to copy ${value}`}
                        >
                          {value}
                        </Button>
                        {idx < 1 && <span className="text-xs text-muted-foreground">,</span>}
                      </React.Fragment>
                    );
                  })}
                </div>
                {csvTitleFormat && (
                  <div className="mt-2 p-2 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Preview (first entity):</p>
                    <p className="text-sm font-medium">
                      {replaceTemplateVariables(
                        csvTitleFormat,
                        generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`][0],
                        csvKeyword || 'keyword'
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <label htmlFor="csvKeyword">Keyword (Optional)</label>
                <Field
                  id="csvKeyword"
                  value={csvKeyword}
                  onChange={(e) => setCsvKeyword(e.target.value)}
                  placeholder="Leave empty to fill manually later"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Leave empty to fill manually later. If provided, will be used for all entities.
                </p>
              </div>

              <div className="grid gap-2">
                
                <SelectField placeholder="Featured Image" value={csvFeaturedImage} onValueChange={setCsvFeaturedImage} options={[{ value: "y", label: "Yes (Y)" }, { value: "n", label: "No (N)" }, { value: "google-maps", label: "Google Image" }]} />
                <p className="text-xs text-muted-foreground">
                  Whether to generate a featured image for each post. Google Image requires an entity.
                </p>
              </div>

              <div className="grid gap-2">
                <label htmlFor="csvOptionalModifier">Optional Modifier (Optional)</label>
                <Field
                  id="csvOptionalModifier"
                  value={csvOptionalModifier}
                  onChange={(e) => setCsvOptionalModifier(e.target.value)}
                  placeholder="e.g., Focus on high-income neighborhoods"
                />
                <p className="text-xs text-muted-foreground">
                  Optional prompt modifier to guide content generation
                </p>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold">Preview ({generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length} entities):</label>
                <div className="max-h-64 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  <div className="text-xs text-muted-foreground mb-2 font-semibold">First 10 rows:</div>
                  <ul className="space-y-1">
                    {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].slice(0, 10).map((entity, index) => {
                      const previewTitle = csvTitleFormat 
                        ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword || '')
                        : entity;
                      return (
                        <li key={index} className="text-sm text-foreground py-1 px-2 hover:bg-accent rounded">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">Entity: {entity}</span>
                            <span className="text-muted-foreground">Title: {previewTitle}</span>
                            {csvKeyword && <span className="text-muted-foreground">Keyword: {csvKeyword}</span>}
                            <span className="text-muted-foreground">Featured Image: {csvFeaturedImage === 'y' ? 'Yes' : csvFeaturedImage === 'google-maps' ? 'Google Image' : 'No'}</span>
                            {csvOptionalModifier && <span className="text-muted-foreground">Modifier: {csvOptionalModifier}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length > 10 && (
                    <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                      ... and {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length - 10} more entities
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setCsvTemplateDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="run"
              onClick={generateCSVTemplate}
            >
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};


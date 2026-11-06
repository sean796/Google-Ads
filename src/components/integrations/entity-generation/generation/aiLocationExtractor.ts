/**
 * AI Location Extractor Module
 * Extracts location information using AI
 */

import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";

/**
 * Extracts location from URLs using AI
 */
export async function extractLocationFromUrlsWithAI(
  urls: string[],
  openRouterApiKey: string
): Promise<string | null> {
  // Collect URL slugs for AI analysis
  const urlSlugsForAnalysis: string[] = [];
  for (const url of urls.slice(0, 10)) { // Limit to first 10 URLs
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
  
  if (urlSlugsForAnalysis.length === 0) {
    return null;
  }
  
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
      const primaryCity = aiLocationResponse
        .split(' ')
        .map(word => {
          // Handle hyphenated cities like "Opa-locka"
          if (word.includes('-')) {
            return word.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
          }
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
      
      return primaryCity;
    } else {
      logger.warn('[Entity Generation] AI could not extract location from URLs');
      return null;
    }
  } catch (error) {
    logger.warn('[Entity Generation] Error extracting location from URLs with AI:', error);
    return null;
  }
}

/**
 * Extracts location from prompt modifier using AI
 */
export async function extractLocationFromModifier(
  promptModifier: string,
  openRouterApiKey: string
): Promise<string | null> {
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
      const modifierLocation = locationResponse
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      return modifierLocation;
    }
  } catch (error) {
    logger.warn('[Entity Generation] Error extracting location from modifier with AI, trying regex fallback:', error);
    // Fallback to regex patterns
    return extractLocationFromModifierWithRegex(promptModifier);
  }
  
  return null;
}

/**
 * Extracts location from prompt modifier using regex patterns (fallback)
 */
export function extractLocationFromModifierWithRegex(promptModifier: string): string | null {
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
    let modifierLocation = inMatch[1].trim();
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
    return modifierLocation;
  } else {
    // Try direct location mentions - check for all US states, Canadian provinces, major cities
    const allStatesAndProvinces = /(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|Alberta|British\s+Columbia|Manitoba|New\s+Brunswick|Newfoundland|Nova\s+Scotia|Ontario|Prince\s+Edward\s+Island|Quebec|Saskatchewan|Calgary|Edmonton|Toronto|Vancouver|Montreal|Ottawa|Winnipeg|Halifax|Victoria|Saskatoon|Regina)/i;
    const locationMatch = promptModifier.match(allStatesAndProvinces);
    
    if (locationMatch && locationMatch[0]) {
      const modifierLocation = locationMatch[0]
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return modifierLocation;
    } else {
      // Try city patterns as last resort
      for (const pattern of cityPatterns) {
        const match = promptModifier.match(pattern);
        if (match) {
          let modifierLocation = match[0];
          modifierLocation = modifierLocation.charAt(0).toUpperCase() + modifierLocation.slice(1).toLowerCase();
          return modifierLocation;
        }
      }
    }
  }
  
  return null;
}

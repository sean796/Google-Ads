
import { notify } from "@/lib/app-notifications";
import { NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE } from "@/lib/notify-messages";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { EntityRunDeps } from "@/components/integrations/entity-run-ctx";
import { logger } from "@/lib/logger";

export async function runEntityPhaseGeo(d: EntityRunDeps): Promise<boolean> {
  const { s, v, c } = d;
// Extract existing entities, geographic area, and title format from URLs
c.existingEntities = [];
const cityNames = new Set<string>();
const areaKeywords = new Set<string>();

for (const url of c.parseResult.urls) {
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
        if (readableLocation && !c.existingEntities.includes(readableLocation)) {
          c.existingEntities.push(readableLocation);
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
        if (readableLocation && !c.existingEntities.includes(readableLocation)) {
          c.existingEntities.push(readableLocation);
        }
      }
    }
  } catch (error) {
    // Skip invalid URLs
  }
}

// Determine primary geographic area
c.primaryCity = cityNames.size > 0 ? Array.from(cityNames)[0] : null;

// Use site's default location if available and no city found from URLs
if (!c.primaryCity && c.site.locations && c.site.locations.length > 0) {
  const defaultLocation = c.site.locations.find(loc => loc.isDefault) || c.site.locations[0];
  if (defaultLocation.city && defaultLocation.state) {
    c.primaryCity = `${defaultLocation.city}, ${defaultLocation.state}`;
  } else if (defaultLocation.city) {
    c.primaryCity = defaultLocation.city;
  } else if (defaultLocation.state) {
    c.primaryCity = defaultLocation.state;
  }
}

// Get OpenRouter API key FIRST (needed for location extraction)
c.openRouterApiKey = loadApiKey();
if (!c.openRouterApiKey) {
  notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE);
  s.setIsGeneratingEntities(prev => {
    const updated = { ...prev };
    delete updated[c.generatingKey];
    return updated;
  });
  return false;
}

// Step -1: If no city found from simple pattern matching, try extracting from URLs using AI and regex
// If still no location found, try extracting from URLs
if (!c.primaryCity) {
  
  // First try regex patterns to extract "Near [City], [State]" or "Near [City]" from URL slugs
  const urlLocationMatches: string[] = [];
  for (const url of c.parseResult.urls) {
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
    c.primaryCity = urlLocationMatches[0];
  } else {
    // If regex didn't work, use AI to extract location from URL slugs
    
    // Collect URL slugs for AI analysis
    const urlSlugsForAnalysis: string[] = [];
    for (const url of c.parseResult.urls.slice(0, 10)) { // Limit to first 10 URLs
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
          apiKey: c.openRouterApiKey,
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
          c.primaryCity = aiLocationResponse
            .split(' ')
            .map(word => {
              // Handle hyphenated cities like "Opa-locka"
              if (word.includes('-')) {
                return word.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
              }
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
          
        } else {
          logger.warn('[Entity Generation] AI could not extract location from URLs');
        }
      } catch (error) {
        logger.warn('[Entity Generation] Error extracting location from URLs with AI:', error);
      }
    }
  }
}

// Step 0: Extract location from prompt modifier if it specifies one (user's explicit instruction takes ABSOLUTE priority)
c.modifierLocation = null;
if (c.promptModifier) {
  // Extract location from modifier - look for patterns like "in calgary", "in Wisconsin", "streets in wisconsin", etc.
  // Use AI to extract location to handle various formats (cities, states, provinces, countries, regions)
  const locationExtractionPrompt = `Extract the location name from this user query: "${c.promptModifier}"

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
      apiKey: c.openRouterApiKey,
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
      c.modifierLocation = locationResponse
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
    }
  } catch (error) {
    logger.warn('[Entity Generation] Error extracting location from modifier with AI, trying regex fallback:', error);
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
    const inMatch = c.promptModifier.match(inLocationPattern);
    
    if (inMatch && inMatch[1]) {
      c.modifierLocation = inMatch[1].trim();
      // Normalize common variations
      if (c.modifierLocation.toLowerCase().includes('united states') || 
          c.modifierLocation.toLowerCase() === 'us' || 
          c.modifierLocation.toLowerCase() === 'usa') {
        c.modifierLocation = 'United States';
      } else if (c.modifierLocation.toLowerCase() === 'canada') {
        c.modifierLocation = 'Canada';
      } else {
        // Capitalize properly (handle multi-word like "New York", "Wisconsin")
        c.modifierLocation = c.modifierLocation
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    } else {
      // Try direct location mentions - check for all US states, Canadian provinces, major cities
      const allStatesAndProvinces = /(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|Alberta|British\s+Columbia|Manitoba|New\s+Brunswick|Newfoundland|Nova\s+Scotia|Ontario|Prince\s+Edward\s+Island|Quebec|Saskatchewan|Calgary|Edmonton|Toronto|Vancouver|Montreal|Ottawa|Winnipeg|Halifax|Victoria|Saskatoon|Regina)/i;
      const locationMatch = c.promptModifier.match(allStatesAndProvinces);
      
      if (locationMatch && locationMatch[0]) {
        c.modifierLocation = locationMatch[0]
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      } else {
        // Try city patterns as last resort
        for (const pattern of cityPatterns) {
          const match = c.promptModifier.match(pattern);
          if (match) {
            c.modifierLocation = match[0];
            c.modifierLocation = c.modifierLocation.charAt(0).toUpperCase() + c.modifierLocation.slice(1).toLowerCase();
            break;
          }
        }
      }
    }
  }
  
  // CRITICAL: If modifier specifies a location, use that instead of detected city - ABSOLUTE PRIORITY
  if (c.modifierLocation && c.modifierLocation !== 'none') {
    const originalCity = c.primaryCity;
    c.primaryCity = c.modifierLocation;
  } else {
    // Check if modifier clearly mentions a location but we failed to extract it
    const hasLocationKeywords = /\b(calgary|edmonton|toronto|vancouver|montreal|ottawa|winnipeg|halifax|victoria|saskatoon|regina|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas)\b/i.test(c.promptModifier);
    if (hasLocationKeywords) {
      logger.warn(`[Entity Generation] WARNING: Modifier "${c.promptModifier}" appears to mention a location but extraction failed. Using sitemap-detected city: "${c.primaryCity}"`);
    } else {
      /* no known location in modifier, keep detected city */
    }
  }
}
  return true;
}

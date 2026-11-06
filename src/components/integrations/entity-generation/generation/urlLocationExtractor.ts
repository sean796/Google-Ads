/**
 * URL Location Extractor Module
 * Extracts location information from sitemap URLs using pattern matching
 */

import type { WordPressSite } from "../../types";

/**
 * Extracts location information from sitemap URLs.
 * Prefers city/state level: e.g. "stuart-florida" -> "Stuart, Florida" (entity) and "Florida" (state for category discovery).
 */
export function extractLocationFromUrls(
  urls: string[],
  site: WordPressSite
): {
  existingEntities: string[];
  cityNames: Set<string>;
  areaKeywords: Set<string>;
  stateNames: Set<string>;
} {
  const existingEntities: string[] = [];
  const cityNames = new Set<string>();
  const areaKeywords = new Set<string>();
  const stateNames = new Set<string>();

  for (const url of urls) {
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
          const parts = locationSlug.split('-').filter(Boolean);
          // Prefer "City, State" format for entity names (city or state level, not neighborhood)
          const readableLocation =
            parts.length >= 2
              ? parts
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(', ')
              : parts
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join(' ');
          if (readableLocation && !existingEntities.includes(readableLocation)) {
            existingEntities.push(readableLocation);
          }
          // For category discovery prefer state level: "stuart-florida" -> state "Florida"
          if (parts.length >= 2) {
            const statePart = parts[parts.length - 1];
            if (statePart && statePart.length >= 2) {
              stateNames.add(statePart.charAt(0).toUpperCase() + statePart.slice(1).toLowerCase());
            }
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

  return { existingEntities, cityNames, areaKeywords, stateNames };
}

/**
 * Determines primary city/region from extracted data or site defaults.
 * Prefers state level for category discovery (e.g. "Florida") so we get city/state-level entities, not neighborhood.
 */
export function determinePrimaryCity(
  cityNames: Set<string>,
  site: WordPressSite,
  stateNames?: Set<string>
): string | null {
  // Prefer state level so Wikipedia category returns cities/states, not neighbourhoods
  let primaryCity: string | null =
    stateNames && stateNames.size > 0 ? Array.from(stateNames)[0]! : null;
  if (!primaryCity && cityNames.size > 0) {
    primaryCity = Array.from(cityNames)[0]!;
  }

  // Use site's default location if available and no city/state found from URLs
  if (!primaryCity && site.locations && site.locations.length > 0) {
    const defaultLocation = site.locations.find(loc => loc.isDefault) || site.locations[0];
    if (defaultLocation.city && defaultLocation.state) {
      primaryCity = `${defaultLocation.city}, ${defaultLocation.state}`;
    } else if (defaultLocation.city) {
      primaryCity = defaultLocation.city;
    } else if (defaultLocation.state) {
      primaryCity = defaultLocation.state;
    }
  }

  return primaryCity;
}

/**
 * Extracts location from URLs using regex patterns
 */
export function extractLocationFromUrlsWithRegex(urls: string[]): string | null {
  const urlLocationMatches: string[] = [];
  
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
      
      // Join all path segments to get full URL slug
      const fullSlug = pathSegments.join('-');
      const decodedSlug = decodeURIComponent(fullSlug);
      
      // Try pattern: "near-[city]-[state]" or "near-[city]"
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
  
  return urlLocationMatches.length > 0 ? urlLocationMatches[0] : null;
}

/**
 * Analyzes title format from existing URLs
 */
export function analyzeTitleFormat(
  urls: string[],
  existingEntities: string[],
  siteName: string
): string {
  if (urls.length > 0 && existingEntities.length > 0) {
    // Common patterns: "[Service] Near [Location]", "[Service] in [Location]", "[Service] [Location]"
    if (urls.some(url => url.toLowerCase().includes('near'))) {
      return `${siteName} Near {entity}`;
    } else if (urls.some(url => url.toLowerCase().includes('in'))) {
      return `${siteName} in {entity}`;
    } else {
      // Default pattern based on common SEO practices
      return `${siteName} Near {entity}`;
    }
  } else {
    // Fallback default
    return `${siteName} Near {entity}`;
  }
}

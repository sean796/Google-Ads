/**
 * Entity Validation Module
 * Validates entities to ensure they are valid location names and not generic phrases
 */

/**
 * Validates that an entity does NOT exist in sitemap URLs
 */
export function validateEntityNotInSitemap(
  entity: string,
  sitemapUrls: string[]
): boolean {
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
}

/**
 * Validates if an entity should be accepted or rejected
 * - Rejects years and dates (entities cannot be years or dates of any kind)
 * - Rejects generic entities like "Your Home", "My Home", "The Home"
 * - Rejects personal entities like "Your Big Day", "My Big Day", "Your Special Day"
 * - Rejects generic personal possessive phrases (Your/My/The + generic term)
 * - Allows hardcoded competitors like "hunter douglas"
 */
export function isValidEntity(entity: string): boolean {
  const entityLower = entity.toLowerCase().trim();
  
  // Reject "List of ..." - these are Wikipedia list pages, not location entities
  if (entityLower.startsWith('list of ')) {
    return false;
  }

  // Hardcoded allowed competitors (OK to target)
  const allowedCompetitors = [
    'hunter douglas',
    'hunterdouglas'
  ];
  
  // Check if entity is an allowed competitor
  for (const allowed of allowedCompetitors) {
    if (entityLower === allowed || entityLower.includes(allowed)) {
      return true;
    }
  }
  
  // AGGRESSIVE REJECTION: Reject years and dates (entities cannot be years or dates of any kind)
  // Check for 4-digit years (1900-2099) - even if standalone or in any context
  const yearPattern = /^(19|20)\d{2}$/;
  if (yearPattern.test(entityLower)) {
    return false;
  }
  
  // AGGRESSIVE: Reject ANY entity that is ONLY a number (could be a year)
  if (/^\d+$/.test(entityLower)) {
    return false;
  }
  
  // AGGRESSIVE: Reject entities that START or END with a 4-digit year
  if (/^(19|20)\d{2}/.test(entityLower) || /(19|20)\d{2}$/.test(entityLower)) {
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
      return false;
    }
    
    // CRITICAL: Entities MUST be geolocations ONLY. If it starts with "Your", "My", or "The",
    // it MUST be followed by a CLEAR geographic location (city name, state, street name, etc.)
    // Geographic locations have specific patterns - if it doesn't match, REJECT it
    const looksLikeGeographicLocation = 
      // City, State pattern (e.g., "Your Local Business in Toronto, Ontario")
      /,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*/.test(entity) ||
      // Street/avenue pattern (e.g., "Your Shop on Main Street")
      /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|place|pl|parkway|pkwy)\b/i.test(entity) ||
      // Directional + location (e.g., "Your Business in North Toronto")
      /^(north|south|east|west|northwest|northeast|southwest|southeast)\s+[A-Z]/.test(entity) ||
      // Known city/state/province patterns
      /\b(california|texas|florida|new york|ontario|alberta|british columbia|quebec|toronto|vancouver|edmonton|calgary|montreal|ottawa|winnipeg|halifax|victoria|regina|saskatoon|windsor|hamilton|kitchener|london|barrie|oshawa|sudbury|thunder bay|saint john|fredericton|charlottetown|whitehorse|yellowknife|iqaluit|new jersey|pennsylvania|illinois|ohio|michigan|georgia|north carolina|virginia|massachusetts|tennessee|indiana|arizona|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|louisiana|kentucky|oregon|oklahoma|connecticut|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming|district of columbia)\b/i.test(entity);
    
    if (!looksLikeGeographicLocation) {
      return false;
    }
  }
  
  // CRITICAL ADDITIONAL CHECK: Reject any entity that contains business/personal terms 
  // UNLESS it's clearly part of a geographic location name
  // CRITICAL: Reject standalone business/workplace terms like "offices", "office", etc.
  const businessPersonalTerms = [
    'business', 'new business', 'company', 'new company', 'organization', 'firm', 'enterprise',
    'office', 'offices', 'workplace', 'workplaces', 'store', 'stores', 'shop', 'shops',
    'home', 'house', 'property', 'properties', 'location', 'locations', 'area', 'areas',
    'region', 'regions', 'neighborhood', 'neighborhoods', 'venue', 'venues', 'facility', 'facilities',
    'building', 'buildings', 'establishment', 'establishments', 'premises', 'site', 'sites'
  ];
  
  // First check: If entity is EXACTLY a business term (standalone), reject immediately
  if (businessPersonalTerms.includes(entityLower)) {
    return false;
  }
  
  // Second check: If entity contains business terms, only allow if clearly part of geographic location
  const containsBusinessTerm = businessPersonalTerms.some(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(entityLower)) {
      // Only allow if it's clearly part of a geographic location (city, state, street, etc.)
      const hasGeographicContext = /,\s*[A-Z][a-z]+/.test(entity) || // City, State pattern
                                  /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|place|pl|parkway|pkwy)\b/i.test(entity) ||
                                  /\b(california|texas|florida|ontario|alberta|british columbia|quebec|toronto|vancouver|edmonton|calgary|montreal|ottawa|winnipeg|halifax|victoria|regina|saskatoon|windsor|hamilton|kitchener|london|barrie|oshawa|sudbury|thunder bay|saint john|fredericton|charlottetown|whitehorse|yellowknife|iqaluit|new jersey|pennsylvania|illinois|ohio|michigan|georgia|north carolina|virginia|massachusetts|tennessee|indiana|arizona|missouri|maryland|wisconsin|colorado|minnesota|south carolina|alabama|louisiana|kentucky|oregon|oklahoma|connecticut|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming|district of columbia)\b/i.test(entity);
      return !hasGeographicContext; // Reject if it contains business term but no geographic context
    }
    return false;
  });
  
  if (containsBusinessTerm) {
    return false;
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
    // Business-related generic phrases - EXPLICITLY REJECT ALL
    'your new business',
    'my new business',
    'the new business',
    'your business',
    'my business',
    'the business',
    'new business', // Reject even without "Your/My/The"
    'business', // Reject standalone "business"
    // Generic business/workplace terms - REJECT ALL
    'office', 'offices', 'workplace', 'workplaces', 'store', 'stores', 'shop', 'shops',
    'location', 'locations', 'area', 'areas', 'region', 'regions', 'neighborhood', 'neighborhoods',
    'venue', 'venues', 'facility', 'facilities', 'building', 'buildings', 'establishment', 'establishments',
    'premises', 'site', 'sites',
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
      return false;
    }
  }
  
  return true; // Entity is valid
}

/**
 * Keyword Formatter
 * Ensures proper capitalization for geographic locations and proper nouns in keywords
 */

// Common geographic locations with proper capitalization
const GEOGRAPHIC_LOCATIONS: Record<string, string> = {
  // US States
  'alabama': 'Alabama',
  'alaska': 'Alaska',
  'arizona': 'Arizona',
  'arkansas': 'Arkansas',
  'california': 'California',
  'colorado': 'Colorado',
  'connecticut': 'Connecticut',
  'delaware': 'Delaware',
  'florida': 'Florida',
  'georgia': 'Georgia',
  'hawaii': 'Hawaii',
  'idaho': 'Idaho',
  'illinois': 'Illinois',
  'indiana': 'Indiana',
  'iowa': 'Iowa',
  'kansas': 'Kansas',
  'kentucky': 'Kentucky',
  'louisiana': 'Louisiana',
  'maine': 'Maine',
  'maryland': 'Maryland',
  'massachusetts': 'Massachusetts',
  'michigan': 'Michigan',
  'minnesota': 'Minnesota',
  'mississippi': 'Mississippi',
  'missouri': 'Missouri',
  'montana': 'Montana',
  'nebraska': 'Nebraska',
  'nevada': 'Nevada',
  'new hampshire': 'New Hampshire',
  'new jersey': 'New Jersey',
  'new mexico': 'New Mexico',
  'new york': 'New York',
  'north carolina': 'North Carolina',
  'north dakota': 'North Dakota',
  'ohio': 'Ohio',
  'oklahoma': 'Oklahoma',
  'oregon': 'Oregon',
  'pennsylvania': 'Pennsylvania',
  'rhode island': 'Rhode Island',
  'south carolina': 'South Carolina',
  'south dakota': 'South Dakota',
  'tennessee': 'Tennessee',
  'texas': 'Texas',
  'utah': 'Utah',
  'vermont': 'Vermont',
  'virginia': 'Virginia',
  'washington': 'Washington',
  'west virginia': 'West Virginia',
  'wisconsin': 'Wisconsin',
  'wyoming': 'Wyoming',
  
  // Canadian Provinces
  'alberta': 'Alberta',
  'british columbia': 'British Columbia',
  'manitoba': 'Manitoba',
  'new brunswick': 'New Brunswick',
  'newfoundland and labrador': 'Newfoundland and Labrador',
  'northwest territories': 'Northwest Territories',
  'nova scotia': 'Nova Scotia',
  'nunavut': 'Nunavut',
  'ontario': 'Ontario',
  'prince edward island': 'Prince Edward Island',
  'quebec': 'Quebec',
  'saskatchewan': 'Saskatchewan',
  'yukon': 'Yukon',
  
  // Major Cities (US) - omit keys already in US States (e.g. new york, washington)
  'los angeles': 'Los Angeles',
  'chicago': 'Chicago',
  'houston': 'Houston',
  'phoenix': 'Phoenix',
  'philadelphia': 'Philadelphia',
  'san antonio': 'San Antonio',
  'san diego': 'San Diego',
  'dallas': 'Dallas',
  'san jose': 'San Jose',
  'austin': 'Austin',
  'jacksonville': 'Jacksonville',
  'fort worth': 'Fort Worth',
  'columbus': 'Columbus',
  'charlotte': 'Charlotte',
  'san francisco': 'San Francisco',
  'indianapolis': 'Indianapolis',
  'seattle': 'Seattle',
  'denver': 'Denver',
  'washington dc': 'Washington DC',
  'boston': 'Boston',
  'el paso': 'El Paso',
  'detroit': 'Detroit',
  'nashville': 'Nashville',
  'portland': 'Portland',
  'oklahoma city': 'Oklahoma City',
  'las vegas': 'Las Vegas',
  'memphis': 'Memphis',
  'louisville': 'Louisville',
  'baltimore': 'Baltimore',
  'milwaukee': 'Milwaukee',
  'albuquerque': 'Albuquerque',
  'tucson': 'Tucson',
  'fresno': 'Fresno',
  'sacramento': 'Sacramento',
  'kansas city': 'Kansas City',
  'mesa': 'Mesa',
  'atlanta': 'Atlanta',
  'omaha': 'Omaha',
  'colorado springs': 'Colorado Springs',
  'raleigh': 'Raleigh',
  'virginia beach': 'Virginia Beach',
  'miami': 'Miami',
  'oakland': 'Oakland',
  'minneapolis': 'Minneapolis',
  'tulsa': 'Tulsa',
  'cleveland': 'Cleveland',
  'wichita': 'Wichita',
  'arlington': 'Arlington',
  'tampa': 'Tampa',
  'new orleans': 'New Orleans',
  'honolulu': 'Honolulu',
  
  // Major Cities (Canada)
  'toronto': 'Toronto',
  'montreal': 'Montreal',
  'vancouver': 'Vancouver',
  'calgary': 'Calgary',
  'edmonton': 'Edmonton',
  'ottawa': 'Ottawa',
  'winnipeg': 'Winnipeg',
  'quebec city': 'Quebec City',
  'hamilton': 'Hamilton',
  'kitchener': 'Kitchener',
  'london': 'London',
  'halifax': 'Halifax',
  'victoria': 'Victoria',
  'saskatoon': 'Saskatoon',
  'regina': 'Regina',
  'oshawa': 'Oshawa',
  'windsor': 'Windsor',
  'sherbrooke': 'Sherbrooke',
  'kelowna': 'Kelowna',
  'barrie': 'Barrie',
  'abbotsford': 'Abbotsford',
  'sudbury': 'Sudbury',
  'kingston': 'Kingston',
  'saguenay': 'Saguenay',
  'trois-rivieres': 'Trois-Rivières',
  'guelph': 'Guelph',
  'cambridge': 'Cambridge',
  'white rock': 'White Rock',
  'saanich': 'Saanich',
  'langley': 'Langley',
  'nanaimo': 'Nanaimo',
  'kamloops': 'Kamloops',
  'chilliwack': 'Chilliwack',
  'red deer': 'Red Deer',
  'lethbridge': 'Lethbridge',
  'thunder bay': 'Thunder Bay',
  'saint john': 'Saint John',
  'saint john\'s': 'Saint John\'s',
  
  // Common geographic terms
  'united states': 'United States',
  'usa': 'USA',
  'canada': 'Canada',
  'united kingdom': 'United Kingdom',
  'uk': 'UK',
};

// Common proper nouns (brands, products, etc.)
const PROPER_NOUNS: Record<string, string> = {
  // Common product/service names
  'venetian': 'Venetian',
  'vertical': 'Vertical',
  'roller': 'Roller',
  'roman': 'Roman',
  'cellular': 'Cellular',
  'pleated': 'Pleated',
  'wood': 'Wood',
  'faux wood': 'Faux Wood',
  'aluminum': 'Aluminum',
  'bamboo': 'Bamboo',
  'motorized': 'Motorized',
  'smart': 'Smart',
  'blackout': 'Blackout',
  'sheer': 'Sheer',
  'solar': 'Solar',
  'energy': 'Energy',
  'efficient': 'Efficient',
};

/**
 * Capitalizes the first letter of each word, handling special cases
 */
function titleCase(str: string): string {
  return str
    .split(' ')
    .map(word => {
      if (!word) return word;
      // Handle words with apostrophes (e.g., "don't", "John's")
      if (word.includes("'")) {
        const parts = word.split("'");
        return parts.map((part, idx) => {
          if (idx === 0) {
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          }
          return part.toLowerCase();
        }).join("'");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Formats a keyword with proper capitalization for geographic locations and proper nouns
 */
export function formatKeyword(keyword: string): string {
  if (!keyword || !keyword.trim()) {
    return keyword;
  }

  const trimmed = keyword.trim();
  const lowerKeyword = trimmed.toLowerCase();
  
  // Check for exact geographic location matches first
  if (GEOGRAPHIC_LOCATIONS[lowerKeyword]) {
    return GEOGRAPHIC_LOCATIONS[lowerKeyword];
  }
  
  // Check if keyword contains geographic locations
  let formatted = trimmed;
  const words = trimmed.split(/\s+/);
  
  // Replace geographic locations in the keyword
  for (const [lower, proper] of Object.entries(GEOGRAPHIC_LOCATIONS)) {
    // Check for exact word match
    const lowerWords = lower.split(/\s+/);
    const keywordLower = lowerKeyword;
    
    // Try to find geographic location in keyword
    if (keywordLower.includes(lower)) {
      // Replace the geographic part with proper capitalization
      formatted = formatted.replace(
        new RegExp(lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        proper
      );
    }
  }
  
  // Handle proper nouns (brands, product types)
  for (const [lower, proper] of Object.entries(PROPER_NOUNS)) {
    const regex = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(formatted)) {
      formatted = formatted.replace(regex, proper);
    }
  }
  
  // If no geographic or proper noun matches, apply title case to the whole keyword
  // But preserve already capitalized geographic locations and proper nouns
  const finalWords = formatted.split(/\s+/);
  const formattedWords = finalWords.map((word, idx) => {
    const lowerWord = word.toLowerCase();
    
    // If word is already properly capitalized (first letter uppercase, rest lowercase or mixed),
    // and it matches a geographic location or proper noun, keep it as is
    const isAlreadyFormatted = word.charAt(0) === word.charAt(0).toUpperCase() && 
                               (GEOGRAPHIC_LOCATIONS[lowerWord] || PROPER_NOUNS[lowerWord]);
    
    if (isAlreadyFormatted) {
      // Double-check it matches our dictionary
      if (GEOGRAPHIC_LOCATIONS[lowerWord]) {
        return GEOGRAPHIC_LOCATIONS[lowerWord];
      }
      if (PROPER_NOUNS[lowerWord]) {
        return PROPER_NOUNS[lowerWord];
      }
    }
    
    // Check if it's a geographic location
    if (GEOGRAPHIC_LOCATIONS[lowerWord]) {
      return GEOGRAPHIC_LOCATIONS[lowerWord];
    }
    
    // Check if it's a proper noun
    if (PROPER_NOUNS[lowerWord]) {
      return PROPER_NOUNS[lowerWord];
    }
    
    // Check for common lowercase words that should stay lowercase (unless first word)
    const lowercaseWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 
                            'in', 'into', 'near', 'of', 'on', 'or', 'the', 'to', 'with'];
    
    if (idx > 0 && lowercaseWords.includes(lowerWord)) {
      return lowerWord;
    }
    
    // Apply title case
    return titleCase(word);
  });
  
  return formattedWords.join(' ');
}

/**
 * Formats an array of keywords
 */
export function formatKeywords(keywords: string[]): string[] {
  return keywords.map(formatKeyword);
}

/**
 * Formats keyword data objects, preserving the structure
 */
export function formatKeywordData<T extends { keyword: string }>(keywordData: T): T {
  return {
    ...keywordData,
    keyword: formatKeyword(keywordData.keyword),
  };
}

/**
 * Formats an array of keyword data objects
 */
export function formatKeywordDataArray<T extends { keyword: string }>(keywordDataArray: T[]): T[] {
  return keywordDataArray.map(formatKeywordData);
}


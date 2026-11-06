/**
 * AI-FIRST: Reads ALL origins, extracts geographic region, picks Wikipedia category page.
 * NO manual validation - AI decides everything. ALWAYS returns a category (never null).
 * NO TRUNCATION - sends ALL origins to OpenRouter (100k context window).
 * 
 * Example output: { type: 'category', title: 'Neighbourhoods_in_Edmonton' }
 */

import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';

export type WikipediaSource =
  | { type: 'category'; title: string }
  | { type: 'list'; title: string };

/**
 * AI-FIRST: Reads ALL origins, extracts geographic region, picks Wikipedia category.
 * ALWAYS returns a category - never null. No manual validation.
 */
export async function decideWikipediaSourceWithAI(
  existingOrigins: string[],
  promptModifier: string | undefined,
  keyword: string | undefined,
  apiKey: string
): Promise<WikipediaSource | null> {
  // NO TRUNCATION - send ALL origins to OpenRouter (100k context window)
  const list = existingOrigins.length > 0 ? existingOrigins.join('\n') : '(none)';
  const modifier = promptModifier?.trim() ? ` User wants: "${promptModifier.trim()}".` : '';
  const keywordContext = keyword?.trim() ? ` Business/service context keyword: "${keyword.trim()}".` : '';
  
  console.log(`[decideWikipediaSourceWithAI] Sending ALL ${existingOrigins.length} origins to OpenRouter (no truncation)`);
  console.log(`[decideWikipediaSourceWithAI] Sample origins (first 10):`, existingOrigins.slice(0, 10));

  let out = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `You are a geographic location analysis system.

TASK: Read ALL location origins, extract the geographic region, and return a Wikipedia CATEGORY page or LIST page that matches the user's requested entity type.

EXTRACTION LOGIC:
1. Read each origin entry
2. Identify geographic locations: neighborhoods, cities, streets, areas, regions, postal codes / ZIP codes, and forward sortation areas (FSA)
3. Ignore business names, service names, commercial terms
4. Extract the geographic region: city, state/province, country
5. Determine the location type: neighborhoods, cities, towns, areas, streets, postal/ZIP codes

CATEGORY / LIST SELECTION LOGIC:
1. Based on the extracted region and the requested entity type (from the user prompt), construct the best Wikipedia source
2. Default pattern: "Type_in_Location" using underscores (e.g., "Neighbourhoods_in_Edmonton")
3. IMPORTANT: For smaller cities/towns, a dedicated "Neighbourhoods_in_X" or "Streets_in_X" category may NOT exist on Wikipedia. In that case, prefer the city-level category itself (e.g., "Jupiter,_Florida" instead of "Neighbourhoods_in_Jupiter,_Florida") or use a broader county/region category (e.g., "Neighborhoods_in_Palm_Beach_County,_Florida"). Only use "Type_in_Location" if you are confident that specific category exists for major cities.
4. CRITICAL: NEVER pick broad country/region-level categories like "Canada", "United_States", "Florida" - these contain thousands of non-place articles about economy, culture, history, etc. ALWAYS pick categories that specifically contain PLACES (cities, neighborhoods, streets, districts, etc.). The category MUST have a place-type prefix like "Neighbourhoods_in_", "Cities_in_", "Streets_in_", "Towns_in_", "Communities_in_", "Villages_in_", "Suburbs_of_", "Districts_of_", etc.
6. POSTAL / ZIP CODE SOURCES:
   - Canada: use pages like "Category:Postal_codes_in_Canada", "Postal_codes_in_Canada:_X", or similar region-specific postal code categories/lists
   - United States: use pages like "List_of_ZIP_Code_prefixes", "ZIP_codes_in_STATE", or similar list/category pages for ZIP codes
   - For postal codes per CITY, consider pages like "List_of_postal_codes_of_Canada:_X" or similar city-focused postal code lists when appropriate.
7. STREET / ROAD / AVENUE SOURCES:
   - When the requested entity type is about streets or similar, prefer pages like "Streets_in_City", "Roads_in_City", "Avenues_in_City", or equivalent list/category pages for that region.
8. If the user prompt mentions "postal code", "postal codes", "zip code", or "zip codes", you MUST prioritize a postal/ZIP-code Wikipedia source over neighborhoods or streets for that same region.
9. Sources must be location-based only, never topic-based (businesses, services, products). Use the business/service keyword only as context, not as a topic.

OUTPUT FORMAT:
Return ONLY valid JSON:
{"type":"category","title":"Category_name_with_underscores"} or {"type":"list","title":"List_page_title"}

No examples, no explanations, only the JSON.`,
      },
      {
        role: 'user',
        content: `Read ALL ${existingOrigins.length} location origins and pick a Wikipedia category or list page:\n\n${list}${modifier}${keywordContext}\n\nReturn JSON with source:`,
      },
    ],
    temperature: 0.3,
    maxTokens: 300,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });

  const raw = out.trim().replace(/^`*json\s*|`*$/gi, '').trim();
  console.log(`[decideWikipediaSourceWithAI] AI RAW RESPONSE:`, raw);
  
  // AGGRESSIVE EXTRACTION - extract category from ANY format
  function extractCategory(raw: string): { type: 'category' | 'list'; title: string } | null {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(raw) as { type?: string; title?: string };
      if (parsed?.title && typeof parsed.title === 'string') {
        const title = parsed.title.trim().replace(/^Category:\s*/i, '').trim();
        if (title.length > 2) {
          const type = parsed.type === 'list' ? 'list' : 'category';
          return { type, title };
        }
      }
    } catch {
      // Unparseable title fragment: fall through to the pattern match below.
    }
    
    // Extract from patterns like "Category:Neighbourhoods_in_Edmonton" or "Neighbourhoods_in_Edmonton"
    const categoryMatch = raw.match(/(?:Category:)?([A-Z][a-zA-Z_]+(?:_in_[A-Z][a-zA-Z_]+)+)/i);
    if (categoryMatch?.[1]) {
      return { type: 'category', title: categoryMatch[1].trim() };
    }
    
    // Extract from quoted strings
    const quotedMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
    if (quotedMatch?.[1]) {
      const title = quotedMatch[1].trim().replace(/^Category:\s*/i, '').trim();
      if (title.length > 2) {
        return { type: 'category', title };
      }
    }
    
    // Extract any word with underscores that looks like a category
    const underscoreMatch = raw.match(/([A-Z][a-zA-Z_]+(?:_in_[A-Z][a-zA-Z_]+)+)/);
    if (underscoreMatch?.[1]) {
      return { type: 'category', title: underscoreMatch[1].trim() };
    }
    
    return null;
  }
  
  const extracted = extractCategory(raw);
  if (extracted) {
    console.log(`[decideWikipediaSourceWithAI] EXTRACTED:`, extracted);
    return extracted;
  }
  
  // FALLBACK: If AI didn't return valid format, use AI again to extract region and construct category
  console.warn(`[decideWikipediaSourceWithAI] Could not extract category from response, using fallback AI extraction`);
  
  let fallbackOut = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `Extract geographic region from locations. Identify neighborhoods, cities, streets, areas, postal codes / ZIP codes, and FSAs. Ignore business names and service terms.

If the user's prompt mentions postal codes or ZIP codes, you MUST construct a postal/ZIP-code Wikipedia source first:
- Canada: categories/lists like "Category:Postal_codes_in_Canada" or "Postal_codes_in_Canada:_X"
- United States: pages like "List_of_ZIP_Code_prefixes" or "ZIP_codes_in_STATE".

Otherwise, construct a standard location-based category in format "Type_in_Location" using underscores (e.g., "Neighbourhoods_in_Edmonton").

Return ONLY a Wikipedia category or list name (no JSON, no explanation).`,
      },
      {
        role: 'user',
        content: `Locations:\n${list}\n\nWikipedia category name (format: Type_in_Location):`,
      },
    ],
    temperature: 0.2,
    maxTokens: 100,
    topP: 0.9,
    onContentChunk: (chunk) => {
      fallbackOut += chunk;
    },
  });
  
  const fallbackCategory = fallbackOut.trim().replace(/^Category:\s*/i, '').replace(/[^a-zA-Z_]/g, '').trim();
  if (fallbackCategory.length > 5) {
    console.log(`[decideWikipediaSourceWithAI] FALLBACK CATEGORY:`, fallbackCategory);
    return { type: 'category', title: fallbackCategory };
  }
  
  // LAST RESORT: Default category based on common patterns
  console.warn(`[decideWikipediaSourceWithAI] Using last resort default category`);
  return { type: 'category', title: 'Neighbourhoods_in_Edmonton' }; // Default fallback
}

/**
 * Pick a different Wikipedia category or list in the SAME high-level location (e.g. streets, avenues, list of X).
 * Used when the first category didn't yield enough entities (already covered). Avoids picking the same source again.
 */
export async function decideFallbackWikipediaSourceWithAI(
  alreadyUsedSources: WikipediaSource[],
  existingOrigins: string[],
  promptModifier: string | undefined,
  keyword: string | undefined,
  apiKey: string
): Promise<WikipediaSource | null> {
  const usedTitles = alreadyUsedSources.map((s) => s.title.toLowerCase().replace(/\s+/g, '_'));
  const list = existingOrigins.length > 0 ? existingOrigins.join('\n') : '(none)';
  const usedList = usedTitles.length > 0 ? `Already used (do NOT pick these again): ${usedTitles.join(', ')}` : '';
  const modifier = promptModifier?.trim() ? ` User preference: "${promptModifier.trim()}".` : '';
  const keywordContext = keyword?.trim() ? ` Business/service context keyword: "${keyword.trim()}".` : '';

  let out = '';
  await streamChatCompletion({
    apiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content: `You are a geographic location expert. Your task: pick a DIFFERENT Wikipedia category or list page in the SAME geographic region.

RULES:
1. Read the existing location origins to infer the region (city, area, country).
2. You must pick a category/list that is LOCATION-BASED and in the same region.
3. Prefer different location types: if we already used "Neighbourhoods_in_X", pick e.g. "Streets_in_X", "Avenues_in_X", "List_of_neighbourhoods_in_X", "Districts_in_X", "Villages_in_X", "Suburbs_of_X", or other relevant geographic locality types for that region.
4. If the user prompt mentions "postal code(s)" or "zip code(s)", strongly prefer postal/ZIP-code sources for the same region, such as:
   - Canada: "Category:Postal_codes_in_Canada", "Postal_codes_in_Canada:_X" variants, or similar postal-code list pages
   - United States: "List_of_ZIP_Code_prefixes", "ZIP_codes_in_STATE", or similar ZIP-code list/category pages
   - For postal codes per CITY, also consider city-level postal code list pages where available.
5. STREET / ROAD / AVENUE SOURCES:
   - When the requested entity type or context suggests streets, prefer titles like "Streets_in_City", "Roads_in_City", "Avenues_in_City", or similar.
6. Return a DIFFERENT source than any already used. Never repeat the same title.
7. Output valid JSON only: {"type":"category","title":"Category_Name_With_Underscores"} or {"type":"list","title":"List_page_title"}. Use the business/service keyword only as context, not as a topic.`,
      },
      {
        role: 'user',
        content: `Existing location origins (same region):\n${list}\n\n${usedList}\n\nPick ONE different Wikipedia category or list in this same region (e.g. streets, avenues, list of areas).${modifier}${keywordContext}\n\nReturn JSON:`,
      },
    ],
    temperature: 0.4,
    maxTokens: 200,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });

  const raw = out.trim().replace(/^`*json\s*|`*$/gi, '').trim();
  function extractSource(raw: string): WikipediaSource | null {
    try {
      const parsed = JSON.parse(raw) as { type?: string; title?: string };
      if (parsed?.title && typeof parsed.title === 'string') {
        const title = parsed.title.trim().replace(/^Category:\s*/i, '').trim();
        if (title.length > 2 && !usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) {
          const type = parsed.type === 'list' ? 'list' : 'category';
          return { type, title };
        }
      }
    } catch {
      // Unparseable title fragment: fall through to the pattern match below.
    }
    const categoryMatch = raw.match(/(?:Category:)?([A-Za-z][a-zA-Z0-9_]+(?:_in_[A-Za-z][a-zA-Z0-9_]+)+)/);
    if (categoryMatch?.[1]) {
      const title = categoryMatch[1].trim();
      if (!usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) return { type: 'category', title };
    }
    const quotedMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
    if (quotedMatch?.[1]) {
      const title = quotedMatch[1].trim().replace(/^Category:\s*/i, '').trim();
      if (title.length > 2 && !usedTitles.includes(title.toLowerCase().replace(/\s+/g, '_'))) {
        return { type: 'category', title };
      }
    }
    return null;
  }

  const extracted = extractSource(raw);
  if (extracted) {
    console.log(`[decideFallbackWikipediaSourceWithAI] Fallback source:`, extracted);
    return extracted;
  }
  return null;
}
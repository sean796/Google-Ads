/**
 * Extract Locations from Entity Titles
 * AI-driven extraction of LOWEST-LEVEL geographic location names from entity sitemap post titles.
 * Used for pre-count deduplication so we do not pull Wikipedia locations that already exist.
 * Focus: neighborhoods only (not cities, not streets) - think advanced local SEO entity mapping.
 */

import { streamChatCompletion } from '@/lib/api';
import { logger } from "@/lib/logger";
import { getResearchModel } from '@/lib/optimization-settings-storage';

/**
 * Extract LOWEST-LEVEL geographic location names from entity sitemap post titles using AI.
 * Extracts ONLY neighborhoods/areas (lowest level), NOT cities or parent regions.
 * Returns deduplicated list of neighborhood names (case-insensitive dedupe).
 * 
 * Full AI control - no truncation, large context window, no hardcoded examples.
 */
export async function extractLocationsFromEntityTitles(
  titles: string[],
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<string[]> {
    if (titles.length === 0) return [];

  onProgress?.('Extracting neighborhood locations from entity sitemap titles (AI)...');

  const systemPrompt = `You are an advanced local SEO entity mapping system. Extract ONLY the lowest-level geographic location from entity sitemap post titles.

CRITICAL RULES:
1. Extract ONLY neighborhoods, areas, districts - the LOWEST LEVEL location mentioned.
2. If title contains "Neighborhood City" or "Area City", extract ONLY the neighborhood/area, NOT the city.
3. If title contains "Street City", extract ONLY the street/area name, NOT the city.
4. Ignore: service names, business names, keywords, taglines, numbers, years, cities, states, countries.
5. Think like advanced local SEO: each title targets ONE specific neighborhood/area entity.
6. Extract the most specific, granular location mentioned - neighborhoods over cities, streets over districts.

EXAMPLES OF WHAT TO EXTRACT:
- Title: "Service Near Abbottsfield Edmonton" → Extract: "Abbottsfield" (neighborhood, not Edmonton)
- Title: "Service Beltline Calgary" → Extract: "Beltline" (neighborhood, not Calgary)
- Title: "Service 124th Street Edmonton" → Extract: "124th Street" (specific area, not Edmonton)

EXAMPLES OF WHAT NOT TO EXTRACT:
- Cities, states, provinces, countries (too high-level)
- Service names, business names, keywords
- Generic terms like "Prices", "Rental", "Your", "Junk"

OUTPUT: Return ONLY a JSON array of strings. Each string is ONE lowest-level location (neighborhood/area). Deduplicate (same place once). No explanations.`;

  // NO TRUNCATION - send ALL titles with large context window
  const titlesBlock = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const userPrompt = `ENTITY SITEMAP POST TITLES (extract ONLY lowest-level neighborhoods/areas, NOT cities):

${titlesBlock}

Return a JSON array of neighborhood/area names extracted from these titles. Extract ONLY the most specific location (neighborhood/area), NOT cities or parent regions. One location per string. No duplicates.`;

  let out = '';
  try {
    await streamChatCompletion({
      apiKey,
      model: getResearchModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 16384, // Large context window for full titles
      topP: 0.9,
      onContentChunk: (chunk) => {
        out += chunk;
      },
    });
  } catch (err) {
    logger.warn('[Entity titles → locations] AI call failed:', err);
    onProgress?.('Location extraction from titles skipped (API error).');
    return [];
  }

  out = out.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  let locations: string[] = [];
  try {
    const match = out.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        locations = parsed
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim());
      }
    }
  } catch {
    logger.warn('[Entity titles → locations] Failed to parse AI response');
    return [];
  }

  // Deduplicate case-insensitively, preserve first occurrence
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const loc of locations) {
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(loc);
  }

    if (deduped.length > 0) {
    onProgress?.(`Extracted ${deduped.length} neighborhood location(s) from entity sitemap titles.`);
  }

  return deduped;
}

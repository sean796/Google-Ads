import { logger } from "@/lib/logger";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { extractGeographicEntityWithAI } from "@/lib/content-optimization-helpers";
import { BACKEND_CONNECTION_ERROR, backendApiUrl } from "@/lib/wordpress-api/connection";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/**
 * Analyzes a WordPress post title to extract the origin entity (location) using AI
 * This is for local SEO service area pages where the origin is the target location
 * 
 * @param title - Post title to analyze
 * @param apiKey - OpenRouter API key (optional, will load from storage if not provided)
 * @returns Promise resolving to the origin entity string (e.g., "Palm City, Florida")
 */
export async function analyzeTitleForOrigin(
  title: string,
  apiKey?: string
): Promise<string> {
  const openRouterApiKey = apiKey || loadApiKey();
  
  if (!openRouterApiKey || !openRouterApiKey.trim()) {
    throw new Error("OpenRouter API key is required for entity analysis");
  }

  const systemPrompt = `You are a local SEO expert specializing in geographic entity extraction for service area pages.

YOUR TASK: Extract the EXACT location phrase from the title, preserving the original format.

CRITICAL RULES:
1. Extract the COMPLETE location exactly as written - including street/avenue numbers, directional indicators (NW, SE, etc.), and city name
2. Keep commas and formatting as they appear in the original title
3. Do NOT simplify "34 Avenue NW, Edmonton" to just "Edmonton"
4. Do NOT simplify "Whyte Avenue, Edmonton" to just "Edmonton"
5. Return "NONE" if there is no geographic location
6. **CRITICAL: NEVER extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01", "2024/01/01") of any kind. Return "NONE" if the title only contains a year or date without a specific geographic location.
7. **CRITICAL: Entities MUST be geolocations ONLY - nothing generic or personal!** NEVER extract personal or generic entities like "home", "Your Home", "My Home", "The Home", "house", "Your House", "My House", "The House", "place", "Your Place", "My Place", "The Place", "Your Big Day", "My Big Day", "The Big Day", "Your Special Day", "My Special Day", "Your Event", "My Event", "Your New Business", "My New Business", "The New Business", "Your Business", "My Business", "Your Company", "My Company", "New Business", "Business", "Office", "Offices", "Workplace", "Store", "Shop", "Location", "Area", "Region", "Neighborhood", "Venue", "Facility", "Building", "Establishment", "Premises", "Site", or ANY other personal/business/workplace terms as entities** - These are generic terms, NOT geographic locations. Entities MUST be geolocations only (cities, states, streets, neighborhoods, etc.). Return "NONE" if the title contains ANY entity starting with "Your", "My", or "The" unless it's clearly followed by a specific geographic location name (city, street, etc.). AGGRESSIVELY REJECT all personal/business/workplace entities. If you see "Your New Business", "Offices", "Office", or similar generic business terms, return "NONE" immediately.

EXAMPLES - Extract the EXACT location phrase:
- Title: "Your Local Dental Clinic Near 34 Avenue NW, Edmonton" → Extract: "34 Avenue NW, Edmonton"
- Title: "Dentist on Whyte Avenue, Edmonton" → Extract: "Whyte Avenue, Edmonton"
- Title: "Dental Services in Sherwood Park, Alberta" → Extract: "Sherwood Park, Alberta"
- Title: "Best Dentist Downtown Toronto" → Extract: "Downtown Toronto"
- Title: "Window Blinds Palm City Florida" → Extract: "Palm City, Florida"

INVALID (return "NONE"):
- "Large Living Room Windows" - no location
- "Kitchen Blinds Installation" - no location
- "Modern Window Treatments" - no location
- "Blinds for Your Home" - "Your Home" is NOT a geographic location, return "NONE"
- "Window Treatments in My Home" - "My Home" is NOT a geographic location, return "NONE"
- "Shades Near Me for Your Home" - "Your Home" is NOT a geographic location, return "NONE"
- "Blinds for Your Big Day" - "Your Big Day" is NOT a geographic location, return "NONE"
- "Window Treatments for My Special Day" - "My Special Day" is NOT a geographic location, return "NONE"
- "Shades for The Event" - "The Event" is NOT a geographic location, return "NONE"
- "Commercial Window Coverings for Your New Business" - "Your New Business" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments for My Business" - "My Business" is NOT a geographic location, return "NONE"
- "Blinds for New Business" - "New Business" is NOT a geographic location, return "NONE"
- "Top Three Commercial Blinds for Offices" - "Offices" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments for Office" - "Office" is NOT a geographic location, return "NONE" IMMEDIATELY
- "Window Treatments 2024" - "2024" is a year, NOT a geographic location, return "NONE"
- "Blinds January 2024" - "January 2024" is a date, NOT a geographic location, return "NONE"
- "Shades 2024-01-01" - "2024-01-01" is a date, NOT a geographic location, return "NONE"

Return ONLY the exact location phrase from the title, or "NONE". No other text.`;

  const userPrompt = `Extract the EXACT location phrase from this title. Include street/avenue names, directional indicators (NW, SE, etc.), and city name exactly as written:

"${title}"

IMPORTANT: 
- Return the complete location like "34 Avenue NW, Edmonton" - do NOT simplify to just "Edmonton"
- **CRITICAL: Do NOT extract years or dates as entities** - Entities cannot be years (e.g., "2024", "2023") or dates (e.g., "January 2024", "2024-01-01") of any kind. If the title only contains a year or date without a specific geographic location, return "NONE".
- **CRITICAL: Entities MUST be geolocations ONLY - nothing generic or personal!** Do NOT extract personal or generic entities like "home", "Your Home", "My Home", "house", "Your House", "place", "Your Big Day", "My Big Day", "Your Special Day", "My Event", "Your New Business", "My New Business", "The New Business", "Your Business", "My Business", "New Business", "Business", "Your Company", "My Company", "Office", "Offices", "Workplace", "Store", "Shop", "Location", "Area", "Region", "Neighborhood", "Venue", "Facility", "Building", "Establishment", "Premises", "Site", or ANY other personal/business/workplace possessive phrases (Your/My/The + generic/business term) as entities** - These are NOT geographic locations. Entities MUST be geolocations only (cities, states, streets, neighborhoods, etc.). AGGRESSIVELY REJECT all entities starting with "Your", "My", or "The" unless clearly followed by a specific geographic location. If the title contains any such personal/business/workplace entity without a specific geographic location, return "NONE" immediately. If you see "Offices", "Office", or any standalone business/workplace term, return "NONE" immediately.`;

  try {
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(openRouterApiKey),
      body: JSON.stringify({
        model: getResearchModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 200, // Increased to handle longer entity names with specific locations
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI analysis failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const origin = data.choices?.[0]?.message?.content?.trim() || "";
// Clean up any markdown formatting or extra text
    const cleanedOrigin = origin
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/`/g, '') // Remove code blocks
      .trim();

    // Check if extracted value is a placeholder, "NONE", or invalid
    // These indicate no actual geographic entity - treat as N/A
    const placeholderPatterns = [
      /^\[.*\]$/,  // Matches [city], [location], [area], etc.
      /^<.*>$/,    // Matches <city>, <location>, etc.
      /^\{.*\}$/,  // Matches {city}, {location}, etc.
      /^placeholder$/i,
      /^n\/a$/i,
      /^none$/i,
      /^not applicable$/i,
      /^no geographic location$/i,
      /^no location$/i,
      /^not found$/i,
    ];

    const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(cleanedOrigin));
    
    if (isPlaceholder) {
      return "";
    }
if (!cleanedOrigin) {
      logger.warn(`[ACF Origin] No origin entity extracted from title: "${title}"`);
      return "";
    }

    // Trust research model output (fully agentic - no blocklist validation)
    return cleanedOrigin;
  } catch (error) {
    logger.error(`[ACF Origin] Error analyzing title:`, error);
    throw error;
  }
}

/**
 * AI agent: extract the single geographic location (Origin) from full post context.
 * Use this in the ACF process so Origin is filled from title, URL/slug, and excerpt - no manual extraction.
 */
export async function analyzeOriginFromContext(options: {
  title: string;
  pageUrl?: string;
  excerpt?: string;
  slug?: string;
  existingOrigin?: string;
  apiKey?: string;
}): Promise<string> {
  const { title, pageUrl, excerpt, slug, existingOrigin, apiKey } = options;
  const openRouterApiKey = apiKey || loadApiKey();
  if (!openRouterApiKey?.trim()) throw new Error("OpenRouter API key is required for origin extraction");

  const systemPrompt = `You are a local SEO expert. Your ONLY task is to extract the single geographic location (the "Origin") for a service area page.

RULES:
1. Return ONLY the location phrase: neighborhood/area + city (e.g. "Downtown Edmonton", "Baranow, Edmonton", "34 Avenue NW, Edmonton"). Nothing else.
2. Use ALL context provided: title, URL slug, and excerpt. The slug often contains the location (e.g. "edmonton-seo-near-downtown-edmonton" → "Downtown Edmonton").
3. Prefer the SPECIFIC location (neighborhood/area + city), not just the city. "downtown edmonton" in slug or excerpt → return "Downtown Edmonton", not "Edmonton".
4. If no geographic location can be determined, return exactly: NONE
5. No marketing words, no "your", "local", "guide", "growth" - only the place name.`;

  const parts: string[] = [`Title: ${title || '(none)'}`];
  if (pageUrl?.trim()) parts.push(`URL: ${pageUrl.trim()}`);
  if (slug?.trim()) parts.push(`Slug: ${slug.trim()}`);
  if (excerpt?.trim()) parts.push(`Excerpt: ${excerpt.trim()}`);
  if (existingOrigin?.trim()) parts.push(`Current Origin (can use or refine): ${existingOrigin.trim()}`);
  const userPrompt = `From this post context, extract the ONE geographic location (Origin) for the ACF Origin field.\n\n${parts.join('\n')}\n\nReturn only the location phrase or NONE.`;

  try {
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(openRouterApiKey),
      body: JSON.stringify({
        model: getResearchModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 120,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI origin extraction failed: ${response.status} ${err.slice(0, 150)}`);
    }
    const data = await response.json();
    const origin = (data.choices?.[0]?.message?.content ?? "").trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\*\*/g, "")
      .trim();
    if (/^n\/a$|^none$/i.test(origin) || !origin) return "";
    // Trust research model output (fully agentic - no blocklist validation)
    return origin;
  } catch (error) {
    logger.error(`[ACF Origin] Error in analyzeOriginFromContext:`, error);
    throw error;
  }
}

/**
 * Updates the ACF Origin field for a WordPress post
 * Uses the single field update endpoint (backward compatible)
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID
 * @param origin - Origin value to set
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional exact endpoint name
 * @returns Promise resolving to success status
 */
/**
 * Origin can only contain a geographic location (e.g. neighborhood, city, street).
 * Non-geo text (e.g. "Local Search Growth Strategies") is rejected.
 */
export async function updateACFOriginField(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  origin: string,
  postType: string = 'post',
  postTypeEndpoint?: string
): Promise<{ success: boolean; error?: string }> {
  // Trust research model–derived origin (fully agentic - no blocklist validation)
  const url = backendApiUrl("/wordpress/update-acf-field");
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        fieldName: 'origin',
        fieldValue: origin,
        postType,
        postTypeEndpoint,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: data.success === true, error: data.error };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Updates multiple ACF fields in one request using the batch update endpoint
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param postId - Post ID
 * @param fields - Object with field names as keys and values as values
 * @param postType - Post type (default: 'post')
 * @param postTypeEndpoint - Optional exact endpoint name
 * @param options - Optional update options (validateOnly, verifyAfterUpdate, continueOnError)
 * @returns Promise resolving to batch update result
 */
export async function updateACFFields(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  fields: Record<string, unknown>,
  postType: string = 'post',
  postTypeEndpoint?: string,
  options?: {
    validateOnly?: boolean;
    verifyAfterUpdate?: boolean;
    continueOnError?: boolean;
  }
): Promise<{
  success: boolean;
  updated: string[];
  failed: Array<{ field: string; error: string }>;
  methods: Record<string, string>;
  diagnostics?: unknown;
  error?: string;
}> {
  const url = backendApiUrl("/wordpress/update-acf-fields");
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        fields,
        postType,
        postTypeEndpoint,
        options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data.success === true,
      updated: data.updated || [],
      failed: data.failed || [],
      methods: data.methods || {},
      diagnostics: data.diagnostics,
      error: data.error,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

/**
 * Sets ACF Origin from title, URL slug, and optional existing origin.
 * Prefers the specific location from the page URL slug (e.g. Baranow, Edmonton)
 * so we don't reduce to just the city (Edmonton).
 *
 * @param pageUrl - Optional page URL (e.g. .../painter-near-baranow-edmonton/) to extract location from slug
 * @param excerpt - Optional post excerpt (used by AI agent to fill Origin)
 * @param existingOrigin - Optional current ACF Origin (for context)
 * @param preferredOrigin - When set (e.g. hyperlocal from SAP title), written directly; skips AI extraction
 */
export async function analyzeAndUpdateOriginField(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  title: string,
  postType: string = 'post',
  postTypeEndpoint?: string,
  pageUrl?: string,
  excerpt?: string,
  existingOrigin?: string,
  preferredOrigin?: string
): Promise<{ success: boolean; origin?: string; error?: string }> {
  try {
    const preferred = preferredOrigin?.trim();
    if (preferred) {
      const result = await updateACFOriginField(
        siteUrl,
        username,
        appPassword,
        postId,
        preferred,
        postType,
        postTypeEndpoint
      );
      if (result.success) {
        return { success: true, origin: preferred };
      }
      return { success: false, origin: preferred, error: result.error };
    }

    const slugFromUrl = pageUrl ? (() => {
      try {
        const p = new URL(pageUrl).pathname.split('/').filter(Boolean);
        return p[p.length - 1] || '';
      } catch { return ''; }
    })() : '';
    const origin = await extractGeographicEntityWithAI(
      { title, url: pageUrl?.trim(), excerpt: excerpt?.trim(), slug: slugFromUrl || undefined },
      undefined,
      { siteUrl }
    );
    if (!origin || !origin.trim()) {
      return { success: true, origin: undefined };
    }

    // Update ACF field
    const result = await updateACFOriginField(
      siteUrl,
      username,
      appPassword,
      postId,
      origin,
      postType,
      postTypeEndpoint
    );

    if (result.success) {
      return { success: true, origin };
    }
    return { success: false, origin, error: result.error };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[ACF Origin] Error in analyzeAndUpdateOriginField:`, error);
    return { success: false, error: errorMessage };
  }
}


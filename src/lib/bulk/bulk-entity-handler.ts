import { parseSitemap, getPublishedPosts } from '../wordpress-api';
import type { WordPressSite } from '@/components/integrations/types';
import { extractEndpointFromEntitySitemapUrl } from '../entity-endpoint-extractor';
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/**
 * Uses AI to analyze entity sitemap titles and extract service nickname
 * Then generates a title following the "Service Near Entity" pattern
 * Optimized for "near me" searches and Google local packs
 * 
 * Uses entity endpoint extraction pattern (Content Optimizer module approach)
 */
export async function generateEntityTitleFromSitemap(
  entity: string,
  entitySitemapUrl: string,
  site: WordPressSite,
  apiKey: string,
  keyword?: string
): Promise<string> {
  try {
    // Extract entity endpoint from sitemap (entity sitemap pattern)
    const entityEndpoint = extractEndpointFromEntitySitemapUrl(entitySitemapUrl);
    
    console.log('[Entity Title] Using entity endpoint:', entityEndpoint);

    // Parse sitemap to get URLs
    const parseResult = await parseSitemap(
      site.siteUrl,
      entitySitemapUrl,
      site.username,
      site.appPassword
    );

    if (!parseResult.urls || parseResult.urls.length === 0) {
      console.warn('[Entity Title] No URLs found in entity sitemap');
      return keyword ? `${keyword} Near ${entity}` : `Local Service Near ${entity}`;
    }

    // Fetch published posts
    // Note: getPublishedPosts doesn't currently support endpoint parameter
    // Entity endpoint extraction is used for logging/debugging purposes
    const publishedResult = await getPublishedPosts(
      site.siteUrl,
      site.username || '',
      site.appPassword || '',
      Math.min(50, parseResult.urls.length), // Sample up to 50 titles
      0
    );

    if (!publishedResult.posts || publishedResult.posts.length === 0) {
      console.warn('[Entity Title] No published posts found');
      return keyword ? `${keyword} Near ${entity}` : `Local Service Near ${entity}`;
    }

    // Match posts to sitemap URLs and collect titles
    const titles: string[] = [];
    const urlSet = new Set(parseResult.urls.map(url => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    }));

    for (const post of publishedResult.posts) {
      try {
        const postUrl = new URL(post.link);
        const postPath = postUrl.pathname.toLowerCase();
        
        // Check if this post URL matches any sitemap URL
        if (urlSet.has(postPath) || Array.from(urlSet).some(sitemapPath => 
          postPath.includes(sitemapPath) || sitemapPath.includes(postPath)
        )) {
          titles.push(post.title);
          if (titles.length >= 20) break; // Use up to 20 titles for analysis
        }
      } catch {
        // Skip invalid URLs
      }
    }

    if (titles.length === 0) {
      console.warn('[Entity Title] No matching titles found');
      return keyword ? `${keyword} Near ${entity}` : `Local Service Near ${entity}`;
    }

    // Use AI to analyze titles and extract service nickname
    const serviceNickname = await extractServiceNicknameFromTitles(titles, apiKey);
    
    // ALWAYS generate title following "Service Near Entity" pattern for "near me" searches
    // This is critical for local SEO and Google local pack optimization
    const serviceName = serviceNickname || keyword || "Local Service";
    const title = `${serviceName} Near ${entity}`;
    
    // Ensure "Near" is always present (double-check)
    const finalTitle = title.includes(' Near ') ? title : `${serviceName} Near ${entity}`;
    
    console.log(`[Entity Title] Generated title: "${finalTitle}" (from ${titles.length} analyzed titles, service: "${serviceNickname || 'default'}")`);
    return finalTitle;
  } catch (error) {
    console.error('[Entity Title] Error generating title from sitemap:', error);
    // Fallback to simple pattern
    return keyword ? `${keyword} Near ${entity}` : `Local Service Near ${entity}`;
  }
}

/**
 * Uses AI to extract service nickname from entity sitemap titles
 * Analyzes the majority intent to determine the service name
 */
async function extractServiceNicknameFromTitles(
  titles: string[],
  apiKey: string
): Promise<string | null> {
  const systemPrompt = `You are an expert SEO analyst specializing in local "near me" searches and Google local pack optimization.

CRITICAL: All entity sitemap titles MUST follow the pattern "[Service] Near [Location]" for optimal "near me" search performance.

Analyze the provided service area page titles and extract the SERVICE NICKNAME (the main service/product name that appears before location mentions).

These titles follow patterns like:
- "[Service] Near [Location]" (PREFERRED - best for "near me" searches)
- "[Service] in [Location]"
- "[Service] [Location]"

Your task:
1. Identify the common service/product name that appears in the majority of titles
2. Extract the service nickname (e.g., "Modular Homes", "Climate Controlled Structures", "HVAC Services")
3. Return ONLY the service nickname - no location names, no "Near" or "In", just the service name
4. If multiple variations exist, choose the most common one
5. If no clear pattern exists, return "null"

IMPORTANT: The extracted service nickname will be used to generate titles in the format "[Service] Near [Location]" - this ensures all titles are optimized for "near me" searches.

Examples:
- "Modular Homes Near Edmonton" → "Modular Homes"
- "Climate Controlled Pre-Fab Structures in British Columbia" → "Climate Controlled Pre-Fab Structures"
- "HVAC Services Near Calgary" → "HVAC Services"

Return ONLY the service nickname, nothing else.`;

  const userPrompt = `Analyze these ${titles.length} service area page titles and extract the service nickname:

${titles.slice(0, 20).map((t, i) => `${i + 1}. ${t}`).join('\n')}

What is the service nickname that appears in the majority of these titles? Return ONLY the service name, no location, no "Near" or "In".`;

  try {
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: getResearchModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2, // Low temperature for consistent extraction
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const serviceName = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Clean up the response
    let cleaned = serviceName
      .replace(/["']/g, '')
      .replace(/^service\s*:\s*/i, '')
      .replace(/^nickname\s*:\s*/i, '')
      .trim();
    
    // Check if it's a valid service name (not "null" or empty)
    if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned.length < 2) {
      return null;
    }
    
    return cleaned;
  } catch (error) {
    console.error('[Entity Title] Error extracting service nickname:', error);
    return null;
  }
}

/**
 * Extract entity endpoint from sitemap URL (entity sitemap pattern)
 * This is the standard pattern used throughout the codebase
 */
export function getEntityEndpoint(entitySitemapUrl?: string): string | null {
  if (!entitySitemapUrl) {
    return null;
  }
  return extractEndpointFromEntitySitemapUrl(entitySitemapUrl);
}


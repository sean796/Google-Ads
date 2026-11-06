/**
 * WordPress API Utils Module
 * Utility functions for WordPress operations
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type {
  GenerateEntitiesResult,
  CheckFuturePostsResult
} from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/**
 * Generate entities based on service-area sitemap URLs (AI-only, no wiki validation).
 * @deprecated Use the agentic entity flow from @/lib/entity instead (read previous → DFS → SERP → wiki-validate).
 * New code should call generateEntities({ site, sitemapUrl, count, promptModifier }) from '@/lib/entity'.
 *
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param urls - Array of service-area URLs to analyze
 * @param count - Number of entities to generate
 * @param existingEntities - Optional array of existing entities to avoid conflicts
 * @param openRouterApiKey - OpenRouter API key for AI analysis
 *
 * @returns Promise resolving to GenerateEntitiesResult with array of entity names
 *
 * @throws Error if API key is missing or generation fails
 */
export async function generateEntities(
  siteUrl: string,
  username: string,
  appPassword: string,
  urls: string[],
  count: number,
  existingEntities?: string[],
  openRouterApiKey?: string
): Promise<GenerateEntitiesResult> {
  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key is required for entity generation');
  }

  const { streamGeneration } = await import('@/lib/api');
  
  // Build prompt to generate new service area entities based on existing ones
  const existingEntitiesText = existingEntities && existingEntities.length > 0 
    ? `\n\nExisting service area entities (DO NOT duplicate these):\n${existingEntities.slice(0, 20).map((e, i) => `${i + 1}. ${e}`).join('\n')}${existingEntities.length > 20 ? `\n... and ${existingEntities.length - 20} more` : ''}`
    : '';
  
  const systemPrompt = `You are an expert at generating service area location names for local business websites. Your task is to generate realistic, natural location names that follow geographic patterns.

${existingEntitiesText}

Generate EXACTLY ${count} new, unique service area location names that:
1. Are real or realistic geographic locations (cities, neighborhoods, areas)
2. Follow the same naming pattern as existing entities shown above
3. Are NOT duplicates of existing entities
4. Are formatted as natural location names (e.g., "Miami Beach", "Downtown Orlando", "Tampa Bay Area")
5. Are appropriate for a service area page

Return ONLY a JSON array of location names. Example format:
["Location Name 1", "Location Name 2", "Location Name 3"]`;

  const userPrompt = `Generate ${count} unique service area location names that are similar in style to the existing ones but are NOT duplicates. Return as a JSON array.`;

  let aiResponse = '';
  try {
    const { getResearchModel } = await import("../optimization-settings-storage");
    const researchModel = getResearchModel();
    await streamGeneration({
      apiKey: openRouterApiKey,
      model: researchModel,
      systemPrompt,
      userPrompt,
      temperature: 1.0,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });
  } catch (streamError) {
    console.error('[generateEntities] streamGeneration failed:', streamError);
    throw new Error(`AI generation failed: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`);
  }
  
  if (!aiResponse || aiResponse.trim().length === 0) {
    throw new Error('AI generation returned empty response');
  }

  // Parse AI response to extract entities
  let generatedEntities: string[] = [];
  try {
    // Try to extract JSON array from response
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      generatedEntities = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: parse line by line
      const lines = aiResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      generatedEntities = lines
        .map(line => {
          // Remove quotes, brackets, numbers, dashes
          return line.replace(/^[\d\-\s]*["']?|["']?[,\]]*$/g, '').trim();
        })
        .filter(e => e.length > 0)
        .slice(0, count);
    }
  } catch (parseError) {
    console.warn('[generateEntities] Failed to parse AI response:', parseError);
    throw new Error(`Failed to parse generated entities: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }

  // Filter out duplicates and existing entities, ensure we have the right count
  generatedEntities = generatedEntities
    .filter((e, i, arr) => arr.indexOf(e) === i) // Remove duplicates
    .filter(e => !existingEntities?.includes(e)) // Remove existing
    .slice(0, count); // Limit to requested count

  if (generatedEntities.length === 0) {
    throw new Error('No entities generated. Please check your sitemap and settings.');
  }

  return { entities: generatedEntities };
}

/**
 * Check for future status posts in a sitemap
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param sitemapUrl - URL of the sitemap to check
 * 
 * @returns Promise resolving to CheckFuturePostsResult with future post count and list
 * 
 * @throws Error if backend server is not running or API call fails
 */
export async function checkFuturePosts(
  siteUrl: string,
  username: string,
  appPassword: string,
  sitemapUrl: string
): Promise<CheckFuturePostsResult> {
  const url = backendApiUrl('/wordpress/check-future-posts');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        sitemapUrl,
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
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}


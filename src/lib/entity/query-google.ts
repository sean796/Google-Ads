/**
 * Entity Query Google - agentic wiki research
 * AI-driven DFS search query generation and SERP fetch.
 */

import { mcpPostInit, resolveMcpApiBase } from "@/lib/mcp-tools";
import { logger } from "@/lib/logger";
import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';

const MCP_API_BASE =
  resolveMcpApiBase();

export interface SerpOrganicItem {
  title: string;
  description?: string;
  url?: string;
}

export interface QueryGoogleInput {
  existingEntities: string[];
  primaryCity: string | null;
  promptModifier?: string;
  openRouterApiKey: string;
  /** When true, ask for a broader/alternate query (retry path) */
  alternate?: boolean;
}

/**
 * Derive a short-tailed DFS search keyword (3-5 words) from the site's content.
 * Used for DataForSEO SERP - must be simple, short, directly related to the site.
 */
export async function deriveEntitySearchKeywordFromSiteContent(
  siteName: string,
  contentContext: string,
  openRouterApiKey: string
): Promise<string> {
  const { streamChatCompletion } = await import('@/lib/api');
  const { getResearchModel } = await import('@/lib/optimization-settings-storage');

  const systemPrompt =
    'You are a search keyword expert. Return ONLY 3-5 words. Short-tailed only. No sentences, no explanations. ' +
    'Infer the main product or service from the content. Format: [category] near me. ' +
    'Rules: (1) 3-5 words maximum. (2) No business name, no locations. (3) Directly related to what the site sells. Return nothing else.';

  const userPrompt = contentContext
    ? `Site: "${siteName}". Post content:\n\n${contentContext}\n\nOne short search phrase (3-5 words) for this business. Example: window treatments near me`
    : `Site: "${siteName}". One short search phrase (3-5 words). Example: PRODUCT OR SERVICE near me`;

  let out = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 100,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });
  const raw = out.trim().replace(/^["']|["']$/g, '').trim();
  // Enforce 3-5 words: take first 5 words only
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 5);
  return words.join(' ') || raw;
}

/**
 * @deprecated Use deriveEntitySearchKeywordFromSiteContent with post content. Kept for backwards compatibility.
 */
export async function deriveEntitySearchKeywordFromSiteName(
  siteName: string,
  openRouterApiKey: string
): Promise<string> {
  return deriveEntitySearchKeywordFromSiteContent(siteName, '', openRouterApiKey);
}

/**
 * Derive the title format for new service entities from entity page titles only (AI-driven).
 * Source: entity URL / entity sitemap post type - not blog posts. No hardcoding. Pattern inferred from data only.
 * Returns a template string with exactly one placeholder: {entity} (the location/area name).
 */
export async function deriveTitleFormatFromExistingTitles(
  existingTitles: string[],
  openRouterApiKey: string
): Promise<string> {
  if (!existingTitles?.length) return '';
  const { streamChatCompletion } = await import('@/lib/api');
  const { getResearchModel } = await import('@/lib/optimization-settings-storage');
  const titlesList = existingTitles.slice(0, 100).join('\n');

  const systemPrompt =
    'You infer naming patterns from the titles provided. Return ONLY a single template string. ' +
    'The template must contain exactly the placeholder {entity} where the location/area name goes. ' +
    'Mirror the pattern the existing titles actually use. If they pair a service phrase with the location, keep that shape with natural local phrasing (for example "[service phrase] in {entity}" or "[service phrase] near {entity}"); do not force the word "near" when the existing titles do not use it. Keyword = service/product ONLY. ' +
    'Return nothing else: no explanation, no quotes, just the template.';

  const userPrompt = `Entity page titles (from entity URL / sitemap):\n\n${titlesList}\n\nInfer the naming pattern. Return one template string with {entity} as the only placeholder for the location name.`;

  let out = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 120,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });
  const raw = out.trim().replace(/^["']|["']$/g, '').trim();
  if (!raw.includes('{entity}')) return '';
  return raw;
}

/**
 * Generate one DFS Google search query from context (AI-driven).
 * Without modifier: "Given existing areas + city, suggest one search query for more similar locations."
 * With modifier: include modifier in the prompt.
 */
export async function generateDfsSearchQuery(input: QueryGoogleInput): Promise<string> {
  const { existingEntities, primaryCity, promptModifier, openRouterApiKey, alternate } = input;
  const city = primaryCity || 'United States';
  // RAG: full list of service area Origin values so AI does not suggest queries that would return them
  const RAG_MAX = 200;
  const existingText =
    existingEntities.length > 0
      ? `EXISTING SERVICE AREA ORIGINS (from WordPress - do not suggest queries that would return these): ${existingEntities.slice(0, RAG_MAX).join(', ')}${existingEntities.length > RAG_MAX ? ` ... and ${existingEntities.length - RAG_MAX} more` : ''}`
      : 'No existing service areas yet.';

  const systemPrompt =
    'You are a search query expert. Return only a single Google search query string, no quotes or explanation. Return ONLY short queries for neighborhoods/areas in the city - do NOT include business type, product, or service words (e.g. no blinds, drapery, window treatments, etc.).';
  const userPrompt = promptModifier?.trim()
    ? `Generate a Google search query to find more entities like: "${promptModifier}". Location: ${city}. ${existingText}. Return ONE short query (e.g. "${city} neighborhoods" or "neighborhoods in ${city}"). Do NOT add product or service keywords.`
    : alternate
      ? `Generate a different, broader Google search query to find neighborhoods or areas in ${city}. ${existingText}. Return ONE short query only (e.g. "${city} neighborhoods", "areas in ${city}", "neighborhoods in ${city}"). No business/product/service words.`
      : `Given primary city: ${city}. ${existingText}. Generate ONE short Google search query for more neighborhoods/areas in ${city}. Examples: "${city} neighborhoods" or "neighborhoods in ${city}". Return only that query - no product, service, or business keywords.`;

  let out = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 200,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });
  return out.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Call DataForSEO SERP and return organic items (titles, snippets, URLs).
 */
export async function fetchSerpOrganic(
  keyword: string,
  locationName: string,
  languageCode: string = 'en',
  depth: number = 20
): Promise<SerpOrganicItem[]> {
  const res = await fetch(
    `${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`,
    mcpPostInit({
      keyword,
      location_name: locationName,
      language_code: languageCode,
      depth,
      people_also_ask_click_depth: 2,
    }),
  );
  if (!res.ok) {
    logger.warn('[Entity] SERP request failed:', await res.text());
    return [];
  }
  const data = await res.json();
  const items: SerpOrganicItem[] = [];
  const result = data?.tasks?.[0]?.result;
  if (!result) return items;
  const list = Array.isArray(result) ? result : result?.items ?? [result];
  for (const item of list) {
    if (item?.type === 'organic' || !item?.type) {
      items.push({
        title: item.title ?? '',
        description: item.description ?? item.snippet ?? '',
        url: item.url ?? item.link ?? '',
      });
    }
    if (item?.items && Array.isArray(item.items)) {
      for (const sub of item.items) {
        if (sub?.type === 'organic' || !sub?.type) {
          items.push({
            title: sub.title ?? '',
            description: sub.description ?? sub.snippet ?? '',
            url: sub.url ?? sub.link ?? '',
          });
        }
      }
    }
  }
  return items;
}

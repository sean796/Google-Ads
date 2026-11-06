/**
 * Entity Extract Candidates - agentic wiki research
 * AI extraction of candidate entity strings from SERP titles/snippets; isValidEntity + dedup.
 */

import { streamChatCompletion } from '@/lib/api';
import { logger } from "@/lib/logger";
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { isValidEntity } from '@/components/integrations/entity-generation/validation/entityValidator';
import { entityConflictsWithExisting } from '@/components/integrations/entity-generation/filtering/conflictChecker';
import type { SerpOrganicItem } from './query-google';

export interface ExtractCandidatesInput {
  serpItems: SerpOrganicItem[];
  primaryCity: string | null;
  existingEntities: string[];
  promptModifier?: string;
  openRouterApiKey: string;
  /** Cap candidates returned (default 50) */
  cap?: number;
}

/**
 * Extract candidate entity names from SERP results (AI-driven).
 * Applies isValidEntity and dedup; returns up to cap candidates.
 */
export async function extractCandidates(input: ExtractCandidatesInput): Promise<string[]> {
  const {
    serpItems,
    primaryCity,
    existingEntities,
    promptModifier,
    openRouterApiKey,
    cap = 50,
  } = input;
  if (serpItems.length === 0) return [];
  const searchLocation = primaryCity || 'United States';
  const serpContent = serpItems
    .slice(0, 30)
    .map(
      (r, i) =>
        `${i + 1}. Title: ${r.title}\n   Description: ${r.description || 'N/A'}\n   URL: ${r.url || 'N/A'}`
    )
    .join('\n\n');

  const modifierHint = promptModifier?.trim()
    ? `Entity type: "${promptModifier}". `
    : 'Entity type: neighborhoods/areas/locations. ';
  // RAG: full list of service area Origin values so AI does not suggest them (or same-place variants like "Garden City, Winnipeg" when "Garden City" exists)
  const RAG_MAX = 200;
  const existingRag = existingEntities.length > 0
    ? `\n\nEXISTING SERVICE AREA ORIGINS (from WordPress - do NOT extract these or any entity that is the same place; e.g. "Garden City" excludes "Garden City, Winnipeg"):\n${existingEntities.slice(0, RAG_MAX).join(', ')}${existingEntities.length > RAG_MAX ? ` ... and ${existingEntities.length - RAG_MAX} more` : ''}\n`
    : '';
  const userPrompt = `Extract geographic location entity names from these Google search results. ${modifierHint}Location: ${searchLocation}.

NEVER extract: years, dates, "Your Home", "My Home", personal phrases, or numbers-only. ONLY extract location/neighborhood/area names from "${searchLocation}".${existingRag}

Search Results:
${serpContent}

Return ONLY a JSON array of entity names from "${searchLocation}". No explanations.
Example: ["Beltline", "Kensington", "Inglewood"]`;

  let out = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content:
          'You are an entity extraction expert. Extract location/neighborhood names from search results. Return only a JSON array of strings.',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.9,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });
  out = out.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: string[] = [];
  try {
    const match = out.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    logger.warn('[Entity] Failed to parse extraction response');
    return [];
  }
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const e of parsed) {
    if (typeof e !== 'string' || !e.trim() || e.trim().length < 2) continue;
    const name = e.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (entityConflictsWithExisting(name, existingEntities)) continue;
    if (!isValidEntity(name)) continue;
    seen.add(key);
    candidates.push(name);
    if (candidates.length >= cap) break;
  }
  return candidates;
}

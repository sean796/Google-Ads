/**
 * Entity Validate Modifier Google - category-first entity generation
 * Validates each entity against prompt modifier via Google SERP + AI: "is [entity] [modifier]"; keep if result doesn't clearly say no.
 */

import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { fetchSerpOrganic } from './query-google';

const CONCURRENCY = 8;

export interface ValidateModifierResult {
  valid: boolean;
}

/**
 * Build search query to check if entity matches modifier (e.g. "is St. Vital high income").
 */
function buildModifierQuery(entity: string, modifier: string): string {
  return `is ${entity} ${modifier}`.trim();
}

/**
 * Validate one entity against modifier via Google: run "is [entity] [modifier]", then AI decides if any result clearly says entity does NOT match.
 * Returns { valid: true } if we should keep the entity (no clear "no" in results).
 */
export async function validateEntityModifierViaGoogle(
  entity: string,
  modifier: string,
  locationName: string,
  openRouterApiKey: string
): Promise<ValidateModifierResult> {
  const query = buildModifierQuery(entity, modifier);
  const serpItems = await fetchSerpOrganic(query, locationName, 'en', 10);
  const snippets = serpItems
    .slice(0, 8)
    .map((item) => `${item.title}\n${item.description ?? ''}`)
    .join('\n\n');

  if (!snippets.trim()) {
    return { valid: true };
  }

  let out = '';
  await streamChatCompletion({
    apiKey: openRouterApiKey,
    model: getResearchModel(),
    messages: [
      {
        role: 'system',
        content:
          'You answer only YES or NO. Given search results, does any result clearly state that the entity does NOT match or is NOT the modifier? If no result clearly says no, answer NO. If at least one result clearly says the entity does not match, answer YES.',
      },
      {
        role: 'user',
        content: `Search query: "${query}"\n\nSnippets:\n${snippets}\n\nDoes any result clearly state that the entity does NOT match or is NOT "${modifier}"? Answer only: YES or NO.`,
      },
    ],
    temperature: 0.1,
    maxTokens: 20,
    topP: 1,
    onContentChunk: (chunk) => {
      out += chunk;
    },
  });

  const answer = out.trim().toUpperCase();
  const clearlySaysNo = answer.startsWith('YES');
  return { valid: !clearlySaysNo };
}

/**
 * Run modifier validation on many entities with concurrency limit.
 * Returns only entities that pass (valid: true).
 */
export async function validatePoolWithModifierViaGoogle(
  pool: Array<{ entity: string; wikipediaUrl: string }>,
  modifier: string,
  locationName: string,
  openRouterApiKey: string,
  options: {
    concurrency?: number;
    maxToCheck?: number;
    onProgress?: (message: string) => void;
  } = {}
): Promise<Array<{ entity: string; wikipediaUrl: string }>> {
  const { concurrency = CONCURRENCY, maxToCheck = Math.min(pool.length, 100), onProgress } = options;
  const toCheck = pool.slice(0, maxToCheck);
  const results: Array<{ entity: string; wikipediaUrl: string }> = [];

  for (let i = 0; i < toCheck.length; i += concurrency) {
    const batch = toCheck.slice(i, i + concurrency);
    onProgress?.(`Validating "${modifier}" via Google (${i + batch.length}/${toCheck.length})...`);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const { valid } = await validateEntityModifierViaGoogle(
          item.entity,
          modifier,
          locationName,
          openRouterApiKey
        );
        return valid ? item : null;
      })
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

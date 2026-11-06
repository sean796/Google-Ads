/**
 * AI Duplicate Filter
 * Uses AI to decide if a candidate location is the same place as any existing one.
 * No hardcoded string rules - model decides (e.g. "Garden City" vs "Garden City, Winnipeg" = duplicate).
 */

import { streamChatCompletion } from '@/lib/api';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import type { FullAcfPostContext } from './read-existing-origins-api';

export interface WikipediaPoolItem {
  entity: string;
  wikipediaUrl: string;
}

const POOL_BATCH_SIZE = 40;

/** Build set of existing location strings from ACF origin field only. Used for deterministic exact-match so duplicates like "Alces, Edmonton" are always excluded when they exist in origin. */
function buildExistingLocationSet(context: FullAcfPostContext[]): Set<string> {
  const set = new Set<string>();
  for (const p of context) {
    const origin = p.acf?.origin;
    if (typeof origin === 'string' && origin.trim()) {
      set.add(origin.trim().toLowerCase());
    }
  }
  return set;
}

/** Existing service-area rows for AI duplicate checks (origin + title/slug only; no full ACF JSON). */
function serializeExistingLocationsForDedupe(context: FullAcfPostContext[]): string {
  if (context.length === 0) return '(none)';
  return context
    .map((p) => {
      const o = p.acf?.origin;
      const originStr = typeof o === 'string' ? o : '';
      return `- postId=${p.postId} title="${p.title}" slug="${p.slug}" origin="${originStr}"`;
    })
    .join('\n');
}

/**
 * Filter Wikipedia pool with AI: remove any candidate that is the same geographic location
 * as any existing service-area post. Uses origin (+ title/slug) per post, not full ACF blobs.
 */
export async function filterWikipediaPoolWithAI(
  pool: WikipediaPoolItem[],
  existingAcfContext: FullAcfPostContext[],
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<WikipediaPoolItem[]> {
  if (pool.length === 0) return [];
  if (existingAcfContext.length === 0) return pool;

  const existingSet = buildExistingLocationSet(existingAcfContext);
  const poolAfterExact = pool.filter(
    (item) => !existingSet.has(item.entity.trim().toLowerCase())
  );
  const exactRemoved = pool.length - poolAfterExact.length;
  if (exactRemoved > 0) {
    onProgress?.(`Excluded ${exactRemoved} exact duplicate(s) (origin match).`);
  }

  const existingBlock = serializeExistingLocationsForDedupe(existingAcfContext);
  const systemPrompt = `You are a geographic location duplicate detector.

EXISTING SERVICE AREA POSTS: Each line has postId, title, slug, and origin (canonical location name from WordPress). Use title/slug only as extra context; origin is the primary match field.

TASK: For each CANDIDATE (a Wikipedia location name), decide if it is the SAME geographic place as any existing post's origin. If the candidate is the same place as any existing post, mark duplicate (true); otherwise not duplicate (false).

OUTPUT: Return ONLY a JSON array of booleans, one per CANDIDATE in order: true = duplicate, false = not duplicate. No explanations, only the JSON array.`;

  const kept: WikipediaPoolItem[] = [];
  for (let offset = 0; offset < poolAfterExact.length; offset += POOL_BATCH_SIZE) {
    const batch = poolAfterExact.slice(offset, offset + POOL_BATCH_SIZE);
    const batchNum = Math.floor(offset / POOL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(poolAfterExact.length / POOL_BATCH_SIZE);
    onProgress?.(`AI pool dedupe: batch ${batchNum}/${totalBatches} (${batch.length} candidates)...`);

    const userPrompt = `EXISTING SERVICE AREA POSTS (origin + title/slug):
${existingBlock}

CANDIDATES (one per line, in order):
${batch.map((c, i) => `${i + 1}. ${c.entity}`).join('\n')}

Return a JSON array of ${batch.length} booleans (true=duplicate, false=not), in the same order as CANDIDATES.`;

    let out = '';
    try {
      await streamChatCompletion({
        apiKey,
        model: getResearchModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 2048,
        topP: 0.9,
        onContentChunk: (chunk) => {
          out += chunk;
        },
      });
    } catch (err) {
      console.warn('[Entity AI pool dedupe] AI call failed for batch, keeping batch:', err);
      kept.push(...batch);
      continue;
    }

    out = out.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    let isDuplicate: boolean[] = [];
    try {
      const match = out.match(/\[[\s\S]*\]/);
      if (match) {
        isDuplicate = JSON.parse(match[0]);
      }
      if (!Array.isArray(isDuplicate) || isDuplicate.length !== batch.length) {
        isDuplicate = [];
      }
    } catch {
      console.warn('[Entity AI pool dedupe] Failed to parse AI response, keeping batch');
    }

    for (let i = 0; i < batch.length; i++) {
      if (!isDuplicate[i]) {
        kept.push(batch[i]);
      }
    }
  }

  const aiRemoved = poolAfterExact.length - kept.length;
  if (aiRemoved > 0) {
    onProgress?.(`AI pool dedupe: excluded ${aiRemoved} location(s) (AI match).`);
  }
  return kept;
}

/**
 * Filter out candidates that AI considers the same geographic location as any existing entity.
 * When existingAcfContext is provided, uses origin (+ title/slug) per post. Otherwise uses existingEntities + postTitles for legacy callers.
 */
export async function filterDuplicatesWithAI(
  candidates: string[],
  existingEntities: string[],
  apiKey: string,
  onProgress?: (message: string) => void,
  postTitles?: string[],
  existingAcfContext?: FullAcfPostContext[]
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const useAcf = existingAcfContext && existingAcfContext.length > 0;
  if (!useAcf && existingEntities.length === 0 && (!postTitles || postTitles.length === 0)) return [...candidates];

  let candidatesToCheck = candidates;
  if (useAcf && existingAcfContext) {
    const existingSet = buildExistingLocationSet(existingAcfContext);
    candidatesToCheck = candidates.filter((c) => !existingSet.has(c.trim().toLowerCase()));
    const exactRemoved = candidates.length - candidatesToCheck.length;
    if (exactRemoved > 0) {
      onProgress?.(`Excluded ${exactRemoved} exact duplicate(s) (origin match).`);
    }
    if (candidatesToCheck.length === 0) return [];
  }

  onProgress?.('Checking for duplicates with AI...');

  const systemPrompt = useAcf
    ? `You are a geographic location comparison system.

EXISTING SERVICE AREA POSTS: Each line has postId, title, slug, and origin (canonical location). The origin field is the primary match; use title/slug as supporting context.

For each CANDIDATE: if it refers to the same real-world geographic place as any existing post's origin, mark duplicate (true); otherwise not duplicate (false).

OUTPUT: Return ONLY a JSON array of booleans, one per CANDIDATE in order. No explanations, only the JSON array.`
    : `You are a geographic location extraction and comparison system.

INPUT:
1. CANDIDATES: Pure geographic location names (neighborhoods, cities, streets, areas).
2. EXISTING: Text entries that may contain geographic locations mixed with other text.
3. POST TITLES: Post titles that may contain geographic locations mixed with business/service names.

EXTRACTION LOGIC:
Read each EXISTING entry and POST TITLE. Identify and extract ONLY the geographic location component. Compare each CANDIDATE to extracted locations; if same place, mark duplicate (true), else false.

OUTPUT: Return ONLY a JSON array of booleans, one per CANDIDATE in order. No explanations, only the JSON boolean array.`;

  let contextBlock: string;
  if (useAcf) {
    contextBlock = `EXISTING SERVICE AREA POSTS (origin + title/slug):
${serializeExistingLocationsForDedupe(existingAcfContext)}`;
  } else {
    const RAG_MAX = 200;
    const existingRag = existingEntities.slice(0, RAG_MAX).join(', ') + (existingEntities.length > RAG_MAX ? ` ... and ${existingEntities.length - RAG_MAX} more` : '');
    const POST_TITLES_MAX = 200;
    const postTitlesRag = postTitles && postTitles.length > 0
      ? postTitles.slice(0, POST_TITLES_MAX).join(', ') + (postTitles.length > POST_TITLES_MAX ? ` ... and ${postTitles.length - POST_TITLES_MAX} more` : '')
      : '';
    contextBlock = `EXISTING SERVICE AREA ORIGINS (from WordPress Origin field):
${existingRag}${postTitlesRag ? `

POST TITLES (extract location from these):
${postTitlesRag}` : ''}`;
  }

  const userPrompt = `CANDIDATES (one per line, in order):
${candidatesToCheck.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${contextBlock}

Return a JSON array of ${candidatesToCheck.length} booleans (true=duplicate, false=not), in the same order as CANDIDATES.`;

  let out = '';
  try {
    await streamChatCompletion({
      apiKey,
      model: getResearchModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 2048,
      topP: 0.9,
      onContentChunk: (chunk) => {
        out += chunk;
      },
    });
  } catch (err) {
    console.warn('[Entity AI dedupe] AI call failed, skipping AI duplicate filter:', err);
    onProgress?.('AI duplicate check skipped (API error).');
    return [...candidatesToCheck];
  }

  out = out.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  let isDuplicate: boolean[] = [];
  try {
    const match = out.match(/\[[\s\S]*\]/);
    if (match) {
      isDuplicate = JSON.parse(match[0]);
    }
    if (!Array.isArray(isDuplicate) || isDuplicate.length !== candidatesToCheck.length) {
      isDuplicate = [];
    }
  } catch {
    console.warn('[Entity AI dedupe] Failed to parse AI response, treating all as non-duplicate');
  }

  const filtered = isDuplicate.length === candidatesToCheck.length
    ? candidatesToCheck.filter((_, i) => !isDuplicate[i])
    : [...candidatesToCheck];
  const removed = candidatesToCheck.length - filtered.length;
  if (removed > 0) {
    onProgress?.(`AI duplicate check: removed ${removed} duplicate(s).`);
  } else {
    onProgress?.('AI duplicate check complete (no duplicates found).');
  }

  return filtered;
}

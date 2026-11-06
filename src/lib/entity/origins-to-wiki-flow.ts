/**
 * Read origins → AI pick Wikipedia source (or user-locked sources) → fetch → filter → return entities.
 * Optional lockedWikipediaSources skips AI for those sources (processed in order until count is met).
 */

import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_SELECTED_WIKIPEDIA_CATEGORIES_HAD_NO_PAG } from "@/lib/notify-messages";
import { decideWikipediaSourceWithAI, decideFallbackWikipediaSourceWithAI, type WikipediaSource } from './decide-wikipedia-source-ai';
import { getPagesInCategoryDeep, extractEntitiesFromWikipediaList } from '@/lib/wikipedia-api';
import { filterNonPlacesWithAI } from './filter-non-places-ai';
import { filterDuplicatesWithAI, filterWikipediaPoolWithAI } from './ai-dedupe-filter';
import type { FullAcfPostContext } from './read-existing-origins-api';
import { fetchScheduledPostTitles, checkConflicts, entityConflictsWithExisting } from '@/components/integrations/entity-generation/filtering/conflictChecker';
import { analyzeTitleFormat } from '@/components/integrations/entity-generation/generation/urlLocationExtractor';
import type { WordPressSite } from '@/components/integrations/types';
import type { EntityWithCriteria, RadiusDistancePreset } from '@/components/integrations/entity-generation/types';
import {
  filterPoolByRadiusMiles,
  geocodeServiceAreaOrigin,
  radiusPresetMaxMiles,
  type ServiceAreaOrigin,
} from './radius-filter';
import { resolvePrimaryLocationLabel } from '@/lib/primary-location-from-site';

/** Wikipedia category/list fetch size - scales with requested entity count, capped. */
function categoryFetchLimitForCount(requested: number): number {
  return Math.min(300, Math.max(requested * 15, 40));
}

/** Max candidates to pass through dedupe + radius for one run (not total site entities). */
function maxWikipediaCandidatesForCount(requested: number): number {
  return Math.min(400, Math.max(requested * 12, 48));
}

export interface OriginsToWikiFlowOptions {
  site: WordPressSite;
  existingEntities: string[];
  urls: string[];
  count: number;
  promptModifier?: string;
  keyword?: string;
  apiKey: string;
  onProgress?: (message: string) => void;
  entitySitemapUrl?: string;
  existingAcfContext?: FullAcfPostContext[];
  /** @deprecated use lockedWikipediaSources */
  lockedWikipediaSource?: WikipediaSource;
  /** User-selected Wikipedia categories/lists, tried in order until enough entities are collected. */
  lockedWikipediaSources?: WikipediaSource[];
  radiusPreset?: RadiusDistancePreset;
  primaryLocationLabelOverride?: string | null;
}

export interface OriginsToWikiFlowResult {
  entities: EntityWithCriteria[];
  suggestedTitleFormat: string;
  triedSources?: string[];
  serviceAreaOrigin?: ServiceAreaOrigin;
}

export async function runOriginsToWikiFlow(
  options: OriginsToWikiFlowOptions
): Promise<OriginsToWikiFlowResult> {
  const {
    site,
    existingEntities,
    urls,
    count,
    promptModifier,
    keyword,
    apiKey,
    onProgress,
    existingAcfContext,
    lockedWikipediaSource,
    lockedWikipediaSources,
    radiusPreset,
    primaryLocationLabelOverride,
  } = options;

  const lockedList: WikipediaSource[] =
    lockedWikipediaSources?.length
      ? [...lockedWikipediaSources]
      : lockedWikipediaSource
        ? [lockedWikipediaSource]
        : [];

  const maxMi = radiusPresetMaxMiles(radiusPreset);
  let resolvedOrigin: ServiceAreaOrigin | null = null;
  if (maxMi != null) {
    const primaryLabel =
      primaryLocationLabelOverride?.trim() ||
      (await resolvePrimaryLocationLabel(site));
    resolvedOrigin = await geocodeServiceAreaOrigin(
      apiKey,
      site.id,
      site.name,
      site.siteUrl,
      primaryLabel,
      onProgress
    );
  }

  const suggestedTitleFormat = analyzeTitleFormat(urls, existingEntities, site.name);

  const scheduledTitles = await fetchScheduledPostTitles(site);
  const seen = new Set<string>();
  let validated: EntityWithCriteria[] = [];
  const usedSources: WikipediaSource[] = [];
  const maxFallbackAttempts = 3;

  let source: WikipediaSource | null = null;

  async function fetchPoolFromSource(src: WikipediaSource): Promise<Array<{ entity: string; wikipediaUrl: string }>> {
    if (src.type === 'category') {
      const fullCategory = src.title.startsWith('Category:') ? src.title : `Category:${src.title}`;
      onProgress?.(`Loading pages from ${fullCategory} (with subcategories)...`);
      const fetchLimit = categoryFetchLimitForCount(count);
      const pageTitles = await getPagesInCategoryDeep(fullCategory, { limit: fetchLimit, pageOnly: true, subcategoryDepth: 1 });
      return pageTitles.map((title) => ({
        entity: title,
        wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      }));
    }
    onProgress?.(`Loading entities from list: ${src.title}...`);
    const entityTitles = await extractEntitiesFromWikipediaList(src.title);
    return entityTitles.map((title) => ({
      entity: title,
      wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
    }));
  }

  async function loadPoolWithBroadening(
    src: WikipediaSource
  ): Promise<Array<{ entity: string; wikipediaUrl: string }>> {
    let pool = await fetchPoolFromSource(src);
    if (pool.length === 0) {
      const locationFromSource = extractLocationFromCategoryTitle(src.title);
      const locationFromOrigins = guessBroadLocationCategory(existingEntities);
      const broadCandidates = new Set<string>();
      if (locationFromSource) broadCandidates.add(locationFromSource);
      if (locationFromOrigins) broadCandidates.add(locationFromOrigins);

      for (const broadCat of broadCandidates) {
        if (pool.length > 0) break;
        const broadFull = broadCat.startsWith('Category:') ? broadCat : `Category:${broadCat}`;
        onProgress?.(`Source "${src.title}" empty. Trying broader category: ${broadFull}...`);
        const fetchLimit = categoryFetchLimitForCount(count);
        pool = (await getPagesInCategoryDeep(broadFull, { limit: fetchLimit, pageOnly: true, subcategoryDepth: 2 }))
          .map((title) => ({
            entity: title,
            wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
          }));
      }
    }
    return pool;
  }

  function processPoolIntoValidated(
    pool: Array<{ entity: string; wikipediaUrl: string }>,
    src: WikipediaSource
  ): Promise<void> {
    return (async () => {
      if (pool.length === 0) return;
      const cap = maxWikipediaCandidatesForCount(count);
      let nextPool = pool.slice(0, cap);
      if (pool.length > cap) {
        onProgress?.(`Capped Wikipedia pool to ${cap} candidates (requested ${count} entities).`);
      }
      if (existingAcfContext && existingAcfContext.length > 0) {
        nextPool = await filterWikipediaPoolWithAI(nextPool, existingAcfContext, apiKey, onProgress);
      }
      if (resolvedOrigin && maxMi != null) {
        const radiusPool = nextPool.slice(0, count);
        nextPool = await filterPoolByRadiusMiles(
          radiusPool,
          resolvedOrigin,
          maxMi,
          apiKey,
          site.id,
          onProgress,
          count
        );
      }
      onProgress?.(`Found ${nextPool.length} potential entities from Wikipedia ${src.type} "${src.title}"`);
      const batchSize = Math.min(nextPool.length, Math.max(count * 4, 24));
      for (let offset = 0; validated.length < count && offset < nextPool.length; offset += batchSize) {
        const batch = nextPool.slice(offset, offset + batchSize);
        const poolAfterNonPlaces = await filterNonPlacesWithAI(
          batch,
          apiKey,
          onProgress,
          promptModifier,
          keyword
        );
        const filtered = poolAfterNonPlaces.filter((e) => !entityConflictsWithExisting(e.entity, existingEntities));
        const candidates: EntityWithCriteria[] = filtered.map((e) => ({
          entity: e.entity,
          wikipediaUrl: e.wikipediaUrl,
          wikipediaTitle: e.entity,
        }));
        onProgress?.('Checking conflicts with scheduled posts...');
        const entityNames = candidates.map((e) => e.entity);
        const conflictResult = checkConflicts(entityNames, existingEntities, scheduledTitles);
        const allowedNames = new Set(conflictResult.nonConflictingEntities.map((s) => s.toLowerCase()));
        for (const e of candidates) {
          if (!allowedNames.has(e.entity.toLowerCase())) continue;
          const k = e.entity.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          validated.push(e);
        }
      }
    })();
  }

  try {
    if (lockedList.length > 0) {
      for (const lockedSrc of lockedList) {
        if (validated.length >= count) break;
        onProgress?.(`Using your selected Wikipedia ${lockedSrc.type}: ${lockedSrc.title}`);
        source = lockedSrc;
        usedSources.push(lockedSrc);
        const pool = await loadPoolWithBroadening(lockedSrc);
        if (pool.length > 0) {
          await processPoolIntoValidated(pool, lockedSrc);
        }
      }
      if (validated.length === 0) {
        notify.info(NOTIFY_SELECTED_WIKIPEDIA_CATEGORIES_HAD_NO_PAG);
        onProgress?.('Selected categories empty; finding Wikipedia source (AI)...');
        try {
          const aiSource = await decideWikipediaSourceWithAI(existingEntities, promptModifier, keyword, apiKey);
          if (aiSource) {
            source = aiSource;
            usedSources.push(aiSource);
            const pool = await loadPoolWithBroadening(aiSource);
            if (pool.length > 0) {
              await processPoolIntoValidated(pool, aiSource);
            }
          }
        } catch (e) {
          logger.warn('[Entity Generation] AI fallback after empty locked categories failed:', e);
        }
      }
    } else {
      onProgress?.('Finding Wikipedia source from origin fields (AI)...');
      source = await decideWikipediaSourceWithAI(existingEntities, promptModifier, keyword, apiKey);

      if (source) {
        const titleLower = source.title.toLowerCase();
        const nonLocationKeywords = ['window', 'treatment', 'business', 'product', 'service'];
        if (nonLocationKeywords.some((kw) => titleLower.includes(kw))) {
          logger.warn(
            `[Entity Generation] AI picked non-location source "${source.title}", retrying with explicit location requirement...`
          );
          onProgress?.(`Retrying with explicit location requirement...`);
          const retryModifier = promptModifier
            ? `${promptModifier} (LOCATIONS ONLY - cities, neighborhoods, streets, areas)`
            : 'LOCATIONS ONLY - cities, neighborhoods, streets, areas';
          source = await decideWikipediaSourceWithAI(existingEntities, retryModifier, keyword, apiKey);
        }
      }

      if (source) {
        usedSources.push(source);
        const pool = await loadPoolWithBroadening(source);
        if (pool.length > 0) {
          await processPoolIntoValidated(pool, source);
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Entity Generation] Failed to decide Wikipedia source:`, error);
    onProgress?.(`Error finding Wikipedia source: ${errorMsg}`);
    throw new Error(`Failed to find Wikipedia source: ${errorMsg}`);
  }

  if (lockedList.length === 0 && !source) {
    const msg = `AI could not determine a LOCATION-BASED Wikipedia source from ${existingEntities.length} existing origin fields${promptModifier ? ` with modifier "${promptModifier}"` : ''}. Make sure your origin fields contain geographic locations (cities, neighborhoods, etc.).`;
    logger.warn(`[Entity Generation] ${msg}`);
    onProgress?.(msg);
    return {
      entities: [],
      suggestedTitleFormat,
      triedSources: ['(none - AI returned null)'],
      serviceAreaOrigin: resolvedOrigin ?? undefined,
    };
  }

  // Fallback: if not enough entities, ask AI for another category in same location (streets, avenues, etc.)
  let fallbackAttempts = 0;
  while (validated.length < count && fallbackAttempts < maxFallbackAttempts) {
    onProgress?.(`Need more entities (${validated.length}/${count}). Asking AI for another Wikipedia category in same location...`);
    const fallbackSource = await decideFallbackWikipediaSourceWithAI(
      usedSources,
      existingEntities,
      promptModifier,
      keyword,
      apiKey
    );
    if (!fallbackSource) break;
    usedSources.push(fallbackSource);
    fallbackAttempts++;
    const pool = await fetchPoolFromSource(fallbackSource);
    if (pool.length === 0) {
      onProgress?.(`Fallback source "${fallbackSource.title}" had no pages, trying next...`);
      continue;
    }
    await processPoolIntoValidated(pool, fallbackSource);
  }

  if (validated.length > 0) {
    onProgress?.('Checking for duplicates with AI (validate before adding)...');
    const beforeDedupe = [...validated];
    const candidateNames = validated.map((e) => e.entity);
    const afterAi = await filterDuplicatesWithAI(
      candidateNames,
      existingEntities,
      apiKey,
      onProgress,
      scheduledTitles,
      existingAcfContext && existingAcfContext.length > 0 ? existingAcfContext : undefined
    );
    const allowedSet = new Set(afterAi.map((n) => n.toLowerCase()));
    validated = validated.filter((e) => allowedSet.has(e.entity.toLowerCase()));
    if (validated.length < count && beforeDedupe.length >= count) {
      const validatedSet = new Set(validated.map((e) => e.entity.toLowerCase()));
      for (const e of beforeDedupe) {
        if (validated.length >= count) break;
        if (!validatedSet.has(e.entity.toLowerCase())) {
          validated.push(e);
          validatedSet.add(e.entity.toLowerCase());
        }
      }
    }
  }

  validated = validated.slice(0, count);
  return {
    entities: validated,
    suggestedTitleFormat,
    triedSources: usedSources.map((s) => `${s.type}:${s.title}`),
    serviceAreaOrigin: resolvedOrigin ?? undefined,
  };
}

function extractLocationFromCategoryTitle(title: string): string | null {
  const cleaned = title.replace(/^Category:/i, '').trim();
  const inMatch = cleaned.match(/_in_(.+)$/i) || cleaned.match(/ in (.+)$/i);
  if (inMatch?.[1]) {
    return inMatch[1].replace(/\s+/g, '_');
  }
  const ofMatch = cleaned.match(/_of_(.+)$/i) || cleaned.match(/ of (.+)$/i);
  if (ofMatch?.[1]) {
    return ofMatch[1].replace(/\s+/g, '_');
  }
  return null;
}

function guessBroadLocationCategory(origins: string[]): string | null {
  for (const origin of origins) {
    const trimmed = origin.trim();
    const cityStateMatch = trimmed.match(/^([A-Z][a-zA-Z\s]+),\s*([A-Z][a-zA-Z\s]+)$/);
    if (cityStateMatch) {
      return `${cityStateMatch[1].trim().replace(/\s+/g, '_')},_${cityStateMatch[2].trim().replace(/\s+/g, '_')}`;
    }
    if (/^[A-Z][a-zA-Z\s]+$/.test(trimmed) && trimmed.length > 2) {
      return trimmed.replace(/\s+/g, '_');
    }
  }
  return null;
}

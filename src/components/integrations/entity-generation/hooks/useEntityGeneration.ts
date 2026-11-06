/**
 * Entity Generation Hook
 * Main state management for entity generation
 */

import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { notifyGeneratedXEntities } from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";
import { suggestWikipediaCategoriesForPrompt } from "@/lib/entity/suggest-wikipedia-categories";
import type { WikipediaSource } from "@/lib/entity/decide-wikipedia-source-ai";
import { generateEntities } from "../generation/entityGenerator";
import {
  fetchGscKeywordPoolForEntitySitemap,
  gscKeywordsForEntity,
} from "@/lib/entity/entity-gsc-keywords";
import type { ServiceAreaOrigin } from "@/lib/entity/radius-filter";
import { logger } from "@/lib/logger";
import type { WordPressSite } from "../../types";
import type { EntityWithCriteria, CriteriaData, RadiusDistancePreset } from "../types";

export interface EntityGenerationProgress {
  currentMessage: string;
  stepLog: string[];
}

export interface UseEntityGenerationReturn {
  isGeneratingEntities: Record<string, boolean>;
  entityGenerationProgress: Record<string, EntityGenerationProgress>;
  generatedEntities: Record<string, string[]>;
  entityRecordsByKey: Record<string, EntityWithCriteria[]>;
  wikipediaLinks: Record<string, Record<string, string>>;
  criteriaInfo: Record<string, Record<string, CriteriaData>>;
  generalCriteriaInfo: Record<string, string>;
  entityCount: number;
  entityPromptModifier: string;
  entityKeyword: string;
  setEntityCount: (count: number) => void;
  setEntityPromptModifier: (modifier: string) => void;
  setEntityKeyword: (keyword: string) => void;
  selectedWikipediaSources: WikipediaSource[];
  setSelectedWikipediaSources: Dispatch<SetStateAction<WikipediaSource[]>>;
  wikiCategorySuggestions: WikipediaSource[];
  wikiCategorySuggestionsLoading: boolean;
  clearWikiCategoryPicker: () => void;
  handleGenerateEntities: (
    site: WordPressSite,
    sitemapUrl: string,
    count: number,
    promptModifier?: string,
    keyword?: string,
    lockedWikipediaSources?: WikipediaSource[]
  ) => Promise<void>;
  clearGeneratedEntities: (storageKey: string) => void;
  clearWikipediaLinks: (storageKey: string) => void;
  clearCriteriaInfo: (storageKey: string) => void;
  clearGeneralCriteriaInfo: (storageKey: string) => void;
  entityRadiusPreset: RadiusDistancePreset;
  setEntityRadiusPreset: (v: RadiusDistancePreset) => void;
  serviceAreaOriginByKey: Record<string, ServiceAreaOrigin>;
  /** Synced from the entity panel: which address line to use for radius (schema / user / Integrations). */
  setDistanceOriginLabel: (label: string | null) => void;
}

export function useEntityGeneration(
  onEntityGenerated?: (storageKey: string, entities: EntityWithCriteria[], suggestedTitleFormat: string) => void
): UseEntityGenerationReturn {
  const [isGeneratingEntities, setIsGeneratingEntities] = useState<Record<string, boolean>>({});
  const [entityGenerationProgress, setEntityGenerationProgress] = useState<Record<string, EntityGenerationProgress>>({});
  const [generatedEntities, setGeneratedEntities] = useState<Record<string, string[]>>({});
  const [wikipediaLinks, setWikipediaLinks] = useState<Record<string, Record<string, string>>>({});
  const [criteriaInfo, setCriteriaInfo] = useState<Record<string, Record<string, CriteriaData>>>({});
  const [generalCriteriaInfo, setGeneralCriteriaInfo] = useState<Record<string, string>>({});
  const [entityCount, setEntityCount] = useState<number>(5);
  const [entityPromptModifier, setEntityPromptModifier] = useState<string>('');
  const [entityKeyword, setEntityKeyword] = useState<string>('');
  const [selectedWikipediaSources, setSelectedWikipediaSources] = useState<WikipediaSource[]>([]);
  const [wikiCategorySuggestions, setWikiCategorySuggestions] = useState<WikipediaSource[]>([]);
  const [wikiCategorySuggestionsLoading, setWikiCategorySuggestionsLoading] = useState(false);
  const [entityRadiusPreset, setEntityRadiusPreset] = useState<RadiusDistancePreset>("off");
  const [entityRecordsByKey, setEntityRecordsByKey] = useState<Record<string, EntityWithCriteria[]>>({});
  const [serviceAreaOriginByKey, setServiceAreaOriginByKey] = useState<Record<string, ServiceAreaOrigin>>({});
  const suggestAbortRef = useRef<AbortController | null>(null);
  const distanceOriginOverrideRef = useRef<string | null>(null);

  const setDistanceOriginLabel = useCallback((label: string | null) => {
    const t = label?.trim();
    distanceOriginOverrideRef.current = t || null;
  }, []);

  const clearWikiCategoryPicker = useCallback(() => {
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    setSelectedWikipediaSources([]);
    setWikiCategorySuggestions([]);
    setWikiCategorySuggestionsLoading(false);
  }, []);

  useEffect(() => {
    const trimmed = entityPromptModifier.trim();
    if (trimmed.length < 2) {
      suggestAbortRef.current?.abort();
      setWikiCategorySuggestions([]);
      setWikiCategorySuggestionsLoading(false);
      setSelectedWikipediaSources([]);
      return;
    }

    const apiKey = loadApiKey();
    if (!apiKey) {
      setWikiCategorySuggestions([]);
      return;
    }

    const handle = window.setTimeout(() => {
      suggestAbortRef.current?.abort();
      const ac = new AbortController();
      suggestAbortRef.current = ac;
      setWikiCategorySuggestionsLoading(true);
      void suggestWikipediaCategoriesForPrompt(trimmed, entityKeyword.trim() || undefined, apiKey, {
        signal: ac.signal,
      })
        .then((list) => {
          if (ac.signal.aborted) return;
          setWikiCategorySuggestions(list);
        })
        .catch((e) => {
          if (ac.signal.aborted) return;
          logger.warn("[Entity Generation] Category suggestions failed:", e);
          setWikiCategorySuggestions([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setWikiCategorySuggestionsLoading(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(handle);
    };
  }, [entityPromptModifier, entityKeyword]);

  const clearGeneratedEntities = useCallback((storageKey: string) => {
    setGeneratedEntities(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setEntityRecordsByKey((prev) => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
    setServiceAreaOriginByKey((prev) => {
      const u = { ...prev };
      delete u[storageKey];
      return u;
    });
  }, []);

  const clearWikipediaLinks = useCallback((storageKey: string) => {
    setWikipediaLinks(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const clearCriteriaInfo = useCallback((storageKey: string) => {
    setCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const clearGeneralCriteriaInfo = useCallback((storageKey: string) => {
    setGeneralCriteriaInfo(prev => {
      const updated = { ...prev };
      delete updated[storageKey];
      return updated;
    });
  }, []);

  const handleGenerateEntities = useCallback(async (
    site: WordPressSite,
    sitemapUrl: string,
    count: number,
    promptModifier?: string,
    keyword?: string,
    lockedWikipediaSources?: WikipediaSource[]
  ) => {
    const entitySitemapUrl = site.entitySitemapUrl || sitemapUrl;
    const generatingKey = `${site.id}-${entitySitemapUrl}`;
    const storageKey = `${site.id}-${entitySitemapUrl}`;

    // Clear cached entities
    clearGeneratedEntities(storageKey);
    setIsGeneratingEntities(prev => ({ ...prev, [generatingKey]: true }));
    setEntityGenerationProgress(prev => ({ ...prev, [generatingKey]: { currentMessage: '', stepLog: [] } }));

    try {
      let gscPool: string[] = [];
      try {
        gscPool = await fetchGscKeywordPoolForEntitySitemap(site, entitySitemapUrl);
        if (gscPool.length > 0) {
          setEntityGenerationProgress((prev) => ({
            ...prev,
            [generatingKey]: {
              currentMessage: `Loaded ${gscPool.length} GSC keywords for entity enrichment`,
              stepLog: [
                ...(prev[generatingKey]?.stepLog ?? []),
                `Loaded ${gscPool.length} GSC keywords for entity enrichment`,
              ],
            },
          }));
        }
      } catch {
        /* non-blocking */
      }

      const result = await generateEntities(
        {
          site,
          sitemapUrl: entitySitemapUrl,
          count,
          promptModifier,
          keyword,
          lockedWikipediaSources,
          radiusPreset: entityRadiusPreset !== "off" ? entityRadiusPreset : undefined,
          primaryLocationLabelOverride: distanceOriginOverrideRef.current ?? undefined,
        },
        (message) => {
          setEntityGenerationProgress(prev => {
            const current = prev[generatingKey] ?? { currentMessage: '', stepLog: [] };
            return {
              ...prev,
              [generatingKey]: {
                currentMessage: message,
                stepLog: [...current.stepLog, message],
              },
            };
          });
          notify.info(message);
        },
        (entity, criteriaData) => {
          setCriteriaInfo(prev => ({
            ...prev,
            [storageKey]: {
              ...(prev[storageKey] || {}),
              [entity]: criteriaData
            }
          }));
        }
      );

      const entitiesWithGsc = result.entities.map((e) => ({
        ...e,
        gscKeywords: gscPool.length ? gscKeywordsForEntity(e.entity, gscPool) : [],
      }));

      // Store results
      setGeneratedEntities(prev => ({
        ...prev,
        [storageKey]: entitiesWithGsc.map(e => e.entity)
      }));
      setEntityRecordsByKey((prev) => ({ ...prev, [storageKey]: entitiesWithGsc }));

      setWikipediaLinks(prev => ({
        ...prev,
        [storageKey]: result.entities.reduce((acc, e) => {
          if (e.wikipediaUrl) {
            acc[e.entity] = e.wikipediaUrl;
          }
          return acc;
        }, {} as Record<string, string>)
      }));

      if (promptModifier) {
        setGeneralCriteriaInfo(prev => ({
          ...prev,
          [storageKey]: promptModifier
        }));
      }

      // Store suggested title format
      localStorage.setItem(`entity-title-format-${storageKey}`, result.suggestedTitleFormat);

      if (result.serviceAreaOrigin) {
        setServiceAreaOriginByKey((prev) => ({ ...prev, [storageKey]: result.serviceAreaOrigin! }));
      } else {
        setServiceAreaOriginByKey((prev) => {
          if (!(storageKey in prev)) return prev;
          const u = { ...prev };
          delete u[storageKey];
          return u;
        });
      }

      notify.success(notifyGeneratedXEntities(result.entities.length));
      onEntityGenerated?.(storageKey, entitiesWithGsc, result.suggestedTitleFormat);
    } catch (error) {
      logger.error('[Entity Generation] Error generating entities:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      notifyHeaderError("Entity generation failed", errorMessage);
    } finally {
      setIsGeneratingEntities(prev => {
        const updated = { ...prev };
        delete updated[generatingKey];
        return updated;
      });
      setEntityGenerationProgress(prev => {
        const updated = { ...prev };
        delete updated[generatingKey];
        return updated;
      });
    }
  }, [clearGeneratedEntities, onEntityGenerated, entityRadiusPreset]);

  return {
    isGeneratingEntities,
    entityGenerationProgress,
    generatedEntities,
    entityRecordsByKey,
    wikipediaLinks,
    criteriaInfo,
    generalCriteriaInfo,
    entityCount,
    entityPromptModifier,
    entityKeyword,
    setEntityCount,
    setEntityPromptModifier,
    setEntityKeyword,
    selectedWikipediaSources,
    setSelectedWikipediaSources,
    wikiCategorySuggestions,
    wikiCategorySuggestionsLoading,
    clearWikiCategoryPicker,
    handleGenerateEntities,
    clearGeneratedEntities,
    clearWikipediaLinks,
    clearCriteriaInfo,
    clearGeneralCriteriaInfo,
    entityRadiusPreset,
    setEntityRadiusPreset,
    serviceAreaOriginByKey,
    setDistanceOriginLabel,
  };
}

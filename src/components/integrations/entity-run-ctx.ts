import type { EntityGenerationState } from "@/components/integrations/use-entity-generation-state";
import type { EntityValidators } from "@/components/integrations/use-entity-validators";
import type { WordPressSite } from "@/components/integrations/types";
import type { parseSitemap } from "@/lib/wordpress-api";

export interface EntityWithCriteria {
  entity: string;
  wikipediaUrl: string;
  wikipediaTitle?: string;
  criteriaData?: {
    matches: boolean;
    confidence: number;
    extractedData: Record<string, unknown>;
    rankingValue?: number;
  };
}

/** Mutable per-run state shared by the entity generation phases. */
export interface EntityRunCtx {
  site: WordPressSite;
  sitemapUrl: string;
  count: number;
  promptModifier?: string;
  entitySitemapUrl: string;
  generatingKey: string;
  storageKey: string;
  parseResult: Awaited<ReturnType<typeof parseSitemap>> | undefined;
  existingEntities: string[];
  primaryCity: string | null;
  openRouterApiKey: string;
  modifierLocation: string | null;
  suggestedTitleFormat: string;
  entitiesFromGoogle: string[];
  researchQuestion: string;
  allCategoryPages: string[];
  validatedEntities: string[];
  selectedPageTitle: string;
  categoryPages: string[];
  entitiesWithWikipedia: EntityWithCriteria[];
  processedEntityNames: Set<string>;
  candidatePool: string[];
  retryCount: number;
  mcpApiBase: string;
}

export interface EntityRunDeps {
  s: EntityGenerationState;
  v: EntityValidators;
  c: EntityRunCtx;
}

export function createEntityRunCtx(
  site: WordPressSite,
  sitemapUrl: string,
  count: number,
  promptModifier?: string,
): EntityRunCtx {
  return {
    site,
    sitemapUrl,
    count,
    promptModifier,
    entitySitemapUrl: "",
    generatingKey: "",
    storageKey: "",
    parseResult: undefined,
    existingEntities: [],
    primaryCity: null,
    openRouterApiKey: "",
    modifierLocation: null,
    suggestedTitleFormat: "",
    entitiesFromGoogle: [],
    researchQuestion: "",
    allCategoryPages: [],
    validatedEntities: [],
    selectedPageTitle: "",
    categoryPages: [],
    entitiesWithWikipedia: [],
    processedEntityNames: new Set<string>(),
    candidatePool: [],
    retryCount: 0,
    mcpApiBase: "",
  };
}

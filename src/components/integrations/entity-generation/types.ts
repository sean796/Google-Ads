import { type WordPressSite } from "../types";
import type { WikipediaSource } from "@/lib/entity/decide-wikipedia-source-ai";

/** Wikipedia entity distance filter: omit or `'off'` = disabled. */
export type RadiusDistancePreset = "off" | "close" | "medium" | "far";

export interface EntityGenerationFeatureRef {
  openDialog: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities: Record<string, boolean>;
}

export interface EntityGenerationFeatureProps {
  onRef?: (ref: EntityGenerationFeatureRef) => void;
}

export interface EntityWithCriteria {
  entity: string;
  wikipediaUrl: string;
  wikipediaTitle?: string;
  criteriaData?: CriteriaData;
  /** Search Console queries appended after generation (when GSC is available). */
  gscKeywords?: string[];
}

export interface CriteriaData {
  matches: boolean;
  confidence: number;
  extractedData: Record<string, unknown>;
  rankingValue?: number;
}

export interface EntityGenerationState {
  isGeneratingEntities: Record<string, boolean>;
  generatedEntities: Record<string, string[]>;
  wikipediaLinks: Record<string, Record<string, string>>;
  criteriaInfo: Record<string, Record<string, CriteriaData>>;
  generalCriteriaInfo: Record<string, string>;
  selectedEntity: string | null;
  entityGenerationDialogOpen: boolean;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  entityCount: number;
  entityPromptModifier: string;
  entityKeyword: string;
  csvTemplateDialogOpen: boolean;
  csvTitleFormat: string;
  csvKeyword: string;
  csvFeaturedImage: string;
  csvOptionalModifier: string;
  isGeneratingTitleSuggestion: boolean;
}

export interface GenerationOptions {
  site: WordPressSite;
  sitemapUrl: string;
  count: number;
  promptModifier?: string;
  keyword?: string;
  /** When set, Wikipedia category/list sources are used in order (before AI fallbacks) until enough entities are found. */
  lockedWikipediaSources?: WikipediaSource[];
  /** Single locked source; merged with or replaced by `lockedWikipediaSources` when that array is set. */
  lockedWikipediaSource?: WikipediaSource;
  /** When set and not `off`, filter Wikipedia pool by miles from resolved service-area origin (OpenRouter geocoding). */
  radiusPreset?: RadiusDistancePreset;
  /** Overrides JSON-LD / NAP resolution for the radius “distance from” point (user-selected address in the entity UI). */
  primaryLocationLabelOverride?: string | null;
}

export interface ValidationResult {
  matches: boolean;
  confidence: number;
  extractedData?: Record<string, unknown>;
  rankingValue?: number;
}

export interface LocationExtractionResult {
  primaryCity: string | null;
  existingEntities: string[];
  cityNames: Set<string>;
  areaKeywords: Set<string>;
  suggestedTitleFormat: string;
}

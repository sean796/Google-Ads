export interface KeywordData {
  keyword: string;
  difficulty: number; // 0-100
  searchVolume: number;
  cpc: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  relatedKeywords: string[];
  serpFeatures: string[];
}

export interface KeywordDensityAnalysis {
  keyword: string;
  density: number; // percentage
  occurrences: number;
  recommendations: string[];
  optimalRange: { min: number; max: number };
}

export interface PeopleAlsoAsk {
  question: string;
  answer?: string;
  url?: string;
  domain?: string;
}

export interface ResearchLink {
  url: string;
  title?: string;
  description?: string;
  domain?: string;
}

export interface KeywordResearchResult {
  primaryKeyword: string;
  keywordData: KeywordData;
  semanticKeywords: KeywordData[];
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  peopleAlsoAsk?: PeopleAlsoAsk[];
  entity?: string; // Optional entity for content optimization (not used in keyword research API calls)
}

export interface KeywordAnalysisOptions {
  location?: string;
  language?: string;
  depth?: number;
  /** Omit or lower for faster SERP; higher (e.g. 4) expands People Also Ask via DataForSEO clicks. */
  peopleAlsoAskClickDepth?: number;
  limit?: number;
  forceRefresh?: boolean; // If true, bypass cache and fetch fresh data from API
  /** When true, throw on API/AI failures instead of returning partial stub data. */
  strict?: boolean;
  /** When false, use legacy sequential keyword research path in the hook. Default true. */
  useParallelPipeline?: boolean;
}

export interface KeywordAnalysisComplete {
  result: KeywordResearchResult;
  aiAnalysis: KeywordAIAnalysis;
  keywordsVolumeData: KeywordData[];
  paaRawResponse?: unknown;
}

export interface KeywordAIAnalysis {
  keywordSuggestions: {
    primary: string;
    variations: string[];
    longTail: string[];
    semantic: string[];
  };
  h2Suggestions: {
    heading: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    reasoning: string;
  }[];
  contentGaps: {
    topic: string;
    description: string;
    opportunity: 'high' | 'medium' | 'low';
    suggestedH2?: string;
  }[];
  peopleAlsoAsk?: PeopleAlsoAsk[];
  researchLinks?: ResearchLink[];
}

export interface BlogTemplateChecklist {
  items: string[];
  context: {
    keywordData?: KeywordData;
    flowTitle?: string;
    flowPurpose?: string;
  };
}


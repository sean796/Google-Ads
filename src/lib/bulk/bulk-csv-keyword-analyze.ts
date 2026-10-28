import {
  analyzeKeywordWithAI,
  extractPeopleAlsoAskWithAI,
} from "@/lib/keyword-ai-analyzer";
import { getKeywordOverview, getSemanticKeywordSuggestions } from "@/lib/keyword-api";
import { formatKeyword } from "@/lib/keyword-formatter";
import {
  callMCPKeywordOverview,
  keywordsForLabsOverview,
} from "@/lib/keyword-mcp-service";
import type {
  KeywordAIAnalysis,
  KeywordAnalysisComplete,
  KeywordAnalysisOptions,
  KeywordData,
  KeywordResearchResult,
  PeopleAlsoAsk,
} from "@/lib/keyword-types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import {
  dataForSeoRequestHeaders,
  withDataForSeoRequestAuth,
} from "@/lib/dataforseo-request-auth";
import { withDataForSeoLocationCode } from "@/lib/dataforseo-location-code";

function mcpApiBase(): string {
  return (
    import.meta.env.VITE_MCP_API_BASE ||
    (import.meta.env.DEV ? "http://localhost:3001/api/mcp" : "/api/mcp")
  );
}

async function fetchSerpOrganicRaw(
  primaryKeyword: string,
  options: KeywordAnalysisOptions,
): Promise<unknown> {
  const serpLocation = options.location || "United States";
  const serpRequestPayload = withDataForSeoLocationCode({
    keyword: primaryKeyword,
    location_name: serpLocation,
    language_code: options.language || "en",
    depth: options.depth ?? 10,
  }) as Record<string, string | number>;
  if (options.peopleAlsoAskClickDepth != null && Number.isFinite(options.peopleAlsoAskClickDepth)) {
    serpRequestPayload.people_also_ask_click_depth = options.peopleAlsoAskClickDepth;
  }

  const serpResponse = await fetch(`${mcpApiBase()}/DataForSEO_serp_organic_live_advanced`, {
    method: "POST",
    headers: dataForSeoRequestHeaders(),
    body: JSON.stringify(withDataForSeoRequestAuth(serpRequestPayload)),
  });

  if (serpResponse.ok) {
    return serpResponse.json();
  }
  const serpErrorText = await serpResponse.text();
  return { error: serpErrorText, status: serpResponse.status };
}

function emptyKeywordAiAnalysis(primaryKeyword: string): KeywordAIAnalysis {
  const primary = primaryKeyword.trim();
  return {
    keywordSuggestions: { primary, variations: [], longTail: [], semantic: [] },
    h2Suggestions: [],
    contentGaps: [],
    peopleAlsoAsk: [],
    researchLinks: [],
  };
}

function normalizeFinalAnalysis(
  analysis: KeywordAIAnalysis,
  primaryKeyword: string,
  paaQuestions: PeopleAlsoAsk[],
): KeywordAIAnalysis {
  return {
    keywordSuggestions: {
      primary: analysis.keywordSuggestions?.primary || primaryKeyword || "",
      variations: Array.isArray(analysis.keywordSuggestions?.variations)
        ? analysis.keywordSuggestions.variations
        : [],
      longTail: Array.isArray(analysis.keywordSuggestions?.longTail)
        ? analysis.keywordSuggestions.longTail
        : [],
      semantic: Array.isArray(analysis.keywordSuggestions?.semantic)
        ? analysis.keywordSuggestions.semantic
        : [],
    },
    h2Suggestions: Array.isArray(analysis.h2Suggestions) ? analysis.h2Suggestions : [],
    contentGaps: Array.isArray(analysis.contentGaps) ? analysis.contentGaps : [],
    peopleAlsoAsk: Array.isArray(paaQuestions) ? paaQuestions : [],
    researchLinks: Array.isArray(analysis.researchLinks) ? analysis.researchLinks : [],
  };
}

export type AnalyzeBulkCsvKeywordInput = {
  primaryKeyword: string;
  options?: KeywordAnalysisOptions;
  openRouterApiKey?: string;
  selectedModel: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entity?: string;
  connectedSite?: ConnectedSiteSummary;
};

/** Stateless bulk CSV keyword research with parallel DFS/OR I/O. */
export async function analyzeBulkCsvKeyword(
  input: AnalyzeBulkCsvKeywordInput,
): Promise<KeywordAnalysisComplete> {
  const {
    primaryKeyword,
    options = {},
    openRouterApiKey,
    selectedModel,
    temperature = 1.0,
    maxTokens = 4000,
    topP = 0.9,
    entity,
    connectedSite,
  } = input;

  const kw = primaryKeyword.trim();
  if (!kw) {
    throw new Error("Keyword is required for research");
  }

  const location = options.location || "United States";
  const language = options.language || "en";
  const labsKeyword = keywordsForLabsOverview([kw])[0] ?? kw.toLowerCase();

  const [overviewRows, serpRaw] = await Promise.all([
    callMCPKeywordOverview([kw], location, language).catch((e) => {
      console.warn("[Bulk CSV keyword analyze] DataForSEO overview failed:", e);
      return [] as KeywordData[];
    }),
    fetchSerpOrganicRaw(kw, options),
  ]);

  const extractedKeywordData =
    overviewRows.find((row) => row.keyword.toLowerCase().trim() === labsKeyword) ??
    overviewRows[0];

  const formattedPrimaryKeyword = formatKeyword(kw);
  const keywordDataForPipeline: KeywordData = extractedKeywordData?.keyword?.trim()
    ? { ...extractedKeywordData, keyword: formattedPrimaryKeyword }
    : {
        keyword: formattedPrimaryKeyword,
        difficulty: 0,
        searchVolume: 0,
        cpc: 0,
        competition: "LOW",
        intent: "informational",
        relatedKeywords: [],
        serpFeatures: [],
      };

  const orKey = openRouterApiKey?.trim() ?? "";
  if (!orKey) {
    const keywordResult: KeywordResearchResult = {
      primaryKeyword: formattedPrimaryKeyword,
      keywordData: keywordDataForPipeline,
      semanticKeywords: [],
      searchIntent: keywordDataForPipeline.intent || "informational",
      entity: entity || undefined,
    };
    return {
      result: keywordResult,
      aiAnalysis: emptyKeywordAiAnalysis(formattedPrimaryKeyword),
      keywordsVolumeData: [],
      paaRawResponse: serpRaw,
    };
  }

  const aiOpts = {
    apiKey: orKey,
    model: selectedModel,
    temperature,
    maxTokens,
    topP,
    location: options.location,
    entity,
    serpData: serpRaw,
    connectedSite,
    siteUrl: connectedSite ? getPublicSiteUrl(connectedSite) : undefined,
    companyName: connectedSite?.name,
  };

  let analysis: Awaited<ReturnType<typeof analyzeKeywordWithAI>> | null = null;
  let paaQuestions: PeopleAlsoAsk[] = [];
  try {
    const [analysisResult, paaResult] = await Promise.all([
      analyzeKeywordWithAI(keywordDataForPipeline, undefined, aiOpts),
      serpRaw
        ? extractPeopleAlsoAskWithAI(serpRaw, {
            apiKey: orKey,
            model: selectedModel,
            temperature,
            maxTokens,
            topP,
          })
        : Promise.resolve({ rawResponse: "", questions: [] as PeopleAlsoAsk[] }),
    ]);
    analysis = analysisResult;
    paaQuestions = paaResult.questions ?? [];
  } catch (e) {
    console.warn("[Bulk CSV keyword analyze] OpenRouter keyword analysis failed:", e);
  }

  const finalAnalysis = analysis
    ? normalizeFinalAnalysis(analysis, kw, paaQuestions)
    : emptyKeywordAiAnalysis(formattedPrimaryKeyword);

  const allAiKeywords = analysis
    ? [
        ...(analysis.keywordSuggestions?.variations || []),
        ...(analysis.keywordSuggestions?.longTail || []),
        ...(analysis.keywordSuggestions?.semantic || []),
      ].filter(Boolean)
    : [];

  const [aiKeywordData, semanticData] = await Promise.all([
    allAiKeywords.length > 0
      ? getKeywordOverview(allAiKeywords, options.location || "United States", options.language || "en")
      : Promise.resolve([] as KeywordData[]),
    getSemanticKeywordSuggestions(
      kw,
      options.location || "United States",
      options.language || "en",
    ),
  ]);

  const aiGeneratedKeywordsWithData = aiKeywordData ?? [];
  const semanticKeywords = [
    ...aiGeneratedKeywordsWithData,
    ...(semanticData ?? []).filter(
      (sk) =>
        !aiGeneratedKeywordsWithData.some(
          (ak) => ak.keyword.toLowerCase() === sk.keyword.toLowerCase(),
        ),
    ),
  ];

  const volumeMap = new Map<string, KeywordData>();
  for (const row of semanticKeywords) {
    volumeMap.set(row.keyword.toLowerCase(), row);
  }
  const volumeKeywords = Array.from(volumeMap.values());

  const keywordResult: KeywordResearchResult = {
    primaryKeyword: formattedPrimaryKeyword,
    keywordData: keywordDataForPipeline,
    semanticKeywords,
    searchIntent: keywordDataForPipeline.intent || "informational",
    peopleAlsoAsk: paaQuestions.length > 0 ? paaQuestions : finalAnalysis.peopleAlsoAsk,
    entity: entity || undefined,
  };

  return {
    result: keywordResult,
    aiAnalysis: finalAnalysis,
    keywordsVolumeData: volumeKeywords,
    paaRawResponse: serpRaw,
  };
}

/** Force CSV primary keyword on a completed analysis payload. */
export function applyCsvPrimaryKeywordToResearch(
  research: KeywordAnalysisComplete,
  csvKeyword: string,
): KeywordAnalysisComplete {
  const primary = csvKeyword.trim();
  return {
    ...research,
    result: {
      ...research.result,
      primaryKeyword: primary,
      keywordData: {
        ...research.result.keywordData,
        keyword: primary,
      },
    },
  };
}

import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZING_KEYWORD_WITH_AI_ANALYZING_SERP, NOTIFY_USING_GSC_ONLY, notifyAiAnalysisCompleteRelatedgsckeywords, notifyFoundXPeopleAlsoAskQuestions, notifyKeywordResearchCompleteSearchVolume, notifyUsingGscDataForXXImpressionsXCli } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { getKeywordOverview } from "@/lib/keyword-api";
import { fetchPeopleAlsoAsk } from "@/lib/keyword-api";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { WordPressSite } from "@/components/integrations/types";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { logger } from "@/lib/logger";

export interface KeywordSelection {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function performKeywordResearch(
  primaryKeyword: string,
  selectedKeyword: KeywordSelection,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  relatedGSCKeywords?: string[]
): Promise<{ keywordData: KeywordData; paaResult: Awaited<ReturnType<typeof fetchPeopleAlsoAsk>>; paaRawResponse: unknown; relatedGSCKeywords?: string[] }> {
  if (!primaryKeyword || typeof primaryKeyword !== "string" || !primaryKeyword.trim()) {
    throw new Error("Primary keyword is invalid or empty. Please select a valid keyword.");
  }
  const sanitizedKeyword = String(primaryKeyword).trim();
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  setProgress({
    step: "Researching keywords...",
    progress: 40,
    message: `Fetching keyword data and PAA for: ${sanitizedKeyword}${relatedGSCKeywords?.length ? ` and ${relatedGSCKeywords.length} related GSC keywords` : ""}`,
  });

  const keywordsToResearch = [sanitizedKeyword, ...(relatedGSCKeywords?.slice(0, 10) ?? [])];
  const [keywordDataResult, paaResult] = await Promise.all([
    getKeywordOverview(keywordsToResearch, "United States", "en", true).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = msg.includes("timeout") || msg.includes("ECONNABORTED");
      logger.warn("[Optimize Content] DataForSEO keyword overview failed, using GSC-only data:", isTimeout ? "timeout" : msg);
      if (!getMuteOptimizationToasts())
        notify.info(NOTIFY_USING_GSC_ONLY);
      return [] as KeywordData[];
    }),
    fetchPeopleAlsoAsk(sanitizedKeyword, "United States", "en", 10).catch(() => ({
      items: [],
      rawResponse: null,
      extractionLog: [] as string[],
    })),
  ]);

  let keywordData: KeywordData[] = keywordDataResult ?? [];
  if (!keywordData?.length) {
    keywordData = [
      {
        keyword: sanitizedKeyword,
        searchVolume: selectedKeyword?.impressions ?? 0,
        difficulty: 0,
        cpc: 0,
        competition: "LOW" as const,
        intent: "informational" as const,
        relatedKeywords: relatedGSCKeywords ?? [],
        serpFeatures: [],
      },
    ];
    if (!getMuteOptimizationToasts())
      notify.info(
        notifyUsingGscDataForXXImpressionsXCli(
          sanitizedKeyword,
          selectedKeyword?.impressions ?? 0,
          selectedKeyword?.clicks ?? 0,
          relatedGSCKeywords?.length
        ),
        { duration: 4000 }
      );
  } else {
    const primary = keywordData[0];
    if (primary && relatedGSCKeywords?.length) {
      primary.relatedKeywords = [...(primary.relatedKeywords ?? []), ...relatedGSCKeywords].filter(
        (kw, idx, arr) => arr.indexOf(kw) === idx
      );
    }
    if (!getMuteOptimizationToasts())
      notify.success(
        notifyKeywordResearchCompleteSearchVolume(
          keywordData[0]?.searchVolume ?? 0,
          relatedGSCKeywords?.length
        ),
        { duration: 4000 }
      );
  }

  const primaryLower = sanitizedKeyword.toLowerCase().trim();
  let primaryKeywordData =
    keywordData.find((k) => k?.keyword && String(k.keyword).toLowerCase().trim() === primaryLower) ?? keywordData[0];
  if (primaryKeywordData && primaryKeywordData.keyword !== sanitizedKeyword) {
    primaryKeywordData = { ...primaryKeywordData, keyword: sanitizedKeyword };
  }

  if (!getMuteOptimizationToasts()) notify.success(notifyFoundXPeopleAlsoAskQuestions(paaResult.items?.length ?? 0), { duration: 3000 });

  return { keywordData: primaryKeywordData, paaResult, paaRawResponse: paaResult.rawResponse, relatedGSCKeywords };
}

export async function performAIAnalysis(
  primaryKeywordData: KeywordData,
  site: WordPressSite,
  paaRawResponse: unknown,
  setProgress: (progress: { step: string; progress: number; message?: string }) => void,
  relatedGSCKeywords?: string[],
  model?: string
): Promise<KeywordAIAnalysis> {
  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey?.trim()) throw new Error("OpenRouter API key not found. Please set it in settings.");

  const researchModel = model ?? getResearchModel(site.id);
  if (!getMuteOptimizationToasts()) notify.info(NOTIFY_ANALYZING_KEYWORD_WITH_AI_ANALYZING_SERP);
  setProgress({ step: "Analyzing keyword with AI...", progress: 50, message: "Processing keyword suggestions, H2 sections, and PAA questions..." });

  const aiAnalysis = await analyzeKeywordWithAI(primaryKeywordData, undefined, {
    apiKey: openRouterApiKey,
    model: researchModel,
    temperature: 1.0,
    maxTokens: 4000,
    topP: 0.9,
    serpData: paaRawResponse,
    connectedSite: { name: site.name, siteUrl: site.siteUrl },
    relatedGSCKeywords,
    siteUrl: site.siteUrl,
    companyName: site.name,
  });

  if (!getMuteOptimizationToasts())
    notify.success(notifyAiAnalysisCompleteRelatedgsckeywords(relatedGSCKeywords?.length), {
      duration: 4000,
    });
  return aiAnalysis;
}

/**
 * Analyzes an entity with AI for content optimization context (local SEO).
 */
export async function analyzeEntityWithAI(
  entity: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const researchModel = model ?? getResearchModel();
  const systemPrompt = `You analyze a place entity for a local service-area page.
Return a concise analysis (2-3 sentences) of trade-relevant local conditions: housing or building pattern, typical exposure or street context, and what that implies for the service. Forbidden: chamber-of-commerce history, cultural trivia, census or demographic fluff, invented project counts.`;
  const userPrompt = `Analyze this place for service-area copy. Name concrete local conditions only:\n\n"${entity}"`;

  try {
    const { content } = await postOpenRouterAppChat({
      apiKey,
      model: researchModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 300,
    });
    return content.trim();
  } catch (error) {
    logger.error("[Entity Analysis] Error analyzing entity:", error);
    return "";
  }
}

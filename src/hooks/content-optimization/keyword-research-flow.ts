import { notify } from "@/lib/app-notifications";
import { NOTIFY_USING_TEST_KEYWORD_DATA, notifyAiAnalysisCompleteSelectedXKeywords, notifyResearchingKeywordXFetchingSearchVo, notifySkippingExternalKeywordApiUsingPrim } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "./optimization-toast-mute";
import type { KeywordAIAnalysis, KeywordData } from "@/lib/keyword-types";
import { type WordPressSite } from "@/components/integrations/types";
import {
  performKeywordResearch,
  findRelatedGSCKeywords,
  performAIAnalysis,
  getAutoSelectHelpers,
} from "@/lib/content-optimization-helpers";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { patchOptimizationProgress } from "./optimization-helpers";
import {
  hasSubstantiveSeoResearchBrief,
  buildOptimizeSelectionsFromStoredBrief,
  type PageGscResultLike,
  type PageGscQueryRow,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";
import type { ProgressSetter } from "./optimization-helpers-a";
import type { Dispatch, SetStateAction } from "react";

type PaaResult = Awaited<ReturnType<typeof performKeywordResearch>>["paaResult"];

export async function performKeywordResearchFlow(
  primaryKeyword: string,
  selectedKeyword: PageGscQueryRow,
  gscResult: PageGscResultLike | null | undefined,
  clusterKeywords: string[] | undefined,
  site: WordPressSite,
  siteId: string,
  testMode: boolean,
  setOptimizationProgress: ProgressSetter,
  /** When true, skip DataForSEO keyword/PAA APIs entirely (use primaryKeyword only). */
  skipKeywordApi: boolean = false,
  seoResearchBrief?: string | null,
): Promise<{
  keywordData: KeywordData;
  aiAnalysis: KeywordAIAnalysis;
  paaResult: PaaResult;
  paaRawResponse: unknown;
  relatedKeywords: string[];
}> {
  if (testMode) {
    if (!getMuteOptimizationToasts()) notify.info(NOTIFY_USING_TEST_KEYWORD_DATA);
    const { createMockKeywordData, createMockAIAnalysis } = await import('@/lib/content-optimization-helpers');
    return {
      keywordData: createMockKeywordData(primaryKeyword),
      aiAnalysis: createMockAIAnalysis(primaryKeyword),
      paaResult: { items: [], rawResponse: null, extractionLog: [] },
      paaRawResponse: null,
      relatedKeywords: []
    };
  }

  const gscQueries = gscResult?.queries || [];
  const relatedGSCKeywords = findRelatedGSCKeywords(
    primaryKeyword,
    (Array.isArray(gscQueries) ? gscQueries : []).map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr ?? 0,
      position: q.position ?? 0,
    })),
    clusterKeywords
  );

  const useSeoBriefPath = hasSubstantiveSeoResearchBrief(seoResearchBrief);
  if (useSeoBriefPath) {
    const selections = buildOptimizeSelectionsFromStoredBrief({
      primaryKeyword,
      selectedKeyword,
      gscResult,
      seoResearchBrief: seoResearchBrief!,
      clusterKeywords,
    });

    if (!getMuteOptimizationToasts()) {
      notify.info(notifySkippingExternalKeywordApiUsingPrim(primaryKeyword));
    }

    return {
      keywordData: selections.keywordData,
      aiAnalysis: selections.aiAnalysis,
      paaResult: {
        items: selections.selectedPeopleAlsoAsk.map((question) => ({ question })),
        rawResponse: null,
        extractionLog: [],
      },
      paaRawResponse: null,
      relatedKeywords: selections.relatedKeywords,
    };
  }

  // If skipKeywordApi is true, do NOT call external keyword/PAA APIs.
  if (skipKeywordApi) {
    if (!getMuteOptimizationToasts())
      notify.info(notifySkippingExternalKeywordApiUsingPrim(primaryKeyword));

    const sanitized = String(primaryKeyword || "").trim();
    const keywordData: KeywordData = {
      keyword: sanitized,
      searchVolume: selectedKeyword?.impressions ?? 0,
      difficulty: 0,
      cpc: 0,
      competition: "LOW",
      intent: "informational",
      relatedKeywords: relatedGSCKeywords ?? [],
      serpFeatures: [],
    };

    const researchModel = getResearchModel(site.id);
    const aiAnalysis = await performAIAnalysis(
      keywordData,
      site,
      null,
      (progress) => patchOptimizationProgress(setOptimizationProgress, siteId, progress),
      relatedGSCKeywords,
      researchModel
    );

    return {
      keywordData,
      aiAnalysis,
      paaResult: { items: [], rawResponse: null, extractionLog: [] },
      paaRawResponse: null,
      relatedKeywords: relatedGSCKeywords ?? [],
    };
  }

  if (!getMuteOptimizationToasts()) notify.info(notifyResearchingKeywordXFetchingSearchVo(primaryKeyword));

  const researchResult = await performKeywordResearch(
    primaryKeyword,
    {
      query: selectedKeyword.query,
      clicks: selectedKeyword.clicks,
      impressions: selectedKeyword.impressions,
      ctr: selectedKeyword.ctr ?? 0,
      position: selectedKeyword.position ?? 0,
    },
    (progress) => patchOptimizationProgress(setOptimizationProgress, siteId, progress),
    relatedGSCKeywords
  );

  const researchModel = getResearchModel(site.id);
  const aiAnalysis = await performAIAnalysis(
    researchResult.keywordData,
    site,
    researchResult.paaRawResponse,
    (progress) => patchOptimizationProgress(setOptimizationProgress, siteId, progress),
    researchResult.relatedGSCKeywords || relatedGSCKeywords,
    researchModel
  );

  if (researchResult.paaResult?.items && Array.isArray(researchResult.paaResult.items) && researchResult.paaResult.items.length > 0) {
    aiAnalysis.peopleAlsoAsk = researchResult.paaResult.items
      .map((item) => ({ question: item.question || "", answer: item.answer || "" }))
      .filter((paa) => paa.question);
  }

  return {
    keywordData: researchResult.keywordData,
    aiAnalysis,
    paaResult: researchResult.paaResult,
    paaRawResponse: researchResult.paaRawResponse,
    relatedKeywords: researchResult.relatedGSCKeywords || relatedGSCKeywords || []
  };
}

export async function autoSelectOptimizationItems(
  aiAnalysis: KeywordAIAnalysis,
  keywordData: KeywordData,
  primaryKeyword: string,
  clusterKeywords: string[] | undefined,
  testMode: boolean
): Promise<{
  selectedKeywords: string[];
  selectedH2Sections: string[];
  selectedPeopleAlsoAsk: string[];
  selectedResearchLinks: string[];
  updatedPrimaryKeyword?: string;
}> {
  const { autoSelectKeywords, autoSelectH2Sections, autoSelectPeopleAlsoAsk, autoSelectResearchLinks } = getAutoSelectHelpers();

  const aiSelectedKeywords = autoSelectKeywords(aiAnalysis, [keywordData]);
  
  // If we have less than 5 keywords, use the best one (first in sorted array) as primary
  let updatedPrimaryKeyword: string | undefined;
  if (aiSelectedKeywords.length < 5 && aiSelectedKeywords.length > 0) {
    // The first keyword is already the best one (sorted by quality)
    updatedPrimaryKeyword = aiSelectedKeywords[0];
    // Update aiAnalysis to reflect the new primary keyword
    if (aiAnalysis.keywordSuggestions) {
      aiAnalysis.keywordSuggestions.primary = updatedPrimaryKeyword;
    }
  }
  
  const selectedKeywords = clusterKeywords && clusterKeywords.length > 0
    ? [...new Set([updatedPrimaryKeyword || primaryKeyword, ...clusterKeywords, ...aiSelectedKeywords])]
    : aiSelectedKeywords;

  const selectedH2Sections = autoSelectH2Sections(aiAnalysis);
  const selectedPeopleAlsoAsk = autoSelectPeopleAlsoAsk(aiAnalysis);
  const selectedResearchLinks = autoSelectResearchLinks(aiAnalysis);

  if (!testMode && !getMuteOptimizationToasts()) {
    notify.success(notifyAiAnalysisCompleteSelectedXKeywords(selectedKeywords.length, selectedH2Sections.length), { duration: 4000 });
  }

  return { 
    selectedKeywords, 
    selectedH2Sections, 
    selectedPeopleAlsoAsk, 
    selectedResearchLinks,
    updatedPrimaryKeyword 
  };
}

export function updateKeywordResearchFile(
  fileManager: OptimizationFileManager,
  siteId: string,
  selectedKeywords: string[],
  selectedH2Sections: string[],
  selectedPeopleAlsoAsk: string[],
  selectedResearchLinks: string[],
  setOptimizationFileManagers: Dispatch<SetStateAction<Record<string, OptimizationFileManager>>>
): void {
  const keywordResearchFiles = fileManager.getFiles().filter(f => f.name.includes('keyword-research'));
  if (keywordResearchFiles.length > 0) {
    const keywordResearchFile = keywordResearchFiles[0];
    const keywordResearchData = JSON.parse(keywordResearchFile.content);
    keywordResearchData.selectedKeywords = selectedKeywords;
    keywordResearchData.selectedH2Sections = selectedH2Sections;
    keywordResearchData.selectedPeopleAlsoAsk = selectedPeopleAlsoAsk;
    keywordResearchData.selectedResearchLinks = selectedResearchLinks;
    fileManager.removeFile(keywordResearchFile.name);
    fileManager.addFile(
      keywordResearchFile.name,
      JSON.stringify(keywordResearchData, null, 2),
      'application/json'
    );
    setOptimizationFileManagers((prev) => ({ ...prev, [siteId]: fileManager }));
  }
}

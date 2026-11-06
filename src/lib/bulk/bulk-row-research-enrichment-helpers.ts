import { resolveSerpLocationName } from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import type { KeywordAIAnalysis } from "../keyword-types";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";

export function bulkRowSerpLocationName(row: {
  title?: string;
  keyword?: string;
  modifier?: string;
  prompt_modifier?: string;
}): string {
  return resolveSerpLocationName("", [row.title, row.keyword, row.prompt_modifier, row.modifier].filter(Boolean).join(" "));
}

export function mergePaaQuestionsIntoAiAnalysis(paaRawResponse: unknown, aiAnalysis: KeywordAIAnalysis): void {
  // CRITICAL FIX: Merge PAA questions from paaRawResponse into aiAnalysis
  // The AI analyzer returns empty peopleAlsoAsk because PAA is extracted separately
  // We need to populate it here so autoSelectPeopleAlsoAsk works correctly
  const paaRoot = paaRawResponse as
    | {
        tasks?: Array<{
          result?: Array<{
            items?: Array<{
              type?: string;
              items?: Array<{ title?: string; snippet?: string }>;
            }>;
          }>;
        }>;
      }
    | null
    | undefined;
  if (paaRoot?.tasks?.[0]?.result?.[0]?.items) {
    const paaItems = paaRoot.tasks[0].result[0].items;
    if (Array.isArray(paaItems) && paaItems.length > 0) {
      aiAnalysis.peopleAlsoAsk = paaItems
        .filter((item) => item.type === 'people_also_ask' && item.items)
        .flatMap((item) => item.items || [])
        .slice(0, 10)
        .map((item) => ({
          question: item.title || '',
          snippet: item.snippet || ''
        }))
        .filter((paa) => paa.question);
      console.log('[Bulk Auto-Generate] Merged PAA questions into aiAnalysis:', {
        paaItemsCount: paaItems.length,
        aiAnalysisPAACount: aiAnalysis.peopleAlsoAsk.length
      });
    }
  }
}

export function fallbackSeoContentBrief(input: {
  waveKeyword: string;
  serpPageUrl: string;
  serpBaseUrl: string;
  serpLocation: string;
}): SeoContentBriefV1 {
  const { waveKeyword, serpPageUrl, serpBaseUrl, serpLocation } = input;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    pageUrl: serpPageUrl,
    focusKeyword: waveKeyword,
    gsc: { pageUrl: serpPageUrl, queries: [] },
    dataforseo: {
      seedKeyword: waveKeyword,
      organic: [],
      peopleAlsoAsk: [],
      peopleAlsoSearchPhrases: [],
      relatedSearches: [],
      refinementChips: [],
      popularProducts: [],
    },
    semrush: {
      urlOrganicKeywords: [],
      phraseRelatedKeywords: [],
      urlOrganicUrls: [],
      phraseRelatedUrls: [],
      phraseOrganicUrls: [],
      externalSemrushUrls: [],
    },
    llmAudit: { siteUrl: serpBaseUrl, location: serpLocation, focusKeyword: waveKeyword, platforms: [] },
  };
}

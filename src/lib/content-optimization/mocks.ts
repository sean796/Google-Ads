import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";

export function createMockKeywordData(keyword: string): KeywordData {
  return {
    keyword,
    difficulty: 50,
    searchVolume: 0,
    cpc: 0,
    competition: "MEDIUM" as const,
    intent: "informational" as const,
    relatedKeywords: [],
    serpFeatures: [],
  };
}

export function createMockAIAnalysis(keyword: string): KeywordAIAnalysis {
  return {
    keywordSuggestions: {
      primary: keyword,
      variations: [`${keyword} services`, `${keyword} companies`, `${keyword} agency`],
      longTail: [`best ${keyword}`, `affordable ${keyword}`, `professional ${keyword}`],
      semantic: ["online marketing", "marketing services", "digital advertising"],
    },
    h2Suggestions: [
      { heading: `What is ${keyword}?`, description: `An introduction to ${keyword} and its importance`, priority: "high" as const, reasoning: "Provides foundational context for readers" },
      { heading: `Benefits of ${keyword}`, description: `Key advantages and benefits of using ${keyword}`, priority: "high" as const, reasoning: "Helps users understand value proposition" },
      { heading: `How to Choose the Right ${keyword} Provider`, description: `Guidance on selecting the best ${keyword} service`, priority: "medium" as const, reasoning: "Addresses common user queries" },
    ],
    contentGaps: [
      { topic: `${keyword} Best Practices`, description: `Industry best practices and recommendations for ${keyword}`, opportunity: "high" as const, suggestedH2: `${keyword} Best Practices` },
    ],
    peopleAlsoAsk: [],
    researchLinks: [],
  };
}

export function createMockBlueprint(
  keyword: string,
  existingTitle: string,
): {
  title: string;
  purpose: string;
  entity: string;
  agents: Array<{ id: string; step: number; title: string; content: string }>;
} {
  return {
    title: existingTitle || `Complete Guide to ${keyword}`,
    purpose: buildFocusedArticlePurpose(keyword),
    entity: "N/A",
    agents: [
      { id: "intro", step: 1, title: `Introduction to ${keyword}`, content: `This section introduces ${keyword} and explains its importance.` },
      { id: "benefits", step: 2, title: `Benefits of ${keyword}`, content: `This section covers the key benefits and advantages of ${keyword}.` },
      { id: "how-to-choose", step: 3, title: `How to Choose the Right ${keyword} Provider`, content: `This section provides guidance on selecting the best ${keyword} service for your needs.` },
    ],
  };
}

import type { KeywordData } from '@/lib/keyword-types';

export function buildBulkSelectedKeywordArtifactPayload(
  primaryKeyword: string,
  selectedKeywords: string[],
  selectedPeopleAlsoAsk: string[],
): string {
  return JSON.stringify(
    {
      primaryKeyword,
      selectedKeywords,
      selectedPeopleAlsoAsk,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/**
 * GSC / merged research often attach rank_math_* and focus_keyword on keywordData (see DFS export JSON).
 */
export function resolveRankMathFromKeywordResearch(keywordData: KeywordData): {
  seoTitle: string | undefined;
  metaDescription: string | undefined;
  focusKeyword: string | undefined;
} {
  const ext: KeywordData & {
    rank_math_title?: unknown;
    rank_math_description?: unknown;
    rank_math_focus_keyword?: unknown;
    focus_keyword?: unknown;
  } = keywordData;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    seoTitle: str(ext.rank_math_title) || undefined,
    metaDescription: str(ext.rank_math_description) || undefined,
    focusKeyword:
      str(ext.rank_math_focus_keyword) || str(ext.focus_keyword) || undefined,
  };
}

export function safeTrimSemrushOverviewForAcf(overview: unknown): unknown {
  if (overview == null) return undefined;
  try {
    const s = JSON.stringify(overview);
    if (s.length <= 12000) {
      return JSON.parse(s) as unknown;
    }
    return { truncated: true as const, preview: s.slice(0, 12000) };
  } catch {
    return undefined;
  }
}

export function mergeSemrushFieldsIntoSeoResearchJson(
  jsonStr: string,
  extras: Record<string, unknown>,
): string {
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    return JSON.stringify({ ...o, ...extras }, null, 2);
  } catch {
    return jsonStr;
  }
}

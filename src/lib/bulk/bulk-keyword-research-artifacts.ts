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
 * GSC / merged research often attach neo_pulse_seo_* and focus_keyword on keywordData (see DFS export JSON).
 */
export function resolveRedirectCsvFromKeywordResearch(keywordData: KeywordData): {
  seoTitle: string | undefined;
  metaDescription: string | undefined;
  focusKeyword: string | undefined;
} {
  const ext: KeywordData & {
    neo_pulse_seo_title?: unknown;
    neo_pulse_seo_description?: unknown;
    neo_pulse_seo_focus_keyword?: unknown;
    focus_keyword?: unknown;
  } = keywordData;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    seoTitle: str(ext.neo_pulse_seo_title) || undefined,
    metaDescription: str(ext.neo_pulse_seo_description) || undefined,
    focusKeyword:
      str(ext.neo_pulse_seo_focus_keyword) || str(ext.focus_keyword) || undefined,
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

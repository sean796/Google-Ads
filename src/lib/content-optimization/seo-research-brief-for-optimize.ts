import type { KeywordData, KeywordAIAnalysis } from "@/lib/keyword-types";
import type { LlmAuditBrief, SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { llmAuditGuidanceFromBrief } from "@/lib/llm-audit/llm-audit-dataforseo";
import { sortGscQueriesByStats } from "@/lib/bulk/bulk-gsc-site-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import {
  mergeSeoResearchFromAcfIntoContext,
  type AIDrivenACFContext,
} from "@/lib/content-generation/ai-driven-post-fields-reader";

export type PageGscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position?: number;
};

export type PageGscResultLike = {
  success?: boolean;
  queries?: PageGscQueryRow[];
  topKeyword?: PageGscQueryRow | null;
};

export function hasUsablePageGsc(gscResult: PageGscResultLike | null | undefined): boolean {
  const queries = gscResult?.queries;
  if (!Array.isArray(queries) || queries.length === 0) return false;
  return queries.some(
    (q) =>
      q?.query?.trim() &&
      ((q.clicks ?? 0) > 0 || (q.impressions ?? 0) > 0),
  );
}

export function hasSubstantiveSeoResearchBrief(raw: string | null | undefined): boolean {
  const brief = parseSeoResearchBrief(raw);
  if (!brief) return false;
  return Object.keys(brief as object).length > 0;
}

/** Prefer ACF brief; otherwise inject overview grid / caller-supplied stored brief. */
export function mergeStoredSeoResearchBriefIntoContext(
  acfFields: Record<string, unknown>,
  acfContext: AIDrivenACFContext | undefined,
  storedBrief?: string | null,
): AIDrivenACFContext | undefined {
  const fromAcf = mergeSeoResearchFromAcfIntoContext(acfFields, acfContext);
  const overview = storedBrief?.trim();
  if (!overview || hasSubstantiveSeoResearchBrief(fromAcf?.seoResearch)) {
    return fromAcf;
  }
  if (hasSubstantiveSeoResearchBrief(overview)) {
    return { ...(fromAcf ?? acfContext ?? {}), seoResearch: overview };
  }
  return fromAcf;
}

export function parseSeoResearchBrief(raw: string | null | undefined): SeoContentBriefV1 | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as SeoContentBriefV1;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function pageGscKeywordStrings(gscResult: PageGscResultLike | null | undefined, limit = 30): string[] {
  const queries = gscResult?.queries ?? [];
  if (!queries.length) return [];
  const sorted = sortGscQueriesByStats(queries as GscSiteQueryRow[]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of sorted) {
    const kw = row.query?.trim();
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    out.push(kw);
    if (out.length >= limit) break;
  }
  return out;
}

export function relatedKeywordsFromSeoBrief(brief: SeoContentBriefV1 | null): string[] {
  if (!brief) return [];
  const fromGsc = brief.gsc?.queries ?? [];
  const fromPaa = (brief.dataforseo?.peopleAlsoAsk ?? [])
    .map((p) => p.question?.trim())
    .filter(Boolean) as string[];
  const related = [
    ...(brief.dataforseo?.relatedSearches ?? []),
    ...(brief.dataforseo?.peopleAlsoSearchPhrases ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of [...fromGsc, ...fromPaa, ...related]) {
    const k = kw.trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

export { llmAuditGuidanceFromBrief };
export { collectLiveLinksFromBrief } from "@/lib/llm-audit/llm-audit-authority-links";

export function llmAuditSummaryFromSeoResearchBrief(raw: string | null | undefined): string {
  return llmAuditGuidanceFromBrief(parseSeoResearchBrief(raw)).trim();
}

export function llmAuditSummaryFromLlmAuditBrief(audit: LlmAuditBrief | null | undefined): string {
  if (!audit) return "";
  return llmAuditGuidanceFromBrief({ llmAudit: audit } as SeoContentBriefV1).trim();
}

export function paaItemsFromSeoBrief(brief: SeoContentBriefV1 | null): Array<{ question: string; snippet: string }> {
  if (!brief?.dataforseo?.peopleAlsoAsk?.length) return [];
  return brief.dataforseo.peopleAlsoAsk
    .map((entry) => ({
      question: entry.question?.trim() ?? "",
      snippet: entry.answers?.[0]?.description?.trim() ?? entry.answers?.[0]?.title?.trim() ?? "",
    }))
    .filter((p) => p.question);
}

export function keywordDataFromSeoBrief(
  brief: SeoContentBriefV1 | null,
  primaryKeyword: string,
  selectedKeyword?: PageGscQueryRow,
  extraRelated: string[] = [],
): KeywordData {
  const keyword = primaryKeyword.trim() || brief?.focusKeyword?.trim() || "";
  const related = [
    ...relatedKeywordsFromSeoBrief(brief),
    ...extraRelated,
  ].filter((k, i, arr) => arr.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i);

  return {
    keyword,
    searchVolume: selectedKeyword?.impressions ?? 0,
    difficulty: 0,
    cpc: 0,
    competition: "LOW",
    intent: "informational",
    relatedKeywords: related,
    serpFeatures: [],
  };
}

export function mergeOptimizeResearchInputs(args: {
  primaryKeyword: string;
  selectedKeyword: PageGscQueryRow;
  gscResult: PageGscResultLike | null | undefined;
  seoResearchBrief: string | null | undefined;
}): {
  keywordData: KeywordData;
  relatedGSCKeywords: string[];
  paaItems: Array<{ question: string; snippet: string }>;
  useCachedResearchOnly: boolean;
} {
  const brief = parseSeoResearchBrief(args.seoResearchBrief);
  const pageGscKws = pageGscKeywordStrings(args.gscResult);
  const briefRelated = relatedKeywordsFromSeoBrief(brief);
  const relatedGSCKeywords = [
    ...pageGscKws,
    ...briefRelated,
  ].filter((k, i, arr) => arr.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i);

  const keywordData = keywordDataFromSeoBrief(
    brief,
    args.primaryKeyword,
    args.selectedKeyword,
    pageGscKws,
  );

  return {
    keywordData,
    relatedGSCKeywords,
    paaItems: paaItemsFromSeoBrief(brief),
    useCachedResearchOnly: Boolean(brief) || hasUsablePageGsc(args.gscResult),
  };
}

export function researchLinksFromSeoBrief(brief: SeoContentBriefV1 | null, limit = 7): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const row of brief?.dataforseo?.organic ?? []) {
    const url = row.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

/** Stored brief → blueprint inputs. No live keyword/PAA re-analysis. */
export function buildOptimizeSelectionsFromStoredBrief(args: {
  primaryKeyword: string;
  selectedKeyword: PageGscQueryRow;
  gscResult: PageGscResultLike | null | undefined;
  seoResearchBrief: string;
  clusterKeywords?: string[];
  secondaryKeywords?: string[];
  sapEntity?: string;
}): {
  keywordData: KeywordData;
  aiAnalysis: KeywordAIAnalysis;
  relatedKeywords: string[];
  selectedKeywords: string[];
  selectedH2Sections: string[];
  selectedPeopleAlsoAsk: string[];
  selectedResearchLinks: string[];
  paaRawResponse: null;
} {
  const merged = mergeOptimizeResearchInputs({
    primaryKeyword: args.primaryKeyword,
    selectedKeyword: args.selectedKeyword,
    gscResult: args.gscResult,
    seoResearchBrief: args.seoResearchBrief,
  });
  const brief = parseSeoResearchBrief(args.seoResearchBrief);
  const outlineH2s: string[] = [];
  const paaQuestions = merged.paaItems.map((p) => p.question).slice(0, 7);
  const researchLinks = researchLinksFromSeoBrief(brief);

  const selectedKeywords = args.clusterKeywords?.length
    ? [
        ...new Set([
          args.primaryKeyword,
          ...args.clusterKeywords,
          ...(args.secondaryKeywords ?? []),
          ...merged.relatedGSCKeywords,
        ]),
      ]
    : args.secondaryKeywords?.length
      ? [...new Set([args.primaryKeyword, ...args.secondaryKeywords, ...merged.relatedGSCKeywords])]
      : [...new Set([args.primaryKeyword, ...merged.relatedGSCKeywords])];

  const aiAnalysis: KeywordAIAnalysis = {
    keywordSuggestions: {
      primary: args.primaryKeyword,
      variations: merged.relatedGSCKeywords.slice(0, 10),
      longTail: [],
      semantic: [],
    },
    h2Suggestions: outlineH2s.map((heading) => ({
      heading,
      description: "",
      priority: "high" as const,
      reasoning: "",
    })),
    contentGaps: [],
    peopleAlsoAsk: merged.paaItems.slice(0, 7).map((p) => ({
      question: p.question,
      answer: p.snippet,
    })),
    researchLinks: researchLinks.map((url) => ({ url, title: url })),
  };

  return {
    keywordData: merged.keywordData,
    aiAnalysis,
    relatedKeywords: merged.relatedGSCKeywords,
    selectedKeywords,
    selectedH2Sections: outlineH2s,
    selectedPeopleAlsoAsk: paaQuestions,
    selectedResearchLinks: researchLinks,
    paaRawResponse: null,
  };
}

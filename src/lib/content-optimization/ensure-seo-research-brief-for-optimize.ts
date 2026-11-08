import type { WordPressSite } from "@/components/integrations/types";
import {
  mergeSeoResearchFromAcfIntoContext,
  type AIDrivenACFContext,
} from "@/lib/content-generation/ai-driven-post-fields-reader";
import { fetchMergedSeoContentBriefLive } from "@/lib/llm-audit/fetch-merged-seo-content-brief";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import {
  hasSubstantiveSeoResearchBrief,
  mergeStoredSeoResearchBriefIntoContext,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";

export function resolveOptimizeFocusKeyword(opts: {
  url: string;
  acfFields?: Record<string, unknown>;
  acfContext?: AIDrivenACFContext;
  selectedKeywordQuery?: string;
  pendingPrimaryKeyword?: string;
}): string {
  const candidates = [
    String(opts.acfFields?.keyword_focus ?? "").trim(),
    String(opts.acfContext?.keywordFocus ?? "").trim(),
    String(opts.pendingPrimaryKeyword ?? "").trim(),
    String(opts.selectedKeywordQuery ?? "").trim(),
    humanizeSlugFromUrl(opts.url).trim().toLowerCase(),
  ];
  for (const kw of candidates) {
    if (kw) return kw;
  }
  return "";
}

export async function ensureSeoResearchBriefForOptimize(opts: {
  url: string;
  site: WordPressSite;
  acfFields: Record<string, unknown>;
  acfContext: AIDrivenACFContext | undefined;
  storedBrief?: string | null;
  focusKeyword: string;
  gscQueries?: string[];
  muteToasts?: boolean;
  forceNewResearch?: boolean;
  onProgress?: (message: string) => void;
}): Promise<{
  seoResearchRaw: string;
  acfContext: AIDrivenACFContext | undefined;
  acfFields: Record<string, unknown>;
}> {
  let acfFields = { ...opts.acfFields };
  let acfContext = mergeStoredSeoResearchBriefIntoContext(
    acfFields,
    opts.acfContext,
    opts.storedBrief,
  );
  let seoResearchRaw = String(acfContext?.seoResearch ?? "").trim();

  if (!opts.forceNewResearch && hasSubstantiveSeoResearchBrief(seoResearchRaw)) {
    return { seoResearchRaw, acfContext, acfFields };
  }

  const keyword = opts.focusKeyword.trim();
  if (!keyword) {
    throw new Error(
      `Cannot run SERP research for ${opts.url}: no focus keyword (set keyword_focus or use a URL with a slug).`,
    );
  }

  opts.onProgress?.(`Running live SERP and full audit for "${keyword}"…`);

  const merged = await fetchMergedSeoContentBriefLive({
    keyword,
    pageUrl: opts.url.trim(),
    site: opts.site,
    gscQueries: opts.gscQueries ?? [],
    requireSerpDump: false,
    onProgress: (message) => opts.onProgress?.(`New research: ${message}`),
  });
  opts.onProgress?.("New live research ready");
  const briefJson = JSON.stringify(merged, null, 2);

  acfFields = {
    ...acfFields,
    seo_research: briefJson,
    ...(!String(acfFields.keyword_focus ?? "").trim() ? { keyword_focus: keyword } : {}),
  };
  acfContext = mergeStoredSeoResearchBriefIntoContext(
    acfFields,
    mergeSeoResearchFromAcfIntoContext(acfFields, acfContext),
    briefJson,
  );
  seoResearchRaw = String(acfContext?.seoResearch ?? briefJson).trim();

  if (!hasSubstantiveSeoResearchBrief(seoResearchRaw)) {
    throw new Error(`SERP research for ${opts.url} did not produce a usable brief.`);
  }

  if (!opts.muteToasts) {
    // Progress only; no success toast (harness shows step state).
  }

  return { seoResearchRaw, acfContext, acfFields };
}

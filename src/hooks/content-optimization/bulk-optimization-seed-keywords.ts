/**
 * Sync bulk KEYWORD column from prefetch caches (after ensureBulk / ACF research).
 */
import { readKeywordFocusFromAcfFields } from "@/lib/content-generation/ai-driven-acf-reader";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";

export function seedBulkUrlKeywordsFromCaches(opts: {
  urls: string[];
  batchKey: string;
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
}): void {
  const { urls, batchKey, prefetchedAcfFieldsCache, setBulkOptimizationState } = opts;

  const urlKeywords: Record<string, string> = {};

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    const acfKw = readKeywordFocusFromAcfFields(
      prefetchedAcfFieldsCache.get(i) as Record<string, unknown> | undefined,
    );
    const kw = acfKw.trim();
    if (kw) urlKeywords[url] = kw;
  }

  if (Object.keys(urlKeywords).length === 0) return;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlKeywords: {
          ...(current.urlKeywords || {}),
          ...urlKeywords,
        },
      },
    };
  });
}

import { notify } from "@/lib/app-notifications";
import { readKeywordFocusFromAcfFields } from "@/lib/content-generation/ai-driven-acf-reader";
import type { WpPostSnapshotFromAcfByUrl } from "@/lib/wordpress-api/fields-client";
import {
  lookupInventoryRow,
  normalizeMatch,
  typeHintFromCachedPost,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import type { LinkPoolPostRow } from "./bulk-optimization-do-prefetch";

export type SeedInventoryKeywordsResult = {
  /** Every target URL has a non-empty keyword in prefetchedAcfFieldsCache. */
  allKeywordsReady: boolean;
  seededCount: number;
  missingCount: number;
};

/**
 * Seed prefetched ACF + bulk urlKeywords from session inventory (no WordPress ACF batch call).
 */
export function seedBulkAcfKeywordsFromInventory(params: {
  site: WordPressSite;
  urls: string[];
  batchKey: string;
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot;
  wordPressPostsForRun: LinkPoolPostRow[];
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
}): SeedInventoryKeywordsResult {
  const {
    site,
    urls,
    batchKey,
    bulkInventorySnapshot,
    wordPressPostsForRun,
    prefetchedAcfFieldsCache,
    setBulkOptimizationState,
  } = params;

  const keywordUpdates: Record<string, string> = {};
  let seededCount = 0;
  let missingCount = 0;

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const targetUrl = urls[urlIndex];
    if (!targetUrl) continue;

    const targetNorm = normalizeMatch(site.siteUrl, targetUrl);
    const cached = wordPressPostsForRun.find(
      (p) => p?.link && normalizeMatch(site.siteUrl, p.link) === targetNorm,
    );
    const hint = typeHintFromCachedPost(cached);
    const invRow = lookupInventoryRow(bulkInventorySnapshot, site.siteUrl, targetUrl, hint);
    const seeded = inventoryRowToAcfKeywordFields(invRow);
    if (!seeded) {
      missingCount += 1;
      continue;
    }

    prefetchedAcfFieldsCache.set(urlIndex, seeded.acfFields);
    keywordUpdates[targetUrl] = seeded.acfKeywordRaw;
    seededCount += 1;
  }

  if (Object.keys(keywordUpdates).length > 0) {
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlKeywords: {
            ...(current.urlKeywords || {}),
            ...keywordUpdates,
          },
        },
      };
    });
  }

  return {
    allKeywordsReady: missingCount === 0 && seededCount === urls.filter(Boolean).length,
    seededCount,
    missingCount,
  };
}

export function readKeywordFromInventoryRow(row: SitePostInventoryRow | undefined): string {
  if (!row) return "";
  const fromAcf = readKeywordFocusFromAcfFields(
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : undefined,
  );
  if (fromAcf) return fromAcf;
  return String(row.fields?.keyword ?? "").trim();
}

export function inventoryRowToAcfKeywordFields(
  invRow: SitePostInventoryRow | undefined,
): { acfFields: Record<string, unknown>; acfKeywordRaw: string; keywordFromAcfDirect: boolean } | null {
  if (!invRow) return null;

  const acfObj =
    invRow.acf && typeof invRow.acf === "object" && Object.keys(invRow.acf).length > 0
      ? (invRow.acf as Record<string, unknown>)
      : null;
  const acfKeywordDirect = acfObj ? readKeywordFocusFromAcfFields(acfObj) : "";
  const keyword = readKeywordFromInventoryRow(invRow);
  if (!keyword) return null;

  const acfFields = acfObj
    ? { ...acfObj, ...(acfKeywordDirect ? {} : { keyword_focus: keyword }) }
    : { keyword_focus: keyword };

  return {
    acfFields,
    acfKeywordRaw: keyword,
    keywordFromAcfDirect: Boolean(acfKeywordDirect),
  };
}

/** Inventory-only: never calls WordPress during bulk prep. */
export async function bulkOptimizationGrepAcfKeywordFocus(params: {
  site: WordPressSite;
  urls: string[];
  batchKey: string;
  muteToasts: boolean;
  setBulkStep: (step: string, message: string, progress?: number) => void;
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromAcfByUrl>;
  prefetchedPendingCache?: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  wordPressPostsForRun: LinkPoolPostRow[];
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null;
}): Promise<void> {
  const {
    site,
    urls,
    batchKey,
    muteToasts,
    setBulkStep,
    prefetchedAcfFieldsCache,
    setBulkOptimizationState,
    wordPressPostsForRun,
    bulkInventorySnapshot,
  } = params;

  if (!site.username || !site.appPassword || !bulkInventorySnapshot) return;

  setBulkStep("Using inventory", "Applying keywords from loaded inventory…", 6);
  if (!muteToasts) {
    notify.info("Using loaded inventory keywords (no WordPress calls)...");
  }

  const result = seedBulkAcfKeywordsFromInventory({
    site,
    urls,
    batchKey,
    bulkInventorySnapshot,
    wordPressPostsForRun,
    prefetchedAcfFieldsCache,
    setBulkOptimizationState,
  });

}

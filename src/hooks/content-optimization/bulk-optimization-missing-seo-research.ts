import pLimit from "p-limit";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { notifyFilledSeoResearchFromSerpForXUrl, notifySeoResearchErrorForX } from "@/lib/notify-messages";
import {
  getSeoResearchFromPostFields,
  mergeSeoResearchFromAcfIntoContext,
  type AIDrivenACFContext,
} from "@/lib/content-generation/ai-driven-post-fields-reader";
import { fetchMergedSeoContentBriefLive } from "@/lib/llm-audit/fetch-merged-seo-content-brief";
import type { WordPressSite } from "@/components/integrations/types";
import { pageGscQueryStringsFromPending } from "./bulk-optimization-prefetch-page-gsc";
import type {
  HandleOptimizeMultipleContentParams,
  PrefilledOverviewTarget,
} from "./bulk-optimization-params";

type BulkStateSetter = HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
import { hasSubstantiveSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";

/** Caps parallel MCP / DataForSEO SERP calls during bulk content run research. */
const BULK_SERP_RESEARCH_CONCURRENCY = 8;

/** Throttle React updates during concurrent research (progress + urlSerpResearchReady). */
const BULK_SERP_RESEARCH_PROGRESS_EVERY = 5;

/**
 * True when ACF already has usable `seo_research`.
 * Empty strings, `{}`, `[]`, and JSON objects/arrays with no entries are not substantive.
 */
export function hasSubstantiveSeoResearch(postFieldsRow: Record<string, unknown> | undefined): boolean {
  const raw = getSeoResearchFromPostFields(postFieldsRow).trim();
  if (!raw) return false;
  try {
    const j = JSON.parse(raw) as unknown;
    if (j === null || j === undefined) return false;
    if (Array.isArray(j)) return j.length > 0;
    if (typeof j === "object") return Object.keys(j as Record<string, unknown>).length > 0;
    return true;
  } catch {
    return true;
  }
}

/**
 * DataForSEO SERP → merged `SeoContentBriefV1` JSON (same shape as Overview grid `seoResearch`).
 * GSC / Semrush are omitted (bulk content run uses no live GSC).
 */
export async function fetchDataForSeoSerpBriefJson(opts: {
  keyword: string;
  pageUrl: string;
  muteToasts?: boolean;
  /** Page-scoped GSC query strings from batch prefetch (optional). */
  gscQueries?: string[];
  site?: WordPressSite | null;
}): Promise<string> {
  const { keyword, pageUrl, muteToasts, gscQueries = [], site } = opts;
  const k = keyword.trim();
  if (!k) {
    throw new Error("fetchDataForSeoSerpBriefJson requires a non-empty keyword");
  }

  try {
    const merged = await fetchMergedSeoContentBriefLive({
      keyword: k,
      pageUrl: pageUrl.trim(),
      site,
      gscQueries,
    });
    return JSON.stringify(merged, null, 2);
  } catch (e) {
    logger.warn("[Bulk Optimization] fetchDataForSeoSerpBriefJson:", e);
    if (!muteToasts) notify.warning(notifySeoResearchErrorForX(k));
    throw e instanceof Error ? e : new Error(String(e));
  }
}

function bulkCancelled(batchKey: string, setBulkOptimizationState: BulkStateSetter): boolean {
  let cancelled = false;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (current?.cancelRequested) cancelled = true;
    return prev;
  });
  return cancelled;
}

/** Mark URLs that already have substantive ACF `seo_research` in the prefetch cache (bulk SERP column). */
export function seedBulkUrlSerpResearchReadyFromAcfCache(opts: {
  urls: string[];
  batchKey: string;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  setBulkOptimizationState: BulkStateSetter;
}): void {
  const { urls, batchKey, prefetchedPostFieldsCache, setBulkOptimizationState } = opts;
  const next: Record<string, boolean> = {};
  for (let i = 0; i < urls.length; i++) {
    const row = prefetchedPostFieldsCache.get(i) ?? {};
    if (hasSubstantiveSeoResearch(row)) next[urls[i]] = true;
  }
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlSerpResearchReady: { ...(current.urlSerpResearchReady || {}), ...next },
      },
    };
  });
}

export function applyBriefToCaches(
  i: number,
  brief: string,
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>,
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>,
): void {
  const prevRow = prefetchedPostFieldsCache.get(i) ?? {};
  const mergedRow = { ...prevRow, seo_research: brief };
  prefetchedPostFieldsCache.set(i, mergedRow);

  const pend = prefetchedPendingCache.get(i);
  if (pend?.pending) {
    const p = pend.pending as Record<string, unknown>;
    const prevAf =
      p.acfFields && typeof p.acfFields === "object" ? (p.acfFields as Record<string, unknown>) : {};
    p.acfFields = { ...prevAf, ...mergedRow };
    p.acfContext = mergeSeoResearchFromAcfIntoContext(
      p.acfFields as Record<string, unknown>,
      p.acfContext as AIDrivenACFContext | undefined,
    );
  }
}

/** Inject overview grid `seoResearch` into prefetch caches (no live SERP). ACF brief wins when present. */
export function seedOverviewSeoResearchFromPrefilledTargets(opts: {
  urls: string[];
  prefilledOverviewTargets?: Record<string, PrefilledOverviewTarget>;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  batchKey: string;
  setBulkOptimizationState: BulkStateSetter;
}): void {
  const {
    urls,
    prefilledOverviewTargets,
    prefetchedPostFieldsCache,
    prefetchedPendingCache,
    batchKey,
    setBulkOptimizationState,
  } = opts;
  if (!prefilledOverviewTargets || Object.keys(prefilledOverviewTargets).length === 0) return;

  const urlSerpReady: Record<string, boolean> = {};
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]?.trim();
    if (!url) continue;
    const brief = prefilledOverviewTargets[url]?.seoResearch?.trim();
    if (!brief || !hasSubstantiveSeoResearchBrief(brief)) continue;
    const postFieldsBrief = getSeoResearchFromPostFields(prefetchedPostFieldsCache.get(i)).trim();
    if (hasSubstantiveSeoResearchBrief(postFieldsBrief)) continue;
    applyBriefToCaches(i, brief, prefetchedPostFieldsCache, prefetchedPendingCache);
    urlSerpReady[url] = true;
  }

  if (Object.keys(urlSerpReady).length === 0) return;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlSerpResearchReady: {
          ...(current.urlSerpResearchReady || {}),
          ...urlSerpReady,
        },
      },
    };
  });
}

export function indexHasStoredSeoResearchBrief(
  index: number,
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>,
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>,
): boolean {
  const postFieldsRow = prefetchedPostFieldsCache.get(index) ?? {};
  const postFieldsBrief = getSeoResearchFromPostFields(postFieldsRow).trim();
  if (hasSubstantiveSeoResearchBrief(postFieldsBrief)) return true;
  const ctx = prefetchedPendingCache.get(index)?.pending?.acfContext as { seoResearch?: string } | undefined;
  return hasSubstantiveSeoResearchBrief(ctx?.seoResearch);
}

/**
 * After ACF prefetch: for each URL with `keyword_focus`, run DataForSEO SERP
 * and write merged JSON into caches so Content Optimizer uses this-run research.
 */
export async function fillMissingBulkSeoResearchFromSerp(opts: {
  urls: string[];
  batchKey: string;
  isAcfKeywordMode: boolean;
  seoExtraTextFieldOnly: boolean;
  muteToasts: boolean;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  setBulkOptimizationState: BulkStateSetter;
  /** Process only indices in [start, end). */
  indexRange?: { start: number; end: number };
  /** Test hook: override SERP brief fetcher (default `fetchDataForSeoSerpBriefJson`). */
  fetchBrief?: (opts: {
    keyword: string;
    pageUrl: string;
    muteToasts?: boolean;
    gscQueries?: string[];
  }) => Promise<string>;
}): Promise<void> {
  const {
    urls,
    batchKey,
    isAcfKeywordMode,
    seoExtraTextFieldOnly,
    muteToasts,
    prefetchedPostFieldsCache,
    prefetchedPendingCache,
    setBulkOptimizationState,
    fetchBrief = fetchDataForSeoSerpBriefJson,
    indexRange,
  } = opts;

  if (!isAcfKeywordMode || seoExtraTextFieldOnly) return;

  type Job = { index: number; url: string; keyword: string };
  const work: Job[] = [];

  const rangeStart = indexRange?.start ?? 0;
  const rangeEnd = indexRange?.end ?? urls.length;

  for (let i = rangeStart; i < rangeEnd; i++) {
    const url = urls[i];
    if (!url) continue;
    const acfCachedKw = String(prefetchedPostFieldsCache.get(i)?.["keyword_focus"] ?? "").trim();
    const cachedPrimaryKeyword = acfCachedKw;
    if (!cachedPrimaryKeyword) {
      // Never skip: keyword will be derived by SERP warmup from URL when warmIndex runs.
      continue;
    }
    work.push({ index: i, url, keyword: cachedPrimaryKeyword });
  }

  if (work.length === 0) return;

  if (bulkCancelled(batchKey, setBulkOptimizationState)) return;

  const workTotal = work.length;
  let filled = 0;
  let completed = 0;
  const pendingUrlReady: Record<string, boolean> = {};

  const flushProgress = (done: number) => {
    const urlPatch =
      Object.keys(pendingUrlReady).length > 0 ? { ...pendingUrlReady } : null;
    if (urlPatch) {
      for (const k of Object.keys(urlPatch)) delete pendingUrlReady[k];
    }
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          currentStep: "SEO research…",
          currentStepProgress: {
            stepId: "prepResearch" as const,
            subProgress: Math.min(0.15, (done / Math.max(1, workTotal)) * 0.15),
            step: "SEO research…",
            progress: Math.min(15, Math.round((done / Math.max(1, workTotal)) * 15)),
            message: `Filling empty seo_research (${done}/${workTotal})`,
          },
          ...(urlPatch && Object.keys(urlPatch).length > 0
            ? {
                urlSerpResearchReady: {
                  ...(current.urlSerpResearchReady || {}),
                  ...urlPatch,
                },
              }
            : {}),
        },
      };
    });
  };

  flushProgress(0);

  const limit = pLimit(BULK_SERP_RESEARCH_CONCURRENCY);

  await Promise.all(
    work.map((job) =>
      limit(async () => {
        if (bulkCancelled(batchKey, setBulkOptimizationState)) return;

        const brief = await fetchBrief({
          keyword: job.keyword,
          pageUrl: job.url,
          muteToasts,
          gscQueries: pageGscQueryStringsFromPending(prefetchedPendingCache.get(job.index)?.pending),
        });

        if (bulkCancelled(batchKey, setBulkOptimizationState)) return;

        applyBriefToCaches(job.index, brief, prefetchedPostFieldsCache, prefetchedPendingCache);
        filled += 1;
        pendingUrlReady[job.url] = true;

        completed += 1;
        if (
          completed % BULK_SERP_RESEARCH_PROGRESS_EVERY === 0 ||
          completed === workTotal ||
          Object.keys(pendingUrlReady).length >= BULK_SERP_RESEARCH_PROGRESS_EVERY
        ) {
          flushProgress(completed);
        }
      }),
    ),
  );

  if (Object.keys(pendingUrlReady).length > 0) {
    flushProgress(completed);
  }

  if (filled > 0 && !muteToasts) {
    notify.success(notifyFilledSeoResearchFromSerpForXUrl(filled));
  }
}

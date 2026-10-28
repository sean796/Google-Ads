import type { Dispatch, SetStateAction } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAQS_NOT_GENERATED, NOTIFY_FAQ_OPTIMIZATION_FAILED_FOR_ALL_SELECTED, notifyAiFaqOptimizationFinishedForXPage } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { FaqEntry } from "@/lib/faq-entries";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { clampBulkAiFaqSeed } from "@/lib/overview/overview-row-helpers";
import {
  makeFaqPairHarnessDonePayload,
  makeFaqPairHarnessStartPayload,
} from "@/lib/overview/overview-faq-harness-sections";
import {
  emitFaqHarnessPayload,
  finishFaqRowHarness,
  markFaqRowActive,
  markFaqRowError,
  type FaqHarnessSetters,
} from "@/lib/overview/overview-faq-harness-mutations";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import { buildFaqJsonGeneratedFile } from "@/lib/overview/overview-faq-harness-sections";
import { appendFaqSectionToPostHtml } from "@/lib/overview/overview-blog-faq-append";
import {
  isTruncatedFaqSourceBody,
  resolveFaqHarnessSourceHtml,
  scoreFaqSourceBody,
} from "@/lib/overview/overview-faq-source-html";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { generateFaqIntroParagraph } from "@/lib/overview/overview-blog-faq-intro-agent";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";
import { loadApiKey } from "@/lib/api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import {
  mergeHarnessProgressSiteAndBatch,
  setOptimizingState,
} from "@/hooks/content-optimization/optimization-helpers-a";
import { mergeOptimizationProgress } from "@/hooks/content-optimization/optimization-helpers";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type FaqHarnessOptimizeDeps = {
  optimizeFaq: (
    url: string,
    focusKeyword: string | undefined,
    currentFaq: string,
    dfsContext: string | undefined,
    pageTitle?: string,
    metaDescription?: string,
    seoResearchBrief?: string,
    options?: { exactQuestionCount?: number; skipLoadingState?: boolean; includeAnswers?: boolean },
  ) => Promise<string | null>;
  optimizeFaqQuestion: (
    url: string,
    focusKeyword: string | undefined,
    question: string,
    currentFaq: string,
    dfsContext: string | undefined,
    pageTitle?: string,
    metaDescription?: string,
    seoResearchBrief?: string,
    options?: { skipLoadingState?: boolean },
  ) => Promise<string | null>;
  optimizeFaqAnswer: (
    url: string,
    focusKeyword: string | undefined,
    question: string,
    answer: string,
    currentFaq: string,
    dfsContext: string | undefined,
    pageTitle?: string,
    metaDescription?: string,
    seoResearchBrief?: string,
    options?: { skipLoadingState?: boolean },
  ) => Promise<string | null>;
  getDfsSerpContext: (row: OverviewRow) => Promise<string | undefined>;
};

export function resolveFaqPairCountForRow(row: OverviewRow, bulkAiFaqSeedCount: number): number {
  const entries = parseFaqEntries(row.faq);
  if (entries.length > 0) return entries.length;
  return clampBulkAiFaqSeed(bulkAiFaqSeedCount);
}

export type InitOverviewFaqHarnessParams = {
  site: WordPressSite;
  rows: OverviewRow[];
  bulkAiFaqSeedCount: number;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
  pairCountByUrl?: Record<string, number>;
};

export function initOverviewFaqHarnessBatchState(params: InitOverviewFaqHarnessParams): string {
  const {
    site,
    rows,
    bulkAiFaqSeedCount,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing FAQ batch…",
    pairCountByUrl = {},
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = rows.map((r) => r.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const kw = row.focusKeyword?.trim();
    if (kw) urlKeywords[url] = kw;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOptimizationProgress(prev as Record<string, unknown>, site.id, {
      step: "AI FAQs",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: null,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "AI FAQs",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiFaq",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: {
        step: "AI FAQs",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: null,
      },
      harnessStartedAt: Date.now(),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewFaqHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "FAQ batch finished",
    });
    return next;
  });
}

export type RunFaqPairsForRowParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  row: OverviewRow;
  rowIndex: number;
  bulkAiFaqSeedCount: number;
  deps: FaqHarnessOptimizeDeps;
  harnessSetters: FaqHarnessSetters;
  cacheWrite?: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  sectionIndexOffset?: number;
  totalHarnessSections?: number;
  skipLoadingState?: boolean;
};

export async function runFaqPairsForRow(params: RunFaqPairsForRowParams): Promise<boolean> {
  const {
    site,
    sitemapSource,
    getInventoryMatchForUrl,
    row,
    rowIndex,
    bulkAiFaqSeedCount,
    deps,
    harnessSetters,
    cacheWrite,
    updateRow,
    uploadAfterRowWrite,
    sectionIndexOffset = 0,
    totalHarnessSections: totalHarnessSectionsIn,
    skipLoadingState = true,
  } = params;

  const url = row.url.trim();
  if (!url) return false;

  const { html: sourceHtml, liveHtml, cachedHtml } = await resolveFaqHarnessSourceHtml({
    row,
    site,
    sitemapSource,
    getInventoryMatchForUrl,
  });
  if (!sourceHtml) {
    markFaqRowError(url, rowIndex, harnessSetters, updateRow, "No post HTML in cache.");
    return false;
  }
  if (isTruncatedFaqSourceBody(sourceHtml)) {
    markFaqRowError(
      url,
      rowIndex,
      harnessSetters,
      updateRow,
      "Post body is truncated (Answer only). Re-scrape this row from WordPress, then retry FAQs.",
    );
    return false;
  }
  if (liveHtml && liveHtml.length > cachedHtml.length) {
    updateRow(rowIndex, { postContent: liveHtml });
  } else if (liveHtml && scoreFaqSourceBody(liveHtml) > scoreFaqSourceBody(cachedHtml)) {
    updateRow(rowIndex, { postContent: liveHtml });
  }

  let existingEntries = parseFaqEntries(row.faq);
  if (existingEntries.length === 0) {
    const htmlFaq = extractFaqFromPostHtml(sourceHtml);
    if (htmlFaq) {
      existingEntries = parseFaqEntries(htmlFaq);
    }
  }
  const pairCount =
    existingEntries.length > 0
      ? existingEntries.length
      : clampBulkAiFaqSeed(bulkAiFaqSeedCount);
  const totalSections = totalHarnessSectionsIn ?? pairCount;

  console.log("[Auto SEO] Generating all FAQs in 1 pass ->", { url, pairCount });
  updateRow(rowIndex, { status: "ai-faq" });
  const briefSeed = row.seoResearch?.trim();
  const dfsContextSeed = briefSeed ? undefined : await deps.getDfsSerpContext(row);
  const existingFaqText =
    existingEntries.length > 0 ? serializeFaqEntriesPlain(existingEntries) : "(none)";
  const generated = await deps.optimizeFaq(
    row.url,
    row.focusKeyword,
    existingFaqText,
    dfsContextSeed,
    row.title,
    row.metaDescription,
    briefSeed || undefined,
    {
      exactQuestionCount: pairCount,
      includeAnswers: true,
      skipLoadingState,
    },
  );
  if (!generated?.trim()) {
    markFaqRowError(url, rowIndex, harnessSetters, updateRow, NOTIFY_FAQS_NOT_GENERATED);
    return false;
  }
  const merged = parseFaqEntries(generated);
  if (!merged.length) {
    markFaqRowError(url, rowIndex, harnessSetters, updateRow, "Could not parse generated FAQs");
    return false;
  }
  updateRow(rowIndex, { faq: serializeFaqEntriesPlain(merged), status: "ai-faq" });

  merged.forEach((entry, pairIndex) => {
    const sectionIndex = sectionIndexOffset + pairIndex;
    emitFaqHarnessPayload(
      url,
      makeFaqPairHarnessStartPayload(rowIndex, pairIndex, totalSections, sectionIndex),
      harnessSetters,
    );
    emitFaqHarnessPayload(
      url,
      makeFaqPairHarnessDonePayload(rowIndex, pairIndex, totalSections, sectionIndex, entry),
      harnessSetters,
    );
  });

  let appended: ReturnType<typeof appendFaqSectionToPostHtml> = null;
  try {
    const apiKey =
      (loadApiKey() ?? "").trim() || (await resolveOpenRouterApiKeyForHarness());
    if (!apiKey) {
      throw new Error("OpenRouter API key required for FAQ intro");
    }
    const introParagraph = await generateFaqIntroParagraph({
      apiKey,
      model: getMetaModel(site.id),
      focusKeyword: row.focusKeyword,
      pageTitle: row.title,
      entries: merged,
    });
    appended = appendFaqSectionToPostHtml({
      sourceHtml,
      entries: merged,
      introParagraph,
    });
  } catch (err) {
    markFaqRowError(
      url,
      rowIndex,
      harnessSetters,
      updateRow,
      err instanceof Error ? err.message : "FAQ append failed",
    );
    return false;
  }

  if (!appended?.html?.trim()) {
    markFaqRowError(url, rowIndex, harnessSetters, updateRow, "FAQ append failed");
    return false;
  }

  finishFaqRowHarness(url, rowIndex, merged, harnessSetters, cacheWrite, updateRow, {
    postHtml: appended.html,
    faqSectionHtml: appended.faqSectionHtml,
  });

  const appendedHtml = appended.html.trim();
  const faqFile = buildFaqJsonGeneratedFile(merged);
  const rowFiles = aiseoRowFilesForUpload({
    runKind: "aiFaq",
    url,
    elementFiles: faqFile ? [faqFile] : [],
    postHtml: appendedHtml,
  });
  if (uploadAfterRowWrite) {
    await uploadAfterRowWrite({
      index: rowIndex,
      url,
      html: appendedHtml,
      rowFiles: rowFiles.length ? rowFiles : undefined,
    });
  }
  return true;
}

export type RunOverviewFaqHarnessBatchParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  rowsRef: { current: OverviewRow[] };
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  rows: OverviewRow[];
  bulkAiFaqSeedCount: number;
  deps: FaqHarnessOptimizeDeps;
  harnessSetters: FaqHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  rowIndices?: number[];
};

export async function runOverviewFaqHarnessBatch(
  params: RunOverviewFaqHarnessBatchParams,
): Promise<{ ok: number; failed: number }> {
  const {
    site,
    sitemapSource,
    rowsRef,
    getInventoryMatchForUrl,
    rows,
    bulkAiFaqSeedCount,
    deps,
    harnessSetters,
    cacheWrite,
    updateRow,
    uploadAfterRowWrite,
    rowIndices,
  } = params;

  const eligible = (rowIndices ?? rows.map((_, index) => index))
    .map((index) => ({ row: rows[index], index }))
    .filter((entry): entry is { row: OverviewRow; index: number } =>
      Boolean(entry.row?.url?.trim()),
    );

  if (!eligible.length) {
    return { ok: 0, failed: 0 };
  }

  const pageRanges = overviewBulkPageRanges(eligible.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageEligible = eligible.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: eligible.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "AI FAQs",
    });

    await mapOverviewAiCopyWithConcurrency(pageEligible, async ({ row, index }) => {
      const url = row.url.trim();
      const liveRow = rowsRef.current[index] ?? row;
      try {
        updateRow(index, { status: "ai-faq" });
        markFaqRowActive(url, index, harnessSetters);

        const success = await runFaqPairsForRow({
          site,
          sitemapSource,
          getInventoryMatchForUrl,
          row: liveRow,
          rowIndex: index,
          bulkAiFaqSeedCount,
          deps,
          harnessSetters,
          cacheWrite,
          updateRow,
          uploadAfterRowWrite,
          skipLoadingState: true,
        });
        if (success) ok += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        markFaqRowError(
          url,
          index,
          harnessSetters,
          updateRow,
          err instanceof Error ? err.message : "FAQ optimization failed",
        );
      }
    });
  }

  if (ok > 0) {
    notify.success(notifyAiFaqOptimizationFinishedForXPage(ok));
  }
  if (failed > 0 && ok === 0) {
    notify.error(NOTIFY_FAQ_OPTIMIZATION_FAILED_FOR_ALL_SELECTED);
  }

  return { ok, failed };
}

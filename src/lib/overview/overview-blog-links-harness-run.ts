import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import type { BlogLinksCatalogRow } from "@/lib/overview/overview-blog-links-catalog";
import type { BlogLinksSiteLinkPool } from "@/lib/overview/overview-blog-links-inventory";
import type {
  BlogLinksAgentOptions,
  BlogLinksLinkAction,
  BlogLinksPlanResult,
} from "@/lib/overview/overview-blog-links-agent";
import { logBlogLinksActivity } from "@/lib/overview/overview-blog-links-activity-log";
import type { BlogLinksAddResult } from "@/lib/overview/overview-blog-links-apply-local";
import {
  extractInternalLinksFromHtml,
  paragraphBlocksForLinkAdds,
} from "@/lib/overview/overview-blog-links-extract";
import type { BlogLinksRowPatch } from "@/lib/overview/overview-blog-links-run";
import {
  buildLinksHarnessSectionsForRow,
  formatLinksAnalyzeAndApplyMarkdown,
  formatLinksAnalyzeMarkdown,
  formatLinksGscSitemapMarkdown,
  LINKS_SECTION_ANALYZE,
  LINKS_SECTION_GSC,
  linksHarnessSectionTitle,
  makeLinksHarnessDonePayloadForRow,
  makeLinksHarnessStartPayloadForRow,
} from "@/lib/overview/overview-blog-links-harness-sections";
import { fetchBlogHeadersGscPicks } from "@/lib/overview/overview-blog-headers-gsc";
import {
  emitLinksHarnessPayload,
  emitLinksHarnessStreamMarkdown,
  finishLinksRowHarness,
  markLinksRowError,
  setLinksHarnessMessage,
  type LinksHarnessSetters,
} from "@/lib/overview/overview-blog-links-harness-mutations";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
} from "@/lib/overview/overview-aiseo-row-artifacts";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;
type UserLinkHint = { anchor: string; href: string };

import {
  addLinksByBudget,
  applyOneLinkAddSlot,
  rewriteExistingLinks,
} from "@/lib/overview/overview-blog-links-harness-run-apply";
function resetRowHarnessSections(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
): void {
  const sections = buildLinksHarnessSectionsForRow(row);
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: sections,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          harnessPlannedSectionCount: sections.length,
        }),
      },
    };
  });
}

function emitRowHarnessStart(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
  sectionIndex: number,
  step: string,
): void {
  logBlogLinksActivity(step, { url: row.url, section: linksHarnessSectionTitle(row, sectionIndex) });
  emitLinksHarnessPayload(url, setters, makeLinksHarnessStartPayloadForRow(row.index, row, sectionIndex));
}

function emitRowHarnessDone(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
  sectionIndex: number,
  step: string,
  markdown: string,
): void {
  logBlogLinksActivity(step, { url: row.url, section: linksHarnessSectionTitle(row, sectionIndex) });
  emitLinksHarnessPayload(
    url,
    setters,
    makeLinksHarnessDonePayloadForRow(row.index, row, sectionIndex, markdown),
  );
}

export function initOverviewLinksHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogLinksCatalogRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    catalog,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing Links batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword) urlKeywords[url] = entry.focusKeyword;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Links",
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
      currentStep: "Links",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiLinks",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Links",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: null,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewLinksHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "Links batch finished",
    });
    return next;
  });
}

async function fetchGscHarnessStep(
  row: BlogLinksCatalogRow,
  siteUrl: string,
  setters: LinksHarnessSetters,
  signal?: AbortSignal,
): Promise<void> {
  const url = row.url.trim();
  emitRowHarnessStart(url, row, setters, LINKS_SECTION_GSC, "gsc_start");
  row.gscPicks = await fetchBlogHeadersGscPicks(siteUrl, url, signal);
  emitRowHarnessDone(
    url,
    row,
    setters,
    LINKS_SECTION_GSC,
    "gsc_done",
    formatLinksGscSitemapMarkdown(row.gscPicks, row.linkPool.postCount, row.linkPool.pageCount),
  );
}

function emitAnalyzeHarness(row: BlogLinksCatalogRow, setters: LinksHarnessSetters): void {
  const url = row.url.trim();
  emitRowHarnessStart(url, row, setters, LINKS_SECTION_ANALYZE, "analyze_start");
  emitLinksHarnessStreamMarkdown(
    url,
    setters,
    LINKS_SECTION_ANALYZE,
    linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
    formatLinksAnalyzeMarkdown(
      row.existingLinks,
      row.linkPool.postCount,
      row.linkPool.pageCount,
      row.wordCount,
      row.sectionHeadings,
      row.linksToAdd,
    ),
  );
}

async function runOneBlogLinksRow(
  row: BlogLinksCatalogRow,
  rowNum: number,
  total: number,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
): Promise<BlogLinksRowPatch | null> {
  const url = row.url.trim();
  const siteUrl = agentOptions.siteUrl?.trim();
  if (!siteUrl) return null;

  resetRowHarnessSections(url, row, setters);
  logBlogLinksActivity("row_start", {
    url: row.url,
    rowNum,
    total,
    existingLinks: row.existingLinks.length,
    adds: row.linksToAdd,
  });

  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
        currentUrl: url,
        currentIndex: rowNum - 1,
      },
    };
  });

  setLinksHarnessMessage(
    setters,
    `Links ${rowNum}/${total}: ${row.title || url}`,
    10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85),
  );

  await fetchGscHarnessStep(row, siteUrl, setters, agentOptions.signal);
  emitAnalyzeHarness(row, setters);

  const linkActions: BlogLinksLinkAction[] = [];
  const {
    html: afterRewrite,
    replacements,
    replacementsOk,
    intentKeywords,
  } = await rewriteExistingLinks(row, row.html, agentOptions, setters, url, linkActions);

  let addHtml = afterRewrite;
  const manualAdditions: BlogLinksAddResult[] = [];
  const usedBlockIndices = new Set<number>();
  let addBlocks = paragraphBlocksForLinkAdds(addHtml);
  const manualTargets = (row.userLinkTargets ?? []).slice(row.existingLinks.length);

  for (const hint of manualTargets) {
    const slot = await applyOneLinkAddSlot(
      row,
      addHtml,
      agentOptions,
      addBlocks,
      usedBlockIndices,
      hint,
    );
    manualAdditions.push(slot.result);
    if (slot.result.ok) {
      addHtml = slot.html;
      usedBlockIndices.add(slot.result.paragraphIndex);
      addBlocks = slot.addBlocks;
      if (slot.action) linkActions.push(slot.action);
    }
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(row, replacements, manualAdditions, intentKeywords),
    );
  }

  const { html: finalHtml, additionsOk, additions } = await addLinksByBudget(
    row,
    addHtml,
    agentOptions,
    setters,
    url,
    linkActions,
    { replacements, intentKeywords },
    manualAdditions,
    usedBlockIndices,
  );

  emitRowHarnessDone(
    url,
    row,
    setters,
    LINKS_SECTION_ANALYZE,
    "analyze_done",
    formatLinksAnalyzeAndApplyMarkdown(row, replacements, additions, intentKeywords),
  );

  const manualOk = manualAdditions.some((m) => m.ok);
  if (replacementsOk === 0 && additionsOk === 0 && !manualOk) {
    return null;
  }

  const plan: BlogLinksPlanResult = { linkActions };

  return {
    blogLinkList: extractInternalLinksFromHtml(finalHtml, siteUrl, row.url),
    blogLinksPlanJson: JSON.stringify(plan),
    postContentOptimized: finalHtml,
    blogLinksRanAtIso: new Date().toISOString(),
    elementorSourceJson: row.elementorSourceJson,
  };
}

export type RunOverviewLinksHarnessBatchParams = {
  catalog: BlogLinksCatalogRow[];
  linkPool: BlogLinksSiteLinkPool;
  agentOptions: BlogLinksAgentOptions;
  harnessSetters: LinksHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewLinksHarnessBatch(
  params: RunOverviewLinksHarnessBatchParams,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const { catalog, agentOptions, harnessSetters, cacheWrite, uploadAfterRowWrite } = params;
  if (!catalog.length) return { ok: 0, failed: 0, skipped: 0 };

  logBlogLinksActivity("batch_start", { catalogSize: catalog.length });
  await ensureMasterInstructionsInMemory(agentOptions.siteId ?? null);

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageCatalog = catalog.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: catalog.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Links",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        const patch = await runOneBlogLinksRow(
          row,
          globalRowNum,
          catalog.length,
          agentOptions,
          harnessSetters,
        );
        if (!patch) {
          failed += 1;
          markLinksRowError(url, row.index, harnessSetters, "No link changes applied");
          return;
        }
        finishLinksRowHarness(url, row.index, patch, harnessSetters, cacheWrite);
        if (uploadAfterRowWrite && patch.postContentOptimized?.trim()) {
          let planPayload: unknown = patch.blogLinksPlanJson;
          try {
            planPayload = JSON.parse(patch.blogLinksPlanJson);
          } catch {
            planPayload = patch.blogLinksPlanJson;
          }
          const elementFile = buildAiseoElementJsonFile("links-plan.json", planPayload);
          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiLinks",
            url,
            elementFiles: elementFile ? [elementFile] : [],
            postHtml: patch.postContentOptimized.trim(),
          });
          await uploadAfterRowWrite({
            index: row.index,
            url,
            html: patch.postContentOptimized.trim(),
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        ok += 1;
      } catch (err) {
        failed += 1;
        logBlogLinksActivity("row_error", {
          url: row.url,
          message: err instanceof Error ? err.message : "Links optimization failed",
        });
        markLinksRowError(
          url,
          row.index,
          harnessSetters,
          err instanceof Error ? err.message : "Links optimization failed",
        );
      }
    },
    );
  }

  logBlogLinksActivity("batch_done", { ok, failed });
  return { ok, failed, skipped: 0 };
}

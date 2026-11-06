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
import type { BlogHeadersCatalogRow } from "@/lib/overview/overview-blog-headers-catalog";
import type { BlogHeadersAgentOptions, BlogHeadersPlanResult } from "@/lib/overview/overview-blog-headers-agent";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import {
  applyBlogHeadersPlanLocally,
  verifyLocalHeadersApply,
} from "@/lib/overview/overview-blog-headers-apply-local";
import { stripContentH1Blocks } from "@/lib/overview/overview-content-cleanup";
import { runBlogHeadersPlanStream } from "@/lib/overview/overview-blog-headers-plan-stream";
import type { BlogHeadersRowPatch } from "@/lib/overview/overview-blog-headers-run";
import { isGenericHarnessHeadingTitle } from "@/lib/content-optimization/harness-heading-titles";
import {
  formatHeadersAnalyzeMarkdown,
  formatHeadersApplyMarkdown,
  formatHeadersPlanMarkdown,
  formatHeadersVerifyMarkdown,
  HEADERS_HARNESS_SECTION_TITLES,
  HEADERS_STEP_ANALYZE,
  HEADERS_STEP_APPLY,
  HEADERS_STEP_GSC,
  HEADERS_STEP_PLAN,
  HEADERS_STEP_VERIFY,
  makeHeadersHarnessDonePayload,
  makeHeadersHarnessStartPayload,
} from "@/lib/overview/overview-blog-headers-harness-sections";
import {
  fetchBlogHeadersGscPicks,
  formatBlogHeadersGscHarnessMarkdown,
} from "@/lib/overview/overview-blog-headers-gsc";
import {
  emitHeadersHarnessPayload,
  emitHeadersHarnessStreamMarkdown,
  finishHeadersRowHarness,
  markHeadersRowError,
  setHeadersHarnessMessage,
  type HeadersHarnessSetters,
} from "@/lib/overview/overview-blog-headers-harness-mutations";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export function initOverviewHeadersHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogHeadersCatalogRow[];
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
    prepMessage = "Preparing Headers batch…",
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
      step: "Headers",
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
      currentStep: "Headers",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiHeaders",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Headers",
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

export function finalizeOverviewHeadersHarnessBatch(
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
      message: "Headers batch finished",
    });
    return next;
  });
}

function emitAnalyzeHarness(
  row: BlogHeadersCatalogRow,
  setters: HeadersHarnessSetters,
): void {
  const url = row.url.trim();
  emitHeadersHarnessPayload(url, setters, makeHeadersHarnessStartPayload(row.index, HEADERS_STEP_ANALYZE));
  emitHeadersHarnessPayload(
    url,
    setters,
    makeHeadersHarnessDonePayload(
      row.index,
      HEADERS_STEP_ANALYZE,
      formatHeadersAnalyzeMarkdown(row.existingH2s, row.missingLeadingH2),
    ),
  );
}

async function fetchGscHarnessStep(
  row: BlogHeadersCatalogRow,
  siteUrl: string,
  setters: HeadersHarnessSetters,
  signal?: AbortSignal,
): Promise<void> {
  const url = row.url.trim();
  emitHeadersHarnessPayload(url, setters, makeHeadersHarnessStartPayload(row.index, HEADERS_STEP_GSC));
  const picks = await fetchBlogHeadersGscPicks(siteUrl, url, signal);
  row.gscPicks = picks;
  emitHeadersHarnessPayload(
    url,
    setters,
    makeHeadersHarnessDonePayload(row.index, HEADERS_STEP_GSC, formatBlogHeadersGscHarnessMarkdown(picks)),
  );
}

function applyAndVerifyLocally(
  row: BlogHeadersCatalogRow,
  plan: BlogHeadersPlanResult,
  setters: HeadersHarnessSetters,
): BlogHeadersRowPatch | null {
  const url = row.url.trim();
  const beforeH2s = row.existingH2s;

  emitHeadersHarnessPayload(url, setters, makeHeadersHarnessStartPayload(row.index, HEADERS_STEP_APPLY));
  const applied = applyBlogHeadersPlanLocally(row.html, plan, beforeH2s, row.missingLeadingH2);
  const afterH2s =
    applied.finalH2s.length > 0 ? applied.finalH2s : extractH2TextsFromHtml(applied.updatedHtml);
  emitHeadersHarnessPayload(
    url,
    setters,
    makeHeadersHarnessDonePayload(
      row.index,
      HEADERS_STEP_APPLY,
      formatHeadersApplyMarkdown(beforeH2s, afterH2s, plan, applied.replacements),
    ),
  );

  const anyReplaced = applied.replacements.some((r) => r.ok);
  emitHeadersHarnessPayload(url, setters, makeHeadersHarnessStartPayload(row.index, HEADERS_STEP_VERIFY));
  const verified = verifyLocalHeadersApply(row.html, applied.updatedHtml, {
    maxExtraH2: row.missingLeadingH2 && plan.leadingH2?.trim() ? 1 : 0,
  });
  const hadGenericBefore = beforeH2s.some(isGenericHarnessHeadingTitle);
  const stillGenericAfter = afterH2s.some(isGenericHarnessHeadingTitle);
  if (!anyReplaced || !verified.ok) {
    const reason = !anyReplaced
      ? "No H2 replacements applied"
      : verified.ok === false
        ? verified.reason
        : "";
    emitHeadersHarnessPayload(
      url,
      setters,
      makeHeadersHarnessDonePayload(
        row.index,
        HEADERS_STEP_VERIFY,
        formatHeadersVerifyMarkdown(beforeH2s, afterH2s, plan, false, reason),
      ),
    );
    return null;
  }
  if (hadGenericBefore && stillGenericAfter) {
    emitHeadersHarnessPayload(
      url,
      setters,
      makeHeadersHarnessDonePayload(
        row.index,
        HEADERS_STEP_VERIFY,
        formatHeadersVerifyMarkdown(
          beforeH2s,
          afterH2s,
          plan,
          false,
          "Placeholder H2 titles remain (Section/Intro)",
        ),
      ),
    );
    return null;
  }
  emitHeadersHarnessPayload(
    url,
    setters,
    makeHeadersHarnessDonePayload(
      row.index,
      HEADERS_STEP_VERIFY,
      formatHeadersVerifyMarkdown(beforeH2s, afterH2s, plan, true),
    ),
  );

  const withoutH1 = stripContentH1Blocks(applied.updatedHtml).html;

  return {
    blogH2List: afterH2s.length > 0 ? afterH2s : beforeH2s,
    blogH2PlanJson: JSON.stringify(plan),
    postContentOptimized: withoutH1,
    blogHeadersRanAtIso: new Date().toISOString(),
  };
}

async function runOneBlogHeadersRow(
  row: BlogHeadersCatalogRow,
  rowNum: number,
  total: number,
  agentOptions: BlogHeadersAgentOptions,
  setters: HeadersHarnessSetters,
): Promise<BlogHeadersRowPatch | null> {
  const url = row.url.trim();

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

  setHeadersHarnessMessage(
    setters,
    `Headers ${rowNum}/${total}: ${row.title || url}`,
    10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85),
  );

  const siteUrl = agentOptions.siteUrl?.trim();
  if (!siteUrl) {
    return null;
  }

  await fetchGscHarnessStep(row, siteUrl, setters, agentOptions.signal);

  emitAnalyzeHarness(row, setters);

  emitHeadersHarnessPayload(url, setters, makeHeadersHarnessStartPayload(row.index, HEADERS_STEP_PLAN));

  const plan = await runBlogHeadersPlanStream(row, agentOptions, (partial) => {
    emitHeadersHarnessStreamMarkdown(
      url,
      setters,
      HEADERS_STEP_PLAN,
      HEADERS_HARNESS_SECTION_TITLES[HEADERS_STEP_PLAN] ?? "Plan H2s",
      partial,
    );
  });

  emitHeadersHarnessPayload(
    url,
    setters,
    makeHeadersHarnessDonePayload(
      row.index,
      HEADERS_STEP_PLAN,
      formatHeadersPlanMarkdown(plan, row.existingH2s, row.gscPicks),
    ),
  );

  return applyAndVerifyLocally(row, plan, setters);
}

export type RunOverviewHeadersHarnessBatchParams = {
  catalog: BlogHeadersCatalogRow[];
  agentOptions: BlogHeadersAgentOptions;
  harnessSetters: HeadersHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  /**
   * When set, called before each pagination page is processed.
   * Return the catalog rows to run for that page (content already hydrated).
   * Return [] to skip the page.
   */
  preparePage?: (info: {
    page: number;
    pageCount: number;
    start: number;
    end: number;
    pageCatalog: BlogHeadersCatalogRow[];
  }) => Promise<BlogHeadersCatalogRow[]>;
};

/** Up to three rows in flight; plan streams per row; apply+verify local after plan. */
export async function runOverviewHeadersHarnessBatch(
  params: RunOverviewHeadersHarnessBatchParams,
): Promise<{ ok: number; failed: number }> {
  const { catalog, agentOptions, harnessSetters, cacheWrite, preparePage, uploadAfterRowWrite } = params;
  if (!catalog.length) return { ok: 0, failed: 0 };

  await ensureMasterInstructionsInMemory(agentOptions.siteId ?? null);

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const stubPageCatalog = catalog.slice(start, end);
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
      step: "Headers",
    });

    const pageCatalog = preparePage
      ? await preparePage({ page, pageCount, start, end, pageCatalog: stubPageCatalog })
      : stubPageCatalog;

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        const patch = await runOneBlogHeadersRow(
          row,
          globalRowNum,
          catalog.length,
          agentOptions,
          harnessSetters,
        );
        if (!patch) {
          failed += 1;
          markHeadersRowError(url, row.index, harnessSetters, "No H2 replacements applied");
          return;
        }
        finishHeadersRowHarness(url, row.index, patch, harnessSetters, cacheWrite);
        if (uploadAfterRowWrite && patch.postContentOptimized?.trim()) {
          let planPayload: unknown = patch.blogH2PlanJson;
          try {
            planPayload = JSON.parse(patch.blogH2PlanJson);
          } catch {
            planPayload = patch.blogH2PlanJson;
          }
          const elementFile = buildAiseoElementJsonFile("headers-plan.json", planPayload);
          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiHeaders",
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
        markHeadersRowError(
          url,
          row.index,
          harnessSetters,
          err instanceof Error ? err.message : "Headers optimization failed",
        );
      }
    },
    );
  }

  return { ok, failed };
}

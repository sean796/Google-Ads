import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_A_FOCUS_KEYWORD_BEFORE_RUNNING_AI_AL, NOTIFY_ADD_FOCUS_KEYWORDS_BEFORE_RUNNING_AI_ALL, NOTIFY_A_BULK_CONTENT_RUN_IS_ALREADY_IN_PROGRES, NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS, NOTIFY_BACKEND_API_URL_IS_NOT_CONFIGURED_FOR_PR, NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN, NOTIFY_NO_ROWS_HAVE_A_FOCUS_KEYWORD_RUN_KEYWORD, NOTIFY_NO_ROWS_HAVE_A_POST_ID_FROM_LOADED_INVEN, notifyFinishedResearchForXRowSDataforseo, notifyOptimizeAllSerpFinishedX, notifyResearchFailedForAllXRowSBriefJs, notifyResearchFinishedXXBriefJsonUpdated, notifyResearchRanOnXRowSButBriefJsonW, notifyStartingAiExtraTextForXUrlSUseT, notifyStartingBulkContentOptimizationForX } from "@/lib/notify-messages";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { isProductionBackendMisconfigured } from "@/lib/mcp-tools";
import { runOverviewResearchBatch, resolveResearchBatchEligibleRows, type OverviewResearchRowResult } from "@/lib/overview/overview-research-batch";
import { overviewDateModifierTodayIso } from "@/lib/overview/overview-bulk-seo-payload";
import { uploadOverviewResearchedRowToWordPress } from "@/lib/overview/overview-research-row-wp-upload";
import {
  attachAiseoUploadGeneratedFiles,
  type AiseoAfterRowWriteFn,
} from "@/lib/overview/overview-aiseo-after-upload";
import { buildAiseoPostContentHtmlFile } from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  clearBulkActionSlice,
  initBulkSliceWithStatus,
  patchActiveBulkSlice,
} from "@/lib/overview/overview-bulk-inline-status";
import { needsOverviewResearchRefresh } from "@/lib/overview/overview-ensure-focus-keyword";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { buildPrefilledTargetsFromOverviewRows } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import {
  overviewInventoryCollectionsFromSource,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { buildAiAllMetaCatalog } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import {
  initOverviewAiAllMetaHarnessBatchState,
  runOverviewAiAllMetaHarness,
} from "@/lib/overview/overview-ai-all-meta-harness-run";
import {
  failResearchRowHarness,
  finalizeOverviewResearchHarnessBatch,
  initOverviewResearchHarnessBatchState,
  makeResearchHarnessCallback,
  makeResearchArtifactCallback,
  finishResearchRowHarness,
  setResearchActiveRow,
  setResearchBatchPrepMessage,
  type ResearchHarnessSetters,
} from "@/lib/overview/overview-research-harness-run";
import { isOverviewBatchRunning } from "@/lib/overview/overview-batch-slot";
import { seedOverviewBulkBatchPrelude } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import {
  markContentPrepBatchHarnessSection,
  setContentPrepBatchMessage,
  type ContentPrepHarnessSetters,
} from "@/lib/overview/overview-content-prep-harness-run";
import { seedBulkInventorySessionFromSiteWarmCache } from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import {
  overviewBulkRowEntries,
  overviewBulkRowIndices,
  overviewBulkRowIndicesForDisplayOrder,
  overviewRowInBulkScope,
  overviewRowsInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import { loadApiKey } from "@/lib/api";
import { runOverviewAiseoFeaturedImageRow } from "@/lib/overview/overview-aiseo-featured-image-run";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
import { updateWordPressPost, uploadWordPressMedia } from "@/lib/wordpress-api";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import {
  rewriteBlogLeadSectionBlock,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchOverviewBlogPostHtml,
} from "@/lib/overview/overview-blog-passage-sections";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { clearOverviewStudioRevisions } from "@/lib/overview/studio-doc-revisions-store";
import { runAutoSeoMetaAndFaqFinale } from "@/lib/overview/overview-auto-seo-meta-faq-finale";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";

type WindowWithOptimizeRunId = Window & {
  __neoPulseOptimizeAllRunId?: number;
};

function nextOptimizeAllRunId(): number {
  if (typeof window === "undefined") return 1;
  const w = window as WindowWithOptimizeRunId;
  w.__neoPulseOptimizeAllRunId = (w.__neoPulseOptimizeAllRunId ?? 0) + 1;
  return w.__neoPulseOptimizeAllRunId;
}

function isOptimizeAllRunCurrent(runId: number): boolean {
  if (typeof window === "undefined") return true;
  return (window as WindowWithOptimizeRunId).__neoPulseOptimizeAllRunId === runId;
}

// Invalidate any orphaned pre-HMR loop immediately on module evaluation
if (typeof window !== "undefined") {
  nextOptimizeAllRunId();
}

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "rowsRef"
  | "displayRowsRef"
  | "setExpandedPageUrl"
  | "updateRow"
  | "setBulkActionProgress"
  | "setGscQuickWinsFile"
  | "opt"
  | "bulkSeoExtraOptions"
  | "bindings"
  | "getInventoryMatchForUrl"
  | "prefetchOverviewInventory"
  | "runAiAllMetaBatchForCatalog"
  | "bulkAiFaqSeedCount"
  | "sitemapSource"
  | "optimizeFaq"
  | "optimizeFaqQuestion"
  | "optimizeFaqAnswer"
  | "getDfsSerpContext"
> & {
  site: WordPressSite | undefined;
  gscQuickWinsFile: string | null;
  serpDumpUrl: (filename: string) => string;
  portfolioBlockedHostsForSemrush: string[];
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  ensureOverviewKeywordsForMissingRows: (options?: {
    progressKey?: "research" | "contentKw" | "entityKw";
    silent?: boolean;
    singleBatch?: boolean;
    preserveRowStatus?: boolean;
    skipProgressSlice?: boolean;
  }) => Promise<{ ensured: number; failed: number; keywordsByIndex: Map<number, string> }>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiFaqRowAll: (
    rowIndex: number,
    rowOverride?: OverviewRow,
    options?: {
      silentToast?: boolean;
      skipFaqLoading?: boolean;
      onMicroStep?: () => void;
      seedQuestionCount?: number;
      skipUploadAfterRowWrite?: boolean;
    },
  ) => Promise<void>;
  bulkScopeUrlKeys: Set<string>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

async function runResearchRefreshForRows(
  indices: number[],
  getRows: () => OverviewRow[],
  handleDataForSeoResearch: Args["handleDataForSeoResearch"],
): Promise<number> {
  let refreshed = 0;
  for (const index of indices) {
    const row = getRows()[index];
    if (!row) continue;
    // Never skip: always run research (handler writes missing keywords first).
    // eslint-disable-next-line no-await-in-loop
    const patch = await handleDataForSeoResearch(index, { silent: true });
    if (patch) refreshed += 1;
  }
  return refreshed;
}

export function useOverviewTabResearchPipelines({
  rows,
  rowsRef,
  displayRowsRef,
  setExpandedPageUrl,
  updateRow,
  setBulkActionProgress,
  setGscQuickWinsFile,
  site,
  gscQuickWinsFile,
  serpDumpUrl,
  portfolioBlockedHostsForSemrush,
  opt,
  bulkSeoExtraOptions,
  bindings,
  getInventoryMatchForUrl,
  prefetchOverviewInventory,
  runAiAllMetaBatchForCatalog,
  bulkAiFaqSeedCount,
  sitemapSource,
  optimizeFaq,
  optimizeFaqQuestion,
  optimizeFaqAnswer,
  getDfsSerpContext,
  handleDataForSeoResearch,
  ensureOverviewKeywordsForMissingRows,
  handleAiTitleRow,
  handleAiMetaRow,
  handleAiFaqRowAll,
  bulkScopeUrlKeys,
  bulkScopeUrlKeysRef,
  uploadAfterRowWrite,
}: Args) {
  const runResearchAll = useCallback(
    async () => {
      const scopeKeys = bulkScopeUrlKeysRef.current;
      if (scopeKeys.size === 0) return;
      if (!site) {
        notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
        return;
      }
      if (isProductionBackendMisconfigured()) {
        notify.error(
          "Backend API URL is not configured for production. On Render, set VITE_MCP_API_BASE on the static frontend service (e.g. https://your-api.onrender.com/api/mcp) and redeploy neo-pulseonefront-end.",
          { duration: 14000 },
        );
        return;
      }

      const batchKey = `${site.id}-batch`;
      if (isOverviewBatchRunning(opt.isOptimizingContent, batchKey)) {
        notify.error(NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS);
        return;
      }

      let harnessInitialized = false;
      let briefUpdated = 0;
      let serpOnly = 0;
      let failed = 0;
      let researchTotal = 0;

      try {
        const currentRows = rowsRef.current;
        const eligible = overviewBulkRowEntries(currentRows, scopeKeys).map(({ row, index }) => {
          const kw = row.focusKeyword?.trim() || "";
          return { row: { ...row, focusKeyword: kw }, index };
        });

        if (!eligible.length) {
          notify.error("No rows in the current scope to research.", { duration: 10000 });
          return;
        }

        researchTotal = eligible.length;

        const batchDeps = {
          site,
          gscQuickWinsFile: null,
          serpDumpUrl,
          portfolioBlockedHostsForSemrush,
          skipGsc: false,
          silent: true,
        };

        const indexToUrl = new Map<number, string>();
        const indexToKeyword = new Map<number, string>();
        for (const { index, row } of eligible) {
          const url = row.url?.trim();
          if (url) indexToUrl.set(index, url);
          const kw = row.focusKeyword?.trim();
          if (kw) indexToKeyword.set(index, kw);
        }

        const harnessSetters: ResearchHarnessSetters = {
          siteId: site.id,
          batchKey,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
        };
        const onHarnessSection = makeResearchHarnessCallback(
          indexToUrl,
          indexToKeyword,
          researchTotal,
          harnessSetters,
        );
        const onResearchArtifact = makeResearchArtifactCallback(indexToUrl, harnessSetters);

        const prepMessage = `Researching ${researchTotal} page(s)…`;

        flushSync(() => {
          initOverviewResearchHarnessBatchState({
            site,
            rows: eligible.map((e) => e.row),
            setBulkOptimizationState: opt.setBulkOptimizationState,
            setOptimizationProgress: opt.setOptimizationProgress,
            setIsOptimizingContent: opt.setIsOptimizingContent,
            setOptimizationFileManagers: opt.setOptimizationFileManagers,
            prepMessage,
          });
          for (const { index } of eligible) {
            updateRow(index, {
              status: "research-faq",
              seoResearch: "",
              briefFileName: null,
              researchFileName: null,
            });
          }
          const first = eligible[0];
          const firstUrl = first?.row.url?.trim();
          if (firstUrl) {
            setResearchActiveRow(
              batchKey,
              firstUrl,
              opt.setBulkOptimizationState,
              researchTotal,
            );
          }
        });
        harnessInitialized = true;

        setResearchBatchPrepMessage(
          batchKey,
          site.id,
          "Ensuring focus keywords…",
          harnessSetters,
        );
        const keywordPrep = await ensureOverviewKeywordsForMissingRows({
          silent: true,
          preserveRowStatus: true,
          skipProgressSlice: true,
          singleBatch: true,
        });

        const researchEligible = resolveResearchBatchEligibleRows(
          eligible,
          (index) => rowsRef.current[index],
          keywordPrep.keywordsByIndex,
        );

        indexToKeyword.clear();
        indexToUrl.clear();
        for (const { index, row } of researchEligible) {
          const url = row.url?.trim();
          if (url) indexToUrl.set(index, url);
          const kw = row.focusKeyword?.trim();
          if (kw) indexToKeyword.set(index, kw);
        }

        const batchCallbacks = {
          onBatchGscExportStart: (urlCount: number) => {
            setResearchBatchPrepMessage(
              batchKey,
              site.id,
              `GSC export for ${urlCount} page(s)…`,
              harnessSetters,
            );
          },
          onBatchGscExportDone: (filename: string | null) => {
            setResearchBatchPrepMessage(
              batchKey,
              site.id,
              filename
                ? `GSC export complete (${filename})`
                : "GSC export finished (no file saved)",
              harnessSetters,
            );
          },
          onPageStart: (index: number, row: OverviewRow) => {
            const url = row.url?.trim();
            if (!url) return;
            flushSync(() => {
              updateRow(index, { status: "research-faq" });
              setResearchActiveRow(
                batchKey,
                url,
                opt.setBulkOptimizationState,
                researchTotal,
              );
            });
          },
          onHarnessSection,
          onResearchArtifact,
          onPageComplete: async (r: OverviewResearchRowResult) => {
            const url = indexToUrl.get(r.index)?.trim();
            const brief = String(r.patch?.seoResearch ?? "").trim();
            const willUpload = Boolean(r.patch) && !r.failed && Boolean(brief);
            flushSync(() => {
              if (r.patch) {
                updateRow(r.index, { status: willUpload ? "uploading" : "idle", ...r.patch });
              } else {
                updateRow(r.index, { status: "error" });
              }
              if (url) {
                if (r.failed && !r.patch) {
                  if (r.harnessSummaries) {
                    finishResearchRowHarness(
                      url,
                      r.index,
                      r.harnessSummaries,
                      harnessSetters,
                      false,
                      undefined,
                      researchEligible.find((e) => e.index === r.index)?.row.focusKeyword,
                    );
                  } else {
                    failResearchRowHarness(
                      url,
                      r.errorMessage ?? "Research failed",
                      harnessSetters,
                      r.index,
                      researchTotal,
                    );
                  }
                } else {
                  finishResearchRowHarness(
                    url,
                    r.index,
                    r.harnessSummaries,
                    harnessSetters,
                    Boolean(r.patch) && !r.failed,
                    r.patch?.seoResearch,
                    researchEligible.find((e) => e.index === r.index)?.row.focusKeyword,
                  );
                }
              }
            });
            if (!willUpload) return;
            const live = rowsRef.current[r.index];
            const baseRow =
              live ?? researchEligible.find((e) => e.index === r.index)?.row;
            if (!baseRow) {
              updateRow(r.index, { status: "idle" });
              return;
            }
            const merged: OverviewRow = { ...baseRow, ...r.patch };
            try {
              const wp = await uploadOverviewResearchedRowToWordPress({
                site,
                row: merged,
                bindings,
                getInventoryMatchForUrl,
              });
              if (url && wp.generatedFiles.length) {
                attachAiseoUploadGeneratedFiles(
                  batchKey,
                  opt.setBulkOptimizationState,
                  url,
                  wp.generatedFiles,
                  wp.ok,
                );
              }
              if (wp.skipped) {
                updateRow(r.index, { status: "idle" });
                return;
              }
              if (wp.ok) {
                updateRow(r.index, {
                  status: "idle",
                  dateModifier: overviewDateModifierTodayIso(),
                  ...(wp.postId != null ? { postId: wp.postId } : {}),
                });
                return;
              }
              updateRow(r.index, { status: "error" });
            } catch {
              updateRow(r.index, { status: "error" });
            }
          },
        };

        const pageRanges = overviewBulkPageRanges(researchEligible.length);
        let completedOffset = 0;
        for (const { start, end, page, pageCount } of pageRanges) {
          const slice = researchEligible.slice(start, end);
          setOverviewBulkHarnessPageState({
            batchKey,
            siteId: site.id,
            page,
            pageCount,
            start,
            end,
            total: researchTotal,
            setBulkOptimizationState: opt.setBulkOptimizationState,
            setOptimizationProgress: opt.setOptimizationProgress,
            step: "Researching…",
          });

          const { stats: pageStats } = await runOverviewResearchBatch(
            slice,
            batchDeps,
            { batchIndex: page, batchCount: pageCount, total: researchTotal, completedOffset },
            batchCallbacks,
          );

          briefUpdated += pageStats.briefUpdated;
          serpOnly += pageStats.serpOnly;
          failed += pageStats.failed;
          completedOffset += slice.length;
        }

        finalizeOverviewResearchHarnessBatch(
          batchKey,
          site.id,
          briefUpdated,
          researchTotal,
          opt.setBulkOptimizationState,
          opt.setOptimizationProgress,
          opt.setIsOptimizingContent,
        );
        if (site.siteUrl && BACKEND_API_BASE && !gscQuickWinsFile) {
          try {
            const exportRes = await fetch(`${BACKEND_API_BASE}/api/gsc/export-overview-quick-wins`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                siteUrl: site.siteUrl,
                siteWideQueriesOnly: true,
              }),
            });
            const exportJson = await exportRes.json().catch(() => null);
            if (exportRes.ok && exportJson?.storedFile) {
              setGscQuickWinsFile(exportJson.storedFile);
            }
          } catch {
            /* optional */
          }
        }

        if (failed === researchTotal) {
          notify.error(notifyResearchFailedForAllXRowSBriefJs(researchTotal), { duration: 14000 });
        } else if (briefUpdated === 0) {
          notify.warning(notifyResearchRanOnXRowSButBriefJsonW(researchTotal, serpOnly, failed), {
            duration: 12000,
          });
        } else if (failed > 0 || serpOnly > 0) {
          notify.warning(
            notifyResearchFinishedXXBriefJsonUpdated(briefUpdated, researchTotal, serpOnly > 0),
            { duration: 10000 },
          );
        } else {
          notify.success(notifyFinishedResearchForXRowSDataforseo(briefUpdated));
        }
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Research batch failed.";
        notify.error(msg, { duration: 12000 });
        if (harnessInitialized && site) {
          finalizeOverviewResearchHarnessBatch(
            batchKey,
            site.id,
            briefUpdated,
            researchTotal || rowsRef.current.length,
            opt.setBulkOptimizationState,
            opt.setOptimizationProgress,
            opt.setIsOptimizingContent,
          );
        }
      }
    },
    [
      rows,
      rowsRef,
      site,
      gscQuickWinsFile,
      serpDumpUrl,
      portfolioBlockedHostsForSemrush,
      setGscQuickWinsFile,
      updateRow,
      bindings,
      getInventoryMatchForUrl,
      bulkScopeUrlKeysRef,
      ensureOverviewKeywordsForMissingRows,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
      setBulkActionProgress,
    ],
  );

  const handleResearchAll = runResearchAll;

  const handleOptimizeAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeysRef.current;
    if (scopeKeys.size === 0) {
      notify.error("No posts in the current grid to optimize. Clear filters or load the sitemap.");
      return;
    }
    const orderedDisplayIndices = overviewBulkRowIndicesForDisplayOrder(
      rowsRef.current,
      displayRowsRef.current,
      scopeKeys,
    );
    const scopedIndices =
      orderedDisplayIndices.length > 0
        ? orderedDisplayIndices
        : overviewBulkRowIndices(rowsRef.current, scopeKeys);
    if (scopedIndices.length === 0) {
      notify.error("No posts in the current grid to optimize.");
      return;
    }
    const urls = scopedIndices.map((index) => rowsRef.current[index]!.url);
    const batchKey = `${site.id}-batch`;

    // Claim the single global run slot (cancels any stale or pre-HMR loop immediately)
    const runId = nextOptimizeAllRunId();

    // Clear any stale row statuses left over from interrupted runs so only 1 row is ever sky-blue
    for (let i = 0; i < rowsRef.current.length; i += 1) {
      const r = rowsRef.current[i];
      if (r && r.status !== "idle") {
        updateRow(i, { status: "idle" });
      }
    }

    flushSync(() => {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls,
          currentIndex: 0,
          urlStatuses: Object.fromEntries(
            urls.map((u, uIdx) => [u, uIdx === 0 ? ("optimizing" as const) : ("pending" as const)]),
          ),
          currentStep: "SERP Research Brief",
          currentUrl: urls[0],
          runKind: "content",
        },
      }));
    });

    const setStepTelemetry = (
      url: string,
      pos: number,
      stepNumber: number,
      totalSteps: number,
      stepTitle: string,
    ) => {
      if (!isOptimizeAllRunCurrent(runId)) return;
      const pct = Math.min(100, Math.max(5, Math.round((stepNumber / Math.max(totalSteps, 1)) * 100)));
      opt.setBulkOptimizationState((prev) => {
        const cur = prev[batchKey];
        const baseUrls = cur?.urls?.length ? cur.urls : urls;
        const baseStatuses: BulkOptimizationState["urlStatuses"] = Object.fromEntries(
          baseUrls.map((u, uIdx) => {
            if (u === url || uIdx === pos) return [u, "optimizing" as const];
            if (uIdx < pos) return [u, cur?.urlStatuses?.[u] ?? ("completed" as const)];
            return [u, "pending" as const];
          }),
        );
        return {
          ...prev,
          [batchKey]: {
            ...(cur || {}),
            urls: baseUrls,
            runKind: "content",
            currentIndex: pos,
            currentUrl: url,
            currentStep: stepTitle,
            currentProgress: pct,
            urlStatuses: baseStatuses,
            currentStepProgress: {
              step: `${stepNumber}/${totalSteps}`,
              progress: pct,
              message: stepTitle,
              harnessPlannedSectionCount: totalSteps,
            },
          },
        };
      });
    };

    try {
      for (let pos = 0; pos < scopedIndices.length; pos += 1) {
        if (!isOptimizeAllRunCurrent(runId)) return;
        const idx = scopedIndices[pos]!;
        let latestRow = rowsRef.current[idx];
        if (!latestRow?.url) continue;
        const url = latestRow.url;
        clearOverviewStudioRevisions(url);
        const revisionRunId = String(runId);

        try {
          const isPages =
            sitemapSource === "pages" ||
            latestRow.contentFormat === "elementor" ||
            Boolean(latestRow.elementorDataJson?.trim());

          let resolvedHtml =
            latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
          if (!isPages) {
            try {
              const sourceRes = await resolveAiseoHarnessSourceHtml({
                row: latestRow,
                site,
                sitemapSource,
                getInventoryMatchForUrl,
              });
              if (!isOptimizeAllRunCurrent(runId)) return;
              if (sourceRes.html?.trim()) {
                resolvedHtml = sourceRes.html;
              }
            } catch (err) {
              console.warn("[Auto SEO] Source HTML resolve warning for", url, err);
            }
          }

          if (!isPages && resolvedHtml.trim() && !latestRow.postContent?.trim()) {
            updateRow(idx, { postContent: resolvedHtml, postContentOptimized: resolvedHtml });
            latestRow = rowsRef.current[idx] ?? latestRow;
          }

          const pageHeaders = isPages
            ? elementorSectionHeadersFromCachedRow(latestRow).filter((sec) => {
                const key = (sec.title ?? "").trim().toLowerCase();
                return key !== "faq" && key !== "frequently asked questions";
              })
            : [];

          let ansHtml = !isPages ? extractAnswerSectionHtml(resolvedHtml) : "";
          let ovHtml = !isPages ? extractOverviewSectionHtml(resolvedHtml) : "";
          const withoutLead = !isPages
            ? stripLeadingOverviewSection(stripLeadingAnswerSection(resolvedHtml))
            : "";
          const coreOnly = !isPages ? stripTrailingFaqSection(withoutLead) : "";
          const trailingFaq =
            !isPages && withoutLead.length > coreOnly.length
              ? withoutLead.slice(coreOnly.length).trim()
              : "";
          const parsedBlog = !isPages
            ? splitHtmlBodyIntoH2PassageSections(coreOnly)
            : { leadingHtml: "", sections: [] };

          let leadingHtml = parsedBlog.leadingHtml;
          const leadCount =
            (!isPages && ansHtml.trim() ? 1 : 0) +
            (!isPages && ovHtml.trim() ? 1 : 0) +
            (!isPages && leadingHtml.trim() ? 1 : 0);
          const sectionCount = isPages ? pageHeaders.length : parsedBlog.sections.length;
          const totalSteps = 1 + leadCount + sectionCount + 1;

          // Step 1: SERP Research Brief (never gate the run if DataForSEO has a payment/auth issue)
          setStepTelemetry(url, pos, 1, totalSteps, "SERP Research Brief");
          if (!latestRow.focusKeyword?.trim()) {
            const slugHint = normalizeFocusKeywordPhrase(pathSlugToFocusHint(url) || "");
            if (slugHint) {
              updateRow(idx, { focusKeyword: slugHint });
              latestRow = rowsRef.current[idx] ?? { ...latestRow, focusKeyword: slugHint };
            }
          }
          // Auto SEO content: use existing brief as read-only context; never refresh or overwrite it.
          const shouldRunDfsResearch =
            !isDfsPaymentLatched() && !latestRow.seoResearch?.trim();
          if (shouldRunDfsResearch) {
            try {
              await handleDataForSeoResearch(idx, { silent: true, skipGsc: true });
              if (!isOptimizeAllRunCurrent(runId)) return;
              latestRow = rowsRef.current[idx] ?? latestRow;
            } catch (err) {
              console.warn("[Auto SEO] Research step warning for", url, err);
            } finally {
              updateRow(idx, { status: "idle" });
            }
          }

          const passageRewriteCtx = {
            articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
            focusKeyword: latestRow.focusKeyword?.trim() || "",
            seoResearchBrief: latestRow.seoResearch,
            siteId: site.id,
            siteUrl: site.siteUrl,
            pageUrl: url,
            businessName: site.name,
          };

          // Step 3+: Answer, Overview, intro lead, then H2 passages (full blog)
          if (!isPages) {
            let stepNum = 2;
            const siblingTitles = parsedBlog.sections.map((s) => s.title);
            const commitBlogHtml = (sections: typeof parsedBlog.sections) => {
              const html = stitchOverviewBlogPostHtml({
                ansHtml,
                ovHtml,
                leadingHtml,
                sections,
                trailingFaq,
              });
              updateRow(idx, {
                postContentOptimized: html,
                postContent: html,
              });
            };
            if (ansHtml.trim()) {
              if (!isOptimizeAllRunCurrent(runId)) return;
              setStepTelemetry(url, pos, stepNum, totalSteps, "Answer");
              stepNum += 1;
              const ansBefore = ansHtml;
              try {
                ansHtml = await rewriteBlogLeadSectionBlock(ansHtml, {
                  ...passageRewriteCtx,
                  siblingTitles,
                });
                recordOverviewStudioRevision({
                  pageUrl: url,
                  stepLabel: "Answer",
                  runId: revisionRunId,
                  beforeHtml: ansBefore,
                  afterHtml: ansHtml,
                });
                commitBlogHtml(parsedBlog.sections);
              } catch (err) {
                console.warn("[Auto SEO] Answer section warning for", url, err);
              }
            }
            if (ovHtml.trim()) {
              if (!isOptimizeAllRunCurrent(runId)) return;
              setStepTelemetry(url, pos, stepNum, totalSteps, "Overview");
              stepNum += 1;
              const ovBefore = ovHtml;
              try {
                ovHtml = await rewriteBlogLeadSectionBlock(ovHtml, {
                  ...passageRewriteCtx,
                  siblingTitles,
                });
                recordOverviewStudioRevision({
                  pageUrl: url,
                  stepLabel: "Overview",
                  runId: revisionRunId,
                  beforeHtml: ovBefore,
                  afterHtml: ovHtml,
                });
                commitBlogHtml(parsedBlog.sections);
              } catch (err) {
                console.warn("[Auto SEO] Overview section warning for", url, err);
              }
            }
            if (leadingHtml.trim()) {
              if (!isOptimizeAllRunCurrent(runId)) return;
              setStepTelemetry(url, pos, stepNum, totalSteps, "Introduction");
              stepNum += 1;
              const introBefore = leadingHtml;
              try {
                leadingHtml = await rewriteBlogLeadSectionBlock(leadingHtml, {
                  ...passageRewriteCtx,
                  siblingTitles,
                });
                recordOverviewStudioRevision({
                  pageUrl: url,
                  stepLabel: "Introduction",
                  runId: revisionRunId,
                  beforeHtml: introBefore,
                  afterHtml: leadingHtml,
                });
                commitBlogHtml(parsedBlog.sections);
              } catch (err) {
                console.warn("[Auto SEO] Intro lead warning for", url, err);
              }
            }
          }

          // Content sections (1 by 1 in document order)
          if (isPages) {
            const siblingTitles = pageHeaders.map((s) => s.title);
            const workingHeaders = [...pageHeaders];
            for (let sIdx = 0; sIdx < workingHeaders.length; sIdx += 1) {
              if (!isOptimizeAllRunCurrent(runId)) return;
              const sec = workingHeaders[sIdx]!;
              const secBody = (sec.bodyHtml || sec.bodyText || "").trim();
              const stepNum = 2 + sIdx;
              setStepTelemetry(
                url,
                pos,
                stepNum,
                totalSteps,
                sec.title?.trim() || `Section ${sIdx + 1}`,
              );
              if (!secBody) continue;

              const elBodyBefore = secBody;
              try {
                const rewritten = await rewriteBlogPassageSection({
                  mode: "copy",
                  section: {
                    id: sec.id || `sec-${sIdx}`,
                    index: sIdx,
                    h2OpenTag: "<h2>",
                    title: sec.title,
                    bodyHtml: secBody,
                  },
                  siblingTitles: siblingTitles.filter((_, i) => i !== sIdx),
                  articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                  focusKeyword: latestRow.focusKeyword?.trim() || "",
                  seoResearchBrief: latestRow.seoResearch,
                  siteId: site.id,
                  siteUrl: site.siteUrl,
                  pageUrl: url,
                  businessName: site.name,
                });
                if (!isOptimizeAllRunCurrent(runId)) return;
                const normalizedHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
                recordOverviewStudioRevision({
                  pageUrl: url,
                  stepLabel: sec.title?.trim() || `Section ${sIdx + 1}`,
                  sectionTitle: sec.title?.trim() || undefined,
                  runId: revisionRunId,
                  beforeHtml: elBodyBefore,
                  afterHtml: normalizedHtml,
                });
                workingHeaders[sIdx] = {
                  ...sec,
                  bodyHtml: normalizedHtml,
                  bodyText: prosePlainText(normalizedHtml),
                };
                updateRow(idx, { elementorSectionHeaders: [...workingHeaders] });
              } catch (err) {
                console.warn(
                  `[Auto SEO] Page section ${sIdx + 1} warning for ${url}:`,
                  err,
                );
              }
            }
          } else {
            const workingSections = [...parsedBlog.sections];
            for (let sIdx = 0; sIdx < workingSections.length; sIdx += 1) {
              if (!isOptimizeAllRunCurrent(runId)) return;
              const sec = workingSections[sIdx]!;
              const stepNum = 1 + leadCount + sIdx + 1;
              setStepTelemetry(
                url,
                pos,
                stepNum,
                totalSteps,
                sec.title?.trim() || `Section ${sIdx + 1}`,
              );
              if (!sec.bodyHtml.trim()) continue;

              const passageBefore = sec.bodyHtml;
              try {
                const rewritten = await rewriteBlogPassageSection({
                  mode: "copy",
                  section: sec,
                  siblingTitles: workingSections
                    .filter((_, i) => i !== sIdx)
                    .map((s) => s.title),
                  articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                  focusKeyword: latestRow.focusKeyword?.trim() || "",
                  seoResearchBrief: latestRow.seoResearch,
                  siteId: site.id,
                  siteUrl: site.siteUrl,
                  pageUrl: url,
                  businessName: site.name,
                });
                if (!isOptimizeAllRunCurrent(runId)) return;
                const nextBody = normalizeSectionProseHtml(rewritten.bodyHtml);
                recordOverviewStudioRevision({
                  pageUrl: url,
                  stepLabel: sec.title?.trim() || `Section ${sIdx + 1}`,
                  sectionTitle: sec.title?.trim() || undefined,
                  runId: revisionRunId,
                  beforeHtml: passageBefore,
                  afterHtml: nextBody,
                });
                workingSections[sIdx] = {
                  ...sec,
                  bodyHtml: nextBody,
                };
                const nextFull = stitchOverviewBlogPostHtml({
                  ansHtml,
                  ovHtml,
                  leadingHtml,
                  sections: workingSections,
                  trailingFaq,
                });
                updateRow(idx, {
                  postContentOptimized: nextFull,
                  postContent: nextFull,
                });
              } catch (err) {
                console.warn(
                  `[Auto SEO] Blog passage ${sIdx + 1} (${sec.title}) warning for ${url}:`,
                  err,
                );
              }
            }
          }

          // Final step: SEO title + meta (sequential) parallel with FAQs
          if (!isOptimizeAllRunCurrent(runId)) return;
          setStepTelemetry(url, pos, totalSteps, totalSteps, "SEO Meta & FAQs");
          try {
            await runAutoSeoMetaAndFaqFinale({
              rowIndex: idx,
              pageUrl: url,
              revisionRunId,
              getRow: () => rowsRef.current[idx],
              handleAiTitleRow,
              handleAiMetaRow,
              handleAiFaqRowAll,
            });
          } finally {
            updateRow(idx, { status: "idle" });
          }
          latestRow = rowsRef.current[idx] ?? latestRow;

          if (!isOptimizeAllRunCurrent(runId)) return;

          // Fire WordPress upload in background so the next selected article starts immediately
          if (uploadAfterRowWrite) {
            latestRow = rowsRef.current[idx] ?? latestRow;
            const finalHtml =
              latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
            if (finalHtml) {
              void uploadAfterRowWrite({
                index: idx,
                url,
                html: finalHtml,
              }).catch((err) => {
                console.warn("[Auto SEO] Background WP upload warning for", url, err);
              });
            }
          }
        } catch (postErr) {
          console.warn("[Auto SEO] Article chain error for", url, postErr);
        } finally {
          updateRow(idx, { status: "idle" });
        }

        if (!isOptimizeAllRunCurrent(runId)) return;
        opt.setBulkOptimizationState((prev) => {
          const cur = prev[batchKey];
          const baseUrls = cur?.urls?.length ? cur.urls : urls;
          return {
            ...prev,
            [batchKey]: {
              ...(cur || { urls: baseUrls, currentIndex: pos, currentStep: "Complete" }),
              urls: baseUrls,
              runKind: "content",
              urlStatuses: { ...(cur?.urlStatuses || {}), [url]: "completed" },
            },
          };
        });
      }
    } finally {
      if (isOptimizeAllRunCurrent(runId)) {
        setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
      }
    }
  }, [
    bulkScopeUrlKeysRef,
    rowsRef,
    displayRowsRef,
    setExpandedPageUrl,
    site,
    opt,
    setBulkActionProgress,
    sitemapSource,
    ensureOverviewKeywordsForMissingRows,
    handleDataForSeoResearch,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiFaqRowAll,
    updateRow,
    uploadAfterRowWrite,
    bindings,
    getInventoryMatchForUrl,
  ]);

  const handleAiFeaturedImageAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeys;
    const scoped = overviewBulkRowEntries(rowsRef.current, scopeKeys);
    if (scoped.length === 0) {
      notify.error("No posts in the current selection. Check rows or clear filters.");
      return;
    }
    const apiKey = loadApiKey().trim();
    if (!apiKey) {
      notify.error("OpenRouter API key is missing. Set it in Settings.");
      return;
    }

    const batchKey = `${site.id}-batch`;
    const urls = scoped.map((entry) => entry.row.url.trim()).filter(Boolean);

    flushSync(() => {
      opt.resetBulkBatch(batchKey);
      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls,
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "Featured image",
          currentUrl: urls[0],
          runKind: "aiFeaturedImage",
          harnessStartedAt: Date.now(),
          urlGeneratedFiles: {},
        },
      }));
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.optimizeAll;
        next.aiFeaturedImage = initBulkSliceWithStatus("aiFeaturedImage", scoped.length, 0);
        return next;
      });
    });

    notify.info(`Featured image: ${scoped.length} post(s). Watch the progress bar below.`, {
      duration: 6000,
    });

    logFeaturedImagePipeline("Batch started", {
      site: site.name,
      rowCount: scoped.length,
      urls,
    });

    patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
      statusMessage: "Loading post HTML…",
    });
    if (site.username?.trim() && site.appPassword?.trim()) {
      logFeaturedImagePipeline("Prefetching WordPress inventory (content)", {
        urlCount: urls.length,
      });
      await prefetchOverviewInventory(site, {
        collections: overviewInventoryCollectionsFromSource(sitemapSource, site),
        includeContent: true,
        sitemapUrls: urls,
        forceRefresh: true,
      });
    }

    const attachRowFiles = (
      url: string,
      files: Array<{ name: string; content: string; mimeType: string }>,
    ) => {
      opt.setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        const storageKey = storageKeyForUrlGeneratedFiles(
          current.urlGeneratedFiles,
          url,
          current.urls,
        );
        const existing = generatedFilesForUrl(current.urlGeneratedFiles, url);
        return {
          ...prev,
          [batchKey]: {
            ...current,
            currentUrl: url,
            urlGeneratedFiles: {
              ...(current.urlGeneratedFiles || {}),
              [storageKey]: mergeGeneratedFilesByName(existing, files),
            },
          },
        };
      });
    };

    let completedRows = 0;
    try {
      for (let i = 0; i < scoped.length; i++) {
        const row = scoped[i]!.row;
        let rowTitle = "";
        try {
        opt.setBulkOptimizationState((prev) => {
          const current = prev[batchKey];
          if (!current) return prev;
          return {
            ...prev,
            [batchKey]: {
              ...current,
              currentIndex: i,
              currentUrl: row.url,
              currentStep: "Featured image",
            },
          };
        });
        const inv = getInventoryMatchForUrl(site, row.url);
        let postId = row.postId ?? inv?.row.id ?? null;
        const title = (row.title || inv?.row.fields?.title || "").trim();
        rowTitle = title;
        if (!title) {
          throw new Error(`Missing title for featured image: ${row.url}`);
        }

        logFeaturedImagePipeline("Row started", {
          index: i + 1,
          total: scoped.length,
          url: row.url,
          title,
        });

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "Loading post HTML…",
        });
        const { html: content } = await resolveAiseoHarnessSourceHtml({
          row,
          site,
          sitemapSource,
          getInventoryMatchForUrl,
        });
        if (!content.trim()) {
          throw new Error(`Missing post HTML for featured image: ${row.url}`);
        }
        if (postId == null || postId <= 0) {
          postId = inv?.row.id ?? null;
        }
        if (postId == null || postId <= 0) {
          throw new Error(`Missing post id for featured image: ${row.url}`);
        }

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "Image requirements",
        });
        const keyword = (row.focusKeyword || row.keyword || inv?.row.fields?.focus_keyword || "").trim();
        const featured = await runOverviewAiseoFeaturedImageRow({
          apiKey,
          siteId: site.id,
          title,
          contentHtml: content,
          keyword: keyword || undefined,
          onArtifacts: (files) => {
            attachRowFiles(row.url, files);
            logFeaturedImagePipeline("Pipeline artifact attached", {
              url: row.url,
              files: files.map((f) => f.name),
            });
            const names = new Set(files.map((f) => f.name));
            if (names.has("image-requirements.json")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "Google Image",
              });
            }
            if (names.has("google-image.png")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "OpenRouter Image",
              });
            }
            if (names.has("openrouter-image.png")) {
              patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
                currentRow: i,
                statusMessage: "WordPress upload",
              });
            }
          },
        });

        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          currentRow: i,
          statusMessage: "WordPress upload",
        });
        logFeaturedImagePipeline("WordPress upload: starting", {
          url: row.url,
          fileName: featured.uploadFileName,
        });
        const uploaded = await uploadWordPressMedia(
          site.siteUrl,
          site.username,
          site.appPassword,
          featured.uploadBase64,
          featured.uploadFileName,
          featured.mediaTitle,
        );
        const imageUrl = uploaded.url || uploaded.link;
        if (!uploaded.success || !uploaded.mediaId || !imageUrl) {
          throw new Error(uploaded.error || `Featured image upload failed: ${row.url}`);
        }
        const subtype = inv?.subtype;
        const postTypeEndpoint =
          subtype === "post" ? "posts" : subtype === "page" ? "pages" : subtype || undefined;
        const updated = await updateWordPressPost(
          site.siteUrl,
          site.username,
          site.appPassword,
          postId,
          title,
          content,
          undefined,
          (row.wpStatus as "draft" | "publish" | undefined) || undefined,
          row.postType || "post",
          uploaded.mediaId,
          undefined,
          undefined,
          inv?.row.slug,
          postTypeEndpoint,
        );
        if (!updated.success) {
          throw new Error(updated.error || `Featured image apply failed: ${row.url}`);
        }
        const postContentFile = buildAiseoPostContentHtmlFile(row.url, content);
        attachRowFiles(row.url, [
          ...(postContentFile ? [postContentFile] : []),
          {
            name: "wordpress.json",
            content: JSON.stringify(
              {
                url: imageUrl,
                mediaId: uploaded.mediaId,
                link: uploaded.link ?? imageUrl,
                postId,
              },
              null,
              2,
            ),
            mimeType: "application/json",
          },
        ]);
        logFeaturedImagePipeline("WordPress upload: complete", {
          url: row.url,
          mediaId: uploaded.mediaId,
          imageUrl,
        });
        completedRows = i + 1;
        patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
          completed: completedRows,
          currentRow: i,
          statusMessage: "Featured image",
        });
        } catch (rowError) {
          const rowMessage =
            rowError instanceof Error ? rowError.message : String(rowError);
          logFeaturedImagePipeline("Row failed (continuing batch)", {
            url: row.url,
            title: rowTitle || row.url,
            error: rowMessage,
          });
          notify.error(`Featured image skipped (${rowTitle || row.url}): ${rowMessage}`, {
            duration: 10000,
          });
        }
      }
      patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
        completed: completedRows,
        total: scoped.length,
        statusMessage: "Featured image",
      });
      logFeaturedImagePipeline("Batch finished", {
        completedRows,
        totalRows: scoped.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFeaturedImagePipeline("Batch failed", { error: message });
      notify.error(message, { duration: 12000 });
      patchActiveBulkSlice(setBulkActionProgress, "aiFeaturedImage", {
        completed: completedRows,
        statusMessage: message,
      });
      throw error;
    } finally {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
    }
  }, [
    bulkScopeUrlKeys,
    rowsRef,
    site,
    opt,
    setBulkActionProgress,
    getInventoryMatchForUrl,
    prefetchOverviewInventory,
    sitemapSource,
  ]);

  const handleBulkSeoExtraText = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    if (!scopedRows.length) return;
    const urls = scopedRows.map((r) => r.url);
    let { prefilledOverviewTargets, prefilledUrlKeywords } =
      buildPrefilledTargetsFromOverviewRows(
        scopedRows,
        bindings,
        getInventoryMatchForUrl,
        site,
        sitemapSource,
      );

    const targetCount = Object.keys(prefilledOverviewTargets).length;
    const missingRatio = scopedRows.length > 0 ? (scopedRows.length - targetCount) / scopedRows.length : 0;
    if (
      targetCount < scopedRows.length &&
      missingRatio > 0.1 &&
      site?.username &&
      site.appPassword
    ) {
      const collections = overviewInventoryCollectionsFromSource(sitemapSource, site);
      await prefetchOverviewInventory(site, {
        collections,
        includeContent: false,
        sitemapUrls: urls,
      });
      ({ prefilledOverviewTargets, prefilledUrlKeywords } = buildPrefilledTargetsFromOverviewRows(
        scopedRows,
        bindings,
        getInventoryMatchForUrl,
        site,
        sitemapSource,
      ));
    }

    const finalTargetCount = Object.keys(prefilledOverviewTargets).length;

    if (finalTargetCount === 0) {
      notify.error(NOTIFY_NO_ROWS_HAVE_A_POST_ID_FROM_LOADED_INVEN, {
        duration: 12000,
      });
      return;
    }

    const batchKey = `${site.id}-batch`;
    if (isOverviewBatchRunning(opt.isOptimizingContent, batchKey)) {
      notify.error(NOTIFY_A_BULK_CONTENT_RUN_IS_ALREADY_IN_PROGRES);
      return;
    }
    notify.info(
      `Starting AI Extra Text for ${urls.length} URL(s). Use the progress strip or bulk review panel.`,
      { duration: 6000 },
    );
    await opt.handleOptimizeMultipleContentClick(
      site,
      urls,
      opt.optimizeUpdateMode[site.id] || "update",
      { ...bulkSeoExtraOptions, prefilledUrlKeywords, prefilledOverviewTargets },
    );
  }, [
    rows,
    bulkScopeUrlKeys,
    site,
    opt,
    bulkSeoExtraOptions,
    bindings,
    getInventoryMatchForUrl,
    prefetchOverviewInventory,
    sitemapSource,
  ]);

  const handleOptimizeAllSerpRow = useCallback(
    async (index: number) => {
      const base = rows[index];
      if (!base) return;

      let snapshot: OverviewRow = { ...base };
      let ranResearch = false;
      if (
        !snapshot.focusKeyword?.trim() ||
        !snapshot.seoResearch?.trim() ||
        needsOverviewResearchRefresh(snapshot, snapshot.focusKeyword ?? "")
      ) {
        ranResearch = true;
        const researchPatch = await handleDataForSeoResearch(index, { silent: true });
        if (researchPatch === null) return;
        snapshot = { ...snapshot, ...researchPatch };
      }

      if (!overviewTitleOptimizationExcluded(snapshot)) {
        const titlePatch = await handleAiTitleRow(index, snapshot);
        if (!titlePatch) return;
        snapshot = { ...snapshot, ...titlePatch };
      }

      const metaPatch = await handleAiMetaRow(index, snapshot);
      if (!metaPatch) return;
      snapshot = { ...snapshot, ...metaPatch };

      await handleAiFaqRowAll(index, snapshot, { silentToast: true, skipFaqLoading: true });

      const parts: string[] = [];
      if (ranResearch) parts.push("research");
      if (!overviewTitleOptimizationExcluded(snapshot)) parts.push("title");
      parts.push("meta");
      parts.push("FAQ");
      notify.success(notifyOptimizeAllSerpFinishedX(parts.join(", ")));
    },
    [rows, handleDataForSeoResearch, handleAiTitleRow, handleAiMetaRow, handleAiFaqRowAll],
  );

  const handleAiAllMetaRow = useCallback(
    async (index: number) => {
      if (!site) {
        notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
        return;
      }
      const batchKey = `${site.id}-batch`;
      if (isOverviewBatchRunning(opt.isOptimizingContent, batchKey)) {
        notify.error(NOTIFY_A_BULK_CONTENT_RUN_IS_ALREADY_IN_PROGRES);
        return;
      }

      const base = rows[index];
      if (!base) return;

      flushSync(() => {
        initOverviewAiAllMetaHarnessBatchState({
          site,
          rows: [base],
          prepMessage: "Preparing meta batch…",
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
        });
      });

      try {
        const { catalog, skippedNoKeyword } = buildAiAllMetaCatalog(
          rows,
          sitemapSource as OverviewSitemapSource | undefined,
          bulkAiFaqSeedCount,
        );
        const entry = catalog.find((c) => c.index === index);
        if (!entry || skippedNoKeyword.includes(index)) {
          notify.error(NOTIFY_ADD_A_FOCUS_KEYWORD_BEFORE_RUNNING_AI_AL);
          updateRow(index, { status: "error" });
          opt.resetBulkBatch(batchKey);
          return;
        }

        await runOverviewAiAllMetaHarness({
          site,
          sitemapSource,
          getInventoryMatchForUrl,
          rows: [base],
          catalog: [entry],
          skippedNoBrief: [],
          runAiAllMetaBatchForCatalog,
          updateRow,
          uploadAfterRowWrite,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
          skipInit: true,
          bulkAiFaqSeedCount,
          faqDeps: {
            optimizeFaq,
            optimizeFaqQuestion,
            optimizeFaqAnswer,
            getDfsSerpContext,
          },
        });
      } catch {
        opt.resetBulkBatch(batchKey);
      }
    },
    [
      rows,
      site,
      opt,
      sitemapSource,
      getInventoryMatchForUrl,
      bulkAiFaqSeedCount,
      runAiAllMetaBatchForCatalog,
      updateRow,
      optimizeFaq,
      optimizeFaqQuestion,
      optimizeFaqAnswer,
      getDfsSerpContext,
    ],
  );

  const handleAiAllMetaAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeysRef.current;
    if (scopeKeys.size === 0) return;

    const batchKey = `${site.id}-batch`;
    if (isOverviewBatchRunning(opt.isOptimizingContent, batchKey)) {
      notify.error(NOTIFY_A_BULK_CONTENT_RUN_IS_ALREADY_IN_PROGRES);
      return;
    }

    const latestRows = rowsRef.current;
    const scopedRows = overviewRowsInBulkScope(latestRows, scopeKeys);

    flushSync(() => {
      initOverviewAiAllMetaHarnessBatchState({
        site,
        rows: scopedRows,
        prepMessage: "Preparing meta batch…",
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
      });
    });

    try {
      const { catalog, skippedNoKeyword } = buildAiAllMetaCatalog(
        latestRows,
        sitemapSource as OverviewSitemapSource | undefined,
        bulkAiFaqSeedCount,
      );
      const scopedCatalog = catalog.filter((entry) =>
        overviewRowInBulkScope(latestRows[entry.index]?.url ?? "", scopeKeys),
      );

      if (scopedCatalog.length === 0) {
        notify.error(NOTIFY_ADD_FOCUS_KEYWORDS_BEFORE_RUNNING_AI_ALL);
        opt.resetBulkBatch(batchKey);
        return;
      }

      await runOverviewAiAllMetaHarness({
        site,
        sitemapSource,
        getInventoryMatchForUrl,
        rows: latestRows,
        catalog: scopedCatalog,
        skippedNoBrief: [],
        skippedNoKeyword,
        runAiAllMetaBatchForCatalog,
        updateRow,
        uploadAfterRowWrite,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        skipInit: true,
        bulkAiFaqSeedCount,
        faqDeps: {
          optimizeFaq,
          optimizeFaqQuestion,
          optimizeFaqAnswer,
          getDfsSerpContext,
        },
      });
    } catch {
      opt.resetBulkBatch(batchKey);
    }
  }, [
    bulkScopeUrlKeysRef,
    rowsRef,
    site,
    opt,
    sitemapSource,
    bulkAiFaqSeedCount,
    runAiAllMetaBatchForCatalog,
    updateRow,
    getInventoryMatchForUrl,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    getDfsSerpContext,
  ]);

  return {
    handleResearchAll,
    handleOptimizeAll,
    handleAiFeaturedImageAll,
    handleBulkSeoExtraText,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiAllMetaAll,
  };
}

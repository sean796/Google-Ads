import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_A_FOCUS_KEYWORD_BEFORE_RUNNING_AI_AL, NOTIFY_ADD_FOCUS_KEYWORDS_BEFORE_RUNNING_AI_ALL, NOTIFY_A_BULK_CONTENT_RUN_IS_ALREADY_IN_PROGRES, NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN, NOTIFY_NO_ROWS_HAVE_A_POST_ID_FROM_LOADED_INVEN, notifyOptimizeAllSerpFinishedX } from "@/lib/notify-messages";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { buildPrefilledTargetsFromOverviewRows } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import { overviewInventoryCollectionsFromSource, type OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { needsOverviewResearchRefresh } from "@/lib/overview/overview-ensure-focus-keyword";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { buildAiAllMetaCatalog } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import { initOverviewAiAllMetaHarnessBatchState, runOverviewAiAllMetaHarness } from "@/lib/overview/overview-ai-all-meta-harness-run";
import { isOverviewBatchRunning } from "@/lib/overview/overview-batch-slot";
import { overviewRowInBulkScope, overviewRowsInBulkScope } from "@/lib/overview/overview-bulk-row-scope";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "rowsRef"
  | "updateRow"
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
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
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

export function useOverviewTabAllMetaAndExtraPipelines({
  rows,
  bulkScopeUrlKeys,
  bulkScopeUrlKeysRef,
  rowsRef,
  site,
  opt,
  bulkSeoExtraOptions,
  bindings,
  getInventoryMatchForUrl,
  prefetchOverviewInventory,
  sitemapSource,
  handleDataForSeoResearch,
  handleAiTitleRow,
  handleAiMetaRow,
  handleAiFaqRowAll,
  bulkAiFaqSeedCount,
  runAiAllMetaBatchForCatalog,
  updateRow,
  uploadAfterRowWrite,
  optimizeFaq,
  optimizeFaqQuestion,
  optimizeFaqAnswer,
  getDfsSerpContext,
}: Args) {
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
      uploadAfterRowWrite,
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
    uploadAfterRowWrite,
    getInventoryMatchForUrl,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    getDfsSerpContext,
  ]);
  return {
    handleBulkSeoExtraText,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiAllMetaAll,
  };
}

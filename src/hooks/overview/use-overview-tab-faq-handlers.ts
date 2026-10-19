import { useCallback, type MutableRefObject } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_AI_OPTIMIZED_FAQS_FOR_THIS_ROW, NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN, NOTIFY_FAQ_OPTIMIZATION_FAILED_FOR_THIS_ROW } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { createAiseoCacheWriteAccumulator, finalizeAiseoCacheWriteForUpload } from "@/lib/overview/overview-aiseo-cache-write";
import {
  finalizeOverviewFaqHarnessBatch,
  initOverviewFaqHarnessBatchState,
  runFaqPairsForRow,
  runOverviewFaqHarnessBatch,
  type FaqHarnessOptimizeDeps,
} from "@/lib/overview/overview-faq-harness-run";
import type { FaqHarnessSetters } from "@/lib/overview/overview-faq-harness-mutations";
import {
  overviewBulkRowIndicesForDisplayOrder,
} from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

type Args = Pick<
  OverviewTabBase,
  | "optimizeFaq"
  | "optimizeFaqQuestion"
  | "optimizeFaqAnswer"
  | "updateRow"
  | "getDfsSerpContext"
  | "bulkAiFaqSeedCount"
  | "opt"
  | "rowsRef"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  displayRowsRef: MutableRefObject<OverviewRow[]>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export function useOverviewTabFaqHandlers({
  site,
  sitemapSource,
  displayRowsRef,
  optimizeFaq,
  optimizeFaqQuestion,
  optimizeFaqAnswer,
  updateRow,
  getDfsSerpContext,
  bulkAiFaqSeedCount,
  opt,
  bulkScopeUrlKeysRef,
  getInventoryMatchForUrl,
  rowsRef,
  uploadAfterRowWrite,
}: Args) {
  const faqDeps: FaqHarnessOptimizeDeps = {
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    getDfsSerpContext,
  };

  const makeHarnessSetters = useCallback(
    (batchKey: string): FaqHarnessSetters | null => {
      if (!site) return null;
      return {
        siteId: site.id,
        batchKey,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
      };
    },
    [site, opt.setBulkOptimizationState, opt.setOptimizationProgress],
  );

  const handleAiFaqQuestion = useCallback(
    async (rowIndex: number, faqIndex: number) => {
      const row = rowsRef.current[rowIndex];
      if (!row) return;
      const currentEntries = parseFaqEntries(row.faq);
      const entry = currentEntries[faqIndex];
      if (!entry) return;
      updateRow(rowIndex, { status: "ai-faq" });
      const brief = row.seoResearch?.trim();
      const dfsContext = brief ? undefined : await getDfsSerpContext(row);
      const improved = await optimizeFaqQuestion(
        row.url,
        row.focusKeyword,
        entry.question,
        row.faq,
        dfsContext,
        row.title,
        row.metaDescription,
        brief || undefined,
      );
      if (!improved) {
        updateRow(rowIndex, { status: "error" });
        return;
      }
      const next = [...currentEntries];
      next[faqIndex] = { ...entry, question: improved };
      updateRow(rowIndex, { faq: serializeFaqEntriesPlain(next), status: "idle" });
    },
    [optimizeFaqQuestion, updateRow, getDfsSerpContext, rowsRef],
  );

  const handleAiFaqAnswer = useCallback(
    async (rowIndex: number, faqIndex: number) => {
      const row = rowsRef.current[rowIndex];
      if (!row) return;
      const currentEntries = parseFaqEntries(row.faq);
      const entry = currentEntries[faqIndex];
      if (!entry) return;
      updateRow(rowIndex, { status: "ai-faq" });
      const brief = row.seoResearch?.trim();
      const dfsContext = brief ? undefined : await getDfsSerpContext(row);
      const improved = await optimizeFaqAnswer(
        row.url,
        row.focusKeyword,
        entry.question,
        entry.answer,
        row.faq,
        dfsContext,
        row.title,
        row.metaDescription,
        brief || undefined,
      );
      if (!improved) {
        updateRow(rowIndex, { status: "error" });
        return;
      }
      const next = [...currentEntries];
      next[faqIndex] = { ...entry, answer: improved };
      updateRow(rowIndex, { faq: serializeFaqEntriesPlain(next), status: "idle" });
    },
    [optimizeFaqAnswer, updateRow, getDfsSerpContext, rowsRef],
  );

  const handleAiFaqRowAll = useCallback(
    async (
      rowIndex: number,
      rowOverride?: OverviewRow,
      options?: {
        silentToast?: boolean;
        skipFaqLoading?: boolean;
        onMicroStep?: () => void;
        seedQuestionCount?: number;
        skipUploadAfterRowWrite?: boolean;
      },
    ) => {
      if (!site) {
        notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
        return;
      }

      const row = rowOverride ?? rowsRef.current[rowIndex];
      if (!row?.url?.trim()) return;
      const liveRow = rowsRef.current[rowIndex] ?? row;

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      const useHarness = !options?.onMicroStep;

      if (useHarness) {
        initOverviewFaqHarnessBatchState({
          site,
          rows: [row],
          bulkAiFaqSeedCount: options?.seedQuestionCount ?? bulkAiFaqSeedCount,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
          prepMessage: "Preparing FAQ batch…",
        });
      }

      try {
        const cacheWrite = createAiseoCacheWriteAccumulator(site);
        const success = await runFaqPairsForRow({
          site,
          sitemapSource,
          getInventoryMatchForUrl,
          row: liveRow,
          rowIndex,
          bulkAiFaqSeedCount: options?.seedQuestionCount ?? bulkAiFaqSeedCount,
          deps: faqDeps,
          harnessSetters,
          cacheWrite,
          updateRow,
          uploadAfterRowWrite: options?.skipUploadAfterRowWrite ? undefined : uploadAfterRowWrite,
          skipLoadingState: options?.skipFaqLoading ?? true,
        });

        finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);

        if (!success && !options?.silentToast) {
          notify.error(NOTIFY_FAQ_OPTIMIZATION_FAILED_FOR_THIS_ROW);
          return;
        }

        if (!options?.silentToast && success) {
          notify.success(NOTIFY_AI_OPTIMIZED_FAQS_FOR_THIS_ROW);
        }
      } finally {
        if (useHarness) {
          finalizeOverviewFaqHarnessBatch(
            batchKey,
            site.id,
            opt.setIsOptimizingContent,
            opt.setOptimizationProgress,
          );
        }
      }
    },
    [
      site,
      bulkAiFaqSeedCount,
      makeHarnessSetters,
      getInventoryMatchForUrl,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
      updateRow,
      faqDeps,
      rowsRef,
      uploadAfterRowWrite,
    ],
  );

  const handleAiFaqAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }

    const latestRows = rowsRef.current;
    const scopeKeys = bulkScopeUrlKeysRef.current;
    const rowIndices = overviewBulkRowIndicesForDisplayOrder(
      latestRows,
      displayRowsRef.current,
      scopeKeys,
    );
    if (!rowIndices.length) return;
    const scopedRows = rowIndices.map((index) => latestRows[index]!);

    const batchKey = `${site.id}-batch`;
    const harnessSetters = makeHarnessSetters(batchKey);
    if (!harnessSetters) return;

    initOverviewFaqHarnessBatchState({
      site,
      rows: scopedRows,
      bulkAiFaqSeedCount,
      setBulkOptimizationState: opt.setBulkOptimizationState,
      setOptimizationProgress: opt.setOptimizationProgress,
      setIsOptimizingContent: opt.setIsOptimizingContent,
      prepMessage: "Preparing FAQ batch…",
    });

    try {
      const cacheWrite = createAiseoCacheWriteAccumulator(site);
      await runOverviewFaqHarnessBatch({
        site,
        sitemapSource,
        rowsRef,
        getInventoryMatchForUrl,
        rows: latestRows,
        rowIndices,
        bulkAiFaqSeedCount,
        deps: faqDeps,
        harnessSetters,
        cacheWrite,
        updateRow,
        uploadAfterRowWrite,
      });

      finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);
    } finally {
      finalizeOverviewFaqHarnessBatch(
        batchKey,
        site.id,
        opt.setIsOptimizingContent,
        opt.setOptimizationProgress,
      );
    }
  }, [
    site,
    sitemapSource,
    displayRowsRef,
    bulkAiFaqSeedCount,
    makeHarnessSetters,
    bulkScopeUrlKeysRef,
    getInventoryMatchForUrl,
    opt.setBulkOptimizationState,
    opt.setOptimizationProgress,
    opt.setIsOptimizingContent,
    updateRow,
    faqDeps,
    rowsRef,
    uploadAfterRowWrite,
  ]);

  return {
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    handleAiFaqRowAll,
    handleAiFaqAll,
  };
}

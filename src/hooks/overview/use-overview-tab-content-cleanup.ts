import { useCallback } from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  overviewBulkRowIndices,
  overviewRowInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import {
  buildContentCleanupStubCatalog,
  finalizeOverviewContentCleanupBatch,
  hydrateCleanupCatalogHtml,
  initOverviewContentCleanupBatchState,
  runOverviewContentCleanupBatch,
  type ContentCleanupSetters,
} from "@/lib/overview/overview-content-cleanup-run";

import {
  createAiseoCacheWriteAccumulator,
  finalizeAiseoCacheWriteForUpload,
} from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "bindings"
  | "resolveBindings"
  | "updateRow"
  | "opt"
> & {
  rowsRef: OverviewTabBase["rowsRef"];
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  mergeInventoryContentForSource: (
    site: WordPressSite,
    source: OverviewSitemapSource,
    contentRows: OverviewInventoryRow[],
  ) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export function useOverviewTabContentCleanup({
  site,
  sitemapSource,
  rows,
  bindings,
  resolveBindings,
  updateRow,
  opt,
  bulkScopeUrlKeys,
  getInventoryMatchForUrl,
  mergeInventoryContentForSource,
  rowsRef,
  uploadAfterRowWrite,
}: Args) {
  const makeSetters = useCallback(
    (batchKey: string): ContentCleanupSetters | null => {
      if (!site?.id) return null;
      return {
        siteId: site.id,
        batchKey,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
      };
    },
    [site?.id, opt.setBulkOptimizationState, opt.setOptimizationProgress],
  );

  const runCleanupForIndices = useCallback(
    async (indices: number[]) => {
      if (!site) return;

      const batchKey = `${site.id}-batch`;
      const setters = makeSetters(batchKey);
      if (!setters) return;

      const scopedIndices = indices.filter((i) =>
        overviewRowInBulkScope(rows[i]?.url ?? "", bulkScopeUrlKeys),
      );
      const stubCatalog = buildContentCleanupStubCatalog(scopedIndices, rows);
      const urls = stubCatalog.map((r) => r.url);
      const cacheWrite = createAiseoCacheWriteAccumulator(site);

      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      initOverviewContentCleanupBatchState({
        site,
        catalog: stubCatalog,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        prepMessage: "Starting Clean Up…",
      });

      try {
        const mergedBindings: Record<string, OverviewBinding | undefined> = {
          ...bindings,
          ...(await resolveBindings(urls, site, undefined, { inventoryOnly: true })),
        };

        await runOverviewContentCleanupBatch({
          catalog: stubCatalog,
          harnessSetters: setters,
          cacheWrite,
          updateRow,
          uploadAfterRowWrite,
          preparePage: async ({ page, pageCount, pageCatalog }) => {
            setters.setBulkOptimizationState((prev) => {
              const current = prev[batchKey];
              if (!current) return prev;
              return {
                ...prev,
                [batchKey]: {
                  ...current,
                  currentStepProgress: harnessStepProgress(current.currentStepProgress, {
                    step: "Clean Up",
                    progress: 5 + Math.round(((page - 1) / Math.max(pageCount, 1)) * 10),
                    message: `Clean Up page ${page}/${pageCount}: using cache…`,
                  }),
                },
              };
            });

            return hydrateCleanupCatalogHtml(
              pageCatalog,
              rows,
              site,
              getInventoryMatchForUrl,
            );
          },
        });

        finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);
      } finally {
        finalizeOverviewContentCleanupBatch(
          batchKey,
          site.id,
          opt.setIsOptimizingContent,
          opt.setOptimizationProgress,
        );
      }
    },
    [
      site,
      rows,
      bindings,
      resolveBindings,
      getInventoryMatchForUrl,
      bulkScopeUrlKeys,
      updateRow,
      makeSetters,
      rowsRef,
      uploadAfterRowWrite,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
    ],
  );

  const handleContentCleanupRow = useCallback(
    async (index: number) => {
      if (!site || index < 0 || index >= rows.length) return;
      await runCleanupForIndices([index]);
    },
    [site, rows.length, runCleanupForIndices],
  );

  const handleContentCleanupAll = useCallback(async () => {
    if (!site || !rows.length) return;
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runCleanupForIndices(indices);
  }, [site, rows, bulkScopeUrlKeys, runCleanupForIndices]);

  return {
    handleContentCleanupRow,
    handleContentCleanupAll,
  };
}

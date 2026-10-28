import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_AI_TITLES_APPLY_TO_POSTS_ONLY_PAGES_BUCK } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import {
  overviewBulkRowIndices,
  overviewRowInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import {
  finalizeOverviewAiTitleHarnessBatch,
  initOverviewAiTitleHarnessBatchState,
  runOverviewAiTitleHarnessBatch,
  type AiTitleCatalogRow,
} from "@/lib/overview/overview-ai-title-harness-run";
import type { TitleHarnessSetters } from "@/lib/overview/overview-ai-title-harness-mutations";

type Args = Pick<
  OverviewTabBase,
  "rows" | "rowsRef" | "opt" | "updateRow" | "optimizeTitle" | "resolvePostBodyHtmlForSentiment"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  bindings: Record<string, OverviewBinding | undefined>;
  resolveBindings: (
    urls: string[],
    site: WordPressSite,
    extra?: undefined,
    options?: { inventoryOnly?: boolean },
  ) => Promise<Record<string, OverviewBinding | undefined>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
};

function buildTitleCatalog(rows: OverviewRow[], indices: number[]): AiTitleCatalogRow[] {
  return indices
    .map((index) => {
      const row = rows[index];
      if (!row?.url?.trim()) return null;
      return {
        index,
        url: row.url.trim(),
        title: (row.title || row.aiTitle || "").trim(),
        focusKeyword: (row.focusKeyword || "").trim(),
      };
    })
    .filter((entry): entry is AiTitleCatalogRow => entry != null);
}

export function useOverviewTabAiTitleHarness({
  site,
  sitemapSource,
  rows,
  rowsRef,
  opt,
  updateRow,
  optimizeTitle,
  resolvePostBodyHtmlForSentiment,
  bulkScopeUrlKeys,
  bindings,
  resolveBindings,
  uploadAfterRowWrite,
  getInventoryMatchForUrl,
}: Args) {
  const makeHarnessSetters = useCallback(
    (batchKey: string): TitleHarnessSetters | null => {
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

  const resolveSentimentSource = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!site) return undefined;
      try {
        let binding = bindings[row.url];
        if (!binding) {
          const singleBindingMap = await resolveBindings([row.url], site, undefined, {
            inventoryOnly: true,
          });
          binding = singleBindingMap[row.url];
        }
        if (binding?.postId) {
          return await resolvePostBodyHtmlForSentiment(row, binding);
        }
      } catch {
        // Ignore sentiment failures
      }
      return undefined;
    },
    [site, bindings, resolveBindings, resolvePostBodyHtmlForSentiment],
  );

  const runTitleForIndices = useCallback(
    async (indices: number[], options?: { ignoreBulkScope?: boolean }) => {
      if (!site) return;

      const scoped = options?.ignoreBulkScope
        ? indices.filter((index) => Boolean(rowsRef.current[index]?.url?.trim()))
        : indices.filter((index) =>
            overviewRowInBulkScope(rowsRef.current[index]?.url ?? "", bulkScopeUrlKeys),
          );
      const eligible = scoped.filter(
        (index) => !overviewTitleOptimizationExcluded(rowsRef.current[index]!, sitemapSource),
      );
      if (!eligible.length) {
        notify.error(NOTIFY_AI_TITLES_APPLY_TO_POSTS_ONLY_PAGES_BUCK);
        return;
      }

      const catalog = buildTitleCatalog(rowsRef.current, eligible);
      if (!catalog.length) return;

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      initOverviewAiTitleHarnessBatchState({
        site,
        catalog,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        prepMessage: `AI titles (${catalog.length} rows)…`,
      });

      try {
        await runOverviewAiTitleHarnessBatch({
          site,
          sitemapSource,
          rowsRef,
          catalog,
          harnessSetters,
          getInventoryMatchForUrl,
          updateRow,
          uploadAfterRowWrite,
          deps: {
            optimizeTitle,
            resolveSentimentSource,
          },
        });
      } finally {
        finalizeOverviewAiTitleHarnessBatch(
          batchKey,
          site.id,
          opt.setIsOptimizingContent,
          opt.setOptimizationProgress,
        );
      }
    },
    [
      site,
      sitemapSource,
      rowsRef,
      bulkScopeUrlKeys,
      makeHarnessSetters,
      opt,
      getInventoryMatchForUrl,
      updateRow,
      uploadAfterRowWrite,
      optimizeTitle,
      resolveSentimentSource,
    ],
  );

  const handleAiTitleAll = useCallback(async () => {
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runTitleForIndices(indices);
  }, [rows, bulkScopeUrlKeys, runTitleForIndices]);

  const handleAiTitleRow = useCallback(
    async (index: number) => {
      await runTitleForIndices([index], { ignoreBulkScope: true });
    },
    [runTitleForIndices],
  );

  return { handleAiTitleAll, handleAiTitleRow };
}

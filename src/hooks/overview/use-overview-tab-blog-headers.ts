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
import { buildBlogHeadersCatalog } from "@/lib/overview/overview-blog-headers-catalog";
import type { HeadersHarnessSetters } from "@/lib/overview/overview-blog-headers-harness-mutations";
import {
  markHeadersRowError,
  setHeadersHarnessMessage,
} from "@/lib/overview/overview-blog-headers-harness-mutations";
import {
  finalizeOverviewHeadersHarnessBatch,
  initOverviewHeadersHarnessBatchState,
  runOverviewHeadersHarnessBatch,
} from "@/lib/overview/overview-blog-headers-harness-run";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { resolveHarnessRowHtmlFromSources } from "@/lib/overview/overview-harness-page-catalog";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { createAiseoCacheWriteAccumulator, finalizeAiseoCacheWriteForUpload } from "@/lib/overview/overview-aiseo-cache-write";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "bindings"
  | "resolveBindings"
  | "updateRow"
  | "opt"
  | "rowsRef"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  apiKey: string;
  selectedModel: string;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  mergeInventoryContentForSource: (
    site: WordPressSite,
    source: OverviewSitemapSource,
    contentRows: OverviewInventoryRow[],
  ) => void;
  /** Skip rows that use a different harness (e.g. Elementor pages). */
  shouldSkipRow?: (row: OverviewRow) => boolean;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export function useOverviewTabBlogHeaders({
  site,
  sitemapSource,
  rows,
  bindings,
  resolveBindings,
  updateRow,
  opt,
  apiKey,
  selectedModel,
  bulkScopeUrlKeys,
  getInventoryMatchForUrl,
  mergeInventoryContentForSource,
  shouldSkipRow,
  rowsRef,
  uploadAfterRowWrite,
}: Args) {
  const makeHarnessSetters = useCallback(
    (batchKey: string): HeadersHarnessSetters | null => {
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

  const runHeadersForIndices = useCallback(
    async (indices: number[]) => {
      if (!site) return;
      if (!apiKey?.trim()) return;

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      const scopedIndices = indices.filter((i) => {
        const row = rows[i];
        if (!row) return false;
        if (shouldSkipRow?.(row)) return false;
        return overviewRowInBulkScope(row.url ?? "", bulkScopeUrlKeys);
      });
      const subset = scopedIndices.map((i) => rows[i]).filter(Boolean) as OverviewRow[];
      const urls = subset.map((r) => r.url);
      const stubCatalog = scopedIndices.map((index) => {
        const row = rows[index];
        return {
          index,
          url: row.url,
          postId: 0,
          title: row.title ?? "",
          focusKeyword: row.focusKeyword ?? "",
          seoResearchBrief: "",
          existingH2s: [] as string[],
          html: "",
          sectionLabels: [] as string[],
          missingLeadingH2: false,
        };
      });

      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      initOverviewHeadersHarnessBatchState({
        site,
        catalog: stubCatalog,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        prepMessage: "Starting Headers batch…",
      });
      setHeadersHarnessMessage(harnessSetters, "Binding rows from inventory…", 3);

      try {
        const cacheWrite = createAiseoCacheWriteAccumulator(site);
        const mergedBindings: Record<string, OverviewBinding | undefined> = {
          ...bindings,
          ...(await resolveBindings(urls, site, undefined, { inventoryOnly: true })),
        };

        initOverviewHeadersHarnessBatchState({
          site,
          catalog: stubCatalog,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
          prepMessage: `Headers: page batches (${scopedIndices.length} rows)…`,
        });

        await runOverviewHeadersHarnessBatch({
          catalog: stubCatalog,
          agentOptions: {
            apiKey,
            model: getBlogModel(site.id) || selectedModel,
            siteId: site.id,
            siteUrl: site.siteUrl,
          },
          harnessSetters,
          cacheWrite,
          uploadAfterRowWrite,
          preparePage: async ({ page, pageCount, pageCatalog }) => {
            setHeadersHarnessMessage(
              harnessSetters,
              `Headers page ${page}/${pageCount}: using cache…`,
              5 + Math.round(((page - 1) / Math.max(pageCount, 1)) * 10),
            );

            for (const entry of pageCatalog) {
              const row = rows[entry.index];
              if (!row) continue;
              const html = resolveHarnessRowHtmlFromSources({
                row,
                site,
                sitemapSource,
                getInventoryMatchForUrl,
                index: entry.index,
              });
              if (html) {
                /* body stays in warm cache; catalog reads via resolveHarnessRowHtmlFromSources */
              }
            }

            setHeadersHarnessMessage(
              harnessSetters,
              `Headers page ${page}/${pageCount}: building catalog…`,
              8 + Math.round(((page - 1) / Math.max(pageCount, 1)) * 10),
            );

            const pageIndexSet = new Set(pageCatalog.map((c) => c.index));
            const { catalog } = buildBlogHeadersCatalog(
              rows,
              mergedBindings,
              getInventoryMatchForUrl,
              site,
              sitemapSource,
            );
            const eligible = catalog.filter((c) => pageIndexSet.has(c.index));
            const eligibleUrls = new Set(eligible.map((c) => normalizePageUrlKey(c.url)));

            for (const entry of pageCatalog) {
              if (eligibleUrls.has(normalizePageUrlKey(entry.url))) continue;
              markHeadersRowError(
                entry.url,
                entry.index,
                harnessSetters,
                "No HTML body in inventory cache for this URL",
              );
            }

            setHeadersHarnessMessage(
              harnessSetters,
              `Headers page ${page}/${pageCount}: optimizing ${eligible.length} rows…`,
              12 + Math.round(((page - 1) / Math.max(pageCount, 1)) * 10),
            );

            return eligible;
          },
        });

        finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);
      } finally {
        finalizeOverviewHeadersHarnessBatch(
          batchKey,
          site.id,
          opt.setIsOptimizingContent,
          opt.setOptimizationProgress,
        );
      }
    },
    [
      site,
      apiKey,
      selectedModel,
      rows,
      bindings,
      resolveBindings,
      sitemapSource,
      getInventoryMatchForUrl,
      bulkScopeUrlKeys,
      shouldSkipRow,
      rowsRef,
      uploadAfterRowWrite,
      makeHarnessSetters,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
    ],
  );

  const handleAiHeadersRow = useCallback(
    async (index: number) => {
      if (!site || index < 0 || index >= rows.length) return;
      const row = rows[index];
      if (row && shouldSkipRow?.(row)) return;
      await runHeadersForIndices([index]);
    },
    [site, rows, shouldSkipRow, runHeadersForIndices],
  );

  const handleAiHeadersAll = useCallback(async () => {
    if (!site || !rows.length) return;
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runHeadersForIndices(indices);
  }, [site, rows, bulkScopeUrlKeys, runHeadersForIndices]);

  return {
    handleAiHeadersRow,
    handleAiHeadersAll,
  };
}

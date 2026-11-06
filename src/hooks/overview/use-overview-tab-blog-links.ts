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
import { buildBlogLinksCatalog } from "@/lib/overview/overview-blog-links-catalog";
import type { LinksHarnessSetters } from "@/lib/overview/overview-blog-links-harness-mutations";
import { setLinksHarnessMessage } from "@/lib/overview/overview-blog-links-harness-mutations";
import {
  finalizeOverviewLinksHarnessBatch,
  initOverviewLinksHarnessBatchState,
  runOverviewLinksHarnessBatch,
} from "@/lib/overview/overview-blog-links-harness-run";
import { loadBlogLinksLinkInventory } from "@/lib/overview/overview-blog-links-inventory";
import { cacheRowHtmlByIndex } from "@/lib/overview/overview-harness-page-catalog";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { createAiseoCacheWriteAccumulator, finalizeAiseoCacheWriteForUpload } from "@/lib/overview/overview-aiseo-cache-write";

type Args = Pick<
  OverviewTabBase,
  "rows" | "bindings" | "resolveBindings" | "updateRow" | "opt" | "rowsRef"
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
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

function fetchRowHtmlByIndex(
  site: WordPressSite,
  indices: number[],
  rows: OverviewRow[],
  sitemapSource: OverviewSitemapSource,
  getInventoryMatchForUrl?: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
): Record<number, string> {
  return cacheRowHtmlByIndex({
    site,
    rows,
    indices,
    sitemapSource,
    getInventoryMatchForUrl: getInventoryMatchForUrl ?? (() => undefined),
  });
}

export function useOverviewTabBlogLinks({
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
  rowsRef,
  uploadAfterRowWrite,
}: Args) {
  const makeHarnessSetters = useCallback(
    (batchKey: string): LinksHarnessSetters | null => {
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

  const runLinksForIndices = useCallback(
    async (indices: number[]) => {
      if (!site) return;
      if (!apiKey?.trim()) return;

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      const subset = indices.map((i) => rows[i]).filter(Boolean) as OverviewRow[];
      const urls = subset.map((r) => r.url);

      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      setLinksHarnessMessage(harnessSetters, "Downloading posts + pages inventory…", 3);

      try {
        const cacheWrite = createAiseoCacheWriteAccumulator(site);
        const linkInventory = await loadBlogLinksLinkInventory(site, (msg) => {
          setLinksHarnessMessage(harnessSetters, msg, 6);
        });
        if (!linkInventory) {
          setLinksHarnessMessage(harnessSetters, "Link inventory unavailable.", 0);
          return;
        }

        const { pool: linkPool } = linkInventory;

        setLinksHarnessMessage(harnessSetters, "Binding rows from inventory…", 8);

        const extraBindings = await resolveBindings(urls, site, undefined, { inventoryOnly: true });
        const rowHtmlByIndex = fetchRowHtmlByIndex(
          site,
          indices,
          rows,
          sitemapSource,
          getInventoryMatchForUrl,
        );
        const mergedBindings: Record<string, OverviewBinding | undefined> = {
          ...bindings,
          ...extraBindings,
        };

        const indexSet = new Set(indices);
        const { catalog, skippedNoHtml, skippedNoBinding, skippedNoWork } = buildBlogLinksCatalog(
          rows,
          mergedBindings,
          getInventoryMatchForUrl,
          site,
          site.siteUrl,
          linkPool,
          sitemapSource,
          rowHtmlByIndex,
        );

        const eligible = catalog.filter(
          (c) =>
            indexSet.has(c.index) &&
            overviewRowInBulkScope(rows[c.index]?.url ?? "", bulkScopeUrlKeys),
        );

        if (!eligible.length) {
          return;
        }

        initOverviewLinksHarnessBatchState({
          site,
          catalog: eligible,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
          prepMessage: `Links: 1 blog at a time (${eligible.length} rows)…`,
        });

        await runOverviewLinksHarnessBatch({
          catalog: eligible,
          linkPool,
          agentOptions: {
            apiKey,
            model: getBlogModel(site.id) || selectedModel,
            siteId: site.id,
            siteUrl: site.siteUrl,
          },
          harnessSetters,
          cacheWrite,
          uploadAfterRowWrite,
        });

        finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);

        void skippedNoHtml;
        void skippedNoBinding;
        void skippedNoWork;
      } finally {
        finalizeOverviewLinksHarnessBatch(
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
      rowsRef,
      uploadAfterRowWrite,
      makeHarnessSetters,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
    ],
  );

  const handleAiLinksRow = useCallback(
    async (index: number) => {
      if (!site || index < 0 || index >= rows.length) return;
      await runLinksForIndices([index]);
    },
    [site, rows.length, runLinksForIndices],
  );

  const handleAiLinksAll = useCallback(async () => {
    if (!site || !rows.length) return;
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runLinksForIndices(indices);
  }, [site, rows, bulkScopeUrlKeys, runLinksForIndices]);

  return {
    handleAiLinksRow,
    handleAiLinksAll,
  };
}

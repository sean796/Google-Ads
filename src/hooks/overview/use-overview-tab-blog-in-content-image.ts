import { useCallback } from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  overviewBulkRowIndices,
  overviewRowInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import {
  finalizeOverviewBlogInContentImageHarnessBatch,
  initOverviewBlogInContentImageHarnessBatchState,
  runOverviewBlogInContentImageHarnessBatch,
  type BlogInContentImageCatalogRow,
} from "@/lib/overview/overview-blog-in-content-image-harness-run";
import { canUseLocalInContentImage } from "@/lib/overview/overview-local-image-dfs-normalize";
import type { LocalImageExistingScope } from "@/lib/overview/local-image-existing-scope";
import { normalizeLocalImageExistingScope } from "@/lib/overview/local-image-existing-scope";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import {
  downloadFieldsFromInventoryRow,
  postBodyHtmlFromInventoryRow,
  sentimentHtmlFromInventoryRow,
} from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { createAiseoCacheWriteAccumulator, finalizeAiseoCacheWriteForUpload } from "@/lib/overview/overview-aiseo-cache-write";

type Args = Pick<
  OverviewTabBase,
  "rows" | "bindings" | "resolveBindings" | "updateRow" | "opt" | "prefetchOverviewInventory" | "rowsRef"
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

function htmlHasH2s(html: string): boolean {
  return extractH2TextsFromHtml(html).length > 0;
}

function resolveCachedInContentHtml(
  site: WordPressSite | undefined,
  row: OverviewRow,
  getInventoryMatchForUrl: Args["getInventoryMatchForUrl"],
): string {
  const fromGrid = resolveOverviewSourceHtml(row).trim();
  if (fromGrid && htmlHasH2s(fromGrid)) return fromGrid;

  const url = row.url?.trim();
  if (url && site) {
    const inv = getInventoryMatchForUrl(site, url)?.row;
    if (inv) {
      const body =
        postBodyHtmlFromInventoryRow(inv)?.trim() ||
        sentimentHtmlFromInventoryRow(inv)?.trim() ||
        "";
      if (body && htmlHasH2s(body)) return body;
    }
  }

  return "";
}

function buildInContentImageCatalogFromCache(
  site: WordPressSite | undefined,
  indices: number[],
  rows: OverviewRow[],
  bulkScopeUrlKeys: Set<string>,
  getInventoryMatchForUrl: Args["getInventoryMatchForUrl"],
  forceLocalMode?: "find" | "generate",
  localImageExistingScope?: LocalImageExistingScope,
): BlogInContentImageCatalogRow[] {
  const catalog: BlogInContentImageCatalogRow[] = [];
  const existingScope = normalizeLocalImageExistingScope(localImageExistingScope);
  for (const index of indices) {
    const row = rows[index];
    if (!row) continue;
    const url = row.url?.trim();
    if (!url) continue;
    if (!overviewRowInBulkScope(url, bulkScopeUrlKeys)) continue;
    const html = resolveCachedInContentHtml(site, row, getInventoryMatchForUrl);
    if (!html) continue;
    const invKw = site
      ? (() => {
          const inv = getInventoryMatchForUrl(site, url)?.row;
          if (!inv) return { hasInv: false, kw: "", title: "" };
          const d = downloadFieldsFromInventoryRow(inv);
          return {
            hasInv: true,
            kw: (d.focusKeyword || "").trim(),
            title: (d.title || "").trim().slice(0, 80),
          };
        })()
      : { hasInv: false, kw: "", title: "" };
    if (forceLocalMode) {
      catalog.push({
        index,
        url,
        title: row.title ?? "",
        focusKeyword: row.focusKeyword ?? "",
        pageHeading: row.pageHeading,
        html,
        forcedSectionHeader: row.blogInContentImageTargetHeading?.trim() || undefined,
        imageKind: "local",
        localImageMode: forceLocalMode,
        localImageExistingScope:
          forceLocalMode === "generate" ? existingScope : undefined,
      });
      continue;
    }
    catalog.push({
      index,
      url,
      title: row.title ?? "",
      focusKeyword: row.focusKeyword ?? "",
      pageHeading: row.pageHeading,
      html,
      forcedSectionHeader: row.blogInContentImageTargetHeading?.trim() || undefined,
      imageKind: row.blogInContentImageKind === "local" ? "local" : "photo",
      localImageMode:
        row.blogInContentImageKind === "local" ? "generate" : undefined,
      localImageExistingScope:
        row.blogInContentImageKind === "local" ? "all" : undefined,
    });
  }
  return catalog;
}

export function useOverviewTabBlogInContentImage({
  site,
  sitemapSource,
  rows,
  resolveBindings,
  updateRow,
  opt,
  apiKey,
  selectedModel,
  bulkScopeUrlKeys,
  getInventoryMatchForUrl,
  prefetchOverviewInventory,
  rowsRef,
  uploadAfterRowWrite,
}: Args) {
  const { sites: peerSites } = useWordPressSites();
  const makeHarnessSetters = useCallback(
    (batchKey: string): OverviewHarnessSetters | null => {
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

  const runInContentImageForIndices = useCallback(
    async (
      indices: number[],
      options?: {
        forceLocalMode?: "find" | "generate";
        localImageExistingScope?: LocalImageExistingScope;
      },
    ) => {
      if (!site) return;
      if (!apiKey?.trim()) {
        return;
      }

      const forceLocalMode = options?.forceLocalMode;
      const localImageExistingScope = normalizeLocalImageExistingScope(
        options?.localImageExistingScope,
      );
      if (forceLocalMode && !canUseLocalInContentImage(sitemapSource)) {
        return;
      }

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      const scoped = indices.filter((i) =>
        overviewRowInBulkScope(rows[i]?.url ?? "", bulkScopeUrlKeys),
      );
      if (!scoped.length) {
        return;
      }

      const prepLabel =
        forceLocalMode === "find"
          ? "Find Local Image"
          : forceLocalMode === "generate"
            ? localImageExistingScope === "old"
              ? "Generate Local Image (Old)"
              : localImageExistingScope === "all"
                ? "Generate Local Image (All)"
                : "Generate Local Image (New)"
            : "In Content Image";

      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      initOverviewBlogInContentImageHarnessBatchState({
        site,
        catalog: scoped.map((index) => {
          const row = rows[index]!;
          return {
            index,
            url: row.url!.trim(),
            title: row.title ?? "",
            focusKeyword: row.focusKeyword ?? "",
            html: "",
          };
        }),
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        prepMessage: `Loading post HTML for ${prepLabel} (${scoped.length})…`,
      });

      try {
        // Find Local Image: do NOT re-crawl the connected (current) site looking for images.
        // Peer caches hold reusable local images; use already-loaded HTML for placement.
        const catalog = buildInContentImageCatalogFromCache(
          site,
          scoped,
          rows,
          bulkScopeUrlKeys,
          getInventoryMatchForUrl,
          forceLocalMode,
          forceLocalMode === "generate" ? localImageExistingScope : undefined,
        );

        // #region agent log
        {
          const emptyKw = catalog.filter((c) => !(c.focusKeyword || "").trim()).length;
          const warm = site ? getEntitySiteWarmCacheIfReady(site.id) : null;
          const warmCount = warm?.bulkInventoryRows?.length ?? 0;
          const warmWithKw =
            warm?.bulkInventoryRows?.filter((r) =>
              Boolean((r.fields?.keyword || "").trim()),
            ).length ?? 0;
        }
        // #endregion

        if (!catalog.length) {
          finalizeOverviewBlogInContentImageHarnessBatch(
            batchKey,
            site.id,
            opt.setIsOptimizingContent,
            opt.setOptimizationProgress,
            opt.setBulkOptimizationState,
          );
          return;
        }

        initOverviewBlogInContentImageHarnessBatchState({
          site,
          catalog,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
          setIsOptimizingContent: opt.setIsOptimizingContent,
          prepMessage: `${prepLabel} (${catalog.length} rows)…`,
        });

        // Find: skip current-site inventory resolve — peers supply images; bindings already on rows.
        if (forceLocalMode !== "find") {
          await resolveBindings(
            catalog.map((c) => c.url),
            site,
            undefined,
            { inventoryOnly: true },
          );
        }

        const cacheWrite = createAiseoCacheWriteAccumulator(site);
        await runOverviewBlogInContentImageHarnessBatch({
          catalog,
          site,
          apiKey,
          model: getResearchModel(site.id) || selectedModel,
          allowLocalImage: canUseLocalInContentImage(sitemapSource),
          peerSites,
          harnessSetters,
          cacheWrite,
          updateRow,
          uploadAfterRowWrite,
        });

        finalizeAiseoCacheWriteForUpload(cacheWrite, rowsRef);
      } finally {
        finalizeOverviewBlogInContentImageHarnessBatch(
          batchKey,
          site.id,
          opt.setIsOptimizingContent,
          opt.setOptimizationProgress,
          opt.setBulkOptimizationState,
        );
      }
    },
    [
      site,
      peerSites,
      sitemapSource,
      apiKey,
      selectedModel,
      rows,
      bulkScopeUrlKeys,
      resolveBindings,
      getInventoryMatchForUrl,
      updateRow,
      rowsRef,
      uploadAfterRowWrite,
      opt,
      makeHarnessSetters,
    ],
  );

  const handleAiInContentImageAll = useCallback(async () => {
    if (!site) return;
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runInContentImageForIndices(indices);
  }, [site, rows, bulkScopeUrlKeys, runInContentImageForIndices]);

  const handleAiInContentImageRow = useCallback(
    async (index: number) => {
      await runInContentImageForIndices([index]);
    },
    [runInContentImageForIndices],
  );

  const handleFindLocalImageAll = useCallback(async () => {
    if (!site) return;
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runInContentImageForIndices(indices, { forceLocalMode: "find" });
  }, [site, rows, bulkScopeUrlKeys, runInContentImageForIndices]);

  const handleGenerateLocalImageAll = useCallback(
    async (existingScope: LocalImageExistingScope = "new") => {
      if (!site) return;
      const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
      await runInContentImageForIndices(indices, {
        forceLocalMode: "generate",
        localImageExistingScope: existingScope,
      });
    },
    [site, rows, bulkScopeUrlKeys, runInContentImageForIndices],
  );

  return {
    handleAiInContentImageAll,
    handleAiInContentImageRow,
    handleFindLocalImageAll,
    handleGenerateLocalImageAll,
  };
}

import { useCallback, useMemo, useRef, useState } from "react";
import { useOverviewSitemap } from "@/hooks/overview/use-overview-sitemap";
import { useOverviewScrape } from "@/hooks/overview/use-overview-scrape";
import { useOverviewAiOptimize } from "@/hooks/overview/use-overview-ai-optimize";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { createNAPSummary } from "@/lib/nap-kb-template";
import type { MetaBulkActionKey, BulkProgressSlice } from "@/components/overview/overview-tab-constants";
import { OVERVIEW_BULK_AI_FAQ_SEED_COUNT } from "@/components/overview/overview-tab-constants";
import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { deferHarnessUiUpdate } from "@/lib/overview/overview-harness-ui-update";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import { useOverviewTabRowsCore } from "@/hooks/overview/use-overview-tab-rows-core";
import { useOverviewTabOptimizationSync } from "@/hooks/overview/use-overview-tab-optimization-sync";
import { useOverviewTabFilterState } from "@/hooks/overview/use-overview-tab-filter-state";
import { useOverviewTabDisplayRows } from "@/hooks/overview/use-overview-tab-display-rows";
import { useOverviewSerpContext } from "@/hooks/overview/use-overview-serp-context";

export function useOverviewTabWorkspace({
  site,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  studioRowSource = "sitemap",
  onBulkGeneratorOverviewRowPatched,
}: OverviewTabContentProps) {
  const [gscQuickWinsFile, setGscQuickWinsFile] = useState<string | null>(null);
  const [bulkActionProgress, setBulkActionProgress] = useState<
    Partial<Record<MetaBulkActionKey, BulkProgressSlice>>
  >({});
  const [bulkSeoCsvExportBusy, setBulkSeoCsvExportBusy] = useState(false);
  const [overviewMetaCsvExportBusy, setOverviewMetaCsvExportBusy] = useState(false);
  const {
    semrushFilterUrlKeys,
    semrushCsvFileName,
    activeErrorFilters,
    setSemrushCsvUpload,
    clearSemrushCsvUpload,
    toggleErrorFilter,
    clearErrorFilters,
  } = useOverviewTabFilterState();
  const opt = useWordPressOptimization();
  const optRef = useRef(opt);
  optRef.current = opt;

  const setBulkOptimizationState = useCallback<typeof opt.setBulkOptimizationState>((action) => {
    deferHarnessUiUpdate(() => {
      optRef.current.setBulkOptimizationState(action);
    });
  }, []);

  const setOptimizationProgress = useCallback<typeof opt.setOptimizationProgress>((action) => {
    deferHarnessUiUpdate(() => {
      optRef.current.setOptimizationProgress(action);
    });
  }, []);

  const setIsOptimizingContent = useCallback<typeof opt.setIsOptimizingContent>((action) => {
    deferHarnessUiUpdate(() => {
      optRef.current.setIsOptimizingContent(action);
    });
  }, []);

  const overviewOpt = useMemo(
    () => ({
      ...opt,
      setBulkOptimizationState,
      setOptimizationProgress,
      setIsOptimizingContent,
    }),
    [opt, setBulkOptimizationState, setOptimizationProgress, setIsOptimizingContent],
  );
  const bulkBatchKey = site ? `${site.id}-batch` : "";
  const isOptimizingContentRef = useRef(opt.isOptimizingContent);
  isOptimizingContentRef.current = opt.isOptimizingContent;
  const bulkOptimizationStateRef = useRef(opt.bulkOptimizationState);
  bulkOptimizationStateRef.current = opt.bulkOptimizationState;

  const isMultiRowBulkActive = useCallback(() => {
    if (!bulkBatchKey) return false;
    if (!isOptimizingContentRef.current[bulkBatchKey]) return false;
    const batch = bulkOptimizationStateRef.current[bulkBatchKey];
    return (batch?.urls?.length ?? 0) > 1;
  }, [bulkBatchKey]);

  const {
    sitemapSource,
    setSitemapSource,
    rows,
    setRows,
    rowsRef,
    expandedContentUrl,
    setExpandedContentUrl,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedPageUrl,
    setExpandedPageUrl,
    toggleExpandedPageUrl,
    syncRowsFromRef,
    updateRow,
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    bindingLoading,
    bindingError,
    activateInventoryCacheForSource,
    getCachedInventoryRowsForSource,
    remapBindingUrl,
    mergeInventoryContentForSource,
  } = useOverviewTabRowsCore({
    site,
    studioRowSource,
    onBulkGeneratorOverviewRowPatched,
    bulkBatchKey,
    opt,
    isMultiRowBulkActive,
  });
  const {
    getInventoryRow,
    downloadLoading,
    downloadError,
    downloadRow,
    uploadError,
    resolvePostBodyHtmlForSentiment,
    bulkSeoExtraOptions,
  } = useOverviewTabOptimizationSync({
    site,
    opt,
    getInventoryRowForUrl,
  });
  const {
    loading: sitemapLoading,
    error: sitemapError,
    loadSitemap,
    loadOverviewSitemapSource,
  } = useOverviewSitemap();

  const {
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    gridPageIndex,
    setGridPageIndex,
    visibleRows,
    visibleRowsRef,
    displayRows,
    displayRowsRef,
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
    bulkScopeUrlKeys,
    bulkScopeUrlKeysRef,
    gridPaginationLayoutTotal,
  } = useOverviewTabDisplayRows({
    rows,
    semrushFilterUrlKeys,
    activeErrorFilters,
    wpTitlesByUrl,
    site,
    sitemapSource,
    studioRowSource,
    setExpandedPageUrl,
  });
  const napSummary =
    site?.napInfo ? createNAPSummary(site.napInfo, site.locations) : undefined;
  const {
    loading: scrapeLoading,
    error: scrapeError,
    scrapeMetaForUrl,
  } = useOverviewScrape();
  const {
    loading: aiLoading,
    error: aiError,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    deriveEntityKeyword,
    deriveFocusKeywordFromPageContext,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
  } = useOverviewAiOptimize({
    apiKey,
    model: getBlogModel(site?.id) || selectedModel,
    temperature,
    maxTokens,
    topP,
    napSummary,
    wordPressSiteId: site?.id ?? null,
    wordPressSite: site ?? null,
  });

  const { serpDumpUrl, getDfsSerpContext } = useOverviewSerpContext();
  return {
    sitemapSource,
    setSitemapSource,
    rows,
    setRows,
    rowsRef,
    gscQuickWinsFile,
    setGscQuickWinsFile,
    bulkActionProgress,
    setBulkActionProgress,
    bulkAiFaqSeedCount: OVERVIEW_BULK_AI_FAQ_SEED_COUNT,
    bulkSeoCsvExportBusy,
    setBulkSeoCsvExportBusy,
    overviewMetaCsvExportBusy,
    setOverviewMetaCsvExportBusy,
    opt: overviewOpt,
    syncOpt: opt,
    expandedContentUrl,
    setExpandedContentUrl,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedPageUrl,
    setExpandedPageUrl,
    toggleExpandedPageUrl,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    gridPageIndex,
    setGridPageIndex,
    gridPaginationLayoutTotal,
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    getCachedInventoryRowsForSource,
    mergeInventoryContentForSource,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    bindingLoading,
    bindingError,
    getInventoryRow,
    downloadLoading,
    downloadError,
    downloadRow,
    uploadError,
    resolvePostBodyHtmlForSentiment,
    bulkSeoExtraOptions,
    sitemapLoading,
    sitemapError,
    loadSitemap,
    loadOverviewSitemapSource,
    displayRows,
    displayRowsRef,
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
    bulkScopeUrlKeys,
    bulkScopeUrlKeysRef,
    visibleRows,
    visibleRowsRef,
    scrapeLoading,
    scrapeError,
    scrapeMetaForUrl,
    aiLoading,
    aiError,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    deriveEntityKeyword,
    deriveFocusKeywordFromPageContext,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
    serpDumpUrl,
    getDfsSerpContext,
    updateRow,
    syncRowsFromRef,
    remapBindingUrl,
    semrushFilterUrlKeys,
    semrushCsvFileName,
    setSemrushCsvUpload,
    clearSemrushCsvUpload,
    activeErrorFilters,
    toggleErrorFilter,
    clearErrorFilters,
  };
}

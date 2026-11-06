import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { useOverviewTabSitemapLoad } from "@/hooks/overview/use-overview-tab-sitemap-load";
import { useOverviewTabScrapeWp } from "@/hooks/overview/use-overview-tab-scrape-wp";
import { useOverviewTabAiTitleMetaUrlCsv } from "@/hooks/overview/use-overview-tab-ai-title-meta-url-csv";
import { useOverviewTabAiTitleHarness } from "@/hooks/overview/use-overview-tab-ai-title-harness";
import { useOverviewTabAiMetaHarness } from "@/hooks/overview/use-overview-tab-ai-meta-harness";
import { useOverviewTabKeywordsHarness } from "@/hooks/overview/use-overview-tab-keywords-harness";
import { useOverviewTabAiUrlHarness } from "@/hooks/overview/use-overview-tab-ai-url-harness";
import { useOverviewTabKeywordsDates } from "@/hooks/overview/use-overview-tab-keywords-dates";
import { useOverviewTabFaqHandlers } from "@/hooks/overview/use-overview-tab-faq-handlers";
import { useOverviewTabDfsResearch } from "@/hooks/overview/use-overview-tab-dfs-research";
import { useOverviewTabResearchPipelines } from "@/hooks/overview/use-overview-tab-research-pipelines";
import { useOverviewTabBulkSeoWp } from "@/hooks/overview/use-overview-tab-bulk-seo-wp";
import { useOverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import {
  uploadAiseoRowAfterWrite,
  type AiseoAfterRowWriteFn,
} from "@/lib/overview/overview-aiseo-after-upload";
import { useCallback, useRef } from "react";

export function useOverviewTabControllerCore(props: OverviewTabContentProps) {
  const base = useOverviewTabBase(props);
  const { site } = props;

  const sitemapLoad = useOverviewTabSitemapLoad({
    rowsRef: base.rowsRef,
    setRows: base.setRows,
    bindings: base.bindings,
    sitemapSource: base.sitemapSource,
    site,
    resolveBindings: base.resolveBindings,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    disableAutoSitemapLoad: props.studioRowSource === "bulk-generator",
  });

  const bindingsRef = useRef(base.bindings);
  bindingsRef.current = base.bindings;

  const aiseoUploadAfterRowWrite = useCallback<AiseoAfterRowWriteFn>(
    async (params) => {
      if (!site?.id) return;
      await uploadAiseoRowAfterWrite(
        {
          site,
          rowsRef: base.rowsRef,
          bindings: bindingsRef.current,
          resolveBindings: base.resolveBindings,
          getInventoryMatchForUrl: base.getInventoryMatchForUrl,
          batchKey: `${site.id}-batch`,
          setBulkOptimizationState: base.opt.setBulkOptimizationState,
        },
        params,
      );
    },
    [site, base.rowsRef, base.resolveBindings, base.getInventoryMatchForUrl, base.opt.setBulkOptimizationState],
  );

  const scrapeWp = useOverviewTabScrapeWp({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    setRows: base.setRows,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    downloadRow: base.downloadRow,
    scrapeMetaForUrl: base.scrapeMetaForUrl,
    updateRow: base.updateRow,
    getInventoryRow: base.getInventoryRow,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    setBulkActionProgress: base.setBulkActionProgress,
    remapBindingUrl: base.remapBindingUrl,
    mergeInventoryContentForSource: base.mergeInventoryContentForSource,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getBulkGeneratorPushBindings: props.getBulkGeneratorPushBindings,
  });

  const faq = useOverviewTabFaqHandlers({
    site,
    sitemapSource: base.sitemapSource,
    displayRowsRef: base.displayRowsRef,
    rowsRef: base.rowsRef,
    optimizeFaq: base.optimizeFaq,
    optimizeFaqQuestion: base.optimizeFaqQuestion,
    optimizeFaqAnswer: base.optimizeFaqAnswer,
    updateRow: base.updateRow,
    getDfsSerpContext: base.getDfsSerpContext,
    bulkAiFaqSeedCount: base.bulkAiFaqSeedCount,
    opt: base.opt,
    bulkScopeUrlKeysRef: base.bulkScopeUrlKeysRef,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const aiCsv = useOverviewTabAiTitleMetaUrlCsv({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    optimizeTitle: base.optimizeTitle,
    optimizeMeta: base.optimizeMeta,
    updateRow: base.updateRow,
    setBulkActionProgress: base.setBulkActionProgress,
    setOverviewMetaCsvExportBusy: base.setOverviewMetaCsvExportBusy,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
    gscQuickWinsFile: base.gscQuickWinsFile,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
  });

  const aiTitleHarness = useOverviewTabAiTitleHarness({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    opt: base.opt,
    updateRow: base.updateRow,
    optimizeTitle: base.optimizeTitle,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
  });

  const aiMetaHarness = useOverviewTabAiMetaHarness({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    opt: base.opt,
    updateRow: base.updateRow,
    optimizeMeta: base.optimizeMeta,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
    gscQuickWinsFile: base.gscQuickWinsFile,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
  });

  const keywordsHarness = useOverviewTabKeywordsHarness({
    site,
    sitemapSource: base.sitemapSource,
    rowsRef: base.rowsRef,
    updateRow: base.updateRow,
    setBulkActionProgress: base.setBulkActionProgress,
    deriveFocusKeywordFromPageContext: base.deriveFocusKeywordFromPageContext,
    deriveEntityKeyword: base.deriveEntityKeyword,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    opt: base.opt,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
  });

  const aiUrlHarness = useOverviewTabAiUrlHarness({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    opt: base.opt,
    updateRow: base.updateRow,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
  });

  const kwDates = useOverviewTabKeywordsDates({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    setRows: base.setRows,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
    deriveEntityKeyword: base.deriveEntityKeyword,
    deriveFocusKeywordFromPageContext: base.deriveFocusKeywordFromPageContext,
    deriveFocusKeywordsFromPageContextBatch: base.deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch: base.deriveEntityKeywordsBatch,
    updateRow: base.updateRow,
    setBulkActionProgress: base.setBulkActionProgress,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
  });

  const dfs = useOverviewTabDfsResearch({
    rows: base.visibleRows,
    updateRow: base.updateRow,
    site,
    gscQuickWinsFile: base.gscQuickWinsFile,
    serpDumpUrl: base.serpDumpUrl,
    sitemapSource: base.sitemapSource,
    deriveEntityKeyword: base.deriveEntityKeyword,
    deriveFocusKeywordFromPageContext: base.deriveFocusKeywordFromPageContext,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
  });

  const pipelines = useOverviewTabResearchPipelines({
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    displayRowsRef: base.displayRowsRef,
    setExpandedPageUrl: base.setExpandedPageUrl,
    updateRow: base.updateRow,
    setBulkActionProgress: base.setBulkActionProgress,
    setGscQuickWinsFile: base.setGscQuickWinsFile,
    gscQuickWinsFile: base.gscQuickWinsFile,
    serpDumpUrl: base.serpDumpUrl,
    site,
    opt: base.syncOpt,
    bulkSeoExtraOptions: base.bulkSeoExtraOptions,
    bindings: base.bindings,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    runAiAllMetaBatchForCatalog: base.runAiAllMetaBatchForCatalog,
    bulkAiFaqSeedCount: base.bulkAiFaqSeedCount,
    sitemapSource: base.sitemapSource,
    optimizeFaq: base.optimizeFaq,
    optimizeFaqQuestion: base.optimizeFaqQuestion,
    optimizeFaqAnswer: base.optimizeFaqAnswer,
    getDfsSerpContext: base.getDfsSerpContext,
    handleDataForSeoResearch: dfs.handleDataForSeoResearch,
    ensureOverviewKeywordsForMissingRows: kwDates.ensureOverviewKeywordsForMissingRows,
    handleAiTitleRow: aiCsv.handleAiTitleRow,
    handleAiMetaRow: aiCsv.handleAiMetaRow,
    handleAiFaqRowAll: faq.handleAiFaqRowAll,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    bulkScopeUrlKeysRef: base.bulkScopeUrlKeysRef,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const bulkSeoWp = useOverviewTabBulkSeoWp({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    setRows: base.setRows,
    rowsRef: base.rowsRef,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    setBulkSeoCsvExportBusy: base.setBulkSeoCsvExportBusy,
    opt: base.opt,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    selectedUrlKeys: base.selectedUrlKeys,
    setBulkActionProgress: base.setBulkActionProgress,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    studioRowSource: props.studioRowSource,
    getBulkGeneratorPushBindings: props.getBulkGeneratorPushBindings,
  });

  return {
    base,
    sitemapLoad,
    bindingsRef,
    scrapeWp,
    faq,
    aiCsv,
    aiTitleHarness,
    aiMetaHarness,
    keywordsHarness,
    aiUrlHarness,
    kwDates,
    dfs,
    pipelines,
    bulkSeoWp,
    aiseoUploadAfterRowWrite,
  };
}

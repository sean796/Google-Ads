import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { useOverviewTabBlogHeaders } from "@/hooks/overview/use-overview-tab-blog-headers";
import { useOverviewTabContentCleanup } from "@/hooks/overview/use-overview-tab-content-cleanup";
import { useOverviewTabBlogLinks } from "@/hooks/overview/use-overview-tab-blog-links";
import { useOverviewTabBlogWikipediaLink } from "@/hooks/overview/use-overview-tab-blog-wikipedia-link";
import { useOverviewTabBlogOverview } from "@/hooks/overview/use-overview-tab-blog-overview";
import { useOverviewTabBlogAnswer } from "@/hooks/overview/use-overview-tab-blog-answer";
import { useOverviewTabBlogScenario } from "@/hooks/overview/use-overview-tab-blog-scenario";
import { useOverviewTabBlogInContentImage } from "@/hooks/overview/use-overview-tab-blog-in-content-image";
import { useOverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
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
import { useOverviewTabElementorHarness } from "@/hooks/overview/use-overview-tab-elementor-harness";
import {
  uploadAiseoRowAfterWrite,
  uploadOverviewAiseoWrittenRows,
  type AiseoAfterRowWriteFn,
} from "@/lib/overview/overview-aiseo-after-upload";
import { overviewBulkRowIndices } from "@/lib/overview/overview-bulk-row-scope";
import { useCallback, useRef } from "react";

export function useOverviewTabController(props: OverviewTabContentProps) {
  const base = useOverviewTabBase(props);
  const { site } = props;

  const sitemapLoad = useOverviewTabSitemapLoad({
    rowsRef: base.rowsRef,
    setRows: base.setRows,
    sitemapSource: base.sitemapSource,
    site,
    resolveBindings: base.resolveBindings,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
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

  const elementorHarness = useOverviewTabElementorHarness({
    site,
    sitemapSource: base.sitemapSource,
    rowsRef: base.visibleRowsRef,
    bindingsRef,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
  });

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
    hydrateElementorRowAtIndex: elementorHarness.hydrateRowAtIndex,
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
    portfolioBlockedHostsForSemrush: base.portfolioBlockedHostsForSemrush,
    sitemapSource: base.sitemapSource,
    deriveEntityKeyword: base.deriveEntityKeyword,
    deriveFocusKeywordFromPageContext: base.deriveFocusKeywordFromPageContext,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    resolvePostBodyHtmlForSentiment: base.resolvePostBodyHtmlForSentiment,
  });

  const pipelines = useOverviewTabResearchPipelines({
    rows: base.visibleRows,
    rowsRef: base.visibleRowsRef,
    updateRow: base.updateRow,
    setBulkActionProgress: base.setBulkActionProgress,
    setGscQuickWinsFile: base.setGscQuickWinsFile,
    gscQuickWinsFile: base.gscQuickWinsFile,
    serpDumpUrl: base.serpDumpUrl,
    portfolioBlockedHostsForSemrush: base.portfolioBlockedHostsForSemrush,
    site,
    opt: base.opt,
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
  });

  const blogHeaders = useOverviewTabBlogHeaders({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    mergeInventoryContentForSource: base.mergeInventoryContentForSource,
    shouldSkipRow: (row) => elementorHarness.shouldUseElementorPageHarness(row),
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const contentCleanup = useOverviewTabContentCleanup({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    updateRow: base.updateRow,
    opt: base.opt,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    mergeInventoryContentForSource: base.mergeInventoryContentForSource,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const blogLinks = useOverviewTabBlogLinks({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const blogWikipediaLink = useOverviewTabBlogWikipediaLink({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    updateRow: base.updateRow,
    opt: base.opt,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    apiKey: props.apiKey,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    mergeInventoryContentForSource: base.mergeInventoryContentForSource,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const blogOverview = useOverviewTabBlogOverview({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const blogAnswer = useOverviewTabBlogAnswer({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const blogScenario = useOverviewTabBlogScenario({
    site,
    sitemapSource: base.sitemapSource,
    rowsRef: base.rowsRef,
    updateRow: base.updateRow,
    opt: base.opt,
    syncOpt: base.syncOpt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
    shouldSkipRow: (row) => elementorHarness.shouldUseElementorPageHarness(row),
  });

  const blogInContentImage = useOverviewTabBlogInContentImage({
    site,
    sitemapSource: base.sitemapSource,
    rows: base.visibleRows,
    rowsRef: base.rowsRef,
    bindings: base.bindings,
    resolveBindings: base.resolveBindings,
    updateRow: base.updateRow,
    opt: base.opt,
    apiKey: props.apiKey,
    selectedModel: props.selectedModel,
    bulkScopeUrlKeys: base.bulkScopeUrlKeys,
    getInventoryMatchForUrl: base.getInventoryMatchForUrl,
    prefetchOverviewInventory: base.prefetchOverviewInventory,
    uploadAfterRowWrite: aiseoUploadAfterRowWrite,
  });

  const elementorHarnessHandlers = elementorHarness;

  const uploadAfterAiseo = useCallback(
    async (indices: number[]) => {
      if (!site?.id) return;
      await uploadOverviewAiseoWrittenRows({
        site,
        rows: base.rowsRef.current,
        indices,
        bindings: bindingsRef.current,
        resolveBindings: base.resolveBindings,
        getInventoryMatchForUrl: base.getInventoryMatchForUrl,
        batchKey: `${site.id}-batch`,
        setBulkOptimizationState: base.opt.setBulkOptimizationState,
      });
    },
    [site, base.rowsRef, base.resolveBindings, base.getInventoryMatchForUrl, base.opt.setBulkOptimizationState],
  );

  const runAiseoBulkAll = useCallback(
    async (run: () => Promise<void>) => {
      await run();
      base.syncRowsFromRef();
    },
    [base.syncRowsFromRef],
  );

  const handleAiAnswerRow = useCallback(
    async (index: number) => {
      const row = base.visibleRows[index];
      if (row && elementorHarnessHandlers.shouldUseElementorPageHarness(row)) {
        await elementorHarnessHandlers.runHarness(index, "answer");
        await uploadAfterAiseo([index]);
      } else {
        await blogAnswer.handleAiAnswerRow(index);
      }
    },
    [base.visibleRows, elementorHarnessHandlers, blogAnswer, uploadAfterAiseo],
  );

  const handleAiAnswerAll = useCallback(
    () => runAiseoBulkAll(() => blogAnswer.handleAiAnswerAll()),
    [runAiseoBulkAll, blogAnswer],
  );

  const handleAiOverviewRow = useCallback(
    async (index: number) => {
      const row = base.visibleRows[index];
      if (row && elementorHarnessHandlers.shouldUseElementorPageHarness(row)) {
        await elementorHarnessHandlers.runHarness(index, "overview");
      } else {
        await blogOverview.handleAiOverviewRow(index);
      }
    },
    [base.visibleRows, elementorHarnessHandlers, blogOverview],
  );

  const handleAiOverviewAll = useCallback(
    () => runAiseoBulkAll(() => blogOverview.handleAiOverviewAll()),
    [runAiseoBulkAll, blogOverview],
  );

  const handleAiScenarioRow = useCallback(
    async (index: number) => {
      const row = base.rowsRef.current[index];
      if (row && elementorHarnessHandlers.shouldUseElementorPageHarness(row)) {
        await elementorHarnessHandlers.runHarness(index, "scenario");
        await uploadAfterAiseo([index]);
      } else {
        await blogScenario.handleAiScenarioRow(index);
      }
    },
    [base.rowsRef, elementorHarnessHandlers, blogScenario],
  );

  const handleAiScenarioAll = useCallback(
    () =>
      runAiseoBulkAll(async () => {
        await blogScenario.handleAiScenarioAll();
        const elementorIndices = overviewBulkRowIndices(
          base.rowsRef.current,
          base.bulkScopeUrlKeys,
        ).filter((index) => {
          const row = base.rowsRef.current[index];
          return row?.url?.trim() && elementorHarnessHandlers.shouldUseElementorPageHarness(row);
        });
        for (const index of elementorIndices) {
          await elementorHarnessHandlers.runHarness(index, "scenario");
          await uploadAfterAiseo([index]);
        }
      }),
    [
      runAiseoBulkAll,
      blogScenario,
      base.rowsRef,
      base.bulkScopeUrlKeys,
      elementorHarnessHandlers,
      uploadAfterAiseo,
    ],
  );

  const handleAiHeadersRow = useCallback(
    async (index: number) => {
      const row = base.visibleRows[index];
      if (row && elementorHarnessHandlers.shouldUseElementorPageHarness(row)) {
        await elementorHarnessHandlers.handleAiElementorHeadersRow(index);
      } else {
        await blogHeaders.handleAiHeadersRow(index);
      }
      await uploadAfterAiseo([index]);
    },
    [base.visibleRows, elementorHarnessHandlers, blogHeaders, uploadAfterAiseo],
  );

  const handleAiHeadersAll = useCallback(
    () => runAiseoBulkAll(() => blogHeaders.handleAiHeadersAll()),
    [runAiseoBulkAll, blogHeaders],
  );

  const handleAiTitleRow = useCallback(
    (index: number) => aiTitleHarness.handleAiTitleRow(index),
    [aiTitleHarness],
  );

  const handleAiTitleAll = useCallback(
    () => runAiseoBulkAll(() => aiTitleHarness.handleAiTitleAll()),
    [runAiseoBulkAll, aiTitleHarness],
  );

  const handleAiMetaRow = useCallback(
    (index: number) => aiMetaHarness.handleAiMetaRow(index),
    [aiMetaHarness],
  );

  const handleAiMetaAll = useCallback(
    () => runAiseoBulkAll(() => aiMetaHarness.handleAiMetaAll()),
    [runAiseoBulkAll, aiMetaHarness],
  );

  const handleAiUrlRow = useCallback(
    (index: number) => aiUrlHarness.handleAiUrlRow(index),
    [aiUrlHarness],
  );

  const handleAiUrlAll = useCallback(
    () => runAiseoBulkAll(() => aiUrlHarness.handleAiUrlAll()),
    [runAiseoBulkAll, aiUrlHarness],
  );

  const handleKeywordsAll = useCallback(
    () => keywordsHarness.handleKeywordsAll(),
    [keywordsHarness],
  );

  const handleAiKeywordRow = useCallback(
    (index: number) => keywordsHarness.handleKeywordsRow(index),
    [keywordsHarness],
  );

  const handleAiFaqQuestion = useCallback(
    async (rowIndex: number, faqIndex: number) => {
      await faq.handleAiFaqQuestion(rowIndex, faqIndex);
      await uploadAfterAiseo([rowIndex]);
    },
    [faq, uploadAfterAiseo],
  );

  const handleAiFaqAnswer = useCallback(
    async (rowIndex: number, faqIndex: number) => {
      await faq.handleAiFaqAnswer(rowIndex, faqIndex);
      await uploadAfterAiseo([rowIndex]);
    },
    [faq, uploadAfterAiseo],
  );

  const handleAiFaqRowAll = useCallback(
    async (...args: Parameters<typeof faq.handleAiFaqRowAll>) => {
      await faq.handleAiFaqRowAll(...args);
      await uploadAfterAiseo([args[0]]);
    },
    [faq, uploadAfterAiseo],
  );

  const handleAiFaqAll = useCallback(
    () => runAiseoBulkAll(() => faq.handleAiFaqAll()),
    [runAiseoBulkAll, faq],
  );

  const handleAiLinksRow = useCallback(
    async (index: number) => {
      await blogLinks.handleAiLinksRow(index);
      await uploadAfterAiseo([index]);
    },
    [blogLinks, uploadAfterAiseo],
  );

  const handleAiLinksAll = useCallback(
    () => runAiseoBulkAll(() => blogLinks.handleAiLinksAll()),
    [runAiseoBulkAll, blogLinks],
  );

  const handleAiWikipediaLinkRow = useCallback(
    async (index: number) => {
      await blogWikipediaLink.handleAiWikipediaLinkRow(index);
      await uploadAfterAiseo([index]);
    },
    [blogWikipediaLink, uploadAfterAiseo],
  );

  const handleAiWikipediaLinkAll = useCallback(
    () => runAiseoBulkAll(() => blogWikipediaLink.handleAiWikipediaLinkAll()),
    [runAiseoBulkAll, blogWikipediaLink],
  );

  const handleAiInContentImageRow = useCallback(
    async (index: number) => {
      await blogInContentImage.handleAiInContentImageRow(index);
      await uploadAfterAiseo([index]);
    },
    [blogInContentImage, uploadAfterAiseo],
  );

  const handleAiInContentImageAll = useCallback(
    () => runAiseoBulkAll(() => blogInContentImage.handleAiInContentImageAll()),
    [runAiseoBulkAll, blogInContentImage],
  );

  const handleAiFeaturedImageAll = useCallback(
    () => runAiseoBulkAll(() => pipelines.handleAiFeaturedImageAll()),
    [runAiseoBulkAll, pipelines],
  );

  const handleFindLocalImageAll = useCallback(
    () => runAiseoBulkAll(() => blogInContentImage.handleFindLocalImageAll()),
    [runAiseoBulkAll, blogInContentImage],
  );

  const handleGenerateLocalImageAll = useCallback(
    async (...args: Parameters<typeof blogInContentImage.handleGenerateLocalImageAll>) => {
      await runAiseoBulkAll(() => blogInContentImage.handleGenerateLocalImageAll(...args));
    },
    [runAiseoBulkAll, blogInContentImage],
  );

  const handleAiAllMetaRow = useCallback(
    async (index: number) => {
      await pipelines.handleAiAllMetaRow(index);
      await uploadAfterAiseo([index]);
    },
    [pipelines, uploadAfterAiseo],
  );

  const handleAiAllMetaAll = useCallback(
    () => runAiseoBulkAll(() => pipelines.handleAiAllMetaAll()),
    [runAiseoBulkAll, pipelines],
  );

  const handleAiElementorSectionRow = useCallback(
    async (...args: Parameters<typeof elementorHarnessHandlers.handleAiElementorSectionRow>) => {
      await elementorHarnessHandlers.handleAiElementorSectionRow(...args);
      await uploadAfterAiseo([args[0]]);
    },
    [elementorHarnessHandlers, uploadAfterAiseo],
  );

  const handleAiElementorSectionHeaderRow = useCallback(
    async (...args: Parameters<typeof elementorHarnessHandlers.handleAiElementorSectionHeaderRow>) => {
      await elementorHarnessHandlers.handleAiElementorSectionHeaderRow(...args);
      await uploadAfterAiseo([args[0]]);
    },
    [elementorHarnessHandlers, uploadAfterAiseo],
  );

  const handleAiElementorSectionContentRow = useCallback(
    async (...args: Parameters<typeof elementorHarnessHandlers.handleAiElementorSectionContentRow>) => {
      await elementorHarnessHandlers.handleAiElementorSectionContentRow(...args);
      await uploadAfterAiseo([args[0]]);
    },
    [elementorHarnessHandlers, uploadAfterAiseo],
  );

  const handleAiElementorSectionLinkRow = useCallback(
    async (...args: Parameters<typeof elementorHarnessHandlers.handleAiElementorSectionLinkRow>) => {
      await elementorHarnessHandlers.handleAiElementorSectionLinkRow(...args);
      await uploadAfterAiseo([args[0]]);
    },
    [elementorHarnessHandlers, uploadAfterAiseo],
  );

  const handleAiElementorFullPageRow = useCallback(
    async (index: number) => {
      await elementorHarnessHandlers.handleAiElementorFullPageRow(index);
      await uploadAfterAiseo([index]);
    },
    [elementorHarnessHandlers, uploadAfterAiseo],
  );

  const handleContentCleanupRow = useCallback(
    async (index: number) => {
      await contentCleanup.handleContentCleanupRow(index);
      await uploadAfterAiseo([index]);
    },
    [contentCleanup, uploadAfterAiseo],
  );

  const handleContentCleanupAll = useCallback(
    () => runAiseoBulkAll(() => contentCleanup.handleContentCleanupAll()),
    [runAiseoBulkAll, contentCleanup],
  );

  return {
    site: props.site,
    ...base,
    overviewSitemapLoadBusy: sitemapLoad.overviewSitemapLoadBusy,
    handleLoadSitemap: sitemapLoad.handleLoadSitemap,
    handleRefreshSitemap: () =>
      sitemapLoad.handleLoadSitemap({ force: true, silent: false, applyToUi: true }),
    ...scrapeWp,
    ...aiCsv,
    ...kwDates,
    handleKeywordsAll,
    handleAiKeywordRow,
    ...faq,
    ...dfs,
    ...pipelines,
    ...bulkSeoWp,
    ...blogHeaders,
    ...contentCleanup,
    ...blogLinks,
    ...blogWikipediaLink,
    ...blogOverview,
    ...blogAnswer,
    ...blogScenario,
    ...blogInContentImage,
    handleAiTitleRow,
    handleAiTitleAll,
    handleAiMetaRow,
    handleAiMetaAll,
    handleAiUrlRow,
    handleAiUrlAll,
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    handleAiFaqRowAll,
    handleAiFaqAll,
    handleAiAllMetaRow,
    handleAiAllMetaAll,
    handleAiAnswerRow,
    handleAiAnswerAll,
    handleAiOverviewRow,
    handleAiOverviewAll,
    handleAiScenarioRow,
    handleAiScenarioAll,
    handleAiHeadersRow,
    handleAiHeadersAll,
    handleAiLinksRow,
    handleAiLinksAll,
    handleAiWikipediaLinkRow,
    handleAiWikipediaLinkAll,
    handleAiInContentImageRow,
    handleAiInContentImageAll,
    handleAiFeaturedImageAll,
    handleFindLocalImageAll,
    handleGenerateLocalImageAll,
    handleContentCleanupRow,
    handleContentCleanupAll,
    handleAiElementorSectionRow,
    handleAiElementorSectionHeaderRow,
    handleAiElementorSectionContentRow,
    handleAiElementorSectionLinkRow,
    handleAiElementorFullPageRow,
    hydrateElementorRowAtIndex: elementorHarnessHandlers.hydrateRowAtIndex,
  };
}

export type OverviewTabController = ReturnType<typeof useOverviewTabController>;

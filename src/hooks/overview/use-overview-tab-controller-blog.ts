import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { useOverviewTabBlogHeaders } from "@/hooks/overview/use-overview-tab-blog-headers";
import { useOverviewTabContentCleanup } from "@/hooks/overview/use-overview-tab-content-cleanup";
import { useOverviewTabBlogLinks } from "@/hooks/overview/use-overview-tab-blog-links";
import { useOverviewTabBlogWikipediaLink } from "@/hooks/overview/use-overview-tab-blog-wikipedia-link";
import { useOverviewTabBlogOverview } from "@/hooks/overview/use-overview-tab-blog-overview";
import { useOverviewTabBlogAnswer } from "@/hooks/overview/use-overview-tab-blog-answer";
import { useOverviewTabBlogScenario } from "@/hooks/overview/use-overview-tab-blog-scenario";
import { useOverviewTabBlogInContentImage } from "@/hooks/overview/use-overview-tab-blog-in-content-image";
import type { useOverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { useOverviewTabResearchPipelines } from "@/hooks/overview/use-overview-tab-research-pipelines";
import type { useOverviewTabFaqHandlers } from "@/hooks/overview/use-overview-tab-faq-handlers";
import type { useOverviewTabAiTitleHarness } from "@/hooks/overview/use-overview-tab-ai-title-harness";
import type { useOverviewTabAiMetaHarness } from "@/hooks/overview/use-overview-tab-ai-meta-harness";
import type { useOverviewTabAiUrlHarness } from "@/hooks/overview/use-overview-tab-ai-url-harness";
import type { useOverviewTabKeywordsHarness } from "@/hooks/overview/use-overview-tab-keywords-harness";
import {
  uploadOverviewAiseoWrittenRows,
  type AiseoAfterRowWriteFn,
} from "@/lib/overview/overview-aiseo-after-upload";
import { useCallback, useRef } from "react";

type BlogArgs = {
  props: OverviewTabContentProps;
  base: ReturnType<typeof useOverviewTabBase>;
  aiseoUploadAfterRowWrite: AiseoAfterRowWriteFn;
  pipelines: ReturnType<typeof useOverviewTabResearchPipelines>;
  faq: ReturnType<typeof useOverviewTabFaqHandlers>;
  aiTitleHarness: ReturnType<typeof useOverviewTabAiTitleHarness>;
  aiMetaHarness: ReturnType<typeof useOverviewTabAiMetaHarness>;
  aiUrlHarness: ReturnType<typeof useOverviewTabAiUrlHarness>;
  keywordsHarness: ReturnType<typeof useOverviewTabKeywordsHarness>;
};

export function useOverviewTabControllerBlog(args: BlogArgs) {
  const { props, base, aiseoUploadAfterRowWrite, pipelines, faq, aiTitleHarness, aiMetaHarness, aiUrlHarness, keywordsHarness } = args;
  const { site } = props;

  const bindingsRef = useRef(base.bindings);
  bindingsRef.current = base.bindings;

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
    [base],
  );

  const handleAiAnswerRow = useCallback(
    async (index: number) => {
      await blogAnswer.handleAiAnswerRow(index);
      base.syncRowsFromRef();
    },
    [blogAnswer, base],
  );

  const handleAiAnswerAll = useCallback(
    () => runAiseoBulkAll(() => blogAnswer.handleAiAnswerAll()),
    [runAiseoBulkAll, blogAnswer],
  );

  const handleAiOverviewRow = useCallback(
    async (index: number) => {
      await blogOverview.handleAiOverviewRow(index);
      base.syncRowsFromRef();
    },
    [blogOverview, base],
  );

  const handleAiOverviewAll = useCallback(
    () => runAiseoBulkAll(() => blogOverview.handleAiOverviewAll()),
    [runAiseoBulkAll, blogOverview],
  );

  const handleAiScenarioRow = useCallback(
    async (index: number) => {
      await blogScenario.handleAiScenarioRow(index);
      base.syncRowsFromRef();
    },
    [blogScenario, base],
  );

  const handleAiScenarioAll = useCallback(
    () => runAiseoBulkAll(() => blogScenario.handleAiScenarioAll()),
    [runAiseoBulkAll, blogScenario],
  );

  const handleAiHeadersRow = useCallback(
    async (index: number) => {
      await blogHeaders.handleAiHeadersRow(index);
      await uploadAfterAiseo([index]);
      base.syncRowsFromRef();
    },
    [blogHeaders, uploadAfterAiseo, base],
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
      base.syncRowsFromRef();
    },
    [blogLinks, uploadAfterAiseo, base],
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
    blogHeaders,
    contentCleanup,
    blogLinks,
    blogWikipediaLink,
    blogOverview,
    blogAnswer,
    blogScenario,
    blogInContentImage,
    handleAiTitleRow,
    handleAiTitleAll,
    handleAiMetaRow,
    handleAiMetaAll,
    handleAiUrlRow,
    handleAiUrlAll,
    handleKeywordsAll,
    handleAiKeywordRow,
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
  };
}

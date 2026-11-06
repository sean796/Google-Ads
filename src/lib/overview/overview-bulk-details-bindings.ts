import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  FEATURED_IMAGE_PIPELINE_TITLES,
  META_BULK_MICRO_LABELS,
} from "@/components/overview/overview-tab-constants";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import {
  buildContentOptimizerBulkGeneratorDetailsProps,
  buildContentOptimizerBulkMicroSnapshot,
  contentOptimizerHeaderProgressFromRun,
  contentOptimizerLiveStatus,
  generatedFilesForUrl,
  isContentOptimizerBulkRun,
  mergeContentOptimizeHarnessSections,
  type ContentOptimizerBulkGeneratorBindingsInput,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { isAiseoFileSlotRunKind } from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  resolveContentOptimizePipelineTitlesForRow,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { resolveContentPrepBatchSectionTitles } from "@/lib/overview/overview-content-prep-harness-sections";
import { RESEARCH_HARNESS_PIPELINE_TITLES } from "@/lib/overview/overview-research-harness-sections";
import { isResearchBatchState, overviewBatchIsResearchContext } from "@/lib/overview/overview-bulk-pipeline-titles";
import { HEADERS_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-headers-harness-sections";
import { OVERVIEW_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-overview-harness-sections";
import { IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import { WP_UPLOAD_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-wp-upload-harness-sections";
import { buildOverviewWpUploadBatchDetailsProps } from "@/lib/overview/overview-wp-upload-batch-details";
import { linksHarnessSectionTitle } from "@/lib/overview/overview-blog-links-harness-sections";
import type { BlogLinksCatalogRow } from "@/lib/overview/overview-blog-links-catalog";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import {
  activeMicroActionKey,
  buildOverviewMicroActionDetailsProps,
  overviewRowToCsvRowFromOverview,
} from "@/lib/overview/overview-bulk-details-micro";
import type {
  MultiSiteBulkDetailsInput,
  OverviewBulkDetailsBindingsInput,
} from "@/lib/overview/overview-bulk-details-bindings-types";

export type {
  MultiSiteBulkDetailsInput,
  OverviewBulkDetailsBindingsInput,
} from "@/lib/overview/overview-bulk-details-bindings-types";
export { buildOverviewMicroActionDetailsProps } from "@/lib/overview/overview-bulk-details-micro";

export {
  buildContentOptimizerBulkGeneratorDetailsProps,
  buildContentOptimizerBulkMicroSnapshot,
  contentOptimizerHeaderProgressFromRun,
  contentOptimizerLiveStatus,
  isContentOptimizerBulkRun,
  mergeContentOptimizeHarnessSections,
  type ContentOptimizerBulkGeneratorBindingsInput,
};

export function isOverviewBulkDetailsRun(
  batchState: BulkOptimizationState | null | undefined,
): boolean {
  return Boolean(batchState?.urls?.length);
}

const LINKS_PIPELINE_TITLES = [
  linksHarnessSectionTitle({} as BlogLinksCatalogRow, 0),
  linksHarnessSectionTitle({} as BlogLinksCatalogRow, 1),
] as const;

export function resolveOverviewBulkPipelineTitles(
  runKind: BulkOptimizationState["runKind"] | undefined,
  bulkState?: BulkOptimizationState,
  overviewRows?: import("@/components/overview/overview-meta-row-types").OverviewRow[],
): readonly string[] | undefined {
  if (
    runKind === "research" ||
    isResearchBatchState(bulkState ?? (runKind ? { runKind } : null)) ||
    overviewBatchIsResearchContext(bulkState, overviewRows)
  ) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }
  if (
    bulkState?.currentStepProgress?.harnessPlannedSectionCount === RESEARCH_HARNESS_PIPELINE_TITLES.length &&
    (bulkState.currentStep?.includes("Research") ||
      bulkState.currentStepProgress?.message?.includes("Research"))
  ) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }

  if (bulkState && isContentOptimizerBulkRun(bulkState)) {
    const currentUrl = bulkState.currentUrl?.trim();
    const rowHarness =
      (currentUrl ? bulkState.urlHarnessSections?.[currentUrl] : undefined) ??
      Object.values(bulkState.urlHarnessSections ?? {})[0];
    const rowFiles = currentUrl
      ? generatedFilesForUrl(bulkState.urlGeneratedFiles, currentUrl)
      : undefined;
    const articleTitle =
      sanitizeHarnessArticleTitle(
        overviewRows?.find((row) => row.url?.trim() === currentUrl)?.title?.trim() ?? "",
        { pageUrl: currentUrl, keyword: bulkState.urlKeywords?.[currentUrl ?? ""] },
      );
    const mergedHarness = mergeContentOptimizeHarnessSections(
      rowHarness as BulkHarnessSectionUi[],
      rowFiles,
      articleTitle,
      currentUrl,
      bulkState.urlKeywords?.[currentUrl ?? ""],
      currentUrl && typeof bulkState.urlEntities?.[currentUrl] === "string"
        ? bulkState.urlEntities[currentUrl]
        : undefined,
    );
    return [...resolveContentOptimizePipelineTitlesForRow(mergedHarness, rowFiles)];
  }

  switch (runKind) {
    case undefined:
    case "content":
    case "extraText":
      return [...CONTENT_OPTIMIZE_PIPELINE_TITLES];
    case "aiHeaders":
      return [...HEADERS_HARNESS_SECTION_TITLES];
    case "aiLinks":
      return [...LINKS_PIPELINE_TITLES];
    case "aiTitle":
    case "aiMeta":
    case "aiUrl":
    case "contentKw":
    case "entityKw":
      return undefined;
    case "aiAnswer":
      return ["Answer"];
    case "aiOverview":
      return [...OVERVIEW_HARNESS_SECTION_TITLES];
    case "aiScenario":
      return ["Scenario"];
    case "aiInContentImage":
      return [...IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES];
    case "aiFeaturedImage":
      return [...FEATURED_IMAGE_PIPELINE_TITLES];
    case "wpUpload":
      return [...WP_UPLOAD_HARNESS_SECTION_TITLES];
    case "contentCleanup":
      return ["Clean Up"];
    case "aiWikipediaLink":
      return ["Wikipedia link"];
    case "aiAllMeta":
    case "aiFaq":
      return undefined;
    default:
      if (bulkState?.batchPrepHarnessSections?.length) {
        return resolveContentPrepBatchSectionTitles(
          bulkState.runKind === "content" && Boolean(bulkState.urlEntities),
        );
      }
      return undefined;
  }
}

function attachInventoryProps(
  props: BulkGeneratorDetailsPanelProps,
  input: Pick<
    OverviewBulkDetailsBindingsInput,
    "sitemapInventoryLinks" | "siteKwHostedLink" | "sitemapInventoryLoading" | "sitemapSource"
  >,
  pipelineSectionTitles?: readonly string[],
): BulkGeneratorDetailsPanelProps {
  return {
    ...props,
    sitemapInventoryLinks: input.sitemapInventoryLinks,
    siteKwHostedLink: input.siteKwHostedLink ?? null,
    sitemapInventoryLoading: input.sitemapInventoryLoading ?? false,
    pipelineSectionTitles: pipelineSectionTitles ? [...pipelineSectionTitles] : props.pipelineSectionTitles,
    entitySapRowDisplay: input.sitemapSource === "sap",
  };
}

export function buildOverviewWarmInventoryDetailsProps(
  input: Pick<
    OverviewBulkDetailsBindingsInput,
    | "sitemapInventoryLinks"
    | "siteKwHostedLink"
    | "sitemapInventoryLoading"
    | "sitemapSource"
    | "overviewRows"
    | "gridPageIndex"
  >,
): BulkGeneratorDetailsPanelProps {
  const allRows = input.overviewRows;
  const paginate = input.gridPageIndex != null && contentOptimizerBulkUsesPagination(allRows.length);
  const pageStart = paginate ? Math.max(0, input.gridPageIndex ?? 0) * CONTENT_OPTIMIZER_BULK_PAGE_SIZE : 0;
  const pageRows = paginate
    ? allRows.slice(pageStart, pageStart + CONTENT_OPTIMIZER_BULK_PAGE_SIZE)
    : allRows;
  const displayRows = pageRows.map((row) => overviewRowToCsvRowFromOverview(row));
  return {
    variant: "csv",
    workspaceBusy: Boolean(input.sitemapInventoryLoading),
    headerProgress: null,
    isProcessing: false,
    status: "",
    harnessSections: [],
    harnessByRow: new Map(),
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: null,
    currentRow: -1,
    totalRows: allRows.length,
    displayRows,
    detailsPageStart: pageStart,
    postDestination: "wordpress",
    wpConfig: null,
    sitemapInventoryLinks: input.sitemapInventoryLinks,
    siteKwHostedLink: input.siteKwHostedLink ?? null,
    sitemapInventoryLoading: input.sitemapInventoryLoading ?? false,
    entitySapRowDisplay: input.sitemapSource === "sap",
    filesByRow: new Map(),
  };
}

export function buildOverviewBulkGeneratorDetailsProps(
  input: OverviewBulkDetailsBindingsInput,
  workspaceBusy: boolean,
): BulkGeneratorDetailsPanelProps | null {
  if (input.bulkState?.runKind === "wpUpload") {
    return attachInventoryProps(
      buildOverviewWpUploadBatchDetailsProps(input, workspaceBusy),
      input,
    );
  }

  if (input.bulkState?.runKind === "aiFeaturedImage") {
    const slice = input.bulkActionProgress?.aiFeaturedImage ?? {
      total: input.bulkState.urls.length,
      completed: input.bulkState.urls.length,
      statusMessage: META_BULK_MICRO_LABELS.aiFeaturedImage,
    };
    return buildOverviewMicroActionDetailsProps(input, "aiFeaturedImage", slice);
  }

  const researchSlice = input.bulkActionProgress?.research;
  const researchProgressActive = Boolean(
    researchSlice && researchSlice.total > 0 && researchSlice.completed < researchSlice.total,
  );
  const researchBatchActive =
    overviewBatchIsResearchContext(input.bulkState, input.overviewRows) ||
    researchProgressActive;
  const microKey = activeMicroActionKey(input.bulkActionProgress);
  const bodyFileSlotBatch =
    isOverviewBulkDetailsRun(input.bulkState) &&
    isAiseoFileSlotRunKind(input.bulkState.runKind);
  const optimizeAllUsesBlogPipeline =
    microKey === "optimizeAll" && isOverviewBulkDetailsRun(input.bulkState);
  if (
    !researchBatchActive &&
    !bodyFileSlotBatch &&
    !optimizeAllUsesBlogPipeline &&
    microKey &&
    input.bulkActionProgress?.[microKey]
  ) {
    return buildOverviewMicroActionDetailsProps(input, microKey, input.bulkActionProgress[microKey]!);
  }

  if (!isOverviewBulkDetailsRun(input.bulkState)) {
    return null;
  }

  const base = buildContentOptimizerBulkGeneratorDetailsProps(input, workspaceBusy);
  const pipelineSectionTitles = resolveOverviewBulkPipelineTitles(
    base.runKind ?? input.bulkState.runKind,
    input.bulkState,
    input.overviewRows,
  );
  return attachInventoryProps(base, input, pipelineSectionTitles);
}

export function buildOverviewBulkMicroSnapshot(
  input: OverviewBulkDetailsBindingsInput,
): MetaBulkMicroSnapshot | null {
  if (!isOverviewBulkDetailsRun(input.bulkState)) {
    return null;
  }
  return buildContentOptimizerBulkMicroSnapshot(input);
}

export function overviewBulkDetailsCanOpenFromWarm(
  _sitemapInventoryLinks: PromptBulkSitemapInventoryLink[],
  _gscHostedLink: BulkGscKeywordsHostedLink | null,
  _sitemapInventoryLoading: boolean,
): boolean {
  return true;
}

export function overviewRowByUrlMap(rows: OverviewRow[]): Map<string, OverviewRow> {
  const map = new Map<string, OverviewRow>();
  for (const row of rows) {
    const key = normalizePageUrlKey(row.url);
    if (key) map.set(key, row);
  }
  return map;
}

export function buildMultiSiteBulkGeneratorDetailsProps(
  input: MultiSiteBulkDetailsInput,
  workspaceBusy: boolean,
): BulkGeneratorDetailsPanelProps | null {
  if (!isOverviewBulkDetailsRun(input.bulkState)) return null;
  const base = buildContentOptimizerBulkGeneratorDetailsProps(input, workspaceBusy);
  const pipelineSectionTitles = resolveOverviewBulkPipelineTitles(
    base.runKind ?? input.bulkState.runKind,
    input.bulkState,
    input.overviewRows,
  );
  return attachInventoryProps(
    base,
    {
      sitemapInventoryLinks: input.sitemapInventoryLinks,
      siteKwHostedLink: input.siteKwHostedLink,
      sitemapInventoryLoading: input.sitemapInventoryLoading,
      sitemapSource: undefined,
    },
    pipelineSectionTitles,
  );
}

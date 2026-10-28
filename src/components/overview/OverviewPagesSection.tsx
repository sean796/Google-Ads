import React, { useMemo } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  MetaOptimizerPageRowDetails,
  type MetaOptimizerPageRowDetailsProps,
} from "@/components/overview/MetaOptimizerPageRowDetails";
import { MetaOptimizerPageRowCompact } from "@/components/overview/MetaOptimizerPageRowCompact";
import { overviewGridPageSlice } from "@/components/overview/OverviewGridPagination";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  createEmptyOverviewRow,
} from "@/lib/overview/overview-row-helpers";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  CONTENT_OPTIMIZER_PAGE_ROW_GRID_CLASS,
  CONTENT_OPTIMIZER_PAGE_ROW_SELECT_CELL,
  OVERVIEW_GRID_VISIBLE_ROW_COUNT,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { isOverviewRowBulkActive, isOverviewBulkWorkerActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { Checkbox } from "@/components/ui/checkbox";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import {
  overviewDisplayRowSelectionKeys,
  overviewPageSelectionState,
} from "@/lib/overview/overview-row-selection";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { cn } from "@/lib/utils";

function metaOptimizerPipelineBusy(row: OverviewRow): boolean {
  return (
    row.status === "research-faq" ||
    row.status === "ai-title" ||
    row.status === "ai-meta" ||
    row.status === "ai-faq" ||
    row.status === "ai-headers" ||
    row.status === "ai-links" ||
    row.status === "ai-wikipedia-link" ||
    row.status === "ai-answer" ||
    row.status === "ai-overview" ||
    row.status === "ai-scenario" ||
    row.status === "ai-in-content-image" ||
    row.status === "ai-focus-kw" ||
    row.status === "uploading" ||
    row.status === "scraping"
  );
}

export interface OverviewPagesSectionProps {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  rows: OverviewRow[];
  displayRows: OverviewRow[];
  selectedUrlKeys?: Set<string>;
  toggleSelectedUrlKey: (url: string, shiftKey?: boolean) => void;
  toggleSelectPageRows: (pageRows: readonly { url: string }[]) => void;
  gridPageIndex: number;
  wpTitlesByUrl: Record<string, string>;
  expandedPageUrl: string | null;
  toggleExpandedPageUrl: (url: string) => void;
  bindings: Record<string, OverviewBinding>;
  opt: MetaOptimizerPageRowDetailsProps["opt"];
  bulkAiFaqSeedCount: number;
  expandedResearchBriefUrl: string | null;
  setExpandedResearchBriefUrl: MetaOptimizerPageRowDetailsProps["setExpandedResearchBriefUrl"];
  expandedContentUrl: string | null;
  setExpandedContentUrl: MetaOptimizerPageRowDetailsProps["setExpandedContentUrl"];
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  handleAiUrlRow: (index: number) => void;
  handleScrapeRow: (index: number) => Promise<void>;
  handleUpdateWordPressForRow: (
    row: OverviewRow,
    options?: { silent?: boolean; binding?: OverviewBinding; rowIndex?: number },
  ) => Promise<boolean>;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  handleOptimizeAllSerpRow: (index: number) => Promise<void>;
  handleAiAllMetaRow: (index: number) => Promise<void>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiKeywordRow: (index: number) => Promise<string | null>;
  handleSetDateToday: (rowIndex: number) => void;
  commitRowDateModifier: (rowIndex: number) => void;
  handleAiFaqRowAll: (
    rowIndex: number,
    rowOverride?: OverviewRow,
    options?: {
      silentToast?: boolean;
      skipFaqLoading?: boolean;
      onMicroStep?: () => void;
      seedQuestionCount?: number;
    },
  ) => Promise<void>;
  handleAiFaqQuestion: (rowIndex: number, faqIndex: number) => Promise<void>;
  handleAiFaqAnswer: (rowIndex: number, faqIndex: number) => Promise<void>;
  handleAiHeadersRow: (index: number) => Promise<void>;
  handleAiLinksRow: (index: number) => Promise<void>;
  handleAiWikipediaLinkRow: (index: number) => Promise<void>;
  handleAiAnswerRow: (index: number) => Promise<void>;
  handleAiOverviewRow: (index: number) => Promise<void>;
  handleAiScenarioRow: (index: number) => Promise<void>;
  handleAiInContentImageRow: (index: number) => Promise<void>;
}

export function OverviewPagesSection({
  site,
  sitemapSource,
  rows,
  displayRows,
  selectedUrlKeys,
  toggleSelectedUrlKey,
  toggleSelectPageRows,
  gridPageIndex,
  wpTitlesByUrl,
  expandedPageUrl,
  toggleExpandedPageUrl,
  bindings,
  opt,
  bulkAiFaqSeedCount,
  expandedResearchBriefUrl,
  setExpandedResearchBriefUrl,
  expandedContentUrl,
  setExpandedContentUrl,
  updateRow,
  handleAiUrlRow,
  handleScrapeRow,
  handleUpdateWordPressForRow,
  handleDataForSeoResearch,
  handleOptimizeAllSerpRow,
  handleAiAllMetaRow,
  handleAiTitleRow,
  handleAiMetaRow,
  handleAiKeywordRow,
  handleSetDateToday,
  commitRowDateModifier,
  handleAiFaqRowAll,
  handleAiFaqQuestion,
  handleAiFaqAnswer,
  handleAiHeadersRow,
  handleAiLinksRow,
  handleAiWikipediaLinkRow,
  handleAiAnswerRow,
  handleAiOverviewRow,
  handleAiScenarioRow,
  handleAiInContentImageRow,
}: OverviewPagesSectionProps) {
  const batchKey = `${site.id}-batch`;
  const batchBulkState = opt.bulkOptimizationState[batchKey];
  const batchRunning = isOverviewBulkWorkerActive(opt.isOptimizingContent, batchKey, site.id, batchBulkState);

  const pageRows = useMemo(
    () => overviewGridPageSlice(displayRows, gridPageIndex, OVERVIEW_GRID_VISIBLE_ROW_COUNT),
    [displayRows, gridPageIndex],
  );
  const pageKeys = useMemo(() => overviewDisplayRowSelectionKeys(pageRows), [pageRows]);
  const { allSelected, someSelected } = overviewPageSelectionState(selectedUrlKeys, pageKeys);

  const gridSlots = useMemo(() => {
    return Array.from({ length: OVERVIEW_GRID_VISIBLE_ROW_COUNT }, (_, i) => pageRows[i] ?? createEmptyOverviewRow());
  }, [pageRows]);

  const rowDetailsProps = {
    site,
    sitemapSource,
    opt,
    bindings,
    bulkAiFaqSeedCount,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedContentUrl,
    setExpandedContentUrl,
    updateRow,
    handleAiUrlRow,
    handleScrapeRow,
    handleUpdateWordPressForRow,
    handleDataForSeoResearch,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiKeywordRow,
    handleSetDateToday,
    commitRowDateModifier,
    handleAiFaqRowAll,
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    handleAiHeadersRow,
    handleAiLinksRow,
    handleAiWikipediaLinkRow,
    handleAiAnswerRow,
    handleAiOverviewRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
  } satisfies Omit<
    MetaOptimizerPageRowDetailsProps,
    | "row"
    | "rowIndex"
    | "metaOptimizerPipelineBusy"
    | "placeholder"
    | "accordionBody"
    | "isSelected"
    | "onToggleSelect"
    | "onCollapse"
  >;

  const renderPageRow = (row: OverviewRow, index: number, stripeIndex: number, placeholder = false) => {
    const busy = metaOptimizerPipelineBusy(row);
    const isActiveOptimize =
      isOverviewRowBulkActive(row.url, batchBulkState, batchRunning) ||
      row.status === "ai-faq" ||
      row.status === "ai-scenario" ||
      row.status === "ai-wikipedia-link";
    const panelId = `neo-pulse-meta-panel-${index}`;
    const rowUrlKey = normalizePageUrlKey(row.url);
    const isExpanded =
      !placeholder &&
      Boolean(rowUrlKey) &&
      normalizePageUrlKey(expandedPageUrl ?? "") === rowUrlKey;

    const isSelected = Boolean(rowUrlKey) && Boolean(selectedUrlKeys?.has(rowUrlKey));
    const onToggleSelect = (shiftKey?: boolean) => toggleSelectedUrlKey(row.url, shiftKey);

    if (!isExpanded) {
      return (
        <MetaOptimizerPageRowCompact
          row={row}
          wpTitlesByUrl={wpTitlesByUrl}
          isExpanded={false}
          stripeIndex={stripeIndex}
          isActiveOptimize={isActiveOptimize}
          placeholder={placeholder}
          panelId={panelId}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
          onToggle={() => toggleExpandedPageUrl(row.url)}
        />
      );
    }

    return (
      <div
        id={panelId}
        className={contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize })}
      >
        <MetaOptimizerPageRowDetails
          {...rowDetailsProps}
          row={row}
          rowIndex={index}
          metaOptimizerPipelineBusy={busy}
          accordionBody
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
          onCollapse={() => toggleExpandedPageUrl(row.url)}
        />
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
        <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
          <div
            className={cn(
              contentOptimizerRowStripeClass(0),
              CONTENT_OPTIMIZER_PAGE_ROW_GRID_CLASS,
            )}
          >
            <div className={CONTENT_OPTIMIZER_PAGE_ROW_SELECT_CELL}>
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => toggleSelectPageRows(pageRows)}
                disabled={pageKeys.length === 0}
                aria-label={allSelected ? "Deselect this page" : "Select this page"}
                className={DASHBOARD_LIST_CHECKBOX_CLASS}
              />
            </div>
          </div>
        </div>
        {gridSlots.map((row, stripeIndex) => {
          const hasUrl = Boolean(row.url?.trim());
          const rowKey = hasUrl
            ? normalizePageUrlKey(row.url)
            : `empty-${gridPageIndex}-${stripeIndex}`;
          const index = hasUrl
            ? rows.findIndex((r) => normalizePageUrlKey(r.url) === normalizePageUrlKey(row.url))
            : -1;
          return (
            <div key={rowKey} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
              {renderPageRow(row, index, stripeIndex, !hasUrl || index < 0)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

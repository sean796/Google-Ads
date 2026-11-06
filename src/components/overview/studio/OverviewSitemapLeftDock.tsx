import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import { OverviewBulkClusterFlyout } from "@/components/overview/overview-tab/OverviewBulkClusterFlyout";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import { isOverviewRowOptimizationActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { buildOverviewBulkActionClusters } from "@/lib/overview/overview-bulk-action-clusters";
import {
  overviewDisplayRowSelectionKeys,
  overviewPageSelectionState,
} from "@/lib/overview/overview-row-selection";
import {
  isOverviewSapSourceAvailable,
  OVERVIEW_SITEMAP_SOURCE_LABELS,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import {
  bulkStudioRowPathLabel,
  metaDisplayTitle,
  overviewRowUrlPathLabel,
  overviewTitlePrimarySegment,
} from "@/lib/overview/overview-tab-display";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { cn } from "@/lib/utils";
import { bulkGeneratorSapPathConfigError } from "@/lib/bulk/bulk-generator-studio-rows";
import { rowIndexForOverviewUrl } from "@/lib/bulk/bulk-generator-overview-row-bridge";
import { BulkStudioTitleUrlOptimizingBlock } from "@/components/keyword-research/bulk/BulkStudioTitleUrlOptimizingBlock";
import { Field, RowButton, SelectField, Checkbox } from "@/ui";
import type { OverviewSitemapLeftDockProps } from "@/components/overview/studio/overview-sitemap-left-dock-types";
import {
  LEFT_DOCK_DEFAULT_WIDTH,
  useOverviewSitemapLeftDockWidth,
} from "@/components/overview/studio/use-overview-sitemap-left-dock-width";
import { OverviewSitemapLeftDockPlaceholder } from "@/components/overview/studio/OverviewSitemapLeftDockPlaceholder";

export function OverviewSitemapLeftDock({
  ctrl: c,
  activeUrl,
  optimizingRowUrl,
  batchBulkState,
  batchRunning = false,
  onSelectUrl,
  bulkWorkspaceBusy,
  optimizerSection,
  onOptimizerSectionChange,
  bulkGeneratorDock,
}: OverviewSitemapLeftDockProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const {
    dockWidth,
    isResizing,
    finishResize,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
  } = useOverviewSitemapLeftDockWidth();
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const hasDetectedSitemaps = Boolean(c.site?.sitemaps?.mainSitemapUrl);
  const isBulkGeneratorDock = Boolean(bulkGeneratorDock);


  const sourceOptions = useMemo(
    () =>
      (["pages", "posts", "sap"] as OverviewSitemapSource[])
        .filter((source) => source !== "sap" || isOverviewSapSourceAvailable(c.site))
        .map((source) => ({
          id: source,
          label: OVERVIEW_SITEMAP_SOURCE_LABELS[source],
        })),
    [c.site],
  );

  const sitemapSelectValue = useMemo(() => {
    if (sourceOptions.some((opt) => opt.id === c.sitemapSource)) {
      return c.sitemapSource;
    }
    return sourceOptions[0]?.id ?? "pages";
  }, [c.sitemapSource, sourceOptions]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return c.displayRows;
    return c.displayRows.filter((row) => {
      const title = (
        row.title ||
        row.aiTitle ||
        c.wpTitlesByUrl[row.url] ||
        ""
      ).toLowerCase();
      const url = (row.url || "").toLowerCase();
      const kw = (row.focusKeyword || "").toLowerCase();
      return title.includes(q) || url.includes(q) || kw.includes(q);
    });
  }, [c.displayRows, c.wpTitlesByUrl, searchQuery]);

  const pageKeys = useMemo(() => overviewDisplayRowSelectionKeys(filteredRows), [filteredRows]);
  const { allSelected, someSelected } = overviewPageSelectionState(
    c.selectedUrlKeys,
    pageKeys,
  );

  const clusters = useMemo(
    () =>
      buildOverviewBulkActionClusters(c, {
        hasDetectedSitemaps,
        bulkWorkspaceBusy,
      }),
    [c, hasDetectedSitemaps, bulkWorkspaceBusy],
  );

  const activeUrlKey = normalizePageUrlKey(activeUrl ?? "");

  // Keep the in-flight optimization row visible without changing the open document
  useEffect(() => {
    if (!optimizingRowUrl) return;
    const key = normalizePageUrlKey(optimizingRowUrl);
    if (!key) return;
    const el = rowRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [optimizingRowUrl]);

  const generatorSelectableIndices = useMemo(() => {
    if (!bulkGeneratorDock?.promptSelection) return [];
    return filteredRows
      .map((row) => rowIndexForOverviewUrl(c.displayRows, row.url))
      .filter((index, i) => {
        if (index < 0) return false;
        const row = filteredRows[i];
        return row.title !== "New blog slot";
      });
  }, [bulkGeneratorDock?.promptSelection, filteredRows, c.displayRows]);

  const generatorAllSelected =
    Boolean(bulkGeneratorDock?.promptSelection) &&
    generatorSelectableIndices.length > 0 &&
    generatorSelectableIndices.every((i) => bulkGeneratorDock!.selectedBlogIndices.has(i));
  const generatorSomeSelected =
    Boolean(bulkGeneratorDock?.promptSelection) &&
    !generatorAllSelected &&
    generatorSelectableIndices.some((i) => bulkGeneratorDock!.selectedBlogIndices.has(i));

  const toggleGeneratorSelectAll = () => {
    if (!bulkGeneratorDock?.promptSelection) return;
    if (generatorAllSelected) {
      bulkGeneratorDock.setSelectedBlogIndices(new Set());
      return;
    }
    bulkGeneratorDock.setSelectedBlogIndices(new Set(generatorSelectableIndices));
  };

  const toggleGeneratorRowSelected = (displayIndex: number) => {
    if (!bulkGeneratorDock?.promptSelection) return;
    bulkGeneratorDock.setSelectedBlogIndices((prev) => {
      const next = new Set(prev);
      if (next.has(displayIndex)) next.delete(displayIndex);
      else next.add(displayIndex);
      return next;
    });
  };

  return (
    <aside
      aria-label={isBulkGeneratorDock ? "Generator rows" : "Sitemap article navigator"}
      style={{ width: `${dockWidth}px` }}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
    >
      {/* Top Sitemap Scope & Mode Row (OPT parity for bulk + optimizer) */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 bg-black px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative flex min-w-0 flex-1 items-center">
            <SelectField placeholder="Sitemap source" tone="data" value={sitemapSelectValue} onValueChange={(v) => c.setSitemapSource(v as OverviewSitemapSource)} options={sourceOptions.map((opt) => ({ value: opt.id, label: opt.label }))} width="full" />
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-white/70" aria-hidden />
          </div>

        </div>
      </div>

      {/* Single Collapsed Action Strip: Checkbox + Items -> Search -> AISEO & WordPress */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-black px-2.5">
        {/* Left: Items Checkbox & Count */}
        <div className="flex shrink-0 items-center gap-1.5 pl-0.5">
          {isBulkGeneratorDock && bulkGeneratorDock!.promptSelection ? (
            <>
              <Checkbox
                checked={generatorAllSelected ? true : generatorSomeSelected ? "indeterminate" : false}
                onCheckedChange={toggleGeneratorSelectAll}
                disabled={generatorSelectableIndices.length === 0 || bulkWorkspaceBusy}
                aria-label={generatorAllSelected ? "Deselect all rows" : "Select all rows"}
                className={DASHBOARD_LIST_CHECKBOX_CLASS}
              />
              <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                {bulkGeneratorDock!.selectedBlogIndices.size > 0 ? (
                  <span className="font-medium text-primary">
                    {bulkGeneratorDock!.selectedBlogIndices.size} selected
                  </span>
                ) : (
                  <span>{filteredRows.length} items</span>
                )}
              </span>
            </>
          ) : (
            <>
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => c.toggleSelectPageRows(filteredRows)}
                disabled={pageKeys.length === 0}
                aria-label={allSelected ? "Deselect all visible articles" : "Select all visible articles"}
                className={DASHBOARD_LIST_CHECKBOX_CLASS}
              />
              <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                {c.selectedCount > 0 ? (
                  <span className="font-medium text-primary">{c.selectedCount} selected</span>
                ) : (
                  <span>{filteredRows.length} items</span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Center: Search Input */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <Field
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isBulkGeneratorDock
                ? `Search ${c.displayRows.length} items…`
                : `Search ${c.displayRows.length} articles...`
            }
            aria-label={isBulkGeneratorDock ? "Search generator rows" : "Search sitemap articles"}
          />
        </div>

        {/* Right: AISEO and WordPress Flyouts */}
        <div className="flex shrink-0 items-center gap-1">
          {clusters.map((cluster) => (
            <OverviewBulkClusterFlyout
              key={cluster.id}
              cluster={cluster}
              workspaceBusy={cluster.id === "wordpress" ? false : bulkWorkspaceBusy}
            />
          ))}
        </div>
      </div>

      {isBulkGeneratorDock && bulkGeneratorSapPathConfigError(c.site, c.sitemapSource) ? (
        <p className="border-b border-white/10 bg-black px-2.5 py-1 text-xs text-destructive" role="status">
          {bulkGeneratorSapPathConfigError(c.site, c.sitemapSource)}
        </p>
      ) : null}

      {/* Scrollable Sitemap Article List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredRows.length === 0 ? (
          (
            <div className="min-h-48" aria-hidden />
          )
        ) : (
          <ul
            className="divide-y divide-white/5"
            aria-label={isBulkGeneratorDock ? "Generator rows" : "Sitemap articles"}
          >
            {filteredRows.map((row, rowIdx) => {
              const displayIndex = rowIndexForOverviewUrl(c.displayRows, row.url);
              const rowKey = normalizePageUrlKey(row.url);
              const isSelected = Boolean(rowKey && c.selectedUrlKeys?.has(rowKey));
              const isActive = Boolean(rowKey && rowKey === activeUrlKey);
              const isBlogSlotLabel =
                /^Blog slot \d+$/i.test(row.title.trim()) ||
                row.title.trim().toLowerCase().startsWith("blog slot") ||
                row.title.trim() === "New blog slot";
              const isPromptPlaceholder =
                isBulkGeneratorDock && bulkGeneratorDock!.promptSelection && isBlogSlotLabel;
              const isPreIdeasPlaceholder =
                isBulkGeneratorDock && !bulkGeneratorDock!.promptSelection && isBlogSlotLabel;
              const isPromptSlotUrl = row.url.includes("__prompt-slot-");
              const isPlaceholderRow =
                isBlogSlotLabel ||
                isPromptSlotUrl ||
                Boolean(isPromptPlaceholder) ||
                Boolean(isPreIdeasPlaceholder);

              const slotMatch = row.title.match(/\d+/) || row.url.match(/__prompt-slot-(\d+)/);
              let slotNum = 1;
              if (slotMatch) {
                const parsed = parseInt(slotMatch[1] ?? slotMatch[0], 10);
                slotNum = row.url.includes("__prompt-slot-") && !row.title.match(/\d+/) ? parsed + 1 : parsed;
                if (slotNum === 0) slotNum = 1;
              } else if (displayIndex >= 0) {
                slotNum = displayIndex + 1;
              }

              const rawTitle = metaDisplayTitle(row, c.wpTitlesByUrl);
              const displayTitle =
                overviewTitlePrimarySegment(rawTitle) ||
                overviewRowUrlPathLabel(row.url) ||
                row.url;
              const pathLabel = isBulkGeneratorDock
                ? bulkStudioRowPathLabel(row)
                : overviewRowUrlPathLabel(row.url, { source: c.sitemapSource });
              const isRowStatusBusy =
                row.status !== "idle" &&
                row.status !== "error" &&
                row.status !== "scraping";
              const isOptimizingRow = isOverviewRowOptimizationActive(row.url, optimizingRowUrl);
              const isBusy = isOptimizingRow || (!optimizingRowUrl && isRowStatusBusy);
              const isTitleUrlOptimizing =
                Boolean(isBulkGeneratorDock && bulkGeneratorDock!.csvEnrichingTitlesUrls) &&
                !isPlaceholderRow;

              return (
                <li
                  key={`${rowKey || row.url}::${rowIdx}`}
                  ref={(el) => {
                    if (!rowKey) return;
                    if (el) rowRefs.current.set(rowKey, el);
                    else rowRefs.current.delete(rowKey);
                  }}
                  className={cn(
                    "group flex items-start gap-2.5 px-3.5 py-3 transition-colors",
                    isBusy
                      ? cn(
                          "border-l-2 border-semantic-analysis bg-semantic-analysis/25",
                          CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                        )
                      : isActive
                        ? "border-l-2 border-primary bg-ui-field"
                        : "bg-black hover:bg-black",
                  )}
                >
                  {isBulkGeneratorDock && bulkGeneratorDock!.promptSelection && !isPlaceholderRow && displayIndex >= 0 ? (
                    <div className="pt-1">
                      <Checkbox
                        checked={bulkGeneratorDock!.selectedBlogIndices.has(displayIndex)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleGeneratorRowSelected(displayIndex);
                        }}
                        aria-label={`Select ${displayTitle}`}
                        className={DASHBOARD_LIST_CHECKBOX_CLASS}
                      />
                    </div>
                  ) : !isBulkGeneratorDock && !isPlaceholderRow ? (
                    <div className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          c.toggleSelectedUrlKey(row.url, e.shiftKey, pageKeys);
                        }}
                        aria-label={`Select ${displayTitle}`}
                        className={DASHBOARD_LIST_CHECKBOX_CLASS}
                      />
                    </div>
                  ) : null}

                  <RowButton
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        c.toggleSelectedUrlKey(row.url, true, pageKeys);
                        return;
                      }
                      onSelectUrl(row.url);
                    }}
                  >
                    {isTitleUrlOptimizing ? (
                      <BulkStudioTitleUrlOptimizingBlock />
                    ) : isPlaceholderRow ? (
                      <OverviewSitemapLeftDockPlaceholder slotNum={slotNum} />
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                        <div className="flex w-full items-center justify-between gap-2">
                          <span
                            className={cn(
                              "text-base font-medium leading-snug",
                              isBusy
                                ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                                : isPreIdeasPlaceholder
                                  ? "text-muted-foreground"
                                  : isActive
                                    ? "text-primary"
                                    : "text-white group-hover:text-primary/90",
                            )}
                          >
                            {displayTitle}
                          </span>
                        </div>

                        <span
                          className={cn(
                            "w-full break-words text-base",
                            isBusy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                          )}
                        >
                          {pathLabel}
                        </span>
                      </div>
                    )}
                  </RowButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Right-edge click & drag resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sitemap list"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={() => finishResize(LEFT_DOCK_DEFAULT_WIDTH)}
        className={cn(
          "absolute inset-y-0 -right-1 z-20 w-2 cursor-ew-resize touch-none transition-colors hover:bg-primary/40",
          isResizing && "bg-primary/60",
        )}
      />
    </aside>
  );
}

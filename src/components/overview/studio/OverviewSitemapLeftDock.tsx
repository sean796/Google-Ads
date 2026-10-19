import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentOptimizerSectionPills } from "@/components/content-optimizer/ContentOptimizerSectionPills";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import { isOverviewRowOptimizationActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { OverviewBulkClusterFlyout } from "@/components/overview/overview-tab/OverviewBulkClusterFlyout";
import { OverviewErrorsFilterMenu } from "@/components/overview/overview-tab/OverviewErrorsFilterMenu";
import { OverviewSemrushCsvUpload } from "@/components/overview/overview-tab/OverviewSemrushCsvUpload";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
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
  metaDisplayTitle,
  overviewRowUrlPathLabel,
  overviewTitlePrimarySegment,
} from "@/lib/overview/overview-tab-display";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { cn } from "@/lib/utils";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
import {
  BULK_AUTO_GENERATE_TEMPLATE_FILENAME,
  BULK_AUTO_GENERATE_TEMPLATE_HREF,
} from "@/lib/bulk/bulk-auto-generate-template-columns";
import { BLOG_IMPORT_FILE_ACCEPT } from "@/lib/bulk/blog-import-parser";
import { rowIndexForOverviewUrl } from "@/lib/bulk/bulk-generator-overview-row-bridge";

export type OverviewSitemapLeftDockBulkGeneratorDock = {
  variant: BulkGeneratorStudioVariant;
  emptyListCopy: string;
  csvLoading?: boolean;
  importParsing?: boolean;
  importedFileName?: string | null;
  csvFileName?: string | null;
  onPickCsvFile?: (file: File | null) => void;
  onPickImportFiles?: (files: File[]) => void;
  promptSelection?: boolean;
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: (
    value: Set<number> | ((prev: Set<number>) => Set<number>),
  ) => void;
};

/** @deprecated Use OverviewSitemapLeftDockBulkGeneratorDock */
export type OverviewSitemapLeftDockGeneratorDock = OverviewSitemapLeftDockBulkGeneratorDock;

export interface OverviewSitemapLeftDockProps {
  ctrl: OverviewTabController;
  activeUrl: string | null;
  optimizingRowUrl?: string | null;
  batchBulkState?: BulkOptimizationState;
  batchRunning?: boolean;
  onSelectUrl: (url: string) => void;
  bulkWorkspaceBusy: boolean;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  bulkGeneratorDock?: OverviewSitemapLeftDockBulkGeneratorDock;
}

const LEFT_DOCK_WIDTH_KEY = "neo-pulse:overview-sitemap-left-dock-width:v1";
const LEFT_DOCK_DEFAULT_WIDTH = 320;
const LEFT_DOCK_MIN_WIDTH = 240;
const LEFT_DOCK_MAX_WIDTH = 680;

function clampLeftDockWidth(width: number): number {
  const maxByViewport =
    typeof window !== "undefined"
      ? Math.max(LEFT_DOCK_MIN_WIDTH, Math.min(LEFT_DOCK_MAX_WIDTH, window.innerWidth - 360))
      : LEFT_DOCK_MAX_WIDTH;
  return Math.round(Math.min(maxByViewport, Math.max(LEFT_DOCK_MIN_WIDTH, width)));
}

function readLeftDockWidth(): number {
  if (typeof window === "undefined") return LEFT_DOCK_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(LEFT_DOCK_WIDTH_KEY);
    if (!raw) return LEFT_DOCK_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return LEFT_DOCK_DEFAULT_WIDTH;
    return clampLeftDockWidth(parsed);
  } catch {
    return LEFT_DOCK_DEFAULT_WIDTH;
  }
}

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
  const [dockWidth, setDockWidth] = useState<number>(() => readLeftDockWidth());
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const csvInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const hasDetectedSitemaps = Boolean(c.site?.sitemaps?.mainSitemapUrl);
  const isBulkGeneratorDock = Boolean(bulkGeneratorDock);

  useEffect(() => {
    const onResize = () => setDockWidth((prev) => clampLeftDockWidth(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  const finishResize = useCallback((nextWidth: number) => {
    const clamped = clampLeftDockWidth(nextWidth);
    setDockWidth(clamped);
    try {
      window.localStorage.setItem(LEFT_DOCK_WIDTH_KEY, String(clamped));
    } catch {
      // Ignore storage errors
    }
    setIsResizing(false);
    dragRef.current = null;
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: dockWidth };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [dockWidth],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextWidth = drag.startWidth + (e.clientX - drag.startX);
    setDockWidth(clampLeftDockWidth(nextWidth));
  }, []);

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      finishResize(drag.startWidth + (e.clientX - drag.startX));
    },
    [finishResize],
  );

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
      className="relative flex h-full shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
    >
      {/* Top Sitemap Scope & Mode Row (OPT parity for bulk + optimizer) */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 bg-zinc-900 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Select
            value={c.sitemapSource}
            onValueChange={(val) => c.setSitemapSource(val as OverviewSitemapSource)}
          >
            <SelectTrigger
              aria-label="Sitemap source"
              className="h-8 min-w-[7.5rem] rounded-none border-0 bg-black px-2.5 text-base font-medium text-white focus-visible:ring-2 focus-visible:ring-primary"
            >
              <SelectValue placeholder="Sitemap source" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-0 bg-zinc-900 text-base text-white">
              {sourceOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="text-base">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={c.overviewSitemapLoadBusy || bulkWorkspaceBusy}
            title="Refresh sitemap inventory"
            aria-label="Refresh sitemap inventory"
            onClick={() => void c.handleRefreshSitemap()}
            className={cn(
              "h-8 w-8 shrink-0 rounded-none border-0 bg-black text-muted-foreground hover:bg-zinc-800 hover:text-white",
              c.overviewSitemapLoadBusy && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
            )}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <ContentOptimizerSectionPills
          activeSection={optimizerSection}
          onSectionChange={onOptimizerSectionChange}
          disabled={bulkWorkspaceBusy}
        />
      </div>

      {/* Inline Search + Error/SEMrush Filter Row */}
      <div className="flex flex-col gap-1.5 border-b border-white/10 bg-black p-2.5">
        {isBulkGeneratorDock && bulkGeneratorDock!.variant === "csv" ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                bulkGeneratorDock!.onPickCsvFile?.(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulkWorkspaceBusy || bulkGeneratorDock!.csvLoading}
              onClick={() => csvInputRef.current?.click()}
              className="h-8 rounded-none border-0 bg-zinc-900 px-2 text-base text-primary hover:bg-zinc-800"
            >
              {bulkGeneratorDock!.csvLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-1 h-4 w-4" aria-hidden />
              )}
              CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-none border-0 bg-zinc-900 px-2 text-base hover:bg-zinc-800"
              asChild
            >
              <a href={BULK_AUTO_GENERATE_TEMPLATE_HREF} download={BULK_AUTO_GENERATE_TEMPLATE_FILENAME}>
                Template
              </a>
            </Button>
            {bulkGeneratorDock!.csvFileName ? (
              <span className="truncate text-base text-muted-foreground" title={bulkGeneratorDock!.csvFileName}>
                {bulkGeneratorDock!.csvFileName}
              </span>
            ) : null}
          </div>
        ) : null}

        {isBulkGeneratorDock && bulkGeneratorDock!.variant === "blog-import" ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              ref={importInputRef}
              type="file"
              className="hidden"
              multiple
              accept={BLOG_IMPORT_FILE_ACCEPT}
              onChange={(e) => {
                bulkGeneratorDock!.onPickImportFiles?.(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulkWorkspaceBusy || bulkGeneratorDock!.importParsing}
              onClick={() => importInputRef.current?.click()}
              className="h-8 rounded-none border-0 bg-zinc-900 px-2 text-base text-primary hover:bg-zinc-800"
            >
              {bulkGeneratorDock!.importParsing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-1 h-4 w-4" aria-hidden />
              )}
              Files
            </Button>
            {bulkGeneratorDock!.importedFileName ? (
              <span
                className="truncate text-base text-muted-foreground"
                title={bulkGeneratorDock!.importedFileName}
              >
                {bulkGeneratorDock!.importedFileName}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isBulkGeneratorDock
                ? `Search ${c.displayRows.length} items…`
                : `Search ${c.displayRows.length} articles...`
            }
            aria-label={isBulkGeneratorDock ? "Search generator rows" : "Search sitemap articles"}
            className="h-8 w-full rounded-none border-0 bg-zinc-900 pl-8 pr-2.5 text-base text-white placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {isBulkGeneratorDock && bulkGeneratorDock!.promptSelection ? (
          <div className="flex items-center gap-2 pl-1">
            <Checkbox
              checked={generatorAllSelected ? true : generatorSomeSelected ? "indeterminate" : false}
              onCheckedChange={toggleGeneratorSelectAll}
              disabled={generatorSelectableIndices.length === 0 || bulkWorkspaceBusy}
              aria-label={generatorAllSelected ? "Deselect all rows" : "Select all rows"}
              className={DASHBOARD_LIST_CHECKBOX_CLASS}
            />
            <span className="tabular-nums text-base text-muted-foreground">
              {bulkGeneratorDock!.selectedBlogIndices.size > 0 ? (
                <span className="font-medium text-primary">
                  {bulkGeneratorDock!.selectedBlogIndices.size} selected
                </span>
              ) : (
                <span>{filteredRows.length} items</span>
              )}
            </span>
          </div>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-2 pl-1">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={() => c.toggleSelectPageRows(filteredRows)}
              disabled={pageKeys.length === 0}
              aria-label={allSelected ? "Deselect all visible articles" : "Select all visible articles"}
              className={DASHBOARD_LIST_CHECKBOX_CLASS}
            />
            <span className="tabular-nums text-muted-foreground">
              {c.selectedCount > 0 ? (
                <span className="font-medium text-primary">{c.selectedCount} selected</span>
              ) : (
                <span>{filteredRows.length} items</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <OverviewErrorsFilterMenu
              rows={c.rows}
              activeFilters={c.activeErrorFilters}
              onToggle={c.toggleErrorFilter}
              onClear={c.clearErrorFilters}
              disabled={bulkWorkspaceBusy}
            />
            <OverviewSemrushCsvUpload
              fileName={c.semrushCsvFileName}
              urlCount={c.semrushFilterUrlKeys?.size ?? 0}
              disabled={bulkWorkspaceBusy}
              onUpload={c.setSemrushCsvUpload}
              onClear={c.clearSemrushCsvUpload}
            />
          </div>
        </div>
        )}
      </div>

      {/* Batch Mastra Action Strip (Always accessible, zero CLS) */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-1 border-b border-white/10 bg-zinc-950 px-2.5">
        <div className="flex items-center gap-1">
          {clusters.map((cluster) => (
            <OverviewBulkClusterFlyout
              key={cluster.id}
              cluster={cluster}
              workspaceBusy={cluster.id === "wordpress" ? false : bulkWorkspaceBusy}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={c.displayRows.length === 0 || bulkWorkspaceBusy}
          onClick={() => void c.handleBulkUploadToWordPress()}
          className="h-7 rounded-none border-0 bg-zinc-900 px-2 text-base font-medium text-primary hover:bg-zinc-800"
          title="Upload staged changes to WordPress"
        >
          <Upload className="mr-1 h-3.5 w-3.5" aria-hidden />
          Push
        </Button>
      </div>

      {/* Scrollable Sitemap Article List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredRows.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-base">
              {isBulkGeneratorDock
                ? bulkGeneratorDock!.emptyListCopy
                : c.overviewSitemapLoadBusy
                  ? "Loading sitemap inventory..."
                  : "No articles match the current filter."}
            </p>
          </div>
        ) : (
          <ul
            className="divide-y divide-white/5"
            aria-label={isBulkGeneratorDock ? "Generator rows" : "Sitemap articles"}
          >
            {filteredRows.map((row) => {
              const displayIndex = rowIndexForOverviewUrl(c.displayRows, row.url);
              const rowKey = normalizePageUrlKey(row.url);
              const isSelected = Boolean(rowKey && c.selectedUrlKeys?.has(rowKey));
              const isActive = Boolean(rowKey && rowKey === activeUrlKey);
              const isBlogSlotLabel = /^Blog slot \d+$/.test(row.title.trim());
              const isPromptPlaceholder =
                isBulkGeneratorDock && bulkGeneratorDock!.promptSelection && isBlogSlotLabel;
              const isPreIdeasPlaceholder =
                isBulkGeneratorDock && !bulkGeneratorDock!.promptSelection && isBlogSlotLabel;
              const rawTitle = metaDisplayTitle(row, c.wpTitlesByUrl);
              const displayTitle =
                overviewTitlePrimarySegment(rawTitle) ||
                overviewRowUrlPathLabel(row.url) ||
                row.url;
              const pathLabel = overviewRowUrlPathLabel(row.url);
              const isRowStatusBusy =
                row.status !== "idle" &&
                row.status !== "error" &&
                row.status !== "scraping";
              const isOptimizingRow = isOverviewRowOptimizationActive(row.url, optimizingRowUrl);
              const isBusy = isOptimizingRow || (!optimizingRowUrl && isRowStatusBusy);

              return (
                <li
                  key={rowKey || row.url}
                  ref={(el) => {
                    if (!rowKey) return;
                    if (el) rowRefs.current.set(rowKey, el);
                    else rowRefs.current.delete(rowKey);
                  }}
                  className={cn(
                    "group flex items-start gap-2.5 px-3.5 py-3 transition-colors",
                    isBusy
                      ? cn(
                          "border-l-2 border-sky-400 bg-sky-950/25",
                          CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                        )
                      : isActive
                        ? "border-l-2 border-primary bg-zinc-900"
                        : "bg-black hover:bg-zinc-950",
                  )}
                >
                  {isBulkGeneratorDock && bulkGeneratorDock!.promptSelection && !isPromptPlaceholder && displayIndex >= 0 ? (
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
                  ) : !isBulkGeneratorDock ? (
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

                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        c.toggleSelectedUrlKey(row.url, true, pageKeys);
                        return;
                      }
                      onSelectUrl(row.url);
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none focus:outline-none focus-visible:outline-none"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span
                        className={cn(
                          "line-clamp-1 text-base font-medium leading-snug",
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
                        "w-full truncate text-base",
                        isBusy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                      )}
                    >
                      {pathLabel}
                    </span>
                  </button>
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

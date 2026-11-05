import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { BlogIdeaRowCompact, BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS } from "@/components/keyword-research/bulk/BlogIdeaRowCompact";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  buildEntityAdGroupSections,
  sapBaseKeywordDisplay,
} from "@/lib/local-analysis/sap-entity-ad-groups";
import { cn } from "@/lib/utils";

export type SapEntityAdGroupListProps = {
  generatedRows: CSVRow[];
  selectedRowIndices: Set<number>;
  setSelectedRowIndices: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  isGenerating: boolean;
  isProcessing: boolean;
  onRowChange: (index: number, patch: Partial<CSVRow>) => void;
  directionsSiteName?: string;
  emptyRowPadCount?: number;
  showBusySpinner?: boolean;
  /** Pre-Clusters: show Entity Location + Entity Keyword instead of Title + Keyword. */
  entityPreloadMode?: boolean;
};

export function SapEntityAdGroupList({
  generatedRows,
  selectedRowIndices,
  setSelectedRowIndices,
  isGenerating,
  isProcessing,
  onRowChange,
  directionsSiteName,
  emptyRowPadCount = BULK_GENERATOR_EMPTY_ROW_COUNT,
  showBusySpinner = true,
  entityPreloadMode = false,
}: SapEntityAdGroupListProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const sections = useMemo(() => buildEntityAdGroupSections(generatedRows), [generatedRows]);

  const selectableIndices = useMemo(
    () => generatedRows.map((_, i) => i).filter((i) => generatedRows[i]?.keyword?.trim()),
    [generatedRows],
  );

  const allSelected =
    selectableIndices.length > 0 &&
    selectableIndices.every((idx) => selectedRowIndices.has(idx));
  const someSelected =
    !allSelected && selectableIndices.some((idx) => selectedRowIndices.has(idx));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRowIndices(new Set());
      return;
    }
    setSelectedRowIndices(new Set(selectableIndices));
  };

  const toggleSectionSelect = (indices: number[]) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      const allInSection = indices.every((i) => next.has(i));
      if (allInSection) {
        for (const i of indices) next.delete(i);
      } else {
        for (const i of indices) next.add(i);
      }
      return next;
    });
  };

  const toggleExpanded = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelected = (idx: number) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  let stripeIndex = 0;
  const selectAllRows = selectableIndices.length > 0 ? 1 : 0;
  const sectionRowCount = sections.reduce((n, s) => n + 1 + s.rowIndices.length, 0);
  const flatRowCount = sections.length === 0 ? generatedRows.length : 0;
  const contentStripeSlots = selectAllRows + sectionRowCount + flatRowCount;
  const placeholderPad = Math.max(0, emptyRowPadCount - contentStripeSlots);

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      {selectableIndices.length > 0 ? (
        <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
          <div
            className={cn(
              contentOptimizerRowStripeClass(stripeIndex++),
              "grid w-full min-w-0 min-h-[3rem] grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-x-2 sm:min-h-[3.25rem] sm:gap-x-3",
            )}
          >
            <div className="flex shrink-0 items-center justify-center pl-0.5">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                className={BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS}
              />
            </div>
          </div>
        </div>
      ) : null}

      {sections.map((section) => {
        const sectionSelected =
          section.rowIndices.length > 0 &&
          section.rowIndices.every((i) => selectedRowIndices.has(i));
        const sectionSomeSelected =
          !sectionSelected && section.rowIndices.some((i) => selectedRowIndices.has(i));
        const headerStripe = stripeIndex++;

        return (
          <div key={section.groupId} className="flex min-w-0 flex-col">
            <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
              <div
                className={cn(
                  contentOptimizerRowStripeClass(headerStripe),
                  "grid w-full min-w-0 min-h-[3rem] grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 bg-ui-field/60 sm:min-h-[3.25rem] sm:gap-x-3",
                )}
              >
                <div className="flex shrink-0 items-center justify-center pl-0.5">
                  <Checkbox
                    checked={sectionSelected ? true : sectionSomeSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleSectionSelect(section.rowIndices)}
                    aria-label={`Select all keywords for ${section.entity}`}
                    className={BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS}
                  />
                </div>
                <div className="flex min-w-0 items-center gap-2 select-text cursor-text">
                  <MapPin className="h-4 w-4 shrink-0 text-semantic-analysis-foreground" aria-hidden />
                  <span className="whitespace-normal break-words text-base font-semibold text-foreground">
                    {section.entity}
                  </span>
                </div>
                <span className="shrink-0 pr-2 text-base text-muted-foreground">
                  {section.rowIndices.length} {section.rowIndices.length === 1 ? "keyword" : "keywords"}
                </span>
              </div>
            </div>

            {section.rowIndices.map((rowIndex) => {
              const row = generatedRows[rowIndex]!;
              const rowStripe = stripeIndex++;
              return (
                <div key={rowIndex} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                  <div className="pl-4 sm:pl-6">
                    <BlogIdeaRowCompact
                      row={row}
                      index={rowIndex}
                      stripeIndex={rowStripe}
                      isSelected={selectedRowIndices.has(rowIndex)}
                      isExpanded={expandedIndices.has(rowIndex)}
                      isProcessing={isProcessing}
                      busy={showBusySpinner && isGenerating}
                      showDirections={false}
                      entityPreloadMode={entityPreloadMode}
                      keywordDisplay={entityPreloadMode ? sapBaseKeywordDisplay(row) : undefined}
                      onToggleSelect={() => toggleSelected(rowIndex)}
                      onToggleExpand={() => toggleExpanded(rowIndex)}
                      onRowChange={(patch) => onRowChange(rowIndex, patch)}
                      directionsSiteName={directionsSiteName}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Amount slots with no AdGroup entity yet (e.g. Neighbourhoods waiting on grid). */}
      {sections.length === 0
        ? generatedRows.map((row, rowIndex) => {
            const rowStripe = stripeIndex++;
            return (
              <div key={`flat-${rowIndex}`} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                <BlogIdeaRowCompact
                  row={row}
                  index={rowIndex}
                  stripeIndex={rowStripe}
                  isSelected={selectedRowIndices.has(rowIndex)}
                  isExpanded={expandedIndices.has(rowIndex)}
                  isProcessing={isProcessing}
                  busy={showBusySpinner && isGenerating}
                  showDirections={false}
                  entityPreloadMode={entityPreloadMode}
                  keywordDisplay={entityPreloadMode ? sapBaseKeywordDisplay(row) : undefined}
                  onToggleSelect={() => toggleSelected(rowIndex)}
                  onToggleExpand={() => toggleExpanded(rowIndex)}
                  onRowChange={(patch) => onRowChange(rowIndex, patch)}
                  directionsSiteName={directionsSiteName}
                />
              </div>
            );
          })
        : null}

      {Array.from({ length: placeholderPad }, (_, i) => {
        const padStripe = stripeIndex++;
        return (
          <div key={`entity-placeholder-${i}`} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
            <BlogIdeaRowCompact
              row={{}}
              index={-(i + 1)}
              stripeIndex={padStripe}
              isSelected={false}
              isExpanded={false}
              isProcessing={false}
              busy={false}
              placeholder
              onToggleSelect={() => {}}
              onToggleExpand={() => {}}
              onRowChange={() => {}}
            />
          </div>
        );
      })}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ScrollArea, Checkbox } from "@/ui";


import type { CSVRow } from "@/lib/bulk-auto-generate";
import { BlogIdeaRowCompact } from "@/components/keyword-research/bulk/BlogIdeaRowCompact";
import { BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { BULK_GENERATOR_ROW_GRID_MIN_CLASS } from "@/components/keyword-research/blog-generator-tab-classes";
import {
  padListWithPlaceholders,
  type GeneratedBlogIdeaListItem as ListItem,
} from "@/components/keyword-research/bulk/generated-blog-ideas-list-helpers";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const BULK_GENERATOR_LIST_ROW_WRAPPER_CLASS = cn(
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  "shrink-0",
);

interface GeneratedBlogIdeasListProps {
  hasGeneratedChecklist: boolean;
  placeholderCount?: number;
  generatedRows: CSVRow[];
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: (indices: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
  publishDateLabelByIndex?: Record<number, string>;
  draftOnly?: boolean;
  onRowChange: (index: number, patch: Partial<CSVRow>) => void;
  showPublishDates?: boolean;
  embedded?: boolean;
  sortable?: boolean;
  previewRows?: CSVRow[];
  rowOrder?: number[];
  setRowOrder?: (value: number[] | ((prev: number[]) => number[])) => void;
  baseDisplayIndices?: number[];
  slotPublishLabels?: string[];
  sortableDisabled?: boolean;
  directionsSiteName?: string;
  /** Pre-Ideas: show count-driven blog slots with optional keyword inputs. */
  slotMode?: boolean;
}

function SortableBlogIdeaRow({
  item,
  stripeIndex,
  isSelected,
  isExpanded,
  isProcessing,
  busy,
  showPublishDates,
  draftOnly = false,
  sortableDisabled,
  slotMode = false,
  onToggleSelect,
  onToggleExpand,
  onRowChange,
  directionsSiteName,
}: {
  item: ListItem;
  stripeIndex: number;
  isSelected: boolean;
  isExpanded: boolean;
  isProcessing: boolean;
  busy: boolean;
  showPublishDates: boolean;
  draftOnly?: boolean;
  sortableDisabled: boolean;
  slotMode?: boolean;
  directionsSiteName?: string;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRowChange: (patch: Partial<CSVRow>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.sortableId,
    disabled: sortableDisabled,
  });

  return (
    <BlogIdeaRowCompact
      row={item.row}
      index={item.generatedIdx}
      stripeIndex={stripeIndex}
      isSelected={isSelected}
      isExpanded={isExpanded}
      isProcessing={isProcessing}
      busy={busy}
      publishDateLabel={item.publishLabel}
      draftOnly={draftOnly}
      showPublishDate={showPublishDates}
      slotMode={slotMode && !item.placeholder}
      showSelect={!slotMode}
      drag={{
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 1 : 0,
        },
        isDragging,
        handleProps: { ...attributes, ...listeners },
        handleDisabled: sortableDisabled,
      }}
      onToggleSelect={onToggleSelect}
      onToggleExpand={onToggleExpand}
      onRowChange={onRowChange}
      directionsSiteName={directionsSiteName}
    />
  );
}

export function GeneratedBlogIdeasList({
  hasGeneratedChecklist,
  placeholderCount = 0,
  generatedRows,
  selectedBlogIndices,
  setSelectedBlogIndices,
  isGeneratingChecklist,
  isProcessing,
  publishDateLabelByIndex = {},
  draftOnly = false,
  onRowChange,
  showPublishDates = false,
  embedded = false,
  sortable = false,
  previewRows = [],
  rowOrder = [],
  setRowOrder,
  baseDisplayIndices,
  slotPublishLabels = [],
  sortableDisabled = false,
  directionsSiteName,
  slotMode = false,
}: GeneratedBlogIdeasListProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  const orderInSync =
    sortable && rowOrder.length === previewRows.length && previewRows.length > 0;

  const listItems = useMemo((): ListItem[] => {
    if (slotMode && placeholderCount > 0) {
      const contentCount = generatedRows.length;
      const target = Math.max(contentCount, placeholderCount);
      return Array.from({ length: target }, (_, rowIndex) => {
        const isPad = rowIndex >= contentCount;
        return {
          generatedIdx: isPad ? -1 : rowIndex,
          row: isPad ? { keyword: "", title: "" } : generatedRows[rowIndex]!,
          slotIdx: rowIndex,
          sortableId: isPad ? `placeholder-${rowIndex}` : String(rowIndex),
          placeholder: isPad,
        };
      });
    }

    if (!hasGeneratedChecklist && placeholderCount > 0) {
      return Array.from({ length: placeholderCount }, (_, slotIdx) => ({
        generatedIdx: slotIdx,
        row: { keyword: "", title: "" },
        slotIdx,
        sortableId: `placeholder-${slotIdx}`,
        placeholder: true,
      }));
    }

    let items: ListItem[];
    if (sortable && orderInSync) {
      items = rowOrder.map((previewIdx, slotIdx) => {
        const generatedIdx = baseDisplayIndices?.[previewIdx] ?? previewIdx;
        const row = previewRows[previewIdx] ?? generatedRows[generatedIdx];
        return {
          generatedIdx,
          row,
          slotIdx,
          publishLabel: draftOnly
            ? "Draft"
            : slotPublishLabels[slotIdx] ?? publishDateLabelByIndex[generatedIdx],
          sortableId: String(slotIdx),
        };
      });
    } else {
      items = generatedRows.map((row, generatedIdx) => ({
        generatedIdx,
        row,
        slotIdx: generatedIdx,
        publishLabel: draftOnly ? "Draft" : publishDateLabelByIndex[generatedIdx],
        sortableId: String(generatedIdx),
      }));
    }

    // Always pad to placeholderCount when set (18-row zebra background after Ideas).
    return padListWithPlaceholders(items, placeholderCount);
  }, [
    slotMode,
    hasGeneratedChecklist,
    placeholderCount,
    sortable,
    orderInSync,
    rowOrder,
    previewRows,
    baseDisplayIndices,
    generatedRows,
    slotPublishLabels,
    publishDateLabelByIndex,
    draftOnly,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectableIndices = useMemo(
    () =>
      listItems
        .filter((item) => !item.placeholder && item.generatedIdx >= 0)
        .map((item) => item.generatedIdx),
    [listItems],
  );

  if (!hasGeneratedChecklist && !slotMode && placeholderCount === 0) {
    return null;
  }

  if (!hasGeneratedChecklist && slotMode && generatedRows.length === 0 && placeholderCount === 0) {
    return null;
  }

  if (hasGeneratedChecklist && generatedRows.length === 0) {
    return null;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!setRowOrder || !orderInSync) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const slotIds = rowOrder.map((_, i) => String(i));
    const oldIndex = slotIds.indexOf(String(active.id));
    const newIndex = slotIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setRowOrder(arrayMove(rowOrder, oldIndex, newIndex));
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
    setSelectedBlogIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const allSelected =
    selectableIndices.length > 0 &&
    selectableIndices.every((idx) => selectedBlogIndices.has(idx));
  const someSelected =
    !allSelected && selectableIndices.some((idx) => selectedBlogIndices.has(idx));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedBlogIndices(new Set());
      return;
    }
    setSelectedBlogIndices(new Set(selectableIndices));
  };

  const showSelectAll = hasGeneratedChecklist && selectableIndices.length > 0;

  const selectAllHeader = showSelectAll ? (
    <div className={BULK_GENERATOR_LIST_ROW_WRAPPER_CLASS}>
      <div
        className={cn(
          contentOptimizerRowStripeClass(0),
          showPublishDates
            ? "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_2.25rem] items-center gap-x-2 sm:gap-x-3"
            : "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-x-2 sm:gap-x-3",
          BULK_GENERATOR_ROW_GRID_MIN_CLASS,
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
  ) : null;

  const renderRow = (item: ListItem, stripeIndex: number) => {
    if (item.placeholder) {
      return (
        <div key={item.sortableId} className={BULK_GENERATOR_LIST_ROW_WRAPPER_CLASS}>
          <BlogIdeaRowCompact
            row={item.row}
            index={item.generatedIdx}
            stripeIndex={stripeIndex}
            isSelected={false}
            isExpanded={false}
            isProcessing={isProcessing}
            busy={isGeneratingChecklist}
            placeholder
            slotMode={slotMode}
            onToggleSelect={() => {}}
            onToggleExpand={() => {}}
            onRowChange={() => {}}
          />
        </div>
      );
    }

    const common = {
      item,
      stripeIndex,
      isSelected: selectedBlogIndices.has(item.generatedIdx),
      isExpanded: expandedIndices.has(item.generatedIdx),
      isProcessing,
      busy: isGeneratingChecklist,
      showPublishDates,
      draftOnly,
      onToggleSelect: () => toggleSelected(item.generatedIdx),
      onToggleExpand: () => toggleExpanded(item.generatedIdx),
      onRowChange: (patch: Partial<CSVRow>) => onRowChange(item.generatedIdx, patch),
      directionsSiteName,
    };

    return (
      <div
        key={item.placeholder ? item.sortableId : item.generatedIdx}
        className={BULK_GENERATOR_LIST_ROW_WRAPPER_CLASS}
      >
        {sortable && orderInSync && !item.placeholder ? (
          <SortableBlogIdeaRow {...common} sortableDisabled={sortableDisabled} slotMode={slotMode && !item.placeholder} draftOnly={draftOnly} />
        ) : (
          <BlogIdeaRowCompact
            row={item.row}
            index={item.generatedIdx}
            stripeIndex={stripeIndex}
            isSelected={common.isSelected}
            isExpanded={common.isExpanded}
            isProcessing={isProcessing}
            busy={isGeneratingChecklist}
            publishDateLabel={item.publishLabel}
            draftOnly={draftOnly}
            showPublishDate={showPublishDates}
            placeholder={item.placeholder}
            slotMode={slotMode && !item.placeholder}
            showSelect={!slotMode}
            onToggleSelect={common.onToggleSelect}
            onToggleExpand={common.onToggleExpand}
            onRowChange={common.onRowChange}
            directionsSiteName={directionsSiteName}
          />
        )}
      </div>
    );
  };

  const placeholderOnly = listItems.length > 0 && listItems.every((item) => item.placeholder);

  const list = (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      <div aria-hidden={placeholderOnly && embedded ? true : undefined}>
        {selectAllHeader}
        {sortable && orderInSync ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={listItems.map((item) => item.sortableId)}
              strategy={verticalListSortingStrategy}
            >
              {listItems.map((item, stripeIndex) => renderRow(item, stripeIndex))}
            </SortableContext>
          </DndContext>
        ) : (
          listItems.map((item, stripeIndex) => renderRow(item, stripeIndex))
        )}
      </div>
    </div>
  );

  if (embedded) {
    return list;
  }

  return (
    <ScrollArea className="h-[min(28rem,calc(100vh-16rem))]">
      {list}
    </ScrollArea>
  );
}

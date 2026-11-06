import type { ReactNode } from "react";
import {
  BLOG_IMPORT_POST_DESTINATION_CHOICES,
} from "@/lib/bulk-auto-generate";
import { resolveRowPostDestination } from "@/lib/bulk-post-destination-normalize";
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import {
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { PPC_CAMPAIGN_ROW_FIELD_CELL } from "@/components/ppc/google/google-ads-row-constants";
import { Field } from "@/ui";
import { cn } from "@/lib/utils";
import {
  BLOG_IDEA_ROW_GRID_CLASS,
  BLOG_IDEA_ROW_GRID_NO_SELECT_CLASS,
  BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DATE_CLASS,
  BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_CLASS,
  BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_DATE_CLASS,
  BLOG_IDEA_ROW_GRID_WITH_DATE_CLASS,
  BLOG_IDEA_ROW_SLOT_GRID_CLASS,
  modifierFromBlur,
  modifierFromInput,
  publishDisplayValue,
  stopFieldBubble,
  type BlogIdeaRow,
  type BlogIdeaRowDragProps,
} from "@/components/keyword-research/bulk/BlogIdeaRowCompact.helpers";
import {
  ActionsCell,
  DestinationCell,
  KeywordCell,
  PublishDateCell,
  SelectCell,
  TitleCell,
} from "@/components/keyword-research/bulk/BlogIdeaRowCompact.cells";
import { ExpandedFields } from "@/components/keyword-research/bulk/BlogIdeaRowCompact.expanded";
import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";

export type BlogIdeaRowCompactProps = {
  row: BlogIdeaRow;
  index: number;
  stripeIndex: number;
  isSelected: boolean;
  isExpanded: boolean;
  isProcessing: boolean;
  busy?: boolean;
  publishDateLabel?: string;
  draftOnly?: boolean;
  showPublishDate?: boolean;
  placeholder?: boolean;
  /** Hide selection checkbox (CSV grid). */
  showSelect?: boolean;
  /** Content Optimizer active row glow (CSV run). */
  activeOptimize?: boolean;
  drag?: BlogIdeaRowDragProps;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRowChange: (patch: Partial<CSVRow>) => void;
  showPostDestination?: boolean;
  postDestinationChoices?: WordPressPostDestination[];
  headerPostDestination?: WordPressPostDestination;
  /** Connected site / business name for Google directions search links. */
  directionsSiteName?: string;
  /** When set, shown in the keyword column instead of `row.keyword`. */
  keywordDisplay?: string;
  /** Hide directions pin on the row (entity ad group header shows location). */
  showDirections?: boolean;
  /** Pre-Ideas slot row: PPC-style keyword + blog fields. */
  slotMode?: boolean;
  /** Live WordPress post/preview URL after upload (from wordpress-post file). */
  previewUrl?: string;
  /** Drawer expanded row: skip outer stripe shell (parent provides it). */
  embedded?: boolean;
  /** Pre-Clusters entity SAP: title column shows entity location, keyword column shows base keyword. */
  entityPreloadMode?: boolean;
};

export function BlogIdeaRowCompact({
  row,
  index,
  stripeIndex,
  isSelected,
  isExpanded,
  isProcessing,
  busy = false,
  publishDateLabel,
  draftOnly = false,
  showPublishDate = false,
  placeholder = false,
  showSelect = true,
  activeOptimize = false,
  drag,
  onToggleSelect,
  onToggleExpand,
  onRowChange,
  showPostDestination = false,
  postDestinationChoices = BLOG_IMPORT_POST_DESTINATION_CHOICES,
  headerPostDestination = "local",
  directionsSiteName,
  keywordDisplay,
  showDirections = true,
  slotMode = false,
  previewUrl,
  embedded = false,
  entityPreloadMode = false,
}: BlogIdeaRowCompactProps) {
  const gridClass = slotMode
    ? BLOG_IDEA_ROW_SLOT_GRID_CLASS
    : showSelect
      ? showPublishDate
        ? BLOG_IDEA_ROW_GRID_WITH_DATE_CLASS
        : BLOG_IDEA_ROW_GRID_CLASS
      : showPostDestination
        ? showPublishDate
          ? BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_DATE_CLASS
          : BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_CLASS
        : showPublishDate
          ? BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DATE_CLASS
          : BLOG_IDEA_ROW_GRID_NO_SELECT_CLASS;

  if (placeholder && slotMode) {
    return (
      <div
        className={cn(contentOptimizerRowStripeClass(stripeIndex), BLOG_IDEA_ROW_SLOT_GRID_CLASS)}
        aria-hidden
      />
    );
  }

  if (placeholder && !slotMode) {
    return (
      <div className={cn(contentOptimizerRowStripeClass(stripeIndex), gridClass)} aria-hidden>
        {showSelect ? (
          <SelectCell isSelected={false} index={index} placeholder onToggleSelect={() => {}} />
        ) : null}
      </div>
    );
  }

  const keywordLabel = keywordDisplay?.trim() || row.keyword?.trim() || "";
  const titleLabel = entityPreloadMode
    ? row.entity?.trim() ?? ""
    : row.title?.trim() ?? "";
  const preloadWikiUrl = entityPreloadMode ? row.wikipedia_url?.trim() : undefined;
  const fieldId = (name: string) => `blog-idea-${index}-${name}`;

  const rowShell = (header: ReactNode) => (
    <div
      ref={drag?.setNodeRef}
      style={drag?.style}
      className={cn(
        !embedded && contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: activeOptimize }),
        drag?.isDragging && "opacity-90",
      )}
    >
      {header}
      {isExpanded ? (
        <ExpandedFields
          row={row}
          fieldId={fieldId}
          isProcessing={isProcessing}
          publishDateLabel={publishDateLabel}
          draftOnly={draftOnly}
          onRowChange={onRowChange}
          previewUrl={previewUrl}
        />
      ) : null}
    </div>
  );

  if (slotMode) {
    const slotRowShellClass = cn(
      contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: activeOptimize }),
      BLOG_IDEA_ROW_SLOT_GRID_CLASS,
      drag?.isDragging && "opacity-90",
    );

    const slotFields = (
      <>
        <div className={cn(PPC_CAMPAIGN_ROW_FIELD_CELL, "pl-[5px]")}>
          <Field
            type="text"
            value={row.keyword ?? ""}
            disabled={isProcessing || busy}
            placeholder="Keyword"
            aria-label="Keyword"
            onClick={stopFieldBubble}
            onChange={(e) => onRowChange({ keyword: e.target.value })}
          />
        </div>
        <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>
          <Field
            type="text"
            value={row.modifier ?? ""}
            disabled={isProcessing || busy}
            placeholder="Modifications"
            aria-label="Modifications"
            onClick={stopFieldBubble}
            onChange={(e) => onRowChange({ modifier: modifierFromInput(e.target.value) })}
            onBlur={(e) => onRowChange({ modifier: modifierFromBlur(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          {row.decision_audit_json ? (
            <DecisionAuditRowBadge auditJson={row.decision_audit_json} className="shrink-0" />
          ) : null}
          <ActionsCell
            isExpanded={isExpanded}
            entity={row.entity}
            directionsSiteName={directionsSiteName}
            showDirections={false}
            onToggleExpand={onToggleExpand}
          />
        </div>
      </>
    );

    if (isExpanded) {
      return (
        <div ref={drag?.setNodeRef} style={drag?.style}>
          <div className={slotRowShellClass}>{slotFields}</div>
          <ExpandedFields
            row={row}
            fieldId={fieldId}
            isProcessing={isProcessing}
            publishDateLabel={publishDateLabel}
            draftOnly={draftOnly}
            onRowChange={onRowChange}
            previewUrl={previewUrl}
          />
        </div>
      );
    }

    return (
      <div ref={drag?.setNodeRef} style={drag?.style} className={slotRowShellClass}>
        {slotFields}
      </div>
    );
  }

  const gridHeader = (
    <div className={gridClass}>
      {showSelect ? (
        <SelectCell
          isSelected={isSelected}
          index={index}
          placeholder={placeholder}
          onToggleSelect={onToggleSelect}
        />
      ) : null}

      <TitleCell
        drag={drag}
        titleLabel={titleLabel}
        placeholder={placeholder}
        wikiUrl={preloadWikiUrl}
        decisionAuditJson={row.decision_audit_json}
      />

      <KeywordCell keywordLabel={keywordLabel} placeholder={placeholder} />

      {showPostDestination ? (
        <DestinationCell
          value={resolveRowPostDestination(row, headerPostDestination)}
          choices={postDestinationChoices}
          disabled={isProcessing || busy}
          placeholder={placeholder}
          onChange={(v) => onRowChange({ post_destination: v })}
        />
      ) : null}

      {showPublishDate ? (
        <PublishDateCell
          publishDateLabel={publishDisplayValue(row, publishDateLabel, draftOnly)}
          placeholder={placeholder}
        />
      ) : null}

      <ActionsCell
        isExpanded={isExpanded}
        entity={row.entity}
        directionsSiteName={directionsSiteName}
        showDirections={showDirections}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );

  if (isExpanded) {
    return rowShell(gridHeader);
  }

  if (embedded) {
    return rowShell(gridHeader);
  }

  return (
    <div
      ref={drag?.setNodeRef}
      style={drag?.style}
      className={cn(
        contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: activeOptimize }),
        gridClass,
        drag?.isDragging && "opacity-90",
      )}
    >
      {showSelect ? (
        <SelectCell
          isSelected={isSelected}
          index={index}
          placeholder={placeholder}
          onToggleSelect={onToggleSelect}
        />
      ) : null}

      <TitleCell
        drag={drag}
        titleLabel={titleLabel}
        placeholder={placeholder}
        wikiUrl={preloadWikiUrl}
      />

      <KeywordCell keywordLabel={keywordLabel} placeholder={placeholder} />

      {showPostDestination ? (
        <DestinationCell
          value={resolveRowPostDestination(row, headerPostDestination)}
          choices={postDestinationChoices}
          disabled={isProcessing || busy}
          placeholder={placeholder}
          onChange={(v) => onRowChange({ post_destination: v })}
        />
      ) : null}

      {showPublishDate ? (
        <PublishDateCell
          publishDateLabel={publishDisplayValue(row, publishDateLabel, draftOnly)}
          placeholder={placeholder}
        />
      ) : null}

      <ActionsCell
        isExpanded={false}
        entity={row.entity}
        directionsSiteName={directionsSiteName}
        showDirections={showDirections}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
}

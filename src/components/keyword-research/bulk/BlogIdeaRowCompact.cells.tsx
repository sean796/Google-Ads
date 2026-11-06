import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronUp, ExternalLink, GripVertical, MapPin } from "lucide-react";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { WORDPRESS_POST_DESTINATION_SHORT } from "@/lib/bulk-auto-generate";
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import {
  CONTENT_OPTIMIZER_PAGE_ROW_TITLE_CELL,
  contentOptimizerCopyableCellProps,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import { googleDirectionsSearchUrl } from "@/lib/google-directions-search-url";
import { cn } from "@/lib/utils";
import { Button, Checkbox, SelectField } from "@/ui";
import {
  BLOG_IDEA_ROW_EXPAND_CELL,
  BLOG_IDEA_ROW_SELECT_CELL,
  stopFieldBubble,
  type BlogIdeaRowDragProps,
} from "@/components/keyword-research/bulk/BlogIdeaRowCompact.helpers";

export function DragHandle({
  drag,
  onClickStop,
}: {
  drag?: BlogIdeaRowDragProps;
  onClickStop: (e: ReactMouseEvent) => void;
}) {
  if (!drag) return null;
  return (
    // Pulse UI exception: dnd-kit drag handle needs a bare element
    <button
      type="button"
      ref={undefined}
      className="mr-1.5 touch-none shrink-0 p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
      disabled={drag.handleDisabled}
      aria-label="Drag to reorder"
      onClick={onClickStop}
      {...drag.handleProps}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

export function TitleCell({
  drag,
  titleLabel,
  placeholder = false,
  wikiUrl,
  decisionAuditJson,
}: {
  drag?: BlogIdeaRowDragProps;
  titleLabel: string;
  placeholder?: boolean;
  wikiUrl?: string;
  decisionAuditJson?: string;
}) {
  const { className: copyableClassName, ...copyableProps } = contentOptimizerCopyableCellProps();
  const wiki = wikiUrl?.trim() ?? "";
  return (
    <div
      className={cn(CONTENT_OPTIMIZER_PAGE_ROW_TITLE_CELL, copyableClassName)}
      {...copyableProps}
    >
      <DragHandle drag={drag} onClickStop={(e) => e.stopPropagation()} />
      <span
        className={cn(
          "select-text whitespace-normal break-words text-base leading-snug",
          placeholder ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {titleLabel}
      </span>
      {decisionAuditJson ? (
        <DecisionAuditRowBadge auditJson={decisionAuditJson} className="ml-2 shrink-0" />
      ) : null}
      {wiki ? (
        <a
          href={wiki}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1.5 inline-flex shrink-0 items-center text-primary hover:text-primary"
          aria-label="Wikipedia"
          onClick={stopFieldBubble}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export function KeywordCell({
  keywordLabel,
  placeholder = false,
}: {
  keywordLabel: string;
  placeholder?: boolean;
}) {
  const { className: copyableClassName, ...copyableProps } = contentOptimizerCopyableCellProps();
  return (
    <div
      className={cn(
        "flex min-w-0 items-center border-0 bg-transparent px-1.5 py-0.5",
        copyableClassName,
      )}
      {...copyableProps}
    >
      <span
        className={cn(
          "select-text whitespace-normal break-words text-base font-bold leading-snug",
          placeholder ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {keywordLabel}
      </span>
    </div>
  );
}

export function PublishDateCell({
  publishDateLabel,
  placeholder = false,
}: {
  publishDateLabel?: string;
  placeholder?: boolean;
}) {
  const label = publishDateLabel?.trim() || "";
  return (
    <div className="flex min-w-0 items-center border-0 bg-transparent px-1.5 py-0.5">
      <span
        className={cn(
          "select-text whitespace-nowrap text-base leading-snug text-white",
          placeholder || !label ? "text-muted-foreground" : null,
        )}
      >
        {label || "-"}
      </span>
    </div>
  );
}

export function SelectCell({
  isSelected,
  index,
  placeholder = false,
  onToggleSelect,
}: {
  isSelected: boolean;
  index: number;
  placeholder?: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div className={BLOG_IDEA_ROW_SELECT_CELL}>
      {!placeholder ? (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select idea ${index + 1}`}
          className={BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS}
        />
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </div>
  );
}

export function DirectionsLinkButton({
  entity,
  siteName,
}: {
  entity?: string;
  siteName?: string;
}) {
  const href = googleDirectionsSearchUrl(entity ?? "", siteName ?? "");
  if (!href) return null;
  const label = `Directions: ${entity?.trim()} to ${siteName?.trim()}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-7 w-7 shrink-0 items-center justify-center text-semantic-analysis-foreground hover:text-semantic-analysis-foreground"
      aria-label={label}
      title={label}
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin className="h-4 w-4" aria-hidden />
    </a>
  );
}

export function ActionsCell({
  isExpanded,
  entity,
  directionsSiteName,
  showDirections = true,
  onToggleExpand,
}: {
  isExpanded: boolean;
  entity?: string;
  directionsSiteName?: string;
  showDirections?: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div className={BLOG_IDEA_ROW_EXPAND_CELL}>
      {showDirections ? <DirectionsLinkButton entity={entity} siteName={directionsSiteName} /> : null}
      <Button
        variant="quiet"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Collapse row" : "Expand row"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}

export function DestinationCell({
  value,
  choices,
  disabled,
  placeholder,
  onChange,
}: {
  value: WordPressPostDestination;
  choices: WordPressPostDestination[];
  disabled?: boolean;
  placeholder?: boolean;
  onChange: (value: WordPressPostDestination) => void;
}) {
  if (placeholder) {
    return <div className="min-w-[7.5rem]" aria-hidden />;
  }
  return (
    <div className="min-w-[7.5rem]" onClick={stopFieldBubble}>
      <SelectField placeholder="Destination" value={value} onValueChange={(v) => onChange(v as WordPressPostDestination)} disabled={disabled} options={choices.map((choice) => ({ value: choice, label: WORDPRESS_POST_DESTINATION_SHORT[choice] }))} width="full" />
    </div>
  );
}

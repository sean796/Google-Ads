import { ChevronDown, ChevronUp, ExternalLink, GripVertical, MapPin, Sparkles } from "lucide-react";

import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import {
  BLOG_IMPORT_POST_DESTINATION_CHOICES,
  WORDPRESS_POST_DESTINATION_SHORT,
} from "@/lib/bulk-auto-generate";
import { resolveRowPostDestination } from "@/lib/bulk-post-destination-normalize";
import {
  importRowLinkEditorUrls,
  serializeModifierLinksJson,
} from "@/lib/bulk/bulk-csv-parser";
import { BlogIdeaModifierLinksEditor } from "@/components/keyword-research/bulk/BlogIdeaModifierLinksEditor";
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import { parseDecisionAuditJson } from "@/components/keyword-research/bulk/decision-audit-json";
import {
  CONTENT_OPTIMIZER_PAGE_ROW_TITLE_CELL,
  contentOptimizerCopyableCellProps,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { WorkspaceNestedInput } from "@/components/seo/WorkspaceNestedField";
import { BLOG_IDEA_ROW_SELECT_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { googleDirectionsSearchUrl } from "@/lib/google-directions-search-url";
import { PPC_CAMPAIGN_ROW_FIELD_CELL } from "@/components/ppc/google/google-ads-row-constants";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import { BULK_GENERATOR_ROW_GRID_MIN_CLASS } from "@/components/keyword-research/blog-generator-tab-classes";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { Button, Field, SelectField, Checkbox } from "@/ui";

const EXPANDED_FIELD_LABEL = "w-[5.75rem] shrink-0 sm:w-[6.5rem]";

/** Left select | title (1fr) | keyword (1fr) | expand. */
const BLOG_IDEA_ROW_GRID_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
/** Left select | title | keyword | publish date | expand. */
const BLOG_IDEA_ROW_GRID_WITH_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
const BLOG_IDEA_ROW_SLOT_GRID_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
const BLOG_IDEA_ROW_GRID_NO_SELECT_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);

const BLOG_IDEA_ROW_SELECT_CELL = "flex shrink-0 items-center justify-center pl-0.5";

const BLOG_IDEA_ROW_EXPAND_CELL =
  "flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2";

export type BlogIdeaRowDragProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  handleProps?: Record<string, unknown>;
  handleDisabled?: boolean;
};

export type BlogIdeaRow = CSVRow & { decision_audit_json?: string };

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

function sapUrlPathFromRow(row: CSVRow): string {
  const locked = row.target_slug?.trim().replace(/^\/+|\/+$/g, "");
  if (locked) return `/${locked}/`;
  const entity = row.entity?.trim();
  if (entity && entity !== "N/A") {
    const slug = buildSapSlugFromKeywordEntity(row.keyword ?? "", entity);
    return slug ? `/${slug}/` : "";
  }
  return "";
}

function previewPathLabel(previewUrl: string, row: CSVRow): string {
  try {
    const path = new URL(previewUrl).pathname;
    if (path && path !== "/") return path.endsWith("/") ? path : `${path}/`;
  } catch {
    /* keep computed path */
  }
  return sapUrlPathFromRow(row) || previewUrl;
}

function publishDisplayValue(
  _row: CSVRow,
  publishDateLabel?: string,
  draftOnly = false,
): string {
  if (draftOnly) return "Draft";
  const label = publishDateLabel?.trim();
  if (label) return label;
  return "";
}

function featuredImageSelectValue(row: CSVRow): "y" | "n" | "google-maps" {
  if (row.featuredImage === "n") return "n";
  if (row.featuredImage === "google-maps") return "google-maps";
  return "y";
}

function stopFieldBubble(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function modifierFromInput(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function modifierFromBlur(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function DragHandle({
  drag,
  onClickStop,
}: {
  drag?: BlogIdeaRowDragProps;
  onClickStop: (e: React.MouseEvent) => void;
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

function TitleCell({
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

function KeywordCell({
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

function PublishDateCell({
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

function SelectCell({
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

function DirectionsLinkButton({
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

function ActionsCell({
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

function ExpandedFields({
  row,
  fieldId,
  isProcessing,
  publishDateLabel,
  draftOnly = false,
  onRowChange,
  previewUrl,
}: {
  row: BlogIdeaRow;
  fieldId: (name: string) => string;
  isProcessing: boolean;
  publishDateLabel?: string;
  draftOnly?: boolean;
  onRowChange: (patch: Partial<CSVRow>) => void;
  previewUrl?: string;
}) {
  const livePreview = previewUrl?.trim() || "";
  const slugDisplay =
    row.target_slug?.trim() ||
    sapUrlPathFromRow(row).replace(/^\/+|\/+$/g, "");
  const linkUrls = importRowLinkEditorUrls(row);

  const handleLinksChange = (urls: string[]) => {
    onRowChange({ modifier_links_json: serializeModifierLinksJson(urls) });
  };

  return (
    <div
      className="grid grid-cols-1 gap-1.5 px-2.5 pb-2 pt-1 sm:grid-cols-2 sm:px-3"
      role="group"
      aria-label="Blog idea details"
      onClick={stopFieldBubble}
    >
      <WorkspaceNestedInput
        id={fieldId("title")}
        layout="inline"
        label="Title"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.title ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ title: e.target.value })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("keyword")}
        layout="inline"
        label="Keyword"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.keyword ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ keyword: e.target.value })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("entity")}
        layout="inline"
        label="Entity"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.entity ?? ""}
        disabled={isProcessing}
        onChange={(e) => onRowChange({ entity: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      {livePreview ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn(EXPANDED_FIELD_LABEL, "text-base text-muted-foreground")}>URL</span>
          <a
            href={livePreview}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-base text-primary underline hover:text-primary"
            onClick={stopFieldBubble}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{previewPathLabel(livePreview, row)}</span>
          </a>
        </div>
      ) : (
        <WorkspaceNestedInput
          id={fieldId("slug")}
          layout="inline"
          label="Slug"
          labelClassName={EXPANDED_FIELD_LABEL}
          value={slugDisplay}
          disabled={isProcessing}
          placeholder="post-slug"
          onChange={(e) => onRowChange({ target_slug: e.target.value.trim() || undefined })}
          onClick={stopFieldBubble}
        />
      )}
      {row.wikipedia_url?.trim() ? (
        <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
          <span className={cn(EXPANDED_FIELD_LABEL, "text-base text-muted-foreground")}>Wikipedia</span>
          <a
            href={row.wikipedia_url.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-base text-primary underline hover:text-primary"
            onClick={stopFieldBubble}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{row.wikipedia_url.trim()}</span>
          </a>
        </div>
      ) : null}
      <WorkspaceNestedInput
        id={fieldId("modifier")}
        layout="inline"
        label="Modifier"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.modifier ?? ""}
        disabled={isProcessing}
        placeholder="e.g. comprehensive guide"
        onChange={(e) => onRowChange({ modifier: modifierFromInput(e.target.value) })}
        onBlur={(e) => onRowChange({ modifier: modifierFromBlur(e.target.value) })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("meta")}
        layout="inline"
        label="Meta"
        labelClassName={EXPANDED_FIELD_LABEL}
        value={row.meta_description ?? ""}
        disabled={isProcessing}
        placeholder="SEO meta description"
        onChange={(e) => onRowChange({ meta_description: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      <WorkspaceNestedInput
        id={fieldId("publish")}
        layout="inline"
        label={draftOnly ? "Status" : "Publish"}
        labelClassName={EXPANDED_FIELD_LABEL}
        value={publishDisplayValue(row, publishDateLabel, draftOnly)}
        disabled={isProcessing || draftOnly}
        placeholder={draftOnly ? "Draft" : "Scheduled date"}
        onChange={(e) => onRowChange({ publish_date_gmt: e.target.value.trim() || undefined })}
        onClick={stopFieldBubble}
      />
      <div
        className="flex min-h-9 min-w-0 flex-row items-stretch overflow-hidden rounded-md bg-ui-field-hover"
        onClick={stopFieldBubble}
      >
        <span className={`${EXPANDED_FIELD_LABEL} flex items-center self-stretch bg-black px-2.5 py-2 text-base`}>
          Image
        </span>
        <div className="flex min-w-0 flex-1 items-center px-2.5">
          <SelectField placeholder="Image" value={featuredImageSelectValue(row)} onValueChange={(v) => onRowChange({ featuredImage: v })} disabled={isProcessing} options={[{ value: "y", label: "AI image" }, { value: "google-maps", label: "Google Maps" }, { value: "n", label: "None" }]} width="full" />
        </div>
      </div>
      <BlogIdeaModifierLinksEditor
        idPrefix={fieldId("links")}
        links={linkUrls}
        disabled={isProcessing}
        onChange={handleLinksChange}
      />
      {row.decision_audit_json ? (
        <div className="sm:col-span-2 mt-1 rounded border border-white/10 bg-ui-field/90 p-2.5 text-xs">
          <div className="flex items-center justify-between font-mono text-base text-foreground pb-1 mb-1.5 border-b border-white/5">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span>Decision Agent Audit (Liquid d1.1)</span>
            </span>
            <DecisionAuditRowBadge auditJson={row.decision_audit_json} showScores />
          </div>
          {(() => {
            const audit = parseDecisionAuditJson(row.decision_audit_json);
            if (!audit) return null;
            return (
              <div className="flex flex-col gap-1.5 text-base">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">On-Brief</span>
                    <span className="text-primary font-bold">{(audit.onBriefProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">Intent Fit</span>
                    <span className="text-white font-bold">{audit.intentScore.toFixed(1)} / 3</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">CTR Appeal</span>
                    <span className="text-white font-bold">{audit.clickAppealScore.toFixed(1)} / 3</span>
                  </div>
                  <div className="rounded border border-white/5 bg-black/40 px-2 py-1">
                    <span className="text-muted-foreground block text-base uppercase tracking-wider">Policy Safe</span>
                    <span className="text-primary font-bold">{(audit.policySafeProbability * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {audit.reasoning && (
                  <p className="mt-0.5 text-foreground font-sans italic">{audit.reasoning}</p>
                )}
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

function DestinationCell({
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

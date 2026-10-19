import type { ComponentProps, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import { WordPressPostingConfig } from "@/components/keyword-research/bulk/WordPressPostingConfig";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  type BlogImportHeaderProgress,
} from "@/lib/bulk/blog-import-header-progress";
import type { ImportedBlogDraft } from "@/lib/bulk/blog-import-parser";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { WORDPRESS_POST_DESTINATION_SHORT } from "@/lib/bulk-auto-generate";
import { cn } from "@/lib/utils";
import { contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";

const DETAILS_FLAT_SECTION_LINE =
  "flex min-h-9 w-full items-center justify-between gap-2 border-0 px-2.5 py-1.5 text-white sm:px-3";
const DETAILS_FLAT_STACK = "flex flex-col gap-0";
import {
  WorkspaceDetailsKvRow,
  WorkspaceDetailsLiveMessage,
  WorkspaceDetailsSection,
  WorkspaceDetailsStack,
} from "@/components/shared/WorkspaceDetailsStack";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { ResearchBatchSignals } from "@/lib/overview/overview-bulk-pipeline-titles";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { SitemapInventoryLinksList } from "@/components/keyword-research/bulk/SitemapInventoryLinksList";
import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export type BulkGeneratorDetailsVariant = "csv" | "prompt" | "blog-import";


const VARIANT_LABEL: Record<BulkGeneratorDetailsVariant, string> = {
  csv: "CSV",
  prompt: "Prompt",
  "blog-import": "Import",
};

export type BulkGeneratorDetailsPanelProps = {
  variant: BulkGeneratorDetailsVariant;
  workspaceBusy: boolean;
  headerProgress: BlogImportHeaderProgress | null;
  isProcessing: boolean;
  status?: string;
  isGeneratingChecklist?: boolean;
  checklistPhase?: string;
  processingStepLog?: string[];
  harnessSections: BulkHarnessSectionUi[];
  harnessByRow?: Map<number, BulkHarnessSectionUi[]>;
  batchPrepHarnessSections?: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
  currentRow: number;
  totalRows: number;
  displayRows: CSVRow[];
  postDestination: BulkGeneratorWorkspaceBindings["bulkPostDestination"];
  wpConfig: Omit<ComponentProps<typeof WordPressPostingConfig>, "isDisabled"> | null;
  draftPreview?: ImportedBlogDraft | null;
  importedFileName?: string | null;
  csvFileName?: string | null;
  rowCount?: number;
  generatedRowCount?: number;
  selectedCount?: number;
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  siteKwHostedLink?: import("@/lib/bulk/prompt-bulk-site-kw-scrape").PromptBulkSiteKwHostedLink | null;
  sitemapInventoryLoading?: boolean;
  filesByRow?: Map<number, BulkGeneratedFile[]>;
  downloadFile?: (file: BulkGeneratedFile) => void;
  canDownloadBlog?: boolean;
  onDownloadBlog?: () => void;
  publishDateLabelByIndex?: Record<number, string>;
  draftOnly?: boolean;
  directionsSiteName?: string;
  prepAccordionTitle?: string;
  pipelineSectionTitles?: string[];
  runKind?: BulkOptimizationState["runKind"];
  researchBatchSignals?: ResearchBatchSignals;
  researchRowIndices?: ReadonlySet<number>;
  liveMessage?: string | null;
  entitySapRowDisplay?: boolean;
  urlStatuses?: BulkOptimizationState["urlStatuses"];
  /** Global row index of first visible row when details are paginated (default 0). */
  detailsPageStart?: number;
};

export function bulkGeneratorDetailsCanOpen(
  hasRows: boolean,
  isProcessing: boolean,
  hasFile: boolean,
  hasDraft: boolean,
): boolean {
  return workspaceDetailsCanOpen(hasRows, isProcessing, hasFile, hasDraft);
}

function BlogImportWorkspaceInline({
  postDestination,
  importedFileName,
}: {
  postDestination: WordPressPostDestination;
  importedFileName?: string | null;
}) {
  const parts = [VARIANT_LABEL["blog-import"], WORDPRESS_POST_DESTINATION_SHORT[postDestination]];
  if (importedFileName?.trim()) parts.push(importedFileName.trim());
  return <WorkspaceDetailsLiveMessage message={parts.join(" · ")} stripeIndex={0} />;
}

function BulkGeneratorWorkspaceContext({
  variant,
  postDestination,
  csvFileName,
  rowCount,
  generatedRowCount,
  selectedCount,
  importedFileName,
  draftPreview,
}: Pick<
  BulkGeneratorDetailsPanelProps,
  | "variant"
  | "postDestination"
  | "csvFileName"
  | "rowCount"
  | "generatedRowCount"
  | "selectedCount"
  | "importedFileName"
  | "draftPreview"
>) {
  const whiteLabels = variant === "blog-import";
  let kvIndex = 0;
  return (
    <>
      <WorkspaceDetailsKvRow label="Section" value={VARIANT_LABEL[variant]} stripeIndex={kvIndex++} whiteLabels={whiteLabels} />
      <WorkspaceDetailsKvRow
        label="Destination"
        value={WORDPRESS_POST_DESTINATION_SHORT[postDestination]}
        stripeIndex={kvIndex++}
        whiteLabels={whiteLabels}
      />
      {variant === "csv" && csvFileName ? (
        <WorkspaceDetailsKvRow
          label="CSV"
          value={`${csvFileName} · ${rowCount ?? 0} row${(rowCount ?? 0) !== 1 ? "s" : ""}`}
          stripeIndex={kvIndex++}
        />
      ) : null}
      {variant === "prompt" ? (
        <WorkspaceDetailsKvRow
          label="Ideas"
          value={`${generatedRowCount ?? 0} generated · ${selectedCount ?? 0} selected`}
          stripeIndex={kvIndex++}
        />
      ) : null}
      {variant === "blog-import" && importedFileName ? (
        <WorkspaceDetailsKvRow label="Import file" value={importedFileName} stripeIndex={kvIndex++} whiteLabels />
      ) : null}
      {variant === "blog-import" && draftPreview ? (
        <WorkspaceDetailsKvRow
          label="Draft"
          value={`${draftPreview.title} · ${draftPreview.sections.length} H2`}
          stripeIndex={kvIndex++}
          whiteLabels
        />
      ) : null}
    </>
  );
}

function BlogImportRunDetail({
  headerProgress,
  harnessSections,
  harnessPlannedSectionCount,
  currentRow,
  totalRows,
  canDownloadBlog,
  onDownloadBlog,
}: {
  headerProgress: BlogImportHeaderProgress;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
  currentRow: number;
  totalRows: number;
  canDownloadBlog: boolean;
  onDownloadBlog?: () => void;
}) {
  const phase = headerProgress.phase.trim();
  return (
    <>
      {phase ? <WorkspaceDetailsLiveMessage message={phase} stripeIndex={0} /> : null}
      {harnessSections.length > 0 ? (
        <BulkHarnessSectionsPanel
          harnessSections={harnessSections}
          harnessPlannedSectionCount={harnessPlannedSectionCount}
          currentRow={currentRow}
          totalRows={totalRows}
          isProcessing={false}
          variant="details-flat"
          hideHeader
          activeIndicator="border"
          blogImportCompact
        />
      ) : null}
      {canDownloadBlog && onDownloadBlog ? (
        <div className="border-0 px-2.5 py-1 sm:px-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 gap-1.5 bg-lime-500 text-black hover:bg-lime-400"
            onClick={onDownloadBlog}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Download blog
          </Button>
        </div>
      ) : null}
    </>
  );
}

function normalizeIdeaPhase(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const withoutLeadingSymbols = trimmed.replace(/^[\s\p{Extended_Pictographic}\u2600-\u27BF✅❌]+/u, "").trim();
  return withoutLeadingSymbols || trimmed;
}

function BulkIdeasRunDetail({ phase }: { phase: string }) {
  const displayPhase = normalizeIdeaPhase(phase) || "Generating blog ideas...";
  return (
    <div
      className={cn(
        DETAILS_FLAT_SECTION_LINE,
        contentOptimizerRowStripeClass(0, { isActiveOptimize: true }),
        "px-2.5 sm:px-3",
      )}
    >
      <p className="font-semibold text-white">Ideas</p>
      <p className="mt-0.5 whitespace-normal break-words text-base leading-snug text-muted-foreground">
        {displayPhase}
      </p>
    </div>
  );
}

export { SitemapInventoryLinksList } from "@/components/keyword-research/bulk/SitemapInventoryLinksList";

export function BulkPromptCsvRunDetail({
  activeRow,
  status,
  currentRow,
  totalRows,
  harnessSections,
  harnessPlannedSectionCount,
}: {
  activeRow?: CSVRow;
  status: string;
  currentRow: number;
  totalRows: number;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
}) {
  const title = activeRow?.title?.trim() || activeRow?.keyword?.trim() || "Untitled";
  const phase = status.trim();

  return (
    <>
      <div
        className={cn(
          DETAILS_FLAT_SECTION_LINE,
          contentOptimizerRowStripeClass(0, { isActiveOptimize: Boolean(phase) }),
          "px-2.5 sm:px-3",
        )}
      >
        <p className="font-semibold text-white">{title}</p>
        {phase ? (
          <p className="mt-0.5 whitespace-normal break-words text-base leading-snug text-muted-foreground">
            {phase}
          </p>
        ) : null}
      </div>
      {harnessSections.length > 0 ? (
        <BulkHarnessSectionsPanel
          harnessSections={harnessSections}
          harnessPlannedSectionCount={harnessPlannedSectionCount}
          currentRow={currentRow}
          totalRows={totalRows}
          isProcessing={false}
          variant="details-flat"
          hideHeader
          activeIndicator="border"
          blogImportCompact
        />
      ) : null}
    </>
  );
}

function BulkGeneratorIdleDetail(props: BulkGeneratorDetailsPanelProps): ReactNode {
  const {
    variant,
    workspaceBusy,
    headerProgress,
    isProcessing,
    postDestination,
    wpConfig,
    draftPreview,
    importedFileName,
    csvFileName,
    rowCount,
    generatedRowCount,
    selectedCount,
  } = props;

  return (
    <>
      {variant === "blog-import" && draftPreview && importedFileName ? (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center gap-1 px-2.5 py-1.5 text-base text-muted-foreground hover:text-foreground sm:px-3">
            <ChevronDown className="h-4 w-4" aria-hidden />
            Section headings
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 max-h-48 list-decimal space-y-1 overflow-y-auto pl-5">
              {draftPreview.sections.map((s) => (
                <li key={s.h2}>
                  <span className="font-medium text-foreground">{s.h2}</span>
                  {s.body ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({s.body.slice(0, 80)}
                      {s.body.length > 80 ? "…" : ""})
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {variant === "csv" && isProcessing && headerProgress?.phase ? (
        <WorkspaceDetailsKvRow label="Phase" value={headerProgress.phase} stripeIndex={0} />
      ) : null}
      {variant === "csv" && !csvFileName ? (
        <p className="px-2.5 py-1.5 text-muted-foreground sm:px-3">
          Select a CSV file to load rows and configure export.
        </p>
      ) : null}

      {variant === "prompt" && !isProcessing ? (
        <p className="px-2.5 py-1.5 text-muted-foreground sm:px-3">
          {hasGeneratedChecklistCopy(generatedRowCount ?? 0, selectedCount ?? 0)}
        </p>
      ) : null}

      {variant === "blog-import" && !draftPreview ? (
        <p className="px-2.5 py-1.5 text-base text-white sm:px-3">
          Upload a draft file to preview H2 sections and configure export.
        </p>
      ) : null}

      {variant === "blog-import" && !hasBlogImportOutputFiles(props) ? (
        <p className="px-2.5 py-1.5 text-base text-white sm:px-3">
          Run Play to upload your draft and write meta (content + JSON).
        </p>
      ) : null}


      {wpConfig && postDestination !== "local" && variant !== "prompt" ? (
        <div className="px-2.5 py-2 sm:px-3">
          <WordPressPostingConfig
            {...wpConfig}
            isDisabled={workspaceBusy}
            hideDestinationRadios
            hideScheduleFields
            hideSitemapField={variant === "csv" || variant === "prompt"}
          />
        </div>
      ) : null}
    </>
  );
}

export function BulkGeneratorDetailsPanel(props: BulkGeneratorDetailsPanelProps) {
  const {
    variant,
    headerProgress,
    isProcessing,
    status = "",
    isGeneratingChecklist = false,
    checklistPhase = "",
    harnessSections,
    harnessPlannedSectionCount,
    currentRow,
    totalRows,
    displayRows,
    canDownloadBlog,
    onDownloadBlog,
  } = props;

  const isBlogImport = variant === "blog-import";
  const pipelineBusy = isBlogImport && Boolean(headerProgress?.phase?.trim());
  const runBusy = isProcessing && !isBlogImport;
  const activeRow = displayRows[currentRow];

  return (
    <WorkspaceDetailsStack>
      {isBlogImport ? (
        <BlogImportWorkspaceInline
          postDestination={props.postDestination}
          importedFileName={props.importedFileName}
        />
      ) : (
        <WorkspaceDetailsSection title="Workspace" stripeIndex={0}>
          <BulkGeneratorWorkspaceContext {...props} />
        </WorkspaceDetailsSection>
      )}

      <WorkspaceDetailsSection title="Run detail" stripeIndex={1} defaultOpen>
        {(variant === "prompt" || variant === "csv") &&
        ((props.sitemapInventoryLinks?.length ?? 0) > 0 ||
          props.siteKwHostedLink ||
          props.sitemapInventoryLoading) ? (
          <BulkSitemapInventoryRunDetail
            links={props.sitemapInventoryLinks ?? []}
            gscHostedLink={props.siteKwHostedLink ?? null}
            loading={props.sitemapInventoryLoading}
          />
        ) : null}

        {pipelineBusy && headerProgress && isBlogImport ? (
          <BlogImportRunDetail
            headerProgress={headerProgress}
            harnessSections={harnessSections}
            harnessPlannedSectionCount={harnessPlannedSectionCount}
            currentRow={currentRow}
            totalRows={totalRows}
            canDownloadBlog={Boolean(canDownloadBlog)}
            onDownloadBlog={onDownloadBlog}
          />
        ) : pipelineBusy && headerProgress ? (
          <WorkspaceDetailsLiveMessage message={headerProgress.phase} stripeIndex={0} />
        ) : null}

        {runBusy ? (
          <BulkPromptCsvRunDetail
            activeRow={activeRow}
            status={status}
            currentRow={currentRow}
            totalRows={totalRows}
            harnessSections={harnessSections}
            harnessPlannedSectionCount={harnessPlannedSectionCount}
          />
        ) : !pipelineBusy && !isProcessing ? (
          <BulkGeneratorIdleDetail {...props} />
        ) : null}
      </WorkspaceDetailsSection>
    </WorkspaceDetailsStack>
  );
}

function hasBlogImportOutputFiles(props: BulkGeneratorDetailsPanelProps): boolean {
  const files = props.filesByRow?.get(props.currentRow) ?? [];
  return files.some((f) => f.status === "completed");
}
function hasGeneratedChecklistCopy(generatedRowCount: number, selectedCount: number): string {
  if (generatedRowCount === 0) {
    return "Generate blog ideas from the toolbar, then run processing on selected rows.";
  }
  if (selectedCount === 0) {
    return `${generatedRowCount} idea${generatedRowCount !== 1 ? "s" : ""} generated. Select rows in the list below, then Run.`;
  }
  return `${selectedCount} of ${generatedRowCount} idea${generatedRowCount !== 1 ? "s" : ""} selected for processing.`;
}

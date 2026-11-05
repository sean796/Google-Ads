import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { ImageThumbnail } from "@/components/OutputManager/ImageThumbnail";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BlogIdeaRowCompact } from "@/components/keyword-research/bulk/BlogIdeaRowCompact";
import { BULK_CSV_ROW_ACTIVE_CLASS } from "@/components/keyword-research/bulk/BulkCsvRunRowCompact";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { bulkCsvRowRunStatus } from "@/lib/bulk/bulk-csv-row-run-status";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { BLOG_IMPORT_POST_DESTINATION_CHOICES } from "@/lib/bulk-auto-generate";
import type { BulkRowSitemapType, BulkSitemapMode } from "@/lib/bulk/bulk-sitemap-mode";
import { resolveRowSitemapType } from "@/lib/bulk/bulk-sitemap-mode";
import { getStatusIcon, isImageWithPreview } from "@/components/keyword-research/bulk/bulk-utils";
import { publishedLinkFromRowFiles } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import { cn } from "@/lib/utils";
import { Button, SelectField } from "@/ui";

export type BulkCsvRunProgressGridProps = {
  displayRows: CSVRow[];
  filesByRow: Map<number, BulkGeneratedFile[]>;
  currentRow: number;
  isProcessing: boolean;
  processingStatus: string;
  failedRowIndices: ReadonlySet<number>;
  failedRowMessages?: Readonly<Record<number, string>>;
  downloadFile: (file: BulkGeneratedFile) => void;
  downloadRowFiles: (rowIndex: number) => void;
  downloadRunContentCsv: () => void;
  runContentCsvAvailable: boolean;
  placeholderRowCount?: number;
  sitemapMode?: BulkSitemapMode;
  siteFallbackSitemapType?: BulkRowSitemapType;
  onRowSitemapChange?: (rowIndex: number, value: BulkRowSitemapType) => void;
  sitemapControlDisabled?: boolean;
  onRowChange?: (rowIndex: number, patch: Partial<CSVRow>) => void;
  directionsSiteName?: string;
  publishDateLabelByIndex?: Record<number, string>;
  draftOnly?: boolean;
  showPostDestination?: boolean;
  postDestinationChoices?: WordPressPostDestination[];
  headerPostDestination?: WordPressPostDestination;
  onDropFiles?: (files: File[]) => void;
  dropDisabled?: boolean;
};

function rowCanDownload(files: BulkGeneratedFile[]): boolean {
  return files.some((f) => f.status === "completed");
}

const BULK_CSV_FILE_STACK_CLASS = "flex flex-col gap-0 pt-2.5";

function bulkFileAccordionLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("keyword-research-dfs")) return "DataForSEO JSON";
  if (lower.startsWith("sem_rush") || lower.startsWith("semrush")) return "Semrush JSON";
  if (lower.includes("checklist")) return "Checklist";
  if (lower.includes("blueprint")) return "Blueprint";
  if (lower.includes("markdown") || lower.endsWith(".md")) return "Markdown";
  if (lower.includes("wikipedia")) return "Wikipedia";
  return fileName;
}

/** One Content Optimizer-style accordion: all row files hidden until expanded. */
function BulkCsvRowFilesAccordion({
  files,
  rowIndex,
  onDownloadFile,
  onDownloadRow,
  canDownloadRow,
}: {
  files: BulkGeneratedFile[];
  rowIndex: number;
  onDownloadFile: (file: BulkGeneratedFile) => void;
  onDownloadRow: () => void;
  canDownloadRow: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;

  const completedCount = files.filter((f) => f.status === "completed").length;

  return (
    <div className={cn(BULK_CSV_FILE_STACK_CLASS, "px-0 pb-2")}>
      <div className={cn(contentOptimizerRowStripeClass(rowIndex + 1), "w-full min-w-0")}>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="quiet"
            >
              <span className="min-w-0 flex-1 break-words text-left text-white">Research docs</span>
              <span
                className="shrink-0 tabular-nums text-base font-medium text-semantic-analysis-foreground"
                title={`${completedCount} of ${files.length} ready`}
              >
                {completedCount.toLocaleString()}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-foreground transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 px-2.5 pb-2 pt-2 sm:px-3">
            {files.map((file) => {
              const label = bulkFileAccordionLabel(file.fileName);
              const showImagePreview = isImageWithPreview(file);
              return (
                <div key={file.id} className="w-full min-w-0">
                  <div className="flex min-h-[2.75rem] items-center gap-2">
                    <span className="shrink-0">{getStatusIcon(file)}</span>
                    <span
                      className="min-w-0 flex-1 break-words text-base text-foreground"
                      title={file.fileName}
                    >
                      {label}
                    </span>
                    {file.status === "completed" ? (
                      <Button
                        size="icon" icon={Download}
                        variant="quiet"
                        type="button"
                        title={`Download ${file.fileName}`}
                        aria-label={`Download ${file.fileName}`}
                        onClick={() => onDownloadFile(file)}
                      ></Button>
                    ) : null}
                  </div>
                  {file.status === "error" && file.error ? (
                    <p className="mt-1 text-base text-ui-danger-hover">{file.error}</p>
                  ) : showImagePreview ? (
                    <div className="mt-1">
                      <ImageThumbnail src={file.content} alt={file.fileName} size={120} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canDownloadRow ? (
              <div className="flex justify-end pt-1">
                <Button
                  variant="quiet"
                  type="button"
                  onClick={onDownloadRow}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  Row files
                </Button>
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

function CsvSitemapFooter({
  sitemapMode,
  rowSitemapType,
  onRowSitemapChange,
  disabled,
}: {
  sitemapMode: BulkSitemapMode;
  rowSitemapType: BulkRowSitemapType;
  onRowSitemapChange?: (value: BulkRowSitemapType) => void;
  disabled?: boolean;
}) {
  if (sitemapMode !== "custom" || !onRowSitemapChange) return null;
  return (
    <div className="flex items-center gap-2 px-2.5 pb-2 pt-0 sm:px-3">
      <span className="w-[5.75rem] shrink-0 text-base text-muted-foreground sm:w-[6.5rem]">Sitemap</span>
      <SelectField
        placeholder="Sitemap type"
        value={rowSitemapType}
        onValueChange={(v) => onRowSitemapChange(v as BulkRowSitemapType)}
        options={[
          { value: "post", label: "Post" },
          { value: "entity", label: "Entity" },
        ]}
        disabled={disabled}
      />
    </div>
  );
}

export function BulkCsvRunProgressGrid({
  displayRows,
  filesByRow,
  currentRow,
  isProcessing,
  processingStatus,
  failedRowIndices,
  failedRowMessages = {},
  downloadFile,
  downloadRowFiles,
  downloadRunContentCsv,
  runContentCsvAvailable,
  placeholderRowCount = BULK_GENERATOR_EMPTY_ROW_COUNT,
  sitemapMode = "post",
  siteFallbackSitemapType = "post",
  onRowSitemapChange,
  sitemapControlDisabled = false,
  onRowChange,
  directionsSiteName,
  publishDateLabelByIndex = {},
  draftOnly = false,
  showPostDestination = false,
  postDestinationChoices = BLOG_IMPORT_POST_DESTINATION_CHOICES,
  headerPostDestination = "local",
  onDropFiles,
  dropDisabled = false,
}: BulkCsvRunProgressGridProps) {
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isProcessing) return;
    setExpandedRowIndex((prev) => (prev === currentRow ? prev : currentRow));
  }, [currentRow, isProcessing]);

  const rowsToRender = useMemo(() => {
    const contentCount = displayRows.length;
    const target = Math.max(contentCount, placeholderRowCount);
    if (contentCount >= target) return displayRows;
    return [
      ...displayRows,
      ...Array.from({ length: target - contentCount }, () => ({} as CSVRow)),
    ];
  }, [displayRows, placeholderRowCount]);

  const contentRowCount = displayRows.length;
  const isPlaceholderSlot = (rowIndex: number) => rowIndex >= contentRowCount;

  const toggleRow = (rowIndex: number) => {
    if (isPlaceholderSlot(rowIndex)) return;
    setExpandedRowIndex((prev) => (prev === rowIndex ? null : rowIndex));
  };

  const renderRow = (row: CSVRow, rowIndex: number) => {
    const placeholder = isPlaceholderSlot(rowIndex);
    const status = placeholder
      ? "idle"
      : bulkCsvRowRunStatus({
          rowIndex,
          currentRow,
          isProcessing,
          filesByRow,
          failedRowIndices,
        });
    const files = filesByRow.get(rowIndex) ?? [];
    const previewUrl = publishedLinkFromRowFiles(files) ?? undefined;
    const rowSitemapType = placeholder
      ? siteFallbackSitemapType
      : resolveRowSitemapType(sitemapMode, row, siteFallbackSitemapType);
    const isExpanded = !placeholder && expandedRowIndex === rowIndex;
    const panelId = `bulk-csv-row-${rowIndex}`;
    const rowActive = status === "generating";
    const canDownloadRow = !placeholder && rowCanDownload(files);
    const rowBody = (
      <BlogIdeaRowCompact
        row={row}
        index={rowIndex}
        stripeIndex={rowIndex}
        isSelected={false}
        isExpanded={isExpanded}
        isProcessing={isProcessing}
        busy={rowActive}
        activeOptimize={rowActive}
        placeholder={placeholder}
        showSelect={false}
        showDirections={false}
        directionsSiteName={directionsSiteName}
        previewUrl={previewUrl}
        publishDateLabel={publishDateLabelByIndex[rowIndex]}
        draftOnly={draftOnly}
        onToggleSelect={() => {}}
        onToggleExpand={() => toggleRow(rowIndex)}
        onRowChange={(patch) => onRowChange?.(rowIndex, patch)}
        showPostDestination={showPostDestination}
        postDestinationChoices={postDestinationChoices}
        headerPostDestination={headerPostDestination}
      />
    );

    if (!isExpanded) {
      return (
        <div key={rowIndex} className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS, "shrink-0")}>
          {rowBody}
        </div>
      );
    }

    return (
      <div key={rowIndex} className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS, "shrink-0")}>
        <div
          id={panelId}
          className={cn(
            CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
            rowActive && BULK_CSV_ROW_ACTIVE_CLASS,
          )}
        >
          {rowBody}

          <CsvSitemapFooter
            sitemapMode={sitemapMode}
            rowSitemapType={rowSitemapType}
            onRowSitemapChange={
              onRowSitemapChange ? (value) => onRowSitemapChange(rowIndex, value) : undefined
            }
            disabled={sitemapControlDisabled || isProcessing}
          />

          {files.length > 0 ? (
            <BulkCsvRowFilesAccordion
              files={files}
              rowIndex={rowIndex}
              onDownloadFile={downloadFile}
              onDownloadRow={() => downloadRowFiles(rowIndex)}
              canDownloadRow={canDownloadRow}
            />
          ) : null}

          {runContentCsvAvailable && rowIndex === displayRows.length - 1 ? (
            <div className="mb-2 flex justify-end px-2.5 sm:px-3">
              <Button
                variant="quiet"
                type="button"
                onClick={downloadRunContentCsv}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Combined CSV
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS} aria-label="CSV rows"
      onDragOver={
        onDropFiles
          ? (e) => {
              e.preventDefault();
            }
          : undefined
      }
      onDrop={
        onDropFiles
          ? (e) => {
              e.preventDefault();
              if (dropDisabled) return;
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length) onDropFiles(files);
            }
          : undefined
      }
    >
      <div>
        {rowsToRender.map((row, rowIndex) => renderRow(row, rowIndex))}
      </div>
    </div>
  );
}

import { useMemo, useRef } from "react";
import { BarChart3, Download, Upload } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { VerticalBenchmarkContentPills } from "@/components/vertical-benchmark/VerticalBenchmarkContentPills";
import { ContentOptimizerDetailsDrawer } from "@/components/overview/overview-tab/ContentOptimizerDetailsDrawer";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_ICON_RUN_BTN,
  BULK_HEADER_ICON_TOOL_BTN,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  buildVerticalBenchmarkMicroSnapshot,
  verticalBenchmarkProgressBusy,
} from "@/lib/vertical-benchmark/vertical-benchmark-header-progress";
import { buildVerticalBenchmarkBulkGeneratorDetailsProps } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-details-bindings";
import type { BenchmarkGridCsvContext } from "@/lib/vertical-benchmark/vertical-benchmark-grid-entity";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgress,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";
import type { ContentTypeFilter } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import type { BenchmarkBulkTemplateDownloadResult } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-template";
import { Button, Field, FileInput, SelectField, TextButton } from "@/ui";

const DETAILS_PANEL_ID = "vertical-benchmark-details-panel";

export type VerticalBenchmarkWorkspaceHeaderProps = {
  contentTypeFilter: ContentTypeFilter;
  onContentTypeFilterChange: (value: ContentTypeFilter) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagFilterOptions: string[];
  onCreateBulkTemplate: (opts?: {
    skipAutoDownload?: boolean;
    blogCountOverride?: number;
  }) => Promise<BenchmarkBulkTemplateDownloadResult | null>;
  onDownloadBulkTemplate: () => void;
  canDownloadBulkTemplate: boolean;
  onGridCsvFile: (file: File | null) => void | Promise<void>;
  onClearGridCsv: () => void;
  exporting: boolean;
  generatingBulkTemplate: boolean;
  busy: boolean;
  exportProgress: BenchmarkPipelineProgress | null;
  bulkTemplateProgress: BenchmarkPipelineProgress | null;
  bulkInventoryLinks: BenchmarkInventoryHostedLink[];
  gridCsvContext: BenchmarkGridCsvContext | null;
  gridCsvFileName: string | null;
  gridCsvParsing: boolean;
  rosterCount: number;
  selectedCount: number;
  blogCount: number;
  onBlogCountChange: (value: number) => void;
};

export function VerticalBenchmarkWorkspaceHeader({
  contentTypeFilter,
  onContentTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  tagFilterOptions,
  onCreateBulkTemplate,
  onDownloadBulkTemplate,
  canDownloadBulkTemplate,
  onGridCsvFile,
  onClearGridCsv,
  exporting,
  generatingBulkTemplate,
  busy,
  exportProgress,
  bulkTemplateProgress,
  bulkInventoryLinks,
  gridCsvContext,
  gridCsvFileName,
  gridCsvParsing,
  rosterCount,
  selectedCount,
  blogCount,
  onBlogCountChange,
}: VerticalBenchmarkWorkspaceHeaderProps) {
  const gridFileInputRef = useRef<HTMLInputElement>(null);

  const progressSnapshot = useMemo(
    () =>
      buildVerticalBenchmarkMicroSnapshot({
        exporting,
        generatingBulkTemplate,
        exportProgress,
        bulkTemplateProgress,
      }),
    [exporting, generatingBulkTemplate, exportProgress, bulkTemplateProgress],
  );

  const isProcessing = verticalBenchmarkProgressBusy({
    exporting,
    generatingBulkTemplate,
  });
  const canOpenDetails =
    busy ||
    Boolean(bulkTemplateProgress) ||
    Boolean(exportProgress) ||
    bulkInventoryLinks.length > 0 ||
    Boolean(gridCsvContext) ||
    rosterCount > 0 ||
    selectedCount > 0;

  const drawerProps = useMemo(
    () =>
      buildVerticalBenchmarkBulkGeneratorDetailsProps({
        busy,
        exporting,
        generatingBulkTemplate,
        exportProgress,
        bulkTemplateProgress,
        bulkInventoryLinks,
        selectedCount,
        rosterCount,
        tagFilter,
        gridCsvContext,
        gridCsvFileName,
        contentTypeFilter,
        blogCount,
      }),
    [
      busy,
      exporting,
      generatingBulkTemplate,
      exportProgress,
      bulkTemplateProgress,
      bulkInventoryLinks,
      selectedCount,
      rosterCount,
      tagFilter,
      gridCsvContext,
      gridCsvFileName,
      contentTypeFilter,
      blogCount,
    ],
  );

  return (
    <UnifiedWorkspaceChrome
      icon={BarChart3}
      title="Industry verticals"
      titleRowEnd={
        <VerticalBenchmarkContentPills
          contentTypeFilter={contentTypeFilter}
          onContentTypeFilterChange={onContentTypeFilterChange}
          disabled={busy}
        />
      }
      workspaceBusy={busy}
      progressSnapshot={progressSnapshot}
      canOpenDetails={canOpenDetails}
      isProcessing={isProcessing}
      detailsPanelId={DETAILS_PANEL_ID}
      detailsPanel={
        <ContentOptimizerDetailsDrawer postDestination="local" {...drawerProps} />
      }
      toolbar={
        <>
          <SelectField placeholder="Category" value={tagFilterOptions.includes(tagFilter) ? tagFilter : (tagFilterOptions[0] ?? undefined)} onValueChange={onTagFilterChange} options={tagFilterOptions.map((label) => ({ value: label, label: label }))} />
          <FileInput
            ref={gridFileInputRef}
            accept=".csv,text/csv"
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void onGridCsvFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="quiet"
            type="button"
            disabled={gridCsvParsing}
            aria-label="Upload grid CSV"
            title="Upload Local Dominator grid CSV"
            onClick={() => gridFileInputRef.current?.click()}
          >
            {gridCsvParsing ? (
              null
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            Grid
          </Button>
          {gridCsvContext ? (
            <span className="flex max-w-[12rem] items-center gap-1.5 text-base text-muted-foreground">
              <span className="break-words" title={gridCsvFileName ?? undefined}>
                {gridCsvFileName ?? "Grid"} ({gridCsvContext.matchedRowCount} rows)
              </span>
              <TextButton
                type="button"
                onClick={onClearGridCsv}
              >
                Clear
              </TextButton>
            </span>
          ) : null}
          <Field
            type="number"
            min={1}
            max={50}
            step={1}
            value={blogCount}
            disabled={busy}
            placeholder="Blogs"
            aria-label="Blogs"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) onBlogCountChange(n);
            }}
          />
          <Button
            variant="run"
            type="button"
            disabled={busy}
            title="Curate bulk CSV from GSC for selected clients"
            onClick={() => void onCreateBulkTemplate()}
          >
            {generatingBulkTemplate ? (
              null
            ) : null}
            Curate
          </Button>
          <Button
            variant="run"
            type="button"
            disabled={!canDownloadBulkTemplate || busy}
            title="Download curated bulk CSV"
            aria-label="Download curated bulk CSV"
            onClick={onDownloadBulkTemplate}
          >
            <Download className="h-4 w-4" aria-hidden />
          </Button>
        </>
      }
    />
  );
}

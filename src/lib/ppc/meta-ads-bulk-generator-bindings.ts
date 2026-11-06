import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
  type BlogImportHeaderProgress,
} from "@/lib/bulk/blog-import-header-progress";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildMetaAdDeliverableFiles, metaAdRowDisplayName } from "@/lib/ppc/meta-ad-deliverable-files";
import {
  META_ADS_PIPELINE_TITLES,
  META_ADS_PREP_STEP_IDS,
  type MetaGenerateStepId,
} from "@/lib/ppc/meta-ads-progress-types";
import type { MetaGenerateProgressState } from "@/lib/ppc/meta-ads-progress-types";
import {
  clampMetaAdCount,
  resolveMetaRowAdName,
  resolveMetaRowFocusKeyword,
  type MetaAdRow,
  type MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import type { PpcPageBucketHostedLink } from "@/lib/ppc/ppc-page-bucket-inventory";
import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

const META_PREP_LABELS: Record<string, string> = {
  "read-master-rules": "Reading master rules",
  "load-context": "Loading page context",
};

const META_RUN_LABEL = "Meta ad";

function mapStepStatus(
  status: MetaGenerateProgressState["steps"][number]["status"],
): BulkHarnessSectionUi["status"] {
  if (status === "running") return "generating";
  if (status === "done") return "done";
  return "waiting";
}

export function metaAdRowToCsvRow(row: MetaAdRow): CSVRow {
  return {
    keyword: resolveMetaRowFocusKeyword(row),
    title: resolveMetaRowAdName(row) || resolveMetaRowFocusKeyword(row) || "Meta ad",
    meta_description: row.copy?.description?.trim() || undefined,
    destination_url: row.landingPageUrl?.trim() || undefined,
    prompt_modifier: row.imagePromptModifier?.trim() || undefined,
  };
}

function resolveDisplayRows(
  ads: MetaAdRow[],
  generateConfig: MetaGenerateConfig,
  isGenerating: boolean,
): MetaAdRow[] {
  const batchSize = clampMetaAdCount(generateConfig.adCount);
  const batchRows = ads.slice(0, batchSize);
  if (isGenerating || batchRows.some((row) => row.status !== "idle")) {
    return batchRows;
  }
  return ads.filter(
    (row) =>
      row.status === "ready" ||
      row.status === "error" ||
      Boolean(row.copy) ||
      Boolean(row.researchSections?.some((section) => section.status === "done")),
  );
}

function resolveCurrentRow(displayRows: MetaAdRow[]): number {
  const generatingIndex = displayRows.findIndex((row) => row.status === "generating");
  if (generatingIndex >= 0) return generatingIndex;
  return displayRows.length ? 0 : -1;
}

function metaPrepHarnessSections(
  generateProgress: MetaGenerateProgressState | null,
): BulkHarnessSectionUi[] {
  if (!generateProgress?.steps.length) return [];
  return generateProgress.steps
    .filter((step) => META_ADS_PREP_STEP_IDS.has(step.id as MetaGenerateStepId))
    .map((step, sectionIndex) => ({
      sectionIndex,
      title: META_PREP_LABELS[step.id] ?? step.label,
      status: mapStepStatus(step.status),
    }));
}

const META_PHASE_TO_TITLE: Record<string, (typeof META_ADS_PIPELINE_TITLES)[number]> = {
  "load-context": "Context research",
  strategy: "Strategy brief",
  copy: "Ad copy",
  "creative-plan": "Creative plan",
  "image-prompt": "Image prompt",
  "image-generate": "Creative image",
};

function rowPhaseHarnessSections(
  generateProgress: MetaGenerateProgressState | null,
  isGenerating: boolean,
  rowReady: boolean,
): BulkHarnessSectionUi[] {
  const progressByTitle = new Map<string, MetaGenerateProgressState["steps"][number]>();
  for (const step of generateProgress?.steps ?? []) {
    const title = META_PHASE_TO_TITLE[step.id];
    if (title) progressByTitle.set(title, step);
  }

  if (isGenerating || rowReady) {
    return META_ADS_PIPELINE_TITLES.map((title, sectionIndex) => {
      const phaseStep = progressByTitle.get(title);
      const status = rowReady
        ? ("done" as const)
        : phaseStep
          ? mapStepStatus(phaseStep.status)
          : ("waiting" as const);
      return {
        sectionIndex,
        title,
        status,
        markdown: phaseStep?.status === "running" ? phaseStep.label : undefined,
      };
    });
  }

  return [];
}

function metaLiveHarnessSections(
  generateProgress: MetaGenerateProgressState | null,
  isGenerating: boolean,
): BulkHarnessSectionUi[] {
  return rowPhaseHarnessSections(generateProgress, isGenerating, false);
}

function buildHarnessByRow(displayRows: MetaAdRow[]): Map<number, BulkHarnessSectionUi[]> {
  const map = new Map<number, BulkHarnessSectionUi[]>();
  displayRows.forEach((row, index) => {
    const ready =
      row.status === "ready" ||
      Boolean(row.copy) ||
      Boolean(row.creative?.imagePreviewUrl || row.creative?.imageBase64);
    if (ready) {
      map.set(index, rowPhaseHarnessSections(null, false, true));
    }
  });
  return map;
}

function metaRowToGeneratedFiles(
  row: MetaAdRow,
  rowIndex: number,
  pageBucketHostedLink?: PpcPageBucketHostedLink | null,
): BulkGeneratedFile[] {
  const slug = metaAdRowDisplayName(row, rowIndex);
  const rowData = metaAdRowToCsvRow(row);
  let ts = Date.now();
  const files: BulkGeneratedFile[] = [];

  if (rowIndex === 0 && pageBucketHostedLink?.href) {
    files.push({
      id: `meta-${rowIndex}-page-bucket`,
      rowIndex,
      fileName: "page-bucket-link.txt",
      content: `${pageBucketHostedLink.href}\nRows: ${pageBucketHostedLink.rowCount}`,
      mimeType: "text/plain;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  for (const file of buildMetaAdDeliverableFiles(row, slug)) {
    files.push({
      id: `meta-${rowIndex}-${file.name}`,
      rowIndex,
      fileName: file.name,
      content: file.content,
      mimeType: file.mimeType,
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  return files;
}

function buildFilesByRow(
  displayRows: MetaAdRow[],
  pageBucketHostedLink?: PpcPageBucketHostedLink | null,
): Map<number, BulkGeneratedFile[]> {
  const map = new Map<number, BulkGeneratedFile[]>();
  displayRows.forEach((row, index) => {
    const files = metaRowToGeneratedFiles(row, index, pageBucketHostedLink);
    if (files.length) map.set(index, files);
  });
  return map;
}

function metaLiveStatus(
  generateProgress: MetaGenerateProgressState | null,
  isGenerating: boolean,
): string {
  if (!isGenerating) return "";
  const active = generateProgress?.steps.find((step) => step.status === "running");
  return active?.label?.trim() || generateProgress?.label?.trim() || "";
}

export function metaAdsHeaderProgressFromRun(options: {
  generateProgress: MetaGenerateProgressState | null;
  isGenerating: boolean;
  currentRow: number;
  totalRows: number;
}): BlogImportHeaderProgress | null {
  const status = metaLiveStatus(options.generateProgress, options.isGenerating);
  if (!options.isGenerating && !status) return null;
  return blogImportHeaderProgressFromBulk({
    status,
    isProcessing: options.isGenerating,
    harnessSections: metaLiveHarnessSections(options.generateProgress, options.isGenerating),
    currentRow: options.currentRow,
    batchRowProgress:
      options.isGenerating && options.totalRows > 0
        ? { current: Math.max(0, options.currentRow), total: options.totalRows }
        : undefined,
  });
}

export function buildMetaAdsBulkMicroSnapshot(options: {
  generateProgress: MetaGenerateProgressState | null;
  isGenerating: boolean;
  currentRow: number;
  totalRows: number;
  siteName?: string;
}): MetaBulkMicroSnapshot | null {
  const headerProgress = metaAdsHeaderProgressFromRun(options);
  const siteSuffix = options.siteName?.trim() ? ` · ${options.siteName.trim()}` : "";
  return buildBlogImportMicroSnapshot(headerProgress, `${META_RUN_LABEL}${siteSuffix}`);
}

export function metaAdsDetailsCanOpen(options: {
  ads: MetaAdRow[];
  generateProgress: MetaGenerateProgressState | null;
  isGenerating: boolean;
}): boolean {
  const hasRows = options.ads.some(
    (row) =>
      row.status !== "idle" ||
      Boolean(row.copy) ||
      Boolean(row.researchSections?.some((section) => section.status === "done")),
  );
  const hasProgress = Boolean(
    options.generateProgress?.steps.some((step) => step.status !== "waiting"),
  );
  return workspaceDetailsCanOpen(hasRows, options.isGenerating, false, false) || hasProgress;
}

export function buildMetaAdsBulkGeneratorDetailsProps(options: {
  ads: MetaAdRow[];
  generateConfig: MetaGenerateConfig;
  generateProgress: MetaGenerateProgressState | null;
  isGenerating: boolean;
  workspaceBusy: boolean;
  pageBucketHostedLink?: PpcPageBucketHostedLink | null;
}): BulkGeneratorDetailsPanelProps {
  const displayRowModels = resolveDisplayRows(options.ads, options.generateConfig, options.isGenerating);
  const displayRows = displayRowModels.map(metaAdRowToCsvRow);
  const currentRow = resolveCurrentRow(displayRowModels);
  const headerProgress = metaAdsHeaderProgressFromRun({
    generateProgress: options.generateProgress,
    isGenerating: options.isGenerating,
    currentRow,
    totalRows: displayRows.length,
  });
  const downloadManager = new BulkFileManager();

  return {
    variant: "csv",
    workspaceBusy: options.workspaceBusy,
    headerProgress,
    isProcessing: options.isGenerating,
    status: metaLiveStatus(options.generateProgress, options.isGenerating),
    harnessSections: metaLiveHarnessSections(options.generateProgress, options.isGenerating),
    harnessByRow: buildHarnessByRow(displayRowModels),
    batchPrepHarnessSections: metaPrepHarnessSections(options.generateProgress),
    harnessPlannedSectionCount: META_ADS_PIPELINE_TITLES.length,
    prepAccordionTitle: "Context prep",
    pipelineSectionTitles: [...META_ADS_PIPELINE_TITLES],
    currentRow,
    totalRows: displayRows.length,
    displayRows,
    postDestination: "local",
    wpConfig: null,
    filesByRow: buildFilesByRow(displayRowModels, options.pageBucketHostedLink),
    downloadFile: (file) => {
      downloadManager.downloadFile(file);
    },
  };
}

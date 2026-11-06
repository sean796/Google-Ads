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
import {
  CONTENT_CREATOR_PIPELINE_TITLES,
  CONTENT_CREATOR_PREP_STEP_IDS,
  type ContentGenerateProgressState,
  type ContentGenerateStepId,
} from "@/lib/social/content-creator-progress-types";
import {
  clampContentPostCount,
  contentRowDisplayLabel,
  contentRowIsGenerated,
  cellString,
  type ContentCalendarRow,
  type ContentCreatorGenerateConfig,
} from "@/lib/social/content-creator-types";
import type { PpcPageBucketHostedLink } from "@/lib/ppc/ppc-page-bucket-inventory";
import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

const PREP_LABELS: Record<string, string> = {
  schedule: "Building schedule",
  "load-context": "Loading page context",
};

const RUN_LABEL = "Content calendar";

function mapStepStatus(
  status: ContentGenerateProgressState["steps"][number]["status"],
): BulkHarnessSectionUi["status"] {
  if (status === "running") return "generating";
  if (status === "done") return "done";
  return "waiting";
}

export function contentCalendarRowToCsvRow(row: ContentCalendarRow, index: number): CSVRow {
  return {
    keyword: cellString(row.keyword) || undefined,
    title: contentRowDisplayLabel(row, index),
    meta_description: cellString(row.fbInstagramContent) || cellString(row.linkedinContent) || undefined,
    destination_url: cellString(row.landingPageUrl) || undefined,
    prompt_modifier: cellString(row.promptModifier) || undefined,
  };
}

function resolveDisplayRows(
  rows: ContentCalendarRow[],
  generateConfig: ContentCreatorGenerateConfig,
  isGenerating: boolean,
): ContentCalendarRow[] {
  const batchSize = clampContentPostCount(generateConfig.postCount);
  const batchRows = rows.slice(0, batchSize);
  if (isGenerating || batchRows.some((row) => row.status !== "idle")) {
    return batchRows;
  }
  return rows.filter((row) => row.status === "ready" || row.status === "error" || contentRowIsGenerated(row));
}

function resolveCurrentRow(displayRows: ContentCalendarRow[]): number {
  const generatingIndex = displayRows.findIndex((row) => row.status === "generating");
  if (generatingIndex >= 0) return generatingIndex;
  return displayRows.length ? 0 : -1;
}

function prepHarnessSections(
  generateProgress: ContentGenerateProgressState | null,
): BulkHarnessSectionUi[] {
  if (!generateProgress?.steps.length) return [];
  return generateProgress.steps
    .filter((step) => CONTENT_CREATOR_PREP_STEP_IDS.has(step.id as ContentGenerateStepId))
    .map((step, sectionIndex) => ({
      sectionIndex,
      title: PREP_LABELS[step.id] ?? step.label,
      status: mapStepStatus(step.status),
    }));
}

const PHASE_TO_TITLE: Record<string, (typeof CONTENT_CREATOR_PIPELINE_TITLES)[number]> = {
  "load-context": "Context research",
  keyword: "Keyword",
  "social-copy": "Social copy",
  "prompt-modifier": "Prompt modifier",
};

function rowPhaseHarnessSections(
  generateProgress: ContentGenerateProgressState | null,
  isGenerating: boolean,
  rowReady: boolean,
): BulkHarnessSectionUi[] {
  const progressByTitle = new Map<string, ContentGenerateProgressState["steps"][number]>();
  for (const step of generateProgress?.steps ?? []) {
    const title = PHASE_TO_TITLE[step.id];
    if (title) progressByTitle.set(title, step);
  }

  if (isGenerating || rowReady) {
    return CONTENT_CREATOR_PIPELINE_TITLES.map((title, sectionIndex) => {
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

function liveHarnessSections(
  generateProgress: ContentGenerateProgressState | null,
  isGenerating: boolean,
): BulkHarnessSectionUi[] {
  return rowPhaseHarnessSections(generateProgress, isGenerating, false);
}

function buildHarnessByRow(displayRows: ContentCalendarRow[]): Map<number, BulkHarnessSectionUi[]> {
  const map = new Map<number, BulkHarnessSectionUi[]>();
  displayRows.forEach((row, index) => {
    const ready = row.status === "ready" || contentRowIsGenerated(row);
    if (ready) {
      map.set(index, rowPhaseHarnessSections(null, false, true));
    }
  });
  return map;
}

function buildDeliverableFiles(row: ContentCalendarRow, rowIndex: number): BulkGeneratedFile[] {
  const rowData = contentCalendarRowToCsvRow(row, rowIndex);
  const slug = contentRowDisplayLabel(row, rowIndex);
  let ts = Date.now();
  const files: BulkGeneratedFile[] = [];

  const sections: Array<{ name: string; content: string }> = [
    { name: "fb-instagram.txt", content: cellString(row.fbInstagramContent) },
    { name: "linkedin.txt", content: cellString(row.linkedinContent) },
    { name: "prompt-modifier.txt", content: cellString(row.promptModifier) },
  ];

  for (const file of sections) {
    if (!file.content) continue;
    files.push({
      id: `content-${rowIndex}-${file.name}`,
      rowIndex,
      fileName: `${slug}-${file.name}`,
      content: file.content,
      mimeType: "text/plain;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  for (const section of row.researchSections ?? []) {
    if (section.status !== "done" || !cellString(section.markdown)) continue;
    files.push({
      id: `content-${rowIndex}-${section.id}`,
      rowIndex,
      fileName: `${slug}-${section.id}.md`,
      content: section.markdown,
      mimeType: "text/markdown;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  return files;
}

function buildFilesByRow(
  displayRows: ContentCalendarRow[],
  pageBucketHostedLink?: PpcPageBucketHostedLink | null,
): Map<number, BulkGeneratedFile[]> {
  const map = new Map<number, BulkGeneratedFile[]>();
  displayRows.forEach((row, index) => {
    const files = buildDeliverableFiles(row, index);
    if (index === 0 && pageBucketHostedLink?.href) {
      files.unshift({
        id: `content-${index}-page-bucket`,
        rowIndex: index,
        fileName: "page-bucket-link.txt",
        content: `${pageBucketHostedLink.href}\nRows: ${pageBucketHostedLink.rowCount}`,
        mimeType: "text/plain;charset=utf-8",
        status: "completed",
        timestamp: Date.now(),
        rowData: contentCalendarRowToCsvRow(row, index),
      });
    }
    if (files.length) map.set(index, files);
  });
  return map;
}

function liveStatus(
  generateProgress: ContentGenerateProgressState | null,
  isGenerating: boolean,
): string {
  if (!isGenerating) return "";
  const active = generateProgress?.steps.find((step) => step.status === "running");
  return cellString(active?.label) || cellString(generateProgress?.label) || "";
}

export function contentCreatorHeaderProgressFromRun(options: {
  generateProgress: ContentGenerateProgressState | null;
  isGenerating: boolean;
  currentRow: number;
  totalRows: number;
}): BlogImportHeaderProgress | null {
  const status = liveStatus(options.generateProgress, options.isGenerating);
  if (!options.isGenerating && !status) return null;
  return blogImportHeaderProgressFromBulk({
    status,
    isProcessing: options.isGenerating,
    harnessSections: liveHarnessSections(options.generateProgress, options.isGenerating),
    currentRow: options.currentRow,
    batchRowProgress:
      options.isGenerating && options.totalRows > 0
        ? { current: Math.max(0, options.currentRow), total: options.totalRows }
        : undefined,
  });
}

export function buildContentCreatorBulkMicroSnapshot(options: {
  generateProgress: ContentGenerateProgressState | null;
  isGenerating: boolean;
  currentRow: number;
  totalRows: number;
  siteName?: string;
}): MetaBulkMicroSnapshot | null {
  const headerProgress = contentCreatorHeaderProgressFromRun(options);
  const siteName = cellString(options.siteName);
  const siteSuffix = siteName.length > 0 ? ` · ${siteName}` : "";
  return buildBlogImportMicroSnapshot(headerProgress, `${RUN_LABEL}${siteSuffix}`);
}

export function contentCreatorDetailsCanOpen(options: {
  rows: ContentCalendarRow[];
  generateProgress: ContentGenerateProgressState | null;
  isGenerating: boolean;
}): boolean {
  const hasRows = options.rows.some(
    (row) =>
      row.status !== "idle" ||
      contentRowIsGenerated(row) ||
      Boolean(row.researchSections?.some((section) => section.status === "done")),
  );
  const hasProgress = Boolean(
    options.generateProgress?.steps.some((step) => step.status !== "waiting"),
  );
  return workspaceDetailsCanOpen(hasRows, options.isGenerating, false, false) || hasProgress;
}

export function buildContentCreatorBulkGeneratorDetailsProps(options: {
  rows: ContentCalendarRow[];
  generateConfig: ContentCreatorGenerateConfig;
  generateProgress: ContentGenerateProgressState | null;
  isGenerating: boolean;
  workspaceBusy: boolean;
  pageBucketHostedLink?: PpcPageBucketHostedLink | null;
}): BulkGeneratorDetailsPanelProps {
  const displayRowModels = resolveDisplayRows(
    options.rows,
    options.generateConfig,
    options.isGenerating,
  );
  const displayRows = displayRowModels.map((row, index) => contentCalendarRowToCsvRow(row, index));
  const currentRow = resolveCurrentRow(displayRowModels);
  const headerProgress = contentCreatorHeaderProgressFromRun({
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
    status: liveStatus(options.generateProgress, options.isGenerating),
    harnessSections: liveHarnessSections(options.generateProgress, options.isGenerating),
    harnessByRow: buildHarnessByRow(displayRowModels),
    batchPrepHarnessSections: prepHarnessSections(options.generateProgress),
    harnessPlannedSectionCount: CONTENT_CREATOR_PIPELINE_TITLES.length,
    prepAccordionTitle: "Schedule prep",
    pipelineSectionTitles: [...CONTENT_CREATOR_PIPELINE_TITLES],
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

import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  contentAlreadyHasBlockHtml,
  isGeneratedContentHtml,
} from "@/lib/content-generation/content-format";
import { emptyPromptBlogSlot } from "@/lib/bulk/prompt-blog-slots";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { ELEMENTOR_PRODUCT_SPLASH_PATH } from "@/lib/video-generator/video-product-view-splashes";
import { isImageWithPreview } from "@/components/keyword-research/bulk/bulk-utils";

export type BulkGeneratorStudioVariant = "csv" | "prompt" | "blog-import";

export type BulkGeneratorStudioRowPhase =
  | "placeholder"
  | "idea"
  | "writing"
  | "done"
  | "error";

export type BulkGeneratorStudioListItem = {
  rowIndex: number;
  id: string;
  placeholder: boolean;
  title: string;
  pathLabel: string;
  fullUrlPreview: string;
  thumbUrl: string | null;
  usePlaceholderThumb: boolean;
  phase: BulkGeneratorStudioRowPhase;
  row: CSVRow;
};

export function normalizeBulkGeneratorSiteBaseUrl(siteUrl: string | null | undefined): string | null {
  const raw = siteUrl?.trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    return `${url.origin}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function bulkGeneratorRowPathPreview(
  row: CSVRow,
  siteBaseUrl: string | null,
): { pathLabel: string; fullUrlPreview: string } {
  const dest = row.destination_url?.trim();
  if (dest) {
    try {
      const u = new URL(dest.startsWith("http") ? dest : `https://${dest.replace(/^\/+/, "")}`);
      const path = u.pathname || "/";
      return { pathLabel: path, fullUrlPreview: u.href };
    } catch {
      const path = dest.startsWith("/") ? dest : `/${dest}`;
      const full = siteBaseUrl ? `${siteBaseUrl}${path}` : path;
      return { pathLabel: path, fullUrlPreview: full };
    }
  }

  const slug =
    row.target_slug?.trim() ||
    buildSapSlugFromKeywordEntity(row.keyword ?? "", row.entity ?? "") ||
    "";

  const pathLabel = slug ? `/blog/${slug.replace(/^\/+|\/+$/g, "")}/` : "/blog/…/";
  const fullUrlPreview = siteBaseUrl ? `${siteBaseUrl}${pathLabel}` : pathLabel;
  return { pathLabel, fullUrlPreview };
}

export function pickRowThumbnailFromFiles(files: BulkGeneratedFile[] | undefined): string | null {
  if (!files?.length) return null;
  for (const file of files) {
    if (isImageWithPreview(file)) {
      return file.content;
    }
  }
  return null;
}

export function resolveBulkGeneratorStudioTargetCount(input: {
  variant: BulkGeneratorStudioVariant;
  sourceRowCount: number;
  numberOfBlogs: number;
  minEmptySlotCount: number;
  hasGeneratedChecklist: boolean;
}): number {
  if (input.variant === "prompt" && !input.hasGeneratedChecklist) {
    return Math.max(input.numberOfBlogs, input.sourceRowCount);
  }
  if (input.sourceRowCount > 0) {
    return input.sourceRowCount;
  }
  if (input.variant === "csv" || input.variant === "blog-import") {
    return 0;
  }
  return input.minEmptySlotCount;
}

export function isEmptyBulkGeneratorStudioRow(row: CSVRow): boolean {
  return (
    !row.keyword?.trim() &&
    !row.title?.trim() &&
    !row.import_file_name?.trim()
  );
}

export function resolveBulkGeneratorStudioRowPhase(input: {
  placeholder: boolean;
  hasGeneratedChecklist: boolean;
  variant: BulkGeneratorStudioVariant;
  rowIndex: number;
  currentRow: number;
  isProcessing: boolean;
  failed: boolean;
  hasContentArtifact: boolean;
}): BulkGeneratorStudioRowPhase {
  if (input.placeholder) return "placeholder";
  if (input.failed) return "error";
  if (input.isProcessing && input.rowIndex === input.currentRow) return "writing";
  if (input.hasContentArtifact) return "done";
  if (input.variant === "prompt" && input.hasGeneratedChecklist) return "idea";
  if (input.variant !== "prompt" && !input.isProcessing && !input.hasContentArtifact) {
    return "idea";
  }
  if (input.isProcessing && input.rowIndex < input.currentRow) return "done";
  return "idea";
}

function rowHasContentArtifact(files: BulkGeneratedFile[] | undefined): boolean {
  if (!files?.length) return false;
  return files.some(
    (f) =>
      f.status === "completed" &&
      (f.fileName.startsWith("content-") ||
        f.fileName.endsWith(".md") ||
        f.fileName.endsWith(".html") ||
        f.fileName.startsWith("wordpress-post-")),
  );
}

function latestCompletedContentFile(
  files: BulkGeneratedFile[] | undefined,
  ext: ".md" | ".html",
): BulkGeneratedFile | undefined {
  if (!files?.length) return undefined;
  const completed = files.filter(
    (f) =>
      f.status === "completed" &&
      f.fileName.startsWith("content-") &&
      f.fileName.toLowerCase().endsWith(ext),
  );
  if (completed.length === 0) return undefined;
  return completed.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b));
}

/** Prefer latest content-*.html (WordPress-ready); fall back to content-*.md. */
export function pickLatestRowContentHtml(files: BulkGeneratedFile[] | undefined): string {
  const htmlFile = latestCompletedContentFile(files, ".html");
  const html = htmlFile?.content?.trim() ?? "";
  if (html) return html;

  const mdFile = latestCompletedContentFile(files, ".md");
  const md = mdFile?.content?.trim() ?? "";
  if (!md) return "";
  if (isGeneratedContentHtml(md) || contentAlreadyHasBlockHtml(md)) return md;
  return markdownToHtml(md);
}

export function pickLatestRowMarkdown(files: BulkGeneratedFile[] | undefined): string {
  const mdFile = latestCompletedContentFile(files, ".md");
  return mdFile?.content?.trim() ?? "";
}

export function bulkGeneratorPromptPlaceholderSlotSlug(slotIndex: number): string {
  return `__prompt-slot-${slotIndex}`;
}

function promptPlaceholderSlotRow(slotIndex: number): CSVRow {
  return {
    ...emptyPromptBlogSlot(),
    target_slug: bulkGeneratorPromptPlaceholderSlotSlug(slotIndex),
  };
}

function displayTitleForRow(row: CSVRow, placeholder: boolean, slotIndex: number): string {
  if (placeholder) return `Blog slot ${slotIndex + 1}`;
  const title = row.title?.trim();
  if (title) return title;
  const kw = row.keyword?.trim();
  if (kw) return kw;
  const importName = row.import_file_name?.trim();
  if (importName) return importName;
  return "Untitled blog";
}

export function buildBulkGeneratorStudioList(input: {
  variant: BulkGeneratorStudioVariant;
  sourceRows: CSVRow[];
  numberOfBlogs: number;
  minEmptySlotCount: number;
  hasGeneratedChecklist: boolean;
  filesByRow: Map<number, BulkGeneratedFile[]>;
  currentRow: number;
  isProcessing: boolean;
  failedRowIndices: ReadonlySet<number>;
  siteBaseUrl: string | null;
}): BulkGeneratorStudioListItem[] {
  const targetCount = resolveBulkGeneratorStudioTargetCount({
    variant: input.variant,
    sourceRowCount: input.sourceRows.length,
    numberOfBlogs: input.numberOfBlogs,
    minEmptySlotCount: input.minEmptySlotCount,
    hasGeneratedChecklist: input.hasGeneratedChecklist,
  });

  const items: BulkGeneratorStudioListItem[] = [];
  for (let i = 0; i < targetCount; i++) {
    const source = input.sourceRows[i];
    const paddedSlot = i >= input.sourceRows.length;
    const row: CSVRow = source ?? promptPlaceholderSlotRow(i);
    const placeholder =
      paddedSlot ||
      (input.variant === "prompt" &&
        !input.hasGeneratedChecklist &&
        isEmptyBulkGeneratorStudioRow(row));
    const files = input.filesByRow.get(i);
    const thumbUrl = pickRowThumbnailFromFiles(files);
    const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview(row, input.siteBaseUrl);
    const hasContent = rowHasContentArtifact(files);

    items.push({
      rowIndex: i,
      id: `bulk-studio-row-${i}`,
      placeholder,
      title: displayTitleForRow(row, placeholder, i),
      pathLabel,
      fullUrlPreview,
      thumbUrl,
      usePlaceholderThumb: !thumbUrl,
      phase: resolveBulkGeneratorStudioRowPhase({
        placeholder,
        hasGeneratedChecklist: input.hasGeneratedChecklist,
        variant: input.variant,
        rowIndex: i,
        currentRow: input.currentRow,
        isProcessing: input.isProcessing,
        failed: input.failedRowIndices.has(i),
        hasContentArtifact: hasContent,
      }),
      row,
    });
  }

  return items;
}

export function bulkGeneratorStudioPlaceholderThumb(): string {
  return ELEMENTOR_PRODUCT_SPLASH_PATH;
}


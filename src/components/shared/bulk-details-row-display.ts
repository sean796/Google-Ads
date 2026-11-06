import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

/** Stable drawer row id so refresh/reorder does not reuse the wrong expanded row. */
export function detailsDrawerRowKey(row: CSVRow | undefined, index: number): string {
  const url = row?.destination_url?.trim();
  if (url) return normalizePageUrlKey(url) || url;
  return `idx-${index}`;
}

export function rowFilesToDownloadables(files: BulkGeneratedFile[]): BulkDetailsDownloadable[] {
  return files
    .filter(
      (f) =>
        f.status === "completed" ||
        (f.status === "error" && Boolean(f.content?.trim())),
    )
    .map((f) => ({
      name: f.fileName,
      content: f.content,
      mimeType: f.mimeType,
    }));
}

export function csvRowToOverviewRowDisplay(
  row: CSVRow,
  index: number,
  previewUrl?: string,
  rowKeyPrefix = "csv-row",
): OverviewRow {
  const liveUrl = previewUrl?.trim() || row.destination_url?.trim();
  return {
    url: liveUrl || `#${rowKeyPrefix}-${index}`,
    title: row.title?.trim() || `Row ${index + 1}`,
    metaDescription: row.meta_description ?? "",
    aiTitle: "",
    aiMeta: "",
    status: "idle",
    focusKeyword: row.keyword?.trim(),
    dateModifier: row.publish_date_gmt?.trim() || undefined,
  };
}

/** Entity SAP preload rows: show entity in title column until titles exist. */
export function csvRowToEntitySapOverviewRowDisplay(
  row: CSVRow,
  index: number,
  previewUrl?: string,
  rowKeyPrefix = "entity-sap-row",
): OverviewRow {
  const liveUrl = previewUrl?.trim() || row.destination_url?.trim();
  const entity = row.entity?.trim();
  const title = row.title?.trim() || entity || `Row ${index + 1}`;
  return {
    url: liveUrl || `#${rowKeyPrefix}-${index}`,
    title,
    metaDescription: row.meta_description ?? "",
    aiTitle: "",
    aiMeta: "",
    status: "idle",
    focusKeyword: row.keyword?.trim(),
    dateModifier: row.publish_date_gmt?.trim() || undefined,
  };
}

export function publishDateLabelForRow(
  index: number,
  publishDateLabelByIndex: Record<number, string> | undefined,
  draftOnly: boolean | undefined,
): string | undefined {
  if (draftOnly) return "Draft";
  return publishDateLabelByIndex?.[index]?.trim() || undefined;
}


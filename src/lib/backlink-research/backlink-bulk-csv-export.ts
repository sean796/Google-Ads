/**
 * CSV export for bulk Keyword Research upload - columns compatible with parseCSV / bulk template.
 */

import Papa from "papaparse";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_ENRICHED_ROWS_TO_DOWNLOAD, NOTIFY_NO_ROWS_TO_DOWNLOAD, notifyBulkCsvTemplateDownloadedXRowS, notifyDownloadedXRowS } from "@/lib/notify-messages";
import { BULK_AUTO_GENERATE_TEMPLATE_COLUMNS } from "@/lib/bulk/bulk-auto-generate-template-columns";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  entityForBulkCsvExport,
  type BacklinkBlogPitchOption,
  type BacklinkTileEnrichment,
} from "@/lib/backlink-research/backlink-tile-enriched";

export function csvRowFromEnrichment(enrichment: BacklinkTileEnrichment): CSVRow {
  const c = enrichment.csv;
  return {
    keyword: c.keyword,
    title: c.title,
    entity: entityForBulkCsvExport(c.entity),
    meta_description: c.meta_description,
    modifier: c.modifier,
    featuredImage: c.featuredImage ?? "y",
    prompt_modifier: c.prompt_modifier,
    keyword_focus: c.keyword_focus,
    rationale: c.rationale,
    origin: c.origin,
    faq: c.faq,
    keyword_questions_json: c.keyword_questions_json,
  };
}

export function buildBacklinkBulkCsvContent(rows: CSVRow[]): string {
  const hasMeta = rows.some((r) => r.meta_description?.trim());
  const hasPm = rows.some((r) => r.prompt_modifier?.trim());
  const hasKf = rows.some((r) => r.keyword_focus?.trim());
  const hasRat = rows.some((r) => r.rationale?.trim());
  const hasOrigin = rows.some((r) => r.origin?.trim());
  const hasFaq = rows.some((r) => r.faq?.trim());
  const hasKqj = rows.some((r) => r.keyword_questions_json?.trim());

  const columns: (keyof CSVRow)[] = [
    "keyword",
    "entity",
    "title",
    ...(hasMeta ? (["meta_description"] as const) : []),
    "modifier",
    "featuredImage",
    ...(hasPm ? (["prompt_modifier"] as const) : []),
    ...(hasKf ? (["keyword_focus"] as const) : []),
    ...(hasRat ? (["rationale"] as const) : []),
    ...(hasOrigin ? (["origin"] as const) : []),
    ...(hasFaq ? (["faq"] as const) : []),
    ...(hasKqj ? (["keyword_questions_json"] as const) : []),
  ];

  const objects = rows.map((row) => {
    const o: Record<string, string> = {};
    for (const col of columns) {
      const v = row[col];
      o[col] = v != null ? String(v) : "";
    }
    return o;
  });

  return Papa.unparse(objects, { columns: columns as string[] });
}

export function buildSingleEnrichedRowCsv(enrichment: BacklinkTileEnrichment): string {
  return buildBacklinkBulkCsvContent([csvRowFromEnrichment(enrichment)]);
}

export function downloadBacklinkBulkCsv(rows: CSVRow[], filenameBase: string): void {
  const filtered = rows.filter((r) => r.keyword?.trim() && r.title?.trim());
  if (filtered.length === 0) {
    notify.error(NOTIFY_NO_ENRICHED_ROWS_TO_DOWNLOAD);
    return;
  }
  const csvContent = buildBacklinkBulkCsvContent(filtered);
  const safeBase = filenameBase.replace(/[^\w-]+/g, "-").slice(0, 80) || "backlink-bulk";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeBase}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify.success(notifyDownloadedXRowS(filtered.length));
}

export type BulkAutoGenerateTemplateCsvOptions = {
  /** When true, the entity column is written empty on every row (national blog rows; no default placeholder). */
  blankEntityColumn?: boolean;
};

/** Matches `bulk-auto-generate-template.csv` (minimal columns). */
export function buildBulkAutoGenerateTemplateCsv(
  rows: BacklinkBlogPitchOption[],
  options?: BulkAutoGenerateTemplateCsvOptions,
): string {
  const blankEntity = Boolean(options?.blankEntityColumn);
  const objects = rows.map((r) => ({
    keyword: r.keyword,
    entity: blankEntity ? "" : entityForBulkCsvExport(r.entity),
    title: r.title,
    modifier: r.modifier ?? "",
    featuredImage: r.featuredImage ?? "y",
    publish_date_gmt: (r.publish_date_gmt ?? "").trim(),
    sitemap_type: "",
    meta_description: "",
    target_slug: "",
    wikipedia_url: "",
    wikipedia_title: "",
  }));
  return Papa.unparse(objects, { columns: [...BULK_AUTO_GENERATE_TEMPLATE_COLUMNS] });
}

export type CsvDownloadArtifact = {
  url: string;
  filename: string;
  rowCount: number;
};

/** Build a blob URL for bulk template CSV (caller must revoke `url` when done). */
export function createBulkTemplateDownloadArtifact(
  rows: BacklinkBlogPitchOption[],
  filenameBase: string,
  csvOptions?: BulkAutoGenerateTemplateCsvOptions,
): CsvDownloadArtifact | null {
  const filtered = rows.filter((r) => r.keyword?.trim() && r.title?.trim());
  if (filtered.length === 0) return null;
  const csvContent = buildBulkAutoGenerateTemplateCsv(filtered, csvOptions);
  const safeBase = filenameBase.replace(/[^\w-]+/g, "-").slice(0, 80) || "bulk-pitch";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${safeBase}-${stamp}.csv`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  return {
    url: URL.createObjectURL(blob),
    filename,
    rowCount: filtered.length,
  };
}

export function triggerCsvDownloadArtifact(artifact: CsvDownloadArtifact): void {
  const a = document.createElement("a");
  a.href = artifact.url;
  a.download = artifact.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function revokeCsvDownloadArtifact(artifact: CsvDownloadArtifact | null | undefined): void {
  if (artifact?.url) URL.revokeObjectURL(artifact.url);
}

export function downloadBulkTemplateCsvRows(
  rows: BacklinkBlogPitchOption[],
  filenameBase: string,
  csvOptions?: BulkAutoGenerateTemplateCsvOptions,
): CsvDownloadArtifact | null {
  const artifact = createBulkTemplateDownloadArtifact(rows, filenameBase, csvOptions);
  if (!artifact) {
    notify.error(NOTIFY_NO_ROWS_TO_DOWNLOAD);
    return null;
  }
  triggerCsvDownloadArtifact(artifact);
  notify.success(notifyBulkCsvTemplateDownloadedXRowS(artifact.rowCount));
  return artifact;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

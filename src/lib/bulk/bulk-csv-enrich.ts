import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { fillPromptBulkIdeaTitlesFromAgent } from "@/lib/bulk/fill-prompt-bulk-idea-titles";
import { fillBlogRowSlugFromOpenRouter } from "@/lib/local-analysis/blog-slug-agent";
import {
  fillBlogRowMetaFromOpenRouter,
  fillSapRowMetaFromOpenRouter,
} from "@/lib/local-analysis/entity-sap-meta-agent";
import { fillSapRowTitlesFromOpenRouter } from "@/lib/local-analysis/entity-sap-title-agent";

export type EnrichCsvRowsFromSheetOptions = {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName: string;
  gridLocations: string[];
  onRowsUpdate?: (rows: CSVRow[]) => void;
};

/** Explicit SAP uploads only — entity column alone is local context for posts/SAP copy. */
function isSapContentRow(row: CSVRow): boolean {
  return row.sitemap_type === "entity";
}

function mergePartitionedRows(
  original: CSVRow[],
  sapRows: CSVRow[],
  blogRows: CSVRow[],
): CSVRow[] {
  let sapI = 0;
  let blogI = 0;
  return original.map((row) => {
    if (isSapContentRow(row)) {
      const next = sapRows[sapI++] ?? row;
      return { ...next };
    }
    const next = blogRows[blogI++] ?? row;
    return { ...next };
  });
}

function partitionFromOriginal(original: CSVRow[], merged: CSVRow[]): {
  sapRows: CSVRow[];
  blogRows: CSVRow[];
} {
  const sapRows: CSVRow[] = [];
  const blogRows: CSVRow[] = [];
  original.forEach((row, i) => {
    const next = merged[i] ?? row;
    if (isSapContentRow(row)) sapRows.push({ ...next });
    else blogRows.push({ ...next });
  });
  return { sapRows, blogRows };
}

/** Same title + URL agents as Prompt checklist; URL agent runs on every row (Posts and SAP). */
export async function enrichCsvRowsFromSheet(
  rows: CSVRow[],
  options: EnrichCsvRowsFromSheetOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;

  const original = rows.map((row) => ({ ...row }));
  let working = original.map((row) => ({ ...row }));
  options.onRowsUpdate?.(working.map((row) => ({ ...row })));

  let sapRows = working.filter(isSapContentRow).map((row) => ({ ...row }));
  let blogRows = working.filter((row) => !isSapContentRow(row)).map((row) => ({ ...row }));

  if (sapRows.length > 0) {
    const needsSapTitles = sapRows.some((row) => !row.title?.trim());
    if (needsSapTitles) {
      sapRows = await fillSapRowTitlesFromOpenRouter(sapRows, {
        apiKey: options.apiKey,
        model: options.model,
        siteId: options.siteId,
        siteName: options.siteName,
        gridLocations: options.gridLocations,
        onRowsUpdate: (next) => {
          sapRows = next.map((row) => ({ ...row }));
        },
      });
    }
  }

  if (blogRows.length > 0) {
    await fillPromptBulkIdeaTitlesFromAgent({
      rows: blogRows,
      apiKey: options.apiKey,
      model: options.model,
    });
  }

  working = mergePartitionedRows(original, sapRows, blogRows);
  options.onRowsUpdate?.(working.map((row) => ({ ...row })));

  working = await fillBlogRowSlugFromOpenRouter(
    working.map((row) => ({
      ...row,
      target_slug: undefined,
      destination_url: undefined,
    })),
    {
      apiKey: options.apiKey,
      model: options.model,
      siteId: options.siteId,
    },
  );
  options.onRowsUpdate?.(working.map((row) => ({ ...row })));

  const parts = partitionFromOriginal(original, working);
  sapRows = parts.sapRows;
  blogRows = parts.blogRows;

  if (sapRows.length > 0) {
    sapRows = await fillSapRowMetaFromOpenRouter(sapRows, {
      apiKey: options.apiKey,
      model: options.model,
      siteId: options.siteId,
      siteName: options.siteName,
      onRowsUpdate: (next) => {
        sapRows = next.map((row) => ({ ...row }));
      },
    });
  }

  if (blogRows.length > 0) {
    blogRows = await fillBlogRowMetaFromOpenRouter(blogRows, {
      apiKey: options.apiKey,
      model: options.model,
      siteId: options.siteId,
      siteName: options.siteName,
      onRowsUpdate: (next) => {
        blogRows = next.map((row) => ({ ...row }));
      },
    });
  }

  const merged = mergePartitionedRows(original, sapRows, blogRows);
  options.onRowsUpdate?.(merged.map((row) => ({ ...row })));
  return merged;
}

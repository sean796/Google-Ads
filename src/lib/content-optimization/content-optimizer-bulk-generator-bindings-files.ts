import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import {
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  generatedFilesForUrl,
  isContentOptimizerBulkRun,
  overviewRowByUrl,
  overviewRowToCsvRow,
  type ContentOptimizerBulkGeneratorBindingsInput,
} from "./content-optimizer-bulk-generator-bindings-shared";

function optimizationFilesToBulkGenerated(
  files: Array<{ name: string; content: string; mimeType: string }>,
  rowIndex: number,
  row: CSVRow,
): BulkGeneratedFile[] {
  const ts = Date.now();
  return files.map((file, fileIndex) => ({
    id: `co-${rowIndex}-${fileIndex}-${file.name}`,
    rowIndex,
    fileName: file.name,
    content: file.content,
    mimeType: file.mimeType,
    status: "completed" as const,
    timestamp: ts + fileIndex,
    rowData: {
      keyword: row.keyword,
      entity: row.entity,
      title: row.title,
      meta_description: row.meta_description,
    },
  }));
}

export function buildFilesByRow(input: ContentOptimizerBulkGeneratorBindingsInput): Map<number, BulkGeneratedFile[]> {
  const { bulkState, siteId, siteProgress, optimizationFileManagers } = input;
  const urls = bulkState.urls ?? [];
  const rowByUrl = overviewRowByUrl(input.overviewRows);
  const activeUrl = bulkState.currentUrl?.trim();
  const activeKey = activeUrl ? normalizePageUrlKey(activeUrl) : "";
  const map = new Map<number, BulkGeneratedFile[]>();

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]!;
    const overviewRow = rowByUrl.get(normalizePageUrlKey(url));
    const csvRow = overviewRowToCsvRow(overviewRow, url, bulkState);
    const persisted = generatedFilesForUrl(bulkState.urlGeneratedFiles, url);
    const isActive = activeKey && normalizePageUrlKey(url) === activeKey;
    const live =
      isActive && siteProgress?.generatedFiles?.length
        ? siteProgress.generatedFiles.map((f) => ({
            name: f.name,
            content: f.content,
            mimeType: f.mimeType,
          }))
        : [];
    const merged = mergeGeneratedFilesByName(persisted, live);
    const rowFiles = isAiseoFileSlotRunKind(bulkState.runKind)
      ? filterAiseoRowDisplayFiles(bulkState.runKind, merged)
      : merged;
    if (rowFiles.length > 0) {
      map.set(index, optimizationFilesToBulkGenerated(rowFiles, index, csvRow));
    }
  }

  const fm = optimizationFileManagers[siteId];
  if (isContentOptimizerBulkRun(bulkState) && fm && fm.getFileCount() > 0 && activeUrl) {
    const activeIndex = urls.findIndex((u) => normalizePageUrlKey(u) === activeKey);
    if (activeIndex >= 0) {
      const overviewRow = rowByUrl.get(normalizePageUrlKey(urls[activeIndex]!));
      const row = overviewRowToCsvRow(overviewRow, urls[activeIndex]!, bulkState);
      const fromFm = fm.getFiles().map((f) => ({
        name: f.name,
        content: f.content,
        mimeType: f.mimeType,
      }));
      const merged = mergeGeneratedFilesByName(
        map.get(activeIndex)?.map((f) => ({
          name: f.fileName,
          content: f.content,
          mimeType: f.mimeType,
        })) ?? [],
        fromFm,
      );
      map.set(activeIndex, optimizationFilesToBulkGenerated(merged, activeIndex, row));
    }
  }

  return map;
}

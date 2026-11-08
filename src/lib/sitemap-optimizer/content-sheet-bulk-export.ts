import Papa from "papaparse";
import { BULK_AUTO_GENERATE_TEMPLATE_COLUMNS } from "@/lib/bulk/bulk-auto-generate-template-columns";
import { normalizeFocusKeywordPhrase } from "@/lib/pulse-redirect-redirect-csv";
import {
  buildContentSheetRows,
  replacementContentSheetRows,
} from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import { isRedirectMapRun } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { contentSheetPrimaryUrl } from "@/lib/sitemap-optimizer/content-sheet-source-url";
import { isEntityCompressionRunResult } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import { buildMergePublishContracts } from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import type {
  SitemapOptimizerContentSheetRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

/** Sitemap merge export: bulk template + destination URL (slug already in template columns). */
export const SITEMAP_CONTENT_SHEET_EXPORT_COLUMNS = [
  ...BULK_AUTO_GENERATE_TEMPLATE_COLUMNS,
  "destination_url",
] as const;

export type BulkTemplateCsvRow = {
  keyword: string;
  entity: string;
  title: string;
  modifier: string;
  featuredImage: string;
  publish_date_gmt: string;
  sitemap_type: string;
  meta_description: string;
  target_slug: string;
  wikipedia_url: string;
  wikipedia_title: string;
  destination_url: string;
};

export function ensureBulkKeyword(row: SitemapOptimizerContentSheetRow): string {
  const fromProposed = row.proposedPrimaryKeyword?.trim();
  if (fromProposed) return normalizeFocusKeywordPhrase(fromProposed) || fromProposed;

  const fromTitle = normalizeFocusKeywordPhrase(displayPostTitle(row.proposedTitle || ""));
  if (fromTitle) return fromTitle;

  const fromLabel = row.mergeGroupLabel?.trim();
  if (fromLabel) return normalizeFocusKeywordPhrase(fromLabel) || fromLabel;

  return "local service";
}

export function ensureBulkTitle(row: SitemapOptimizerContentSheetRow, keyword: string): string {
  const title = displayPostTitle(row.proposedTitle || "").trim();
  if (title) return title;
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

export function entityLabelForSheetRow(
  result: SitemapOptimizerRunResult,
  row: SitemapOptimizerContentSheetRow,
): string {
  if (row.bulkEntityLabel?.trim()) return row.bulkEntityLabel.trim();
  return "";
}

function slugSegmentFromDestinationUrl(url: string): string {
  try {
    const segments = new URL(url.trim()).pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

export function contentSheetRowsForExport(result: SitemapOptimizerRunResult): SitemapOptimizerContentSheetRow[] {
  const sheet = result.contentSheet?.length
    ? result.contentSheet
    : buildContentSheetRows({
        rows: result.rows,
        clusters: result.clusters,
        merges: result.merges,
        blogDestination: result.blogDestination,
        minClusterMembers:
          isRedirectMapRun(result) || isEntityCompressionRunResult(result) ? 1 : 2,
      });
  return replacementContentSheetRows(sheet);
}

export function contentSheetToBulkTemplateObjects(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): BulkTemplateCsvRow[] {
  const contracts = buildMergePublishContracts(result, publishDateGmt);
  const contractByCluster = new Map(contracts.map((c) => [c.clusterId, c]));

  return contentSheetRowsForExport(result).map((row) => {
    const keyword = ensureBulkKeyword(row);
    const clusterId = row.mergeClusterId?.trim();
    const contract = clusterId ? contractByCluster.get(clusterId) : undefined;
    const destinationUrl =
      contract?.destinationUrl?.trim() || contentSheetPrimaryUrl(row);
    const targetSlug =
      contract?.slugSegment?.trim() || slugSegmentFromDestinationUrl(destinationUrl);

    return {
      keyword: contract?.keyword || keyword,
      entity: entityLabelForSheetRow(result, row),
      title: contract?.title || ensureBulkTitle(row, keyword),
      modifier: contract?.modifier || row.modifier?.trim() || "",
      featuredImage: isEntityCompressionRunResult(result) ? "google-maps" : "y",
      publish_date_gmt: publishDateGmt ?? contract?.publishDateGmt ?? "",
      sitemap_type: isEntityCompressionRunResult(result) ? "entity" : "post",
      meta_description: row.proposedMeta?.trim() || "",
      target_slug: targetSlug,
      wikipedia_url: "",
      wikipedia_title: "",
      destination_url: destinationUrl,
    };
  });
}

export function buildContentSheetBulkTemplateCsv(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): string {
  return Papa.unparse(contentSheetToBulkTemplateObjects(result, publishDateGmt), {
    columns: [...SITEMAP_CONTENT_SHEET_EXPORT_COLUMNS],
  });
}

import {
  buildRedirectCsvRedirectCsv,
  normalizeRedirectCsvRelativePath,
  rankMathSourceFromPageUrl,
} from "@/lib/pulse-redirect-redirect-csv";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import { contentSheetPrimaryUrl } from "@/lib/sitemap-optimizer/content-sheet-source-url";
import {
  buildGridRedirectCsvRedirectRows,
  buildRedirectMapFamilyRedirectCsvCsv,
  buildRedirectMapFamilyRows,
  buildRedirectMapFamilyWideCsv,
  isRedirectMapRun,
} from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import {
  buildMergePublishContracts,
  redirectRowsFromContracts,
  type SitemapMergePublishContract,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

import { buildContentSheetBulkTemplateCsv } from "@/lib/sitemap-optimizer/content-sheet-bulk-export";
import { buildMergePublishContract } from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import type {
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export { buildMergeContentModifier } from "@/lib/sitemap-optimizer/merge-content-brief";

export function resolveMergeDestinationUrl(
  merge: SitemapOptimizerMergeRecommendation,
  memberRows: SitemapOptimizerPostRow[],
): string | null {
  const contract = buildMergePublishContract(merge, memberRows, new Date().toISOString());
  return contract?.destinationUrl ?? null;
}

/** Downloadable bulk CSV — template columns plus locked destination_url (matches redirect CSV). */
export function buildSitemapOptimizerContentUploadCsv(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): string {
  return buildContentSheetBulkTemplateCsv(result, publishDateGmt);
}

export function buildSitemapOptimizerRedirectCsvRedirectCsv(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): { csv: string; rowCount: number } {
  const contracts = buildMergePublishContracts(result, publishDateGmt);
  const redirectRows = redirectRowsFromContracts(contracts, result);
  return {
    csv: buildRedirectCsvRedirectCsv(redirectRows),
    rowCount: redirectRows.length,
  };
}

function rankMathDestinationValue(fullDestinationUrl: string): string {
  const rel = normalizeRedirectCsvRelativePath(fullDestinationUrl);
  return rel ?? fullDestinationUrl.trim();
}

function sheetMapsForResult(result: SitemapOptimizerRunResult) {
  const sheet = result.contentSheet?.length
    ? result.contentSheet
    : buildContentSheetRows({
        rows: result.rows,
        clusters: result.clusters,
        merges: result.merges,
        blogDestination: result.blogDestination,
      });
  const byPostId = new Map(sheet.map((r) => [r.postId, r]));
  const byClusterId = new Map(
    sheet
      .filter((r) => r.mergeClusterId)
      .map((r) => [r.mergeClusterId!, r] as const),
  );
  return { sheet, byPostId, byClusterId };
}

/** Every inventory URL → optimized NEO Pulse redirect destination (grid + WordPress). */
export function buildSitemapOptimizerAllRedirectCsvRedirectCsv(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): { csv: string; rowCount: number } {
  if (isRedirectMapRun(result)) {
    const rows = buildRedirectMapFamilyRows(result);
    return {
      csv: buildRedirectMapFamilyRedirectCsvCsv(result),
      rowCount: rows.length,
    };
  }

  if (result.runMode === "grid_csv") {
    if (isRedirectMapRun(result)) {
      const familyRows = buildRedirectMapFamilyRows(result);
      return {
        csv: buildRedirectMapFamilyRedirectCsvCsv(result),
        rowCount: familyRows.length,
      };
    }
    const rows = buildGridRedirectCsvRedirectRows(result);
    const redirectRows = rows.map((r) => ({
      source: r.source,
      destination: rankMathDestinationValue(r.destinationUrl),
    }));
    return {
      csv: buildRedirectCsvRedirectCsv(redirectRows),
      rowCount: redirectRows.length,
    };
  }

  const outbound = outboundRedirectInventoryRows(result, publishDateGmt);
  const redirectRows = outbound.map(({ legacyUrl, destinationUrl }) => ({
    source: rankMathSourceFromPageUrl(legacyUrl)!,
    destination: rankMathDestinationValue(destinationUrl),
  }));
  const skippedSamePath = result.rows.length - outbound.length;
  const skippedNoSource = 0;


  return {
    csv: buildRedirectCsvRedirectCsv(redirectRows),
    rowCount: redirectRows.length,
  };
}

export function getMergePublishContracts(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): SitemapMergePublishContract[] {
  return buildMergePublishContracts(result, publishDateGmt);
}

export type OutboundRedirectInventoryRow = {
  row: SitemapOptimizerPostRow;
  legacyUrl: string;
  destinationUrl: string;
};

/** Inventory rows that receive an outbound NEO Pulse redirect redirect (same rules as redirect CSV export). */
export function outboundRedirectInventoryRows(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): OutboundRedirectInventoryRow[] {
  const contracts = buildMergePublishContracts(result, publishDateGmt);
  const contractByCluster = new Map(contracts.map((c) => [c.clusterId, c]));
  const mergeByCluster = new Map(result.merges.map((m) => [m.clusterId, m]));
  const { byPostId, byClusterId } = sheetMapsForResult(result);
  const out: OutboundRedirectInventoryRow[] = [];
  const seen = new Set<string>();

  for (const row of result.rows) {
    const cluster = result.clusters.clusters.find((c) => c.memberPostIds.includes(row.postId));
    const sheetRow =
      byPostId.get(row.postId) ??
      (cluster ? byClusterId.get(cluster.clusterId) : undefined);

    const legacyUrl =
      row.gridRedirectFromUrl?.trim() ||
      (sheetRow?.postId === row.postId ? sheetRow.legacySourceUrl?.trim() : undefined) ||
      row.url.trim();
    const source = rankMathSourceFromPageUrl(legacyUrl);
    if (!source) continue;

    let destinationUrl = "";
    if (cluster) {
      const contract = contractByCluster.get(cluster.clusterId);
      const merge = mergeByCluster.get(cluster.clusterId);
      destinationUrl =
        contract?.destinationUrl?.trim() ||
        (sheetRow ? contentSheetPrimaryUrl(sheetRow) : "") ||
        merge?.lockedDestinationUrl?.trim() ||
        row.url.trim();
    } else {
      destinationUrl = sheetRow ? contentSheetPrimaryUrl(sheetRow) : row.url.trim();
    }

    if (!destinationUrl) continue;

    try {
      const cur = new URL(legacyUrl).pathname.toLowerCase();
      const dest = new URL(destinationUrl).pathname.toLowerCase();
      const normCur = cur.endsWith("/") ? cur : `${cur}/`;
      const normDest = dest.endsWith("/") ? dest : `${dest}/`;
      if (normCur === normDest) continue;
    } catch {
      /* still export */
    }

    if (seen.has(row.postId)) continue;
    seen.add(row.postId);
    out.push({ row, legacyUrl, destinationUrl });
  }

  return out;
}

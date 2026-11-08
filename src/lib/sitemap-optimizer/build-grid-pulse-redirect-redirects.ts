import { buildRedirectCsvRedirectCsv } from "@/lib/pulse-redirect-redirect-csv";
import { editorialDestinationWithContentYear } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { isCompanyNewsRow } from "@/lib/sitemap-optimizer/grid-company-news";
import { getGridContentYear } from "@/lib/sitemap-optimizer/grid-title-year";
import { isTemporalCannibalizationCluster } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";
import { applyBlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { normalizeRedirectCsvRelativePath, rankMathSourceFromPageUrl } from "@/lib/pulse-redirect-redirect-csv";
import { gridMemberCanonicalUrl, gridMemberSourceUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import {
  buildMergeGroupNumbersForGridResult,
  buildMergeGroupNumberByClusterUploadOrder,
  mergeGroupNumberForCluster,
  mergeGroupNumberForDestination,
} from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { buildMergePublishContract } from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import { resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import type { SitemapMergePublishContract } from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export function buildGridPublishContracts(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): SitemapMergePublishContract[] {
  if (result.runMode !== "grid_csv") return [];
  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const publishedAt = publishDateGmt ?? new Date().toISOString();
  const contracts: SitemapMergePublishContract[] = [];

  for (const merge of result.merges) {
    const cluster = result.clusters.clusters.find((c) => c.clusterId === merge.clusterId);
    if (!cluster) continue;
    const members = resolvedMemberRows(cluster, rowMap);
    const contract = buildMergePublishContract(merge, members, publishedAt, {
      minMembers: 1,
      blogDestination: result.blogDestination,
    });
    if (contract) contracts.push(contract);
  }
  return contracts;
}

export type GridRedirectCsvRedirectRow = {
  /** Same integer for every URL in one content/redirect family (1, 2, 3, …). */
  familyId: number;
  /** @deprecated Use familyId — kept for callers that still read familyTag. */
  familyTag: number;
  mergeGroupId: number;
  source: string;
  destination: string;
  sourceUrl: string;
  destinationUrl: string;
  topicTag: string;
  geoTag: string;
  tagLabel: string;
};

export function isRedirectMapRun(result: SitemapOptimizerRunResult): boolean {
  if (result.redirectMapUpload) return true;
  const editorial = result.rows.filter((r) => !isCompanyNewsRow(r));
  const redirectRows = editorial.filter((r) => Boolean(r.gridRedirectFromUrl?.trim()));
  return redirectRows.length > 0;
}

function redirectDestinationForRow(
  destinationUrl: string,
  result: SitemapOptimizerRunResult,
  row: SitemapOptimizerRunResult["rows"][number],
): string {
  const cluster = result.clusters.clusters.find((c) => c.memberPostIds.includes(row.postId));
  if (cluster && isTemporalCannibalizationCluster(cluster)) {
    return applyBlogDestinationPolicy(destinationUrl.trim(), result.blogDestination);
  }
  const year = getGridContentYear(result.analyzedAt);
  return editorialDestinationWithContentYear(destinationUrl, year, row);
}

function buildRedirectMapPublishContracts(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): SitemapMergePublishContract[] {
  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const publishedAt = publishDateGmt ?? result.analyzedAt ?? new Date().toISOString();
  const contracts: SitemapMergePublishContract[] = [];
  for (const merge of result.merges) {
    const cluster = result.clusters.clusters.find((c) => c.clusterId === merge.clusterId);
    if (!cluster) continue;
    const members = resolvedMemberRows(cluster, rowMap);
    const contract = buildMergePublishContract(merge, members, publishedAt, {
      minMembers: 1,
      blogDestination: result.blogDestination,
    });
    if (contract) contracts.push(contract);
  }
  return contracts;
}

function resolveRedirectFamilyDestinationUrl(
  cluster: SitemapOptimizerCluster,
  row: SitemapOptimizerRunResult["rows"][number],
  merge: SitemapOptimizerMergeRecommendation | undefined,
  contract: SitemapMergePublishContract | undefined,
  result: SitemapOptimizerRunResult,
): string {
  const locked = merge?.lockedDestinationUrl?.trim();
  if (locked) return redirectDestinationForRow(locked, result, row);
  if (contract?.destinationUrl?.trim()) {
    return redirectDestinationForRow(contract.destinationUrl, result, row);
  }
  return redirectDestinationForRow(row.url.trim() || gridMemberCanonicalUrl(row), result, row);
}

/** Force one new_url per family_id (quarterly sources must not keep CSV quarter slugs). */
function unifyRedirectRowsByFamilyId(rows: GridRedirectCsvRedirectRow[]): GridRedirectCsvRedirectRow[] {
  const byFamily = new Map<number, GridRedirectCsvRedirectRow[]>();
  for (const r of rows) {
    const list = byFamily.get(r.familyId) ?? [];
    list.push(r);
    byFamily.set(r.familyId, list);
  }
  const out: GridRedirectCsvRedirectRow[] = [];
  for (const members of byFamily.values()) {
    const counts = new Map<string, number>();
    for (const m of members) {
      const key = m.destinationUrl.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let canonical = members[0]!.destinationUrl;
    let best = 0;
    for (const m of members) {
      const key = m.destinationUrl.trim().toLowerCase();
      const n = counts.get(key) ?? 0;
      if (n > best) {
        best = n;
        canonical = m.destinationUrl;
      }
    }
    const destination = normalizeRedirectCsvRelativePath(canonical) ?? members[0]!.destination;
    for (const m of members) {
      out.push({ ...m, destinationUrl: canonical, destination });
    }
  }
  return out;
}

function pushRedirectFamilyRow(
  out: GridRedirectCsvRedirectRow[],
  args: {
    familyId: number;
    legacyUrl: string;
    destinationUrl: string;
    row: SitemapOptimizerRunResult["rows"][number];
  },
): void {
  const source = rankMathSourceFromPageUrl(args.legacyUrl);
  if (!source) return;
  const destination = normalizeRedirectCsvRelativePath(args.destinationUrl) ?? "";
  out.push({
    familyId: args.familyId,
    familyTag: args.familyId,
    mergeGroupId: args.familyId,
    source,
    destination,
    sourceUrl: args.legacyUrl,
    destinationUrl: args.destinationUrl,
    topicTag: args.row.gridTopicTag ?? "",
    geoTag: args.row.gridGeoTag ?? "",
    tagLabel: args.row.gridTagLabel ?? "",
  });
}

/** Redirect-map rows with family_id — one id + one new_url per family. */
export function buildRedirectMapFamilyRows(
  result: SitemapOptimizerRunResult,
): GridRedirectCsvRedirectRow[] {
  if (!isRedirectMapRun(result)) {
    return result.runMode === "grid_csv" ? buildGridRedirectCsvRedirectRows(result) : [];
  }

  const contracts = buildRedirectMapPublishContracts(result);
  const contractByCluster = new Map(contracts.map((c) => [c.clusterId, c]));
  const mergeByCluster = new Map(result.merges.map((m) => [m.clusterId, m]));
  const groupByCluster = buildMergeGroupNumberByClusterUploadOrder(result.clusters, result.rows);
  const out: GridRedirectCsvRedirectRow[] = [];

  for (const row of result.rows) {
    if (isCompanyNewsRow(row)) continue;
    if (!row.gridRedirectFromUrl?.trim()) continue;
    const cluster = result.clusters.clusters.find((c) => c.memberPostIds.includes(row.postId));
    if (!cluster) continue;
    const legacyUrl = gridMemberSourceUrl(row);
    const familyId = mergeGroupNumberForCluster(cluster.clusterId, groupByCluster);
    const merge = mergeByCluster.get(cluster.clusterId);
    const contract = contractByCluster.get(cluster.clusterId);
    const destinationUrl = resolveRedirectFamilyDestinationUrl(
      cluster,
      row,
      merge,
      contract,
      result,
    );
    pushRedirectFamilyRow(out, { familyId, legacyUrl, destinationUrl, row });
  }

  const unified = unifyRedirectRowsByFamilyId(out);
  unified.sort((a, b) => {
    if (a.familyId !== b.familyId) return a.familyId - b.familyId;
    return a.sourceUrl.localeCompare(b.sourceUrl);
  });


  return unified;
}

export function buildGridRedirectCsvRedirectRows(
  result: SitemapOptimizerRunResult,
): GridRedirectCsvRedirectRow[] {
  if (isRedirectMapRun(result)) {
    return buildRedirectMapFamilyRows(result);
  }

  const contracts = buildGridPublishContracts(result);
  const contractByCluster = new Map(contracts.map((c) => [c.clusterId, c]));
  const oneToOne = result.gridMaxUrlsPerPost === 1;
  const groupByDestination = oneToOne ? null : buildMergeGroupNumbersForGridResult(result);
  const groupByCluster = oneToOne
    ? buildMergeGroupNumberByClusterUploadOrder(result.clusters, result.rows)
    : null;
  const out: GridRedirectCsvRedirectRow[] = [];

  for (const row of result.rows) {
    if (isCompanyNewsRow(row)) continue;
    const cluster = result.clusters.clusters.find((c) => c.memberPostIds.includes(row.postId));
    if (!cluster) continue;
    const contract = contractByCluster.get(cluster.clusterId);
    const legacyUrl = gridMemberSourceUrl(row);
    const source = rankMathSourceFromPageUrl(legacyUrl);
    if (!source) continue;

    if (!contract && oneToOne && row.gridRedirectFromUrl?.trim()) {
      const destinationUrl = redirectDestinationForRow(gridMemberCanonicalUrl(row), result, row);
      const familyId = mergeGroupNumberForCluster(cluster.clusterId, groupByCluster!);
      out.push({
        familyId,
        familyTag: familyId,
        mergeGroupId: familyId,
        source,
        destination: normalizeRedirectCsvRelativePath(destinationUrl) ?? "",
        sourceUrl: legacyUrl,
        destinationUrl,
        topicTag: row.gridTopicTag ?? "",
        geoTag: row.gridGeoTag ?? "",
        tagLabel: row.gridTagLabel ?? "",
      });
      continue;
    }

    if (!contract) continue;
    const destinationUrl = redirectDestinationForRow(contract.destinationUrl, result, row);
    const familyId = oneToOne
      ? mergeGroupNumberForCluster(cluster.clusterId, groupByCluster!)
      : mergeGroupNumberForDestination(contract.destinationUrl, groupByDestination!);
    out.push({
      familyId,
      familyTag: familyId,
      mergeGroupId: familyId,
      source,
      destination: normalizeRedirectCsvRelativePath(destinationUrl) ?? "",
      sourceUrl: legacyUrl,
      destinationUrl,
      topicTag: row.gridTopicTag ?? "",
      geoTag: row.gridGeoTag ?? "",
      tagLabel: row.gridTagLabel ?? "",
    });
  }
  out.sort((a, b) => {
    if (a.familyId !== b.familyId) return a.familyId - b.familyId;
    return a.sourceUrl.localeCompare(b.sourceUrl);
  });
  return out;
}

function csvEsc(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/** Wide redirect sheet: family_id tags each row; same id → same new_url. */
export function buildRedirectMapFamilyWideCsv(result: SitemapOptimizerRunResult): string {
  const header =
    "family_id,upload_row,topic_tag,geo_tag,tag_label,old_url,new_url,neo_pulse_seo_source,neo_pulse_seo_destination";
  const rows = buildRedirectMapFamilyRows(result);
  const uploadRowByUrl = new Map(
    result.rows.map((r) => [gridMemberSourceUrl(r).toLowerCase(), r.uploadRowIndex ?? ""]),
  );
  const lines = [header];
  rows.forEach((r) => {
    const uploadRow = uploadRowByUrl.get(r.sourceUrl.toLowerCase()) ?? "";
    lines.push(
      [
        r.familyId,
        uploadRow,
        csvEsc(r.topicTag),
        csvEsc(r.geoTag),
        csvEsc(r.tagLabel),
        csvEsc(r.sourceUrl),
        csvEsc(r.destinationUrl),
        csvEsc(r.source),
        csvEsc(r.destination),
      ].join(","),
    );
  });
  return lines.join("\n");
}

/** NEO Pulse redirect–style export with family_id so families are visible beside source/destination. */
export function buildRedirectMapFamilyRedirectCsvCsv(result: SitemapOptimizerRunResult): string {
  const header = "id,family_id,source,matching,destination,type,category,status,ignore";
  const rows = buildRedirectMapFamilyRows(result);
  const lines = [header];
  rows.forEach((r, i) => {
    lines.push(
      [
        String(i + 1),
        String(r.familyId),
        csvEsc(r.source),
        csvEsc("exact"),
        csvEsc(r.destination),
        csvEsc("301"),
        csvEsc(""),
        csvEsc("active"),
        csvEsc(""),
      ].join(","),
    );
  });
  return lines.join("\n");
}

/** Wide grid NEO Pulse redirect sheet with merge_group_id for every upload row. */
export function buildGridRedirectCsvWideCsv(result: SitemapOptimizerRunResult): string {
  if (isRedirectMapRun(result)) {
    return buildRedirectMapFamilyWideCsv(result);
  }
  const header = [
    "merge_group_id",
    "upload_row",
    "old_url",
    "new_url",
    "neo_pulse_seo_source",
    "neo_pulse_seo_destination",
  ];
  const rows = buildGridRedirectCsvRedirectRows(result);
  const uploadRowByUrl = new Map(
    result.rows.map((r) => [gridMemberSourceUrl(r).toLowerCase(), r.uploadRowIndex ?? 0]),
  );
  const lines = rows.map((r) => {
    const uploadRow = uploadRowByUrl.get(r.sourceUrl.toLowerCase()) ?? "";
    return [
      r.mergeGroupId,
      uploadRow,
      r.sourceUrl,
      r.destinationUrl,
      r.source,
      r.destination,
    ]
      .map((c) => csvEsc(String(c ?? "")))
      .join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

export function buildGridRedirectCsvRedirectCsv(result: SitemapOptimizerRunResult): {
  csv: string;
  rowCount: number;
} {
  const rows = buildGridRedirectCsvRedirectRows(result);
  return {
    csv: buildRedirectCsvRedirectCsv(rows.map((r) => ({ source: r.source, destination: r.destination }))),
    rowCount: rows.length,
  };
}

/** Grid toolbar export: UI group/row plus NEO Pulse redirect import columns. */
function slugLengthFromUrl(url: string): number {
  try {
    const segments = new URL(url.trim()).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1]!.length : 0;
  } catch {
    return 0;
  }
}

export function buildGridRedirectCsvExportCsv(result: SitemapOptimizerRunResult): string {
  if (isRedirectMapRun(result)) {
    return buildRedirectMapFamilyRedirectCsvCsv(result);
  }
  const header =
    "group,upload_row,topic_tag,geo_tag,tag_label,old_url,new_url,id,source,matching,destination,type,category,status,ignore";
  const rows = buildGridRedirectCsvRedirectRows(result);
  const uploadRowByUrl = new Map(
    result.rows.map((r) => [gridMemberSourceUrl(r).toLowerCase(), r.uploadRowIndex ?? ""]),
  );
  const lines = [header];
  rows.forEach((r) => {
    const uploadRow = uploadRowByUrl.get(r.sourceUrl.toLowerCase()) ?? "";
    lines.push(
      [
        r.familyTag,
        uploadRow,
        csvEsc(r.topicTag),
        csvEsc(r.geoTag),
        csvEsc(r.tagLabel),
        csvEsc(r.sourceUrl),
        csvEsc(r.destinationUrl),
        String(r.familyTag),
        csvEsc(r.source),
        csvEsc("exact"),
        csvEsc(r.destination),
        csvEsc("301"),
        csvEsc(""),
        csvEsc("active"),
        csvEsc(""),
      ].join(","),
    );
  });
  return lines.join("\n");
}

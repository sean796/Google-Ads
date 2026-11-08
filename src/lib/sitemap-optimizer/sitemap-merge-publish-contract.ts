import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { applyBlogDestinationPolicy, blogPermalinkPrefixForPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { editorialDestinationWithContentYear } from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { contentSheetRowsForExport } from "@/lib/sitemap-optimizer/content-sheet-bulk-export";
import { getGridContentYear } from "@/lib/sitemap-optimizer/grid-title-year";
import { optimizeBlogMergeDestination } from "@/lib/sitemap-optimizer/optimize-blog-destination";
import { gridMemberSourceUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import { isRedirectMapCluster } from "@/lib/sitemap-optimizer/grid-redirect-destination";
import { buildMergeContentModifier } from "@/lib/sitemap-optimizer/merge-content-brief";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { contentSheetPrimaryUrl } from "@/lib/sitemap-optimizer/content-sheet-source-url";
import {
  filterMergeableMerges,
  resolvedMemberRows,
} from "@/lib/sitemap-optimizer/resolved-cluster-members";
import {
  fullDestinationUrl,
  normalizeFocusKeywordPhrase,
  normalizeRedirectCsvRelativePath,
  permalinkParentPrefixFromPageUrls,
  rankMathSourceFromPageUrl,
  slugifyFocusKeywordToRelativePath,
} from "@/lib/pulse-redirect-redirect-csv";
import { minMembersForMergePublish } from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import type {
  SitemapOptimizerContentSheetRow,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export type SitemapMergePublishContract = {
  clusterId: string;
  title: string;
  keyword: string;
  slugSegment: string;
  permalinkPrefix: string;
  relativePath: string;
  destinationUrl: string;
  publishDateGmt: string;
  modifier: string;
  sourceUrls: string[];
};

function pathFieldsFromLockedDestination(lockedUrl: string): {
  destinationUrl: string;
  slugSegment: string;
  permalinkPrefix: string;
  relativePath: string;
} | null {
  try {
    const u = new URL(lockedUrl.trim());
    let path = u.pathname.replace(/\/+/g, "/");
    if (!path.endsWith("/")) path += "/";
    const destinationUrl = `${u.origin}${path}`;
    const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (!segments.length) return null;
    const slugSegment = segments[segments.length - 1] ?? "";
    if (!slugSegment) return null;
    const permalinkPrefix =
      segments.length > 1 ? `${segments.slice(0, -1).join("/")}/` : "";
    const relativePath = normalizeRedirectCsvRelativePath(path.replace(/^\/+/, "")) ?? slugSegment;
    return {
      destinationUrl,
      slugSegment,
      permalinkPrefix,
      relativePath: relativePath.endsWith("/") ? relativePath : `${relativePath}/`,
    };
  } catch {
    return null;
  }
}

function slugSegmentForMerge(
  merge: SitemapOptimizerMergeRecommendation,
  keyword: string,
): string | null {
  const fromKw = slugifyFocusKeywordToRelativePath(keyword);
  if (fromKw) return fromKw.replace(/^\/+|\/+$/g, "");
  const fromTitle = slugifyFocusKeywordToRelativePath(merge.recommendedTitle);
  if (fromTitle) return fromTitle.replace(/^\/+|\/+$/g, "");
  const fromDisplay = slugifyFocusKeywordToRelativePath(displayPostTitle(merge.recommendedTitle));
  if (fromDisplay) return fromDisplay.replace(/^\/+|\/+$/g, "");
  return null;
}

function memberSourceUrlsForContract(members: SitemapOptimizerPostRow[]): string[] {
  if (isRedirectMapCluster(members)) {
    return members.map((m) => gridMemberSourceUrl(m));
  }
  return members.map((m) => m.url.trim());
}

function finalizeContractDestination(
  destinationUrl: string,
  policy?: BlogDestinationPolicy | null,
): string {
  return applyBlogDestinationPolicy(destinationUrl, policy);
}

export function buildMergePublishContract(
  merge: SitemapOptimizerMergeRecommendation,
  members: SitemapOptimizerPostRow[],
  publishDateGmt: string,
  options?: { minMembers?: number; blogDestination?: BlogDestinationPolicy | null },
): SitemapMergePublishContract | null {
  const minMembers = options?.minMembers ?? 2;
  if (members.length < minMembers) return null;
  const baseUrl = members[0]?.url?.trim();
  if (!baseUrl) return null;

  const title = displayPostTitle(merge.recommendedTitle || "New post");
  const keyword = normalizeFocusKeywordPhrase(merge.recommendedPrimaryKeyword);

  const blogPolicy = options?.blogDestination ?? null;
  const forcedBlogPrefix = blogPermalinkPrefixForPolicy(blogPolicy);

  const locked = merge.lockedDestinationUrl?.trim();
  if (locked) {
    const contentYear = getGridContentYear(publishDateGmt);
    const lockedForContract = blogPolicy?.preserveCsvDestinations
      ? editorialDestinationWithContentYear(
          applyBlogDestinationPolicy(locked, blogPolicy),
          contentYear,
        )
      : editorialDestinationWithContentYear(
          blogPolicy?.forceBlogPermalink
            ? optimizeBlogMergeDestination(
                locked,
                keyword,
                title,
                members.map((m) => m.url.trim()),
                blogPolicy,
              )
            : locked,
          contentYear,
        );
    const fromSheet = pathFieldsFromLockedDestination(lockedForContract);
    if (!fromSheet) return null;
    const destinationUrl = finalizeContractDestination(fromSheet.destinationUrl, blogPolicy);
    const normalizedLocked = pathFieldsFromLockedDestination(destinationUrl);
    if (!normalizedLocked) return null;
    return {
      clusterId: merge.clusterId,
      title,
      keyword,
      slugSegment: normalizedLocked.slugSegment,
      permalinkPrefix: normalizedLocked.permalinkPrefix,
      relativePath: normalizedLocked.relativePath,
      destinationUrl: normalizedLocked.destinationUrl,
      publishDateGmt,
      modifier: buildMergeContentModifier(merge),
      sourceUrls: memberSourceUrlsForContract(members),
    };
  }

  const slugSegment = slugSegmentForMerge(merge, keyword);
  if (!slugSegment) return null;

  const permalinkPrefix =
    forcedBlogPrefix || permalinkParentPrefixFromPageUrls(members.map((m) => m.url));
  const relativePath = permalinkPrefix ? `${permalinkPrefix}${slugSegment}` : slugSegment;
  const destinationUrlRaw = fullDestinationUrl(baseUrl, relativePath);
  if (!destinationUrlRaw) return null;
  const destinationUrl = finalizeContractDestination(destinationUrlRaw, blogPolicy);

  return {
    clusterId: merge.clusterId,
    title,
    keyword,
    slugSegment,
    permalinkPrefix,
    relativePath: relativePath.endsWith("/") ? relativePath : `${relativePath}/`,
    destinationUrl,
    publishDateGmt,
    modifier: buildMergeContentModifier(merge),
    sourceUrls: memberSourceUrlsForContract(members),
  };
}

function membersForContentSheetMergeRow(
  result: SitemapOptimizerRunResult,
  sheetRow: SitemapOptimizerContentSheetRow,
  rowMap: Map<string, SitemapOptimizerPostRow>,
): SitemapOptimizerPostRow[] {
  const clusterId = sheetRow.mergeClusterId?.trim();
  if (!clusterId) return [];
  const cluster = result.clusters.clusters.find((c) => c.clusterId === clusterId);
  if (cluster) return resolvedMemberRows(cluster, rowMap);
  const row = rowMap.get(sheetRow.postId);
  return row ? [row] : [];
}

/** Publish contracts from the analyzed content sheet (same rows as the UI and CSV export). */
function buildMergePublishContractsFromContentSheet(
  result: SitemapOptimizerRunResult,
  publishDateGmt: string,
): SitemapMergePublishContract[] {
  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const mergeRows = contentSheetRowsForExport(result).filter(
    (row) => row.action === "merge" && row.mergeClusterId?.trim(),
  );
  const contracts: SitemapMergePublishContract[] = [];
  const seenClusters = new Set<string>();

  for (const sheetRow of mergeRows) {
    const clusterId = sheetRow.mergeClusterId!.trim();
    if (seenClusters.has(clusterId)) continue;
    seenClusters.add(clusterId);

    const destinationUrl = contentSheetPrimaryUrl(sheetRow);
    const pathFields = pathFieldsFromLockedDestination(destinationUrl);
    if (!pathFields) continue;

    const members = membersForContentSheetMergeRow(result, sheetRow, rowMap);
    if (!members.length) continue;

    contracts.push({
      clusterId,
      title: displayPostTitle(sheetRow.proposedTitle || "New post"),
      keyword: normalizeFocusKeywordPhrase(sheetRow.proposedPrimaryKeyword),
      slugSegment: pathFields.slugSegment,
      permalinkPrefix: pathFields.permalinkPrefix,
      relativePath: pathFields.relativePath,
      destinationUrl: pathFields.destinationUrl,
      publishDateGmt,
      modifier: sheetRow.modifier?.trim() || "",
      sourceUrls: memberSourceUrlsForContract(members),
    });
  }

  return contracts;
}

function buildMergePublishContractsFromMerges(
  result: SitemapOptimizerRunResult,
  publishDateGmt: string,
): SitemapMergePublishContract[] {
  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const minMembers = minMembersForMergePublish(result);
  const merges = filterMergeableMerges(
    result.merges,
    result.clusters.clusters,
    result.rows,
    minMembers,
  );
  const contracts: SitemapMergePublishContract[] = [];

  for (const merge of merges) {
    const cluster = result.clusters.clusters.find((c) => c.clusterId === merge.clusterId);
    if (!cluster) continue;
    const members = resolvedMemberRows(cluster, rowMap);
    const contract = buildMergePublishContract(merge, members, publishDateGmt, {
      minMembers,
      blogDestination: result.blogDestination,
    });
    if (contract) contracts.push(contract);
  }

  return contracts;
}

export function buildMergePublishContracts(
  result: SitemapOptimizerRunResult,
  publishDateGmt?: string,
): SitemapMergePublishContract[] {
  const publishedAt = publishDateGmt ?? new Date().toISOString();
  const sheetMergeRows = contentSheetRowsForExport(result).filter(
    (row) => row.action === "merge" && row.mergeClusterId?.trim(),
  );
  if (sheetMergeRows.length > 0) {
    return buildMergePublishContractsFromContentSheet(result, publishedAt);
  }
  return buildMergePublishContractsFromMerges(result, publishedAt);
}

export function mergeContractToCsvRow(contract: SitemapMergePublishContract): CSVRow {
  return {
    keyword: contract.keyword,
    keyword_focus: contract.keyword,
    title: contract.title,
    modifier: contract.modifier,
    prompt_modifier: contract.modifier,
    featuredImage: "y",
    publish_date_gmt: contract.publishDateGmt,
    target_slug: contract.slugSegment,
    destination_url: contract.destinationUrl,
    origin: "sitemap-merge",
  };
}

export function redirectRowsFromContracts(
  contracts: SitemapMergePublishContract[],
  result: SitemapOptimizerRunResult,
): { source: string; destination: string }[] {
  const contractByCluster = new Map(contracts.map((c) => [c.clusterId, c]));
  const redirectRows: { source: string; destination: string }[] = [];

  for (const contract of contracts) {
    for (const sourceUrl of contract.sourceUrls) {
      const source = rankMathSourceFromPageUrl(sourceUrl);
      if (!source) continue;
      try {
        const cur = new URL(sourceUrl.trim()).pathname.toLowerCase();
        const normCur = cur.endsWith("/") ? cur : `${cur}/`;
        const normDest = new URL(contract.destinationUrl).pathname.toLowerCase();
        const normDestSlash = normDest.endsWith("/") ? normDest : `${normDest}/`;
        if (normCur === normDestSlash) continue;
      } catch {
        /* compare via destination only */
      }
      redirectRows.push({ source, destination: contract.destinationUrl });
    }
  }

  if (redirectRows.length > 0 || contracts.length === 0) {
    return redirectRows;
  }

  const rowMap = new Map(result.rows.map((r) => [r.postId, r]));
  const minMembers = minMembersForMergePublish(result);
  for (const merge of filterMergeableMerges(
    result.merges,
    result.clusters.clusters,
    result.rows,
    minMembers,
  )) {
    const contract = contractByCluster.get(merge.clusterId);
    if (!contract) continue;
    const cluster = result.clusters.clusters.find((c) => c.clusterId === merge.clusterId);
    if (!cluster) continue;
    const members = resolvedMemberRows(cluster, rowMap);

    for (const member of members) {
      const legacyPageUrl = isRedirectMapCluster(members)
        ? gridMemberSourceUrl(member)
        : member.url;
      const source = rankMathSourceFromPageUrl(legacyPageUrl);
      if (!source) continue;
      try {
        const cur = new URL(legacyPageUrl.trim()).pathname.toLowerCase();
        const normCur = cur.endsWith("/") ? cur : `${cur}/`;
        const normDest = new URL(contract.destinationUrl).pathname.toLowerCase();
        const normDestSlash = normDest.endsWith("/") ? normDest : `${normDest}/`;
        if (normCur === normDestSlash) continue;
      } catch {
        /* compare via destination only */
      }
      redirectRows.push({ source, destination: contract.destinationUrl });
    }
  }
  return redirectRows;
}

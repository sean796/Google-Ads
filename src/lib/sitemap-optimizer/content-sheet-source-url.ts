import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { applyBlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  gridMemberCanonicalUrl,
  gridMemberSourceUrl,
} from "@/lib/sitemap-optimizer/grid-member-url";
import { optimizeBlogMergeDestination } from "@/lib/sitemap-optimizer/optimize-blog-destination";
import type { SitemapMergePublishContract } from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import type {
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

/** Redirect-map row with old_url → new_url from CSV. */
export function isRedirectMapGridRow(row: SitemapOptimizerPostRow): boolean {
  return Boolean(row.gridRedirectFromUrl?.trim());
}

/**
 * Target blog URL on the content sheet (CSV new_url).
 * For redirect-map uploads this is the planned destination, not the legacy page.
 */
export function resolveContentSheetSourceUrl(args: {
  row: SitemapOptimizerPostRow;
  merge?: SitemapOptimizerMergeRecommendation;
  contract?: SitemapMergePublishContract | null;
}): string {
  const { row, merge, contract } = args;

  if (isRedirectMapGridRow(row)) {
    return gridMemberCanonicalUrl(row);
  }

  if (contract?.destinationUrl?.trim()) {
    return contract.destinationUrl.trim();
  }

  const locked = merge?.lockedDestinationUrl?.trim();
  if (locked) return locked;

  return row.url.trim();
}

/** Legacy URL being redirected away from (CSV old_url). */
export function resolveContentSheetLegacySourceUrl(row: SitemapOptimizerPostRow): string | undefined {
  const legacy = row.gridRedirectFromUrl?.trim();
  return legacy || undefined;
}

/** Planned NEO Pulse redirect destination (new_url from CSV when present). */
export function resolveContentSheetDestinationUrl(args: {
  row: SitemapOptimizerPostRow;
  merge?: SitemapOptimizerMergeRecommendation;
  contract?: SitemapMergePublishContract | null;
  blogDestination?: BlogDestinationPolicy | null;
  standaloneKeyword?: string;
  standaloneTitle?: string;
}): string {
  const { row, merge, contract, blogDestination, standaloneKeyword, standaloneTitle } = args;

  if (contract?.destinationUrl?.trim()) {
    return applyBlogDestinationPolicy(contract.destinationUrl.trim(), blogDestination);
  }

  const locked = merge?.lockedDestinationUrl?.trim();
  if (locked) return applyBlogDestinationPolicy(locked, blogDestination);

  if (isRedirectMapGridRow(row)) {
    return gridMemberCanonicalUrl(row);
  }

  if (blogDestination?.forceBlogPermalink) {
    const keyword =
      standaloneKeyword?.trim() ||
      merge?.recommendedPrimaryKeyword?.trim() ||
      row.keyword.trim() ||
      row.title.trim();
    const title =
      standaloneTitle?.trim() || merge?.recommendedTitle?.trim() || row.title.trim() || keyword;
    return optimizeBlogMergeDestination(
      row.url.trim(),
      keyword,
      title,
      [row.gridRedirectFromUrl?.trim() || row.url.trim()],
      blogDestination,
    );
  }

  return applyBlogDestinationPolicy(row.url.trim(), blogDestination);
}

/** Primary URL column: planned blog/redirect target (never legacy old_url). */
export function contentSheetPrimaryUrl(row: {
  proposedDestinationUrl?: string;
  sourceUrl: string;
}): string {
  return row.proposedDestinationUrl?.trim() || row.sourceUrl.trim();
}

/** Legacy page URL for redirects; falls back to inventory URL when not a redirect-map row. */
export function resolveContentSheetLegacySourceUrlForRow(
  row: SitemapOptimizerPostRow,
  destinationUrl: string,
): string | undefined {
  const redirectLegacy = row.gridRedirectFromUrl?.trim();
  if (redirectLegacy) return redirectLegacy;
  const inv = row.url.trim();
  if (inv && inv !== destinationUrl.trim()) return inv;
  return undefined;
}

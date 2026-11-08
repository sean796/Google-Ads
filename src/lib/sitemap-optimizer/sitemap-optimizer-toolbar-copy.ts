import { OVERVIEW_SITEMAP_SOURCE_LABELS } from "@/lib/overview/overview-sitemap-source";

export const SITEMAP_OPTIMIZER_HEADER_TITLE = "Sitemap";

export const SITEMAP_OPTIMIZER_POSTS_LABEL = OVERVIEW_SITEMAP_SOURCE_LABELS.posts;
export const SITEMAP_OPTIMIZER_PAGES_LABEL = OVERVIEW_SITEMAP_SOURCE_LABELS.pages;
export const SITEMAP_OPTIMIZER_SAP_LABEL = OVERVIEW_SITEMAP_SOURCE_LABELS.sap;

export const SITEMAP_OPTIMIZER_MERGE_RATIO_LABEL = "Merge ratio";
export const SITEMAP_OPTIMIZER_COMPRESSION_LABEL = "Compression";
export const SITEMAP_OPTIMIZER_UPLOAD_GSC_CSV_LABEL = "GSC CSV";
export const SITEMAP_OPTIMIZER_ANALYZE_LABEL = "Analyze";
export const SITEMAP_OPTIMIZER_REANALYZE_LABEL = "Re-analyze";
export const SITEMAP_OPTIMIZER_ANALYZE_GRID_LABEL = "Grid";
export const SITEMAP_OPTIMIZER_UPLOAD_RANK_MATH_LABEL = "NEO Pulse redirect plan";
export const SITEMAP_OPTIMIZER_REDIRECT_MAP_TEMPLATE_LABEL = "Redirect map template";

export const SITEMAP_OPTIMIZER_CLUSTER_COMPRESSION = "Compression";

export function sitemapOptimizerEntityCollectionLabel(entityEndpoint: string): string {
  const ep = entityEndpoint.trim();
  if (!ep) return SITEMAP_OPTIMIZER_SAP_LABEL;
  if (ep.toLowerCase() === SITEMAP_OPTIMIZER_SAP_LABEL.toLowerCase()) {
    return SITEMAP_OPTIMIZER_SAP_LABEL;
  }
  return `${SITEMAP_OPTIMIZER_SAP_LABEL} (${ep})`;
}

export function sitemapOptimizerAnalyzeButtonLabel(opts: {
  isGridHarness: boolean;
  hasResult: boolean;
}): string {
  if (opts.isGridHarness) return SITEMAP_OPTIMIZER_ANALYZE_GRID_LABEL;
  if (opts.hasResult) return SITEMAP_OPTIMIZER_REANALYZE_LABEL;
  return SITEMAP_OPTIMIZER_ANALYZE_LABEL;
}

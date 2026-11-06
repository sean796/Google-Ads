import type { GSCPageQuery } from "@/lib/wordpress-api/types";
import type { GridCompressionLevel } from "@/lib/sitemap-optimizer/grid-compression-policy";

export type { GridCompressionLevel } from "@/lib/sitemap-optimizer/grid-compression-policy";

/** User-selectable REST collections for a run. Built-ins plus `custom:{slug}` from property tags. */
export type SitemapOptimizerCollectionKey = "posts" | "pages" | "entity" | `custom:${string}`;

export function isCustomSitemapOptimizerCollectionKey(
  key: string,
): key is `custom:${string}` {
  return key.startsWith("custom:");
}

export type SitemapOptimizerGscDateRange = {
  startDate: string;
  endDate: string;
};

export type SitemapOptimizerRunMode = "wordpress" | "grid_csv";

export type SitemapOptimizerPhase =
  | "idle"
  | "ingest_csv"
  | "tagging"
  | "inventory"
  | "gsc"
  | "gsc_triage"
  | "clustering"
  | "merge"
  | "content_sheet"
  | "done"
  | "error";

import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import type { SitemapOptimizerTrafficFilter } from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc-import";

export type GridUrlIntent = "informational" | "commercial" | "transactional" | "local" | "mixed";

export type SitemapOptimizerProgress = {
  phase: SitemapOptimizerPhase;
  completed: number;
  total: number;
  detail?: string;
  runMode?: SitemapOptimizerRunMode;
  /** GSC live import sub-step for stacked progress UI. */
  gscImportSubphase?: "sitewide" | "join" | "filter" | "queries";
  gscSitePageCount?: number;
  gscAnalyzedPostCount?: number;
  /** Live GSC query fetch within the traffic filter set. */
  gscQueryProgressCompleted?: number;
  gscQueryProgressTotal?: number;
  /** Live GSC import: traffic filter applied before clustering. */
  gscTrafficFilter?: SitemapOptimizerTrafficFilter;
  /** Entity-only run: progress copy uses service-area labels. */
  entityPrimary?: boolean;
  /** WordPress clustering / entity compress: batch / validate / tighten / compress / etc. */
  clusteringSubphase?:
    | "batch"
    | "reconcile"
    | "validate"
    | "tighten"
    | "finalize"
    | "singleton_sweep"
    | "compress"
    | "temporal";
  /** Set after inventory load (full catalog size). */
  inventoryCount?: number;
  uploadRowCount?: number;
  urlsProcessed?: number;
  currentUrl?: string;
  clustersCreated?: number;
  blogsCompleted?: number;
  blogsTotal?: number;
  /** Grid tagging phase progress. */
  tagsCompleted?: number;
  tagsTotal?: number;
  /** Grid cluster-by-tag: tag buckets processed. */
  tagBucketsCompleted?: number;
  tagBucketsTotal?: number;
  /** Grid merge: canonical topics completed (primary merge progress). */
  topicsCompleted?: number;
  topicsTotal?: number;
  currentTopicLabel?: string;
  /** Grid merge: parallel topic workers in flight. */
  topicsInFlight?: number;
  /** Grid merge: OpenRouter batch progress within content plans. */
  mergeBatchCompleted?: number;
  mergeBatchTotal?: number;
  /** Last N URLs touched during clustering (grid harness). */
  recentUrls?: string[];
  /** Grid: max CSV URLs per cluster / new post (1–5). */
  gridMaxUrlsPerPost?: 1 | 2 | 3 | 4 | 5;
  /** @deprecated Use gridMaxUrlsPerPost */
  gridTargetPostCount?: 1 | 2 | 3 | 4 | 5;
};

export type SitemapOptimizerGscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Stable id for clustering (WP post id or normalized url). */
export type SitemapOptimizerPostRow = {
  postId: string;
  url: string;
  id?: number;
  slug?: string;
  collection: string;
  title: string;
  keyword: string;
  meta: string;
  contentSnippet: string;
  seoResearch?: string;
  /** WordPress publish date (GMT ISO), when inventory REST join succeeded. */
  publishedAtGmt?: string;
  gscQueries: SitemapOptimizerGscQueryRow[];
  gscFetched: boolean;
  /** From GSC Pages CSV upload (page-level totals). */
  gscPageClicks?: number;
  gscPageImpressions?: number;
  gscPageCtr?: number;
  gscPagePosition?: number;
  /** GSC performance triage: keep live URL vs consolidate underperformer. */
  gscDisposition?: "keep" | "consolidate";
  gscTriageRationale?: string;
  /** 1-based row in uploaded GSC grid CSV (grid harness). */
  uploadRowIndex?: number;
  /** Redirect grid CSV: URL being replaced (old_url). */
  gridRedirectFromUrl?: string;
  /** Redirect grid CSV: pre-assigned merge group number. */
  gridRedirectGroup?: number;
  /** Grid harness: stable topic tag from tag agent. */
  gridTopicTag?: string;
  /** Grid harness: geo tag when local (empty = global). */
  gridGeoTag?: string;
  /** Grid harness: short label for UI/export. */
  gridTagLabel?: string;
  gridIntent?: GridUrlIntent;
};

export type SitemapOptimizerCluster = {
  clusterId: string;
  label: string;
  intent: string;
  memberPostIds: string[];
  confidence: "high" | "medium" | "low";
  rationale: string;
  /** AI temporal pillar: slug stem without year/quarter (e.g. canadian-interest-rates). */
  temporalPillarSlugStem?: string;
  /** AI temporal pillar: one H2 header per legacy time slice. */
  temporalSectionHeaders?: string[];
};

export type SitemapOptimizerClusterResult = {
  clusters: SitemapOptimizerCluster[];
  singletons: string[];
};

export type SitemapOptimizerMergeKeepFrom = {
  url: string;
  title: string;
  bullets: string[];
};

export type SitemapOptimizerMergeRecommendation = {
  clusterId: string;
  recommendedTitle: string;
  recommendedPrimaryKeyword: string;
  recommendedMeta: string;
  combinedOutline: string[];
  whatToKeepFromEach: SitemapOptimizerMergeKeepFrom[];
  redirectOrCanonicalNote: string;
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  rationale: string;
  /** Rank Math import: exact new post URL from redirect sheet. */
  lockedDestinationUrl?: string;
  /** Entity SAP export: bulk CSV entity column (hyperlocal place, city). */
  sapEntity?: string;
  /** Entity SAP export: bulk CSV modifier column (writer brief, not template text). */
  sapModifier?: string;
};

export type SitemapOptimizerStandaloneProposal = {
  postId: string;
  action: "refresh" | "keep";
  proposedTitle: string;
  proposedPrimaryKeyword: string;
  proposedMeta: string;
  priority: "high" | "medium" | "low";
  rationale: string;
};

export type SitemapOptimizerContentSheetRow = {
  postId: string;
  sourceUrl: string;
  sourceTitle: string;
  action: "merge" | "refresh" | "keep" | "new_blog";
  priority: "high" | "medium" | "low";
  proposedTitle: string;
  proposedPrimaryKeyword: string;
  proposedMeta: string;
  mergeClusterId?: string;
  mergeGroupLabel?: string;
  rationale?: string;
  gscClicks?: number;
  gscImpressions?: number;
  combinedOutline?: string[];
  mergeSourceCount?: number;
  uploadRowIndex?: number;
  isSingletonCluster?: boolean;
  /** 1-based merge group (grid harness). */
  mergeGroupNumber?: number;
  gridTopicTag?: string;
  gridGeoTag?: string;
  gridTagLabel?: string;
  /** Planned new URL (redirect-map new_url or AI locked destination). */
  proposedDestinationUrl?: string;
  /** Legacy page URL (redirect-map old_url) for reference. */
  legacySourceUrl?: string;
  /** Bulk harness writer brief (intent, H2s, legacy topics). */
  modifier?: string;
  /** Entity SAP bulk CSV entity column when AI-authored. */
  bulkEntityLabel?: string;
  /** Per legacy URL topics/angles to carry into the new post. */
  whatToKeepFromEach?: SitemapOptimizerMergeKeepFrom[];
};

export type SitemapOptimizerRunResult = {
  rows: SitemapOptimizerPostRow[];
  clusters: SitemapOptimizerClusterResult;
  merges: SitemapOptimizerMergeRecommendation[];
  contentSheet: SitemapOptimizerContentSheetRow[];
  gscMissCount: number;
  dateRange: SitemapOptimizerGscDateRange;
  analyzedAt: string;
  /** GSC CSV upload row count when a file was used. */
  gscUploadRowCount?: number;
  runMode?: SitemapOptimizerRunMode;
  gridMaxUrlsPerPost?: 1 | 2 | 3 | 4 | 5;
  /** @deprecated Use gridMaxUrlsPerPost */
  gridTargetPostCount?: 1 | 2 | 3 | 4 | 5;
  /** Grid run skipped OpenRouter blog briefs (Rank Math redirects only). */
  gridRankMathOnly?: boolean;
  /** Redirect-map topic compression. Forced to none when gridMaxUrlsPerPost is 1; Basic = directly related when max ≥ 2. */
  gridCompression?: GridCompressionLevel;
  /** When set, destination URLs are normalized to /blog/{slug}/. */
  blogDestination?: BlogDestinationPolicy;
  /** User uploaded a Rank Math / traffic redirect CSV (not full-inventory-only GSC). */
  redirectMapUpload?: boolean;
  /** Entity-only run: service-area compression (1-URL families allowed). */
  entityPrimary?: boolean;
};

/** Compact catalog row sent to cluster agent. */
export type SitemapOptimizerCatalogEntry = {
  postId: string;
  url: string;
  /** Last URL path segment (slug); helps separate geo/topic. */
  urlPathTail: string;
  title: string;
  keyword: string;
  meta: string;
  collection: string;
  gscTopQueries: string[];
  contentSnippet: string;
  gscPageClicks?: number;
  gscPageImpressions?: number;
  gscPageCtr?: number;
  gscPagePosition?: number;
};

/** Sitemap Optimizer workspace sub-mode. */
export type SitemapOptimizerWorkspaceMode = "plan" | "url_optimizer";

export function gscPageQueriesToRows(queries: GSCPageQuery[]): SitemapOptimizerGscQueryRow[] {
  return [...queries]
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 15)
    .map((q) => ({
      query: q.query,
      clicks: q.clicks ?? 0,
      impressions: q.impressions ?? 0,
      ctr: q.ctr ?? 0,
      position: q.position ?? 0,
    }));
}

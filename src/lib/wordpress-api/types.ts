/**
 * WordPress API TypeScript Interfaces and Types
 * All type definitions for WordPress API operations
 */

export interface WordPressConnectionResult {
  success: boolean;
  message: string;
  siteInfo?: {
    name: string;
    description: string;
    url: string;
  };
  capabilities?: import('@/components/integrations/types').WordPressSiteCapabilities;
}

export interface SitemapDetectionResult {
  found: boolean;
  sitemapUrl?: string;
  type?: 'index' | 'urlset';
  content?: string;
  message?: string;
}

export interface SitemapParseResult {
  type: 'index' | 'urlset';
  urls: string[];
  childSitemaps?: string[];
  error?: string;
}

export interface ScheduledPostsResult {
  count: number;
  posts?: Array<{
    id: number;
    slug: string;
    date_gmt: string;
    title: string;
  }>;
  month?: number;
  year?: number;
  allScheduled?: boolean;
  error?: string;
  debug?: {
    totalScheduledPosts: number;
    targetMonth?: number;
    targetYear?: number;
  };
}

export interface PublishedPostsResult {
  count: number;
  posts?: Array<{
    id: number;
    slug: string;
    date_gmt: string;
    title: string;
    excerpt: string;
    link: string;
  }>;
  total?: number;
  error?: string;
}

/** POST /api/wordpress/get-optimization-activity-counts */
export interface OptimizationActivityCountsResult {
  ok: boolean;
  postsOptimized?: number | null;
  pagesOptimized?: number | null;
  entityOptimized?: number | null;
  entityConfigured?: boolean;
  entityCountsAvailable?: boolean;
  entityCollection?: string;
  totalOptimized?: number | null;
  error?: string;
}

/** Client tile for optimization usage vs package cap (Integrations). */
export interface OptimizationActivityTileStats {
  quarterLabel: string;
  loading: boolean;
  errorTitle?: string;
  totalOptimized: number | null;
  cap: number;
  remaining: number | null;
  countsPeriodAfterIso?: string;
  countsPeriodEndExclusiveIso?: string;
  countsPeriodMode?: "quarter" | "rolling" | "month";
}

/** POST /api/wordpress/get-quarter-editorial-counts */
export interface QuarterEditorialCountsResult {
  ok: boolean;
  /** Blog posts (`wp/v2/posts`) published in quarter. */
  postsPublished?: number | null;
  /** Blog posts scheduled in quarter (`future`). */
  postsScheduled?: number | null;
  /** Entity CPT live in quarter when `entityConfigured` and fetch succeeded or CPT missing (zeros). */
  entityPublished?: number | null;
  entityScheduled?: number | null;
  entityConfigured?: boolean;
  entityCountsAvailable?: boolean;
  entityCollection?: string;
  /** @deprecated summed posts + entities */
  published: number | null;
  scheduled: number | null;
  error?: string;
}

/** Property tile quarterly birds-eye stats (client hook). */
export interface QuarterEditorialTileStats {
  quarterLabel: string;
  loading: boolean;
  errorTitle?: string;
  postsLive: number | null;
  postsScheduled: number | null;
  entityLive: number | null;
  entityScheduled: number | null;
  entityConfigured: boolean;
  entityCountsAvailable: boolean;
  entityCollectionLabel?: string;
  /** WordPress REST `after` for the active counts window (ISO). */
  countsPeriodAfterIso?: string;
  /** WordPress REST `before` (exclusive end); next editorial period starts here (ISO). */
  countsPeriodEndExclusiveIso?: string;
  countsPeriodMode?: "quarter" | "rolling" | "month";
}

/** Single row in site inventory JSON (bulk prompt generator). */
export interface SitePostInventoryRow {
  id?: number;
  slug?: string;
  date_gmt?: string;
  url: string;
  /** WP featured_media attachment id when the post has a featured image. */
  featuredMediaId?: number;
  /** Raw ACF object when fetched with includeRawAcf (context=edit). */
  acf?: Record<string, unknown>;
  fields: {
    title: string;
    meta: string;
    keyword: string;
    /** First H1 from post body when inventory used includePageHeading. */
    pageHeading?: string;
    /** Present when inventory was fetched with includeContent (REST context=edit). */
    content?: string;
    excerpt?: string;
  };
}

/** Server response before client adds generatedAt (saved to KB). */
export interface SitePostInventoryResponse {
  site: { url: string };
  posts: SitePostInventoryRow[];
  total?: number;
  error?: string;
}

/** Inventory row tagged with REST collection (bulk single-call endpoint). */
export interface SiteInventoryBulkRow extends SitePostInventoryRow {
  /** `posts` / `pages` or custom wp/v2 segment (e.g. `service-area`). */
  collection: string;
}

export interface SiteInventoryBulkResponse {
  site: { url: string };
  rows: SiteInventoryBulkRow[];
  total?: number;
  /** Per-collection errors when another collection still returned rows */
  errors?: Partial<Record<string, string>>;
  error?: string;
  /** True when auto sizing capped rows for a large site. */
  truncated?: boolean;
  /** `full` = no cap applied; `large` = capped inventory for curate. */
  inventorySizing?: "full" | "large";
}

/** Full payload written to Knowledge Base (includes client-generatedAt). */
export interface SitePostInventoryKbPayload {
  site: { url: string };
  generatedAt: string;
  posts: SitePostInventoryRow[];
}

/** WP REST rendered field (title / content / excerpt in `context=edit` payloads). */
export interface WordPressRenderedField {
  rendered?: string;
  raw?: string;
  protected?: boolean;
}

/** Raw WP REST post payload carried on `WordPressPostContent.fullData`. */
export interface WordPressPostFullData {
  id?: number;
  slug?: string;
  status?: string;
  link?: string;
  date?: string;
  date_gmt?: string;
  title?: WordPressRenderedField;
  content?: WordPressRenderedField;
  excerpt?: WordPressRenderedField;
  featured_media?: number | { id?: number };
  meta?: Record<string, unknown>;
  acf?: Record<string, unknown>;
  neo_pulse_fields?: Record<string, unknown>;
  _embedded?: {
    featured_media?: Array<{ id?: number }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface WordPressPostContent {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date_gmt: string;
  status: string;
  link: string;
  categories: number[];
  tags: number[];
  // Store the actual WordPress REST API endpoint used when fetching this post
  // This is reliable, unlike sitemap subtypes which can be inconsistent
  postTypeEndpoint?: string; // e.g., 'posts', 'pages', 'service-area'
  postTypeSubtype?: string; // Original subtype from resolution (for reference)
  // Complete WordPress API response with all fields (featured_media, ACF, meta, author, etc.)
  fullData?: WordPressPostFullData;
}

export interface PostContentResult {
  count: number;
  posts?: WordPressPostContent[];
  errors?: Array<{ id?: number; slug?: string; error: string }>;
  error?: string;
}

export interface ResolvedUrl {
  url: string;
  id: number;
  subtype: string;
  link: string;
}

export interface UnresolvableUrl {
  url: string;
  reason: string;
}

export interface ResolveUrlsResult {
  resolved: ResolvedUrl[];
  unresolvable: UnresolvableUrl[];
  summary: {
    total: number;
    resolved: number;
    unresolvable: number;
    typeCounts: Record<string, number>;
  };
  error?: string;
}

/** Server-side check that REST `content.raw` length matches what we sent (intermittent truncation guard). */
export interface WordPressContentVerification {
  ok: boolean;
  skipped?: boolean;
  sentLength: number;
  storedLength: number | null;
}

export interface WordPressPostCreateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
  contentVerification?: WordPressContentVerification | null;
  /** Present when verification detected far less stored HTML than sent (after automatic repair attempt). */
  contentSaveWarning?: string;
}

export interface WordPressPostUpdateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
  contentVerification?: WordPressContentVerification | null;
  contentSaveWarning?: string;
  /** Raw WordPress REST error body when success is false (e.g. 403 code/message) */
  details?: { code?: string; message?: string; data?: { status?: number } };
}

export interface WordPressPostDeleteResult {
  success: boolean;
  postId?: number;
  deleted?: boolean;
  previous?: {
    link?: string;
    status?: string;
    title?: string;
  };
  error?: string;
}

export interface WordPressMediaUploadResult {
  success: boolean;
  mediaId?: number;
  url?: string;
  link?: string;
  title?: string;
  error?: string;
}

export interface GenerateEntitiesResult {
  entities: string[];
  error?: string;
}

export interface CheckFuturePostsResult {
  success: boolean;
  futureCount: number;
  posts?: Array<{
    id: number;
    slug: string;
    title: string;
    date_gmt: string;
    status: string;
    link: string;
  }>;
  error?: string;
}

export interface WordPressPostMetaResult {
  success: boolean;
  postId?: number;
  meta?: Record<string, unknown>;
  /** Rendered post title (optional; returned for Content Optimizer / server meta AI). */
  title?: string;
  /** Rendered post content HTML (optional). */
  content?: string;
  excerpt?: string;
  link?: string;
  acf?: Record<string, unknown>;
  error?: string;
}

export interface WordPressPostMetaUpdateResult {
  success: boolean;
  postId?: number;
  updated?: boolean;
  error?: string;
}

export interface GSCPageQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SitemapIndexingResult {
  success: boolean;
  processed: number;
  indexed: number;
  requested: number;
  errors: number;
  total: number;
  results: Array<{
    url: string;
    status: 'indexed' | 'requested' | 'error';
    indexingStatus?: string;
    error?: string;
  }>;
  property?: string;
  error?: string;
}

export interface IndexingProgress {
  processed: number;
  total: number;
  indexed: number;
  requested: number;
  errors: number;
  currentUrl?: string;
}

export interface GSCPagesPerformanceBatchResult {
  success: boolean;
  siteUrl?: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  property?: string;
  pages: GSCPagePerformanceResult[];
  error?: string;
}

export interface GSCSitePageMetric {
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSitePagesPerformanceResult {
  success: boolean;
  siteUrl?: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  property?: string;
  totalPages?: number;
  pages: GSCSitePageMetric[];
  error?: string;
}

export interface GSCPagePerformanceResult {
  success: boolean;
  pageUrl: string;
  matchedUrl?: string | null;
  pageExists?: boolean;
  pageStats?: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  queries: GSCPageQuery[];
  topKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  } | null;
  totalQueries: number;
  property?: string;
  error?: string;
}


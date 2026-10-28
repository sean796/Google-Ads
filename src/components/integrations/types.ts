export const WORDPRESS_SITES_STORAGE_KEY = 'wordpress_sites';
export const KB_FILES_STORAGE_KEY = 'kb_files';

/** Detected WordPress / NEO Pulse WP capabilities from POST /test-connection. */
export interface WordPressSiteCapabilities {
  hasNeoPulseWp: boolean;
  neoPulseWpVersion?: string;
  fieldsBackend: 'acf_native' | 'neo_pulse_fields' | 'none';
  acfRestObjectPresent: boolean;
}

export interface WordPressSite {
  id: string;
  name: string;
  /** Header site menu label only (top-bar pencil). Does not change Properties list names. */
  menuDisplayName?: string;
  siteUrl: string;
  /**
   * Live / production site URL when it differs from `siteUrl` (e.g. REST connects to staging,
   * but reports and citations should reference the public domain).
   */
  productionSiteUrl?: string;
  username: string;
  appPassword: string;
  connectedAt: number;
  lastTested?: number;
  connectionStatus?: 'testing' | 'success' | 'failed';
  /** NEO Pulse WP plugin + fields backend detected at last connection test. */
  capabilities?: WordPressSiteCapabilities;
  enabled?: boolean;
  sitemaps?: {
    mainSitemapUrl: string;
    detectedAt: number;
    type: 'index' | 'urlset';
    childSitemaps?: string[];
    urls?: string[];
    endpoints?: Record<string, string>; // Map of sitemap URL -> endpoint (e.g., "service-areas-sitemap.xml" -> "service-areas")
    postMetadata?: Record<string, {
      posts: Array<{
        id: number;
        slug: string;
        title: string;
        date_gmt: string;
        status: string;
        link: string;
      }>;
      futureCount: number;
      lastChecked: number;
    }>;
    /** Child sitemap URLs excluded for this property (Sitemaps tab → Sitemap menu). */
    disabledChildSitemapUrls?: string[];
    /** Per child sitemap URL: system roles and custom tag labels. */
    childTagsByUrl?: Record<
      string,
      {
        roles: Array<"pages" | "posts" | "entity" | "competitor">;
        custom: string[];
      }
    >;
  };
  /** Property-wide custom sitemap tag labels (Integrations → Sitemaps). */
  customSitemapTagLabels?: string[];
  scheduledPosts?: {
    count: number;
    month: number;
    year: number;
    fetchedAt: number;
  };
  entitySitemapUrl?: string;
  /** Rank Math child sitemap for competitor comparison CPT (e.g. competitor-sitemap.xml). */
  competitorEntitySitemapUrl?: string;
  manualEndpoint?: string; // Manually declared endpoint (authoritative, no mutation)
  locations?: Location[];
  napInfo?: NAPInfo;
  /** GA4 Property ID for this site (numeric). Used by Test GA and future report integration. */
  ga4PropertyId?: string;
  /** Google Ads customer ID for this site (10 digits, hyphens optional). Used by PPC reporting. */
  googleAdsCustomerId?: string;
  /** Google Business Profile location ID for this site. From business.google.com profile URL (e.g. fid=... or the numeric ID). Used by Pull GMB stats to skip account/location discovery and avoid quota. */
  gbpLocationId?: string;
  /** Semrush Site Audit project ID (from semrush.com/projects/{id}). Used by Meta Optimizer AUDIT fetch. */
  semrushSiteAuditProjectId?: string;
  /** Semrush Position Tracking project ID (from semrush.com/seo/{id}/). */
  semrushPositionTrackingProjectId?: string;
  /** Semrush Position Tracking campaign ID (URL fid= or full {project}_{campaign}). */
  semrushPositionTrackingCampaignId?: string;
  /** WP Engine install name (my.wpengine.com/installs/{install}). */
  wpEngineInstall?: string;
  /** WP Engine account UUID that owns the install (launch_wp_admin?account_id=...). */
  wpEngineAccountId?: string;
  /**
   * Optional local `YYYY-MM-DD` anchor for editorial post/entity counts: each period is three calendar months
   * from this date. When unset, counts use the calendar quarter (Q1–Q4).
   */
  editorialCountsPeriodStartYmd?: string;

  /**
   * Optimization package for multi-site sampling and period caps on the property tile (sparkle x/cap).
   * When unset, no cap is shown or enforced.
   */
  optimizationPackage?: "basic" | "pro" | "plus";

  /** Monthly blog + SAP editorial quotas (Standard 2+4, Lite 1+2). */
  editorialContentPackage?: "standard" | "lite";

  /** Local publish time for editorial schedule alignment (`HH:MM`, site timezone). */
  editorialPublishTimeLocal?: string;

  /** Portfolio industry vertical for GSC benchmarks and CSV packages (controlled taxonomy). */
  industryVertical?: string;

  /**
   * Optional benchmark category tag (Integrations → property). When set, Client benchmarks
   * uses this label instead of Gemini taxonomy for that site.
   */
  benchmarkCustomTag?: string;

  /** Multi-select profile tags (Integrations → property Profile). */
  profileTags?: string[];

  /** Default local grid / geo-grid keyword (e.g. blinds near me). */
  primaryLocalKeyword?: string;

  /** Client site logo URL for reports (Integrations → Profile). */
  clientLogoUrl?: string;
  /** When the logo URL was last fetched from the live site (epoch ms). */
  clientLogoFetchedAt?: number;
  clientLogoSource?:
    | "og:image"
    | "twitter:image"
    | "apple-touch-icon"
    | "icon"
    | "json-ld"
    | "manual"
    | "upload";
  /** Background box theme for client logo on executive report covers. Defaults to "black". */
  clientLogoBoxTheme?: "black" | "white";

  /** @deprecated Use per-sitemap exclusions (`sitemaps.disabledChildSitemapUrls`) instead. */
  sitemapsEnabledForProperty?: boolean;
  /** Plugin token for NEO Pulse WP direct connect (from workspace save). */
  pluginAccessToken?: string;
  /** When false, no Slack posts for this property (global Slack must also be enabled). Default true when unset. */
  slackEnabledForProperty?: boolean;
  /** Target channel for bot (`chat.postMessage`). Bot must be in the channel. */
  slackChannelId?: string;
  /** Optional display label (e.g. #client-name). */
  slackChannelName?: string;
  /** Alternate posting path: Incoming Webhook URL for this property. */
  slackIncomingWebhookUrl?: string;
  /** Appended to alert messages (e.g. <!subteam^S123>). */
  slackMentionSnippet?: string;
  /** Last Test Slack result for this site. */
  slackConnectionStatus?: 'not_configured' | 'ok' | 'error';
  slackLastTestAt?: number;
  /** Legacy persisted flag; ignored by current properties UI. */
  postBankEnabled?: boolean;
}

/** Bulk / keyword flows: `siteUrl` is the WordPress connection base; optional production URL for display. */
export type ConnectedSiteSummary = Pick<WordPressSite, "name" | "siteUrl" | "productionSiteUrl">;

export type SlackSiteConnectionStatus = NonNullable<WordPressSite['slackConnectionStatus']>;

/** One GA4 period slice for Organic Search (sessionDefaultChannelGroup). */
export interface GA4OrganicAcquisitionPeriod {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDurationSec: number;
  keyEvents: number;
  eventCount: number;
  eventsPerSession: number;
}

/** GA4 report data returned by POST /api/ga/report-data. All metrics are organic-only (Organic Search channel). */
export interface GA4ReportData {
  /** Conversions from organic search sessions only. */
  conversions?: {
    current: number;
    previous: number;
    change: number;
    /** null when prior period has no data (do not show 100%). */
    changePercent: number | null;
  };
  /** Organic search sessions only. */
  organicTraffic?: {
    sessionsCurrent: number;
    sessionsPrevious: number;
    change: number;
    /** null when prior period has no data (do not show 100%). */
    changePercent: number | null;
  };
  /** Rich organic engagement metrics for reporting CSV (current vs compare date ranges). */
  organicAcquisition?: {
    current: GA4OrganicAcquisitionPeriod;
    previous: GA4OrganicAcquisitionPeriod;
  };
  /**
   * Same shape as `organicAcquisition`. Returned by some deployed `/api/ga/report-data` handlers.
   */
  organicTrafficAcquisition?: {
    current: GA4OrganicAcquisitionPeriod;
    previous: GA4OrganicAcquisitionPeriod;
  };
  /** Optional channel breakdown when the API returns multi-channel rows. */
  trafficByChannel?: {
    channels: GA4TrafficChannelRow[];
  };
  /** firstUserMedium = organic, current vs compare period totals (User acquisition report). */
  organicUsers?: {
    current: GA4OrganicUsersPeriodTotals;
    previous: GA4OrganicUsersPeriodTotals;
  };
  /** firstUserMedium = organic, monthly rows + period totals (User acquisition). */
  organicUsersMonthly?: GA4OrganicUsersMonthlyBlock;
  /** sessionDefaultChannelGroup = Organic Search, monthly traffic acquisition rows. */
  organicTrafficAcquisitionMonthly?: GA4OrganicTrafficAcquisitionMonthlyBlock;
}

export type GA4OrganicTrafficAcquisitionMonthlyBlock = {
  channel: "Organic Search";
  dimension: "sessionDefaultChannelGroup";
  periodStart: string;
  periodEnd: string;
  totals: GA4OrganicAcquisitionPeriod;
  months: Array<
    {
      yearMonth: string;
      label: string;
    } & GA4OrganicAcquisitionPeriod
  >;
};

export type GA4OrganicUsersPeriodTotals = {
  totalUsers: number;
  newUsers: number;
  userKeyEventRate: number;
  keyEvents: number;
};

export type GA4OrganicUsersMonthlyBlock = {
  medium: "organic";
  dimension: "firstUserMedium";
  periodStart: string;
  periodEnd: string;
  totals: GA4OrganicUsersPeriodTotals;
  months: Array<{
    yearMonth: string;
    label: string;
    totalUsers: number;
    newUsers: number;
    userKeyEventRate: number;
    keyEvents: number;
  }>;
};

/** Accept `organicAcquisition` or legacy/alternate `organicTrafficAcquisition` from GA report-data. */
export function pickGa4OrganicAcquisition(
  data: GA4ReportData,
): GA4ReportData["organicAcquisition"] | undefined {
  return data.organicAcquisition ?? data.organicTrafficAcquisition;
}

export type GA4TrafficChannelRow = {
  channel: string;
  sessionsCurrent: number;
  sessionsPrevious: number;
  change: number;
  changePercent: number | null;
};

/** GMB (Google Business Profile) performance data from POST /api/gmb/performance - calls, directions, website clicks for two periods. */
export interface GMBReportData {
  locationCount: number;
  currentPeriod: {
    startDate: string;
    endDate: string;
    calls: number;
    directions: number;
    websiteClicks: number;
  };
  comparisonPeriod: {
    startDate: string;
    endDate: string;
    calls: number;
    directions: number;
    websiteClicks: number;
  };
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  /** United States or Canada when set from Profile country select. */
  country?: string;
  zip: string;
  phone: string;
  email?: string;
  isDefault: boolean;
}

export interface NAPInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  locations?: Location[];
}

export interface StoredFile {
  name: string;
  size: number;
  content: string;
  starred: boolean;
  timestamp: number;
}

// GSC Performance Report Types
export interface GSCPerformanceStats {
  currentPeriod: PeriodStats;
  comparisonPeriod: PeriodStats;
  comparisons: ComparisonMetrics;
  topKeywords: KeywordPerformance[];
}

export interface PeriodStats {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  pagesCount: number;
  searchTermsCount: number;
}

export interface ComparisonMetrics {
  clicksChange: number;
  clicksChangePercent: number;
  impressionsChange: number;
  impressionsChangePercent: number;
  ctrChange: number;
  ctrChangePercent: number;
  avgPositionChange: number;
  avgPositionChangePercent: number;
  pagesChange: number;
  pagesChangePercent: number;
  searchTermsChange: number;
  searchTermsChangePercent: number;
}

export interface KeywordPerformance {
  query: string;
  currentRanking: number;
  previousRanking: number;
  rankingChange: number;
  currentClicks: number;
  previousClicks: number;
  clicksChange: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsChange: number;
  url?: string;
}

// WordPress Post Update Types
export interface WordPressPostUpdateResult {
  success: boolean;
  postId?: number;
  link?: string;
  status?: string;
  date?: string;
  title?: string;
  error?: string;
}

// GSC Page Performance Types
export interface GSCPageQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPagePerformanceResult {
  success: boolean;
  pageUrl: string;
  matchedUrl?: string | null;
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

// Content Optimization Types
export interface ContentOptimizationProgress {
  step: string;
  progress: number;
  message?: string;
}

export interface ContentOptimizationResult {
  success: boolean;
  postId?: number;
  link?: string;
  title?: string;
  status?: string;
  primaryKeyword?: string;
  optimizedTitle?: string;
  error?: string;
}

// GSC Report AI Analysis Types (simplified - AI handles everything)
export interface AIReportAnalysis {
  executiveSummary: {
    bullets: string[];
    aiInsight: string;
  };
  newTermsTable: string;
  newTermsInsight: string;
  topPerformersTable: string;
  topPerformersInsight: string;
  localSEOTable: string;
  localSEOInsight: string;
  trafficTable: string;
  trafficInsight: string;
  growthOpportunities: string[];
  lookingAheadInsight: string;
}

// Legacy types kept for compatibility but simplified
export interface NewTermsAnalysis {
  newTerms: NewTermWithAnalysis[];
  categories: Record<string, string[]>;
  localTerms: string[];
  aiInsights: string;
  totalNewTerms: number;
  topOpportunities: NewTermWithAnalysis[];
}

export interface NewTermWithAnalysis {
  term: string;
  category: string;
  categoryEmoji: string;
  intent: 'informational' | 'transactional' | 'navigational' | 'local';
  intentEmoji: string;
  opportunityScore: number;
  opportunityEmoji: string;
  impressions?: number;
  clicks?: number;
  position?: number;
}

export interface LocalSEOInsights {
  locationTerms: LocationTerm[];
  serviceAreaExpansion: string[];
  localIntentBreakdown: {
    commercial: number;
    informational: number;
    navigational: number;
  };
  napSignals: string[];
  aiLocalInsights: string;
}

export interface LocationTerm {
  term: string;
  locationType: 'city' | 'region' | 'neighborhood' | 'state' | 'general';
  emoji: string;
  impressions?: number;
  position?: number;
}

export interface EnhancedMetrics {
  metric: string;
  currentValue: string;
  previousValue: string;
  change: string;
  changePercent: string;
  emoji: string;
  isPositive: boolean;
  aiInsight?: string;
}

export interface GSCReportSection {
  title: string;
  emoji: string;
  bullets: string[];
  table?: string;
  aiAnalysis?: string;
}
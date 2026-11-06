import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { CompetitorComparisonHarnessGroup } from "@/lib/competitor-research/competitor-comparison-harness-state";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import type { WordPressSite } from "@/components/integrations/types";

/** Row from Semrush domain_organic_organic (normalized server-side). */
export type SemrushCompetitorRow = {
  domain: string;
  competitionLevel: number | null;
  commonKeywords: number | null;
  organicTraffic: number | null;
  trafficCost: number | null;
  organicKeywords: number | null;
  adsKeywords: number | null;
  /** Optional link metrics if ever reintroduced (server no longer calls backlinks_overview). */
  authorityScore?: number | null;
  referringDomains?: number | null;
  backlinksTotal?: number | null;
};

/** Parsed row from domain_organic (per-competitor enrichment). */
export type CompetitorKeywordRow = {
  /** Cluster label when row is an aggregated semantic cluster; otherwise the Semrush keyword phrase. */
  phrase: string;
  volume: number | null;
  traffic: number | null;
  position: number | null;
  /** When set, Semrush phrases grouped into this cluster (exact strings from domain_organic). */
  clusterMembers?: string[];
};

export type CompetitorDomainEnrichment = {
  topKeywords: CompetitorKeywordRow[];
  topPageUrl?: string;
  pageTitle?: string;
};

/** Seed domain snapshot from Semrush domain_rank (same metric meanings as competitor rows). */
export type CompetitorSeedMetrics = {
  organicKeywords: number | null;
  organicTraffic: number | null;
  trafficCost: number | null;
  adsKeywords: number | null;
};

/** Legacy shape for optional link totals (server returns null; wire may omit). */
export type CompetitorSeedOverview = {
  authorityScore: number | null;
  referringDomains: number | null;
  backlinksTotal: number | null;
};

export type CompetitorResearchSemrushResponse = {
  seedDomain: string;
  /** Regional Semrush database used for all calls in this response (e.g. us, uk). */
  database: string;
  /** When `"dfs"`, data came from DataForSEO Labs (no Semrush API); prompts should avoid Semrush/backlink claims. */
  dataSource?: "semrush" | "dfs";
  rows: SemrushCompetitorRow[];
  /** Live seed-domain totals from domain_rank (when returned by Semrush). */
  seedMetrics?: CompetitorSeedMetrics | null;
  /** Seed link snapshot; server always null (no backlinks_overview call). */
  seedOverview?: CompetitorSeedOverview | null;
  /** Top organic keywords for the seed domain (domain_organic). */
  seedTopKeywords?: CompetitorKeywordRow[];
  /** Semrush `domain_organic` top phrases as CSV (server-built; same rows as seed keywords cap). */
  seedDomainOrganicCsv?: string;
  /** Per-competitor domain key → CSV of top Semrush organic keywords (server `domain_organic`). */
  domainOrganicCsvByDomain?: Record<string, string>;
  enrichmentByDomain?: Record<string, CompetitorDomainEnrichment>;
  errors?: { step: string; message: string }[];
};

export type TieredCompetitorItem = {
  domain: string;
  score: number;
  rationale: string;
};

export type CompetitorTierGroup = {
  tier: "high" | "medium" | "low";
  label: string;
  competitors: TieredCompetitorItem[];
};

export type TieredCompetitorsResult = {
  tiers: CompetitorTierGroup[];
  summary: string;
};

export type CompetitorModuleLineCount = {
  path: string;
  lines: number;
};

/** Row from POST /api/gsc/fetch-queries (aligned with GSC search analytics). */
export type GscSiteQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date?: string;
};

export type GscCompetitorDateRange = {
  startDate: string;
  endDate: string;
};

export type CompetitorPageMeta = {
  url: string;
  title: string;
  metaDescription: string;
  bodySnippet: string;
};

export type CompetitorSiteProfile = {
  businessName: string;
  domain: string | null;
  homepageUrl: string | null;
  sitemapUrl: string | null;
  services: string[];
  categories: string[];
  metaPatterns: string[];
  topPages: CompetitorPageMeta[];
};

export type ConnectedSiteProfile = {
  siteName: string;
  siteUrl: string;
  services: string[];
  metaPatterns: string[];
  samplePages: Array<{ title: string; url: string; metaDescription?: string }>;
};

export type ServiceComparisonRow = {
  service: string;
  competitorNotes: string;
  marketNotes: string;
  connectedSiteOffers: boolean;
};

export type FeatureBenefitRow = {
  feature: string;
  typicalApproach: string;
  practicalBenefit: string;
};

export type CompetitorComparisonResult = {
  serviceComparison: ServiceComparisonRow[];
  featureBenefitTable: FeatureBenefitRow[];
  positioningNotes: string;
};

export type CompetitorWithRow = {
  place: CompetitorGridPlaceRow;
  domain: string | null;
  profile: CompetitorSiteProfile | null;
  comparison: CompetitorComparisonResult | null;
  row: CSVRow;
};

export type CompetitorGenerationProgress = {
  currentMessage: string;
  stepLog: string[];
  harnessGroups?: CompetitorComparisonHarnessGroup[];
};

export type CompetitorGenerationOptions = {
  site: WordPressSite;
  places: CompetitorGridPlaceRow[];
  keyword: string;
  promptModifier?: string;
  apiKey: string;
  siteId?: string;
  onRowsUpdate?: (competitors: CompetitorWithRow[]) => void;
};

export type CompetitorOrchestratorResult = {
  competitors: CompetitorWithRow[];
  suggestedTitleFormat: string;
  connectedProfile: ConnectedSiteProfile;
};

export type CompetitorProgressCallback = (
  message: string,
  harnessGroups?: CompetitorComparisonHarnessGroup[],
) => void;


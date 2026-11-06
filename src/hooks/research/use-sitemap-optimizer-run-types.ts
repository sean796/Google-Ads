import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SitemapOptimizerCollectionOption } from "@/lib/sitemap-optimizer/collection-options";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import type { buildCompanyKeepClusters } from "@/lib/sitemap-optimizer/company-content-policy";
import type { EntityCompressionProfile } from "@/lib/sitemap-optimizer/entity-compression-profile";
import type { SitemapOptimizerTrafficFilter } from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc-import";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type {
  SitemapOptimizerCollectionKey,
  SitemapOptimizerGscDateRange,
  SitemapOptimizerPostRow,
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export type SitemapOptimizerRunArgs = {
  site: WordPressSite | null;
  collectionOptions: SitemapOptimizerCollectionOption[];
  selectedCollections: Set<SitemapOptimizerCollectionKey>;
  dateRange: SitemapOptimizerGscDateRange;
  gscPagesUpload?: GscParsedPageRow[] | null;
  /** Redirect map CSV (old_url → new_url) — used with live GSC or WordPress inventory. */
  redirectMapUpload?: GscParsedPageRow[] | null;
  /** When false and GSC CSV is uploaded, only URLs in the CSV that match inventory are analyzed. */
  analyzeFullInventory?: boolean;
  /** Live GSC API import (sitewide metrics + traffic filter). */
  gscImportMode?: boolean;
  forceLiveInventory?: boolean;
};

export type SitemapOptimizerRunDeps = {
  setPhase: Dispatch<SetStateAction<SitemapOptimizerProgress["phase"]>>;
  setProgress: Dispatch<SetStateAction<SitemapOptimizerProgress>>;
  setResult: Dispatch<SetStateAction<SitemapOptimizerRunResult | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  abortRef: { current: AbortController | null };
};

export type SitemapOptimizerRunOutcome =
  | { ok: true; result: SitemapOptimizerRunResult; error?: string }
  | { ok: false; error: string; result?: SitemapOptimizerRunResult };

export type PreparedSitemapOptimizerRun = {
  site: WordPressSite | null;
  apiKey: string;
  signal: AbortSignal;
  blogDestination: BlogDestinationPolicy;
  entityOnly: boolean;
  gscRows: SitemapOptimizerPostRow[];
  missCount: number;
  entityProfile: EntityCompressionProfile;
  entityRows: SitemapOptimizerPostRow[];
  pipelineRows: SitemapOptimizerPostRow[];
  companyRows: SitemapOptimizerPostRow[];
  companyClusterResult: ReturnType<typeof buildCompanyKeepClusters>;
  hasEditorialPipeline: boolean;
  hasEntityPipeline: boolean;
  gscAnalyzeProgress: {
    inventoryCount: number;
    gscAnalyzedPostCount: number;
    entityPrimary: boolean;
    gscTrafficFilter?: SitemapOptimizerTrafficFilter;
  };
  useRedirectFamilies: boolean;
  pipelineClusters: SitemapOptimizerRunResult["clusters"];
  merges: SitemapOptimizerRunResult["merges"];
  contentSheet: SitemapOptimizerRunResult["contentSheet"];
  analyzedAt: string;
  dateRange: SitemapOptimizerGscDateRange;
  gscPagesUpload?: GscParsedPageRow[] | null;
  redirectGridUpload: GscParsedPageRow[] | null;
};

export type SitemapOptimizerRunPrepareResult =
  | { outcome: SitemapOptimizerRunOutcome }
  | { prepared: PreparedSitemapOptimizerRun };

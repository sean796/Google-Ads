import type { BulkProgressSlice, MetaBulkActionKey } from "@/components/overview/overview-tab-constants";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { ContentOptimizerBulkGeneratorBindingsInput } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";

export type OverviewBulkDetailsBindingsInput = ContentOptimizerBulkGeneratorBindingsInput & {
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  siteKwHostedLink?: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading?: boolean;
  sitemapSource?: OverviewSitemapSource;
  bulkActionProgress?: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>;
  bulkScopeUrlKeys?: Set<string>;
};

export type MultiSiteBulkDetailsInput = {
  siteId: string;
  batchKey: string;
  bulkState: BulkOptimizationState;
  batchProgress?: OptimizationProgressState;
  siteProgress?: OptimizationProgressState;
  overviewRows: OverviewRow[];
  isOptimizingContent: Record<string, boolean>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  siteName?: string;
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  siteKwHostedLink?: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading?: boolean;
};


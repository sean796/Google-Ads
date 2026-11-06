import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type {
  GSCQuery,
  GSCQueryClusterAnalysis,
} from "@/lib/gsc-query-clustering";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "./use-optimization-state";
import type { ImageType } from "@/lib/image-section-analyzer";

export type GscQueriesSetter = Dispatch<
  SetStateAction<Record<string, GSCQuery[]>>
>;
export type BooleanMapSetter = Dispatch<SetStateAction<Record<string, boolean>>>;
export type ClusterAnalysisSetter = Dispatch<
  SetStateAction<Record<string, GSCQueryClusterAnalysis>>
>;

export type PrefilledOverviewTarget = {
  postId: number;
  postType?: string;
  postTypeEndpoint?: string;
  keyword?: string;
  content?: string;
  /** Overview grid seo_research snapshot. Not a live SERP skip. */
  seoResearch?: string;
};

export interface HandleOptimizeMultipleContentParams {
  site: WordPressSite;
  urls: string[];
  wordPressPosts?: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
  }>;
  updateMode: "update" | "draft";
  setGscQueriesForSelection: GscQueriesSetter;
  setIsKeywordSelectionOpen: BooleanMapSetter;
  setGscClusterAnalysis: ClusterAnalysisSetter;
  setIsAnalyzingClusters: BooleanMapSetter;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    featuredImageType?: "ai-generated" | "google-maps";
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
    hasEntity?: boolean;
    stagingSite?: boolean;
    useAcfKeyword?: boolean;
    bulkFaqMinimum4?: boolean;
    contentOnlyUpload?: boolean;
    seoExtraTextFieldOnly?: boolean;
    /** Overview sitemap bucket that loaded inventory (posts | pages | sap). */
    inventorySitemapSource?: "posts" | "pages" | "sap";
    /** Multi-site Both: download entity sitemap CSV in batch prep without SAP optimization mode. */
    prepEntitySitemap?: boolean;
  };
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
  setIsOptimizingContent: BooleanMapSetter;
  setOptimizationProgress: Dispatch<
    SetStateAction<Record<string, OptimizationProgressState>>
  >;
  setBulkOptimizationState: Dispatch<
    SetStateAction<Record<string, BulkOptimizationState>>
  >;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  setOptimizationFileManagers?: Dispatch<
    SetStateAction<Record<string, OptimizationFileManager>>
  >;
  continueOptimizationRef: React.MutableRefObject<
    | ((
        siteId: string,
        selectedKeyword: GSCQuery,
        clusterKeywords?: string[],
        setIsKeywordSelectionOpen?: BooleanMapSetter,
        testMode?: boolean
      ) => Promise<void>)
    | null
  >;
  muteToasts?: boolean;
  /** Overview / grid: focus keywords already known; skip redundant ACF grep when inventory matches. */
  prefilledUrlKeywords?: Record<string, string>;
  /** Overview grid: post IDs and types already hydrated; skip bind-style prep when complete. */
  prefilledOverviewTargets?: Record<string, PrefilledOverviewTarget>;
  /** Agent runs: skip URLs already optimized and uploaded before refresh. */
  resumeCompletedUrls?: string[];
  /** Agent runs: inventory snapshot loaded during task URL resolution. */
  prefetchedBulkInventorySnapshot?: import("@/lib/wordpress-api/inventory-match").BulkOptimizerInventorySnapshot;
  /** Agent runs: skip live prep refetch; require warm site cache + prefetched snapshot. */
  useSiteWarmCacheOnly?: boolean;
  /** Agent runs: called after each URL completes optimization + WordPress upload. */
  onBulkUrlComplete?: (info: {
    url: string;
    index: number;
    total: number;
    uploaded: boolean;
  }) => void | Promise<void>;
  /** Agent runs: isolated bulk state key (defaults to `${site.id}-batch`). */
  batchKey?: string;
}

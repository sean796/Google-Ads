import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { GSCQuery } from "@/lib/gsc-query-clustering";
import type { GscPerformancePreviewByUrl } from "./gsc-preview-types";
import type {
  BooleanMapSetter,
  ClusterAnalysisSetter,
  GscQueriesSetter,
} from "./bulk-optimization-params";
import type {
  OptimizationProgressState,
  PendingOptimization,
} from "./use-optimization-state";
import type { ImageType } from "@/lib/image-section-analyzer";

/** Derive a keyword hint from SEM task suggestedAction (e.g. "Optimize for 'zebra shades'" -> "zebra shades"). */
export function deriveKeywordHintFromSuggestedAction(suggestedAction: string): string | undefined {
  const t = suggestedAction.trim();
  if (!t) return undefined;
  const quoted = t.match(/for\s+['"]([^'"]+)['"]/i) || t.match(/['"]([^'"]+)['"]/);
  if (quoted?.[1]) return quoted[1].trim().substring(0, 80);
  if (t.length <= 80 && !/^fix\s+(title|meta|link)/i.test(t)) return t;
  return undefined;
}

export interface HandleOptimizeContentParams {
  site: WordPressSite;
  url: string;
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
  skipOnNoGSC: boolean;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    featuredImageType?: "ai-generated" | "google-maps";
    autoOptimize?: boolean;
    testMode?: boolean;
    hasEntity?: boolean;
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
    stagingSite?: boolean;
    useAcfKeyword?: boolean;
    manualKeyword?: string;
  };
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
  /** Sheet / inventory row: id required. Optional body skips WP fetch + URL resolve. */
  resolvedPost?: {
    id: number;
    subtype: string;
    link?: string;
    slug?: string;
    endpoint?: string;
    title?: string;
    content?: string;
    excerpt?: string;
    /** Sheet focus keyword (CSV / grid). Skips ACF keyword_focus WordPress read. */
    focusKeyword?: string;
    /** Overview grid SERP brief when WordPress ACF seo_research is empty. */
    seoResearch?: string;
  };
  testMode: boolean;
  semTaskContext?: {
    suggestedAction: string;
    checklist?: string[];
    promptModifier?: string;
    focusCategories?: string[];
  };
  setIsOptimizingContent: BooleanMapSetter;
  setOptimizationProgress: Dispatch<
    SetStateAction<Record<string, OptimizationProgressState>>
  >;
  setOptimizationFileManagers: Dispatch<
    SetStateAction<Record<string, OptimizationFileManager>>
  >;
  setPendingOptimization: Dispatch<
    SetStateAction<Record<string, PendingOptimization>>
  >;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  continueOptimizationRef: React.MutableRefObject<
    | ((
        siteId: string,
        selectedKeyword: GSCQuery,
        clusterKeywords?: string[],
        setIsKeywordSelectionOpen?: BooleanMapSetter,
        testMode?: boolean,
        secondaryKeywords?: string[],
        pendingOverride?: PendingOptimization
      ) => Promise<void>)
    | null
  >;
  setGscPerformancePreview?: React.Dispatch<React.SetStateAction<Record<string, GscPerformancePreviewByUrl>>>;
}

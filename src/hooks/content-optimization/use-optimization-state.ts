import { useState } from "react";
import { OptimizationFileManager, type OptimizationFile } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import type { LinkCheckResult } from "@/lib/wordpress-api/validate-internal-links";
import type { SemrushClusterScatterPlan } from "@/lib/semrush-cluster-scatter";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { MetaPipelineStepUi } from "@/components/overview/overview-tab-constants";
import type {
  BulkProgressMeta,
  ContentOptimizerStepId,
} from "@/lib/content-optimization/content-optimizer-run-progress";
import type { ExtraTextInventoryLinkRow } from "@/lib/content-generation/extra-text-inventory-links";
import type { ImageType } from "@/lib/image-section-analyzer";

/** One line in the live micro-step list during content optimization. */
export interface OptimizationMicroLogEntry {
  stepId: ContentOptimizerStepId;
  message?: string;
}

export interface OptimizationProgressState {
  stepId: ContentOptimizerStepId;
  subProgress: number;
  /** Human label derived from stepId. */
  step: string;
  /** Monotonic 0–100 computed from stepId + subProgress. */
  progress: number;
  message?: string;
  error?: string;
  linkCheckResults?: LinkCheckResult[];
  microLog?: OptimizationMicroLogEntry[];
  /** Parallel blueprint-section harness (same model as bulk SAP/post harness). */
  harnessSections?: HarnessSectionListItem[];
  harnessPlannedSectionCount?: number | null;
  filesRevision?: number;
  generatedFileNames?: string[];
  /** @deprecated Prefer fileManager + filesRevision; kept for legacy progress payloads */
  generatedFiles?: OptimizationFile[];
  /** Overview Details header label after pendingOptimization is cleared. */
  pageUrl?: string;
  /** Batch-level counters carried on the `${siteId}-batch` progress entry. */
  bulkMeta?: BulkProgressMeta;
}

/** Loose GSC result bag consumed by validateGSCData (fields narrowed at read). */
export interface GscResultLike {
  error?: unknown;
  success?: unknown;
  topKeyword?: { query?: unknown } | null;
  queries?: Array<{ query?: unknown }> | null;
}

/** WordPress post object as carried through the optimize pipeline (REST or snapshot shape). */
export interface WpExistingPostLike {
  id?: number | string;
  title?: unknown;
  content?: unknown;
  excerpt?: unknown;
  slug?: string;
  link?: string;
  status?: string;
  postType?: string;
  post_type?: string;
  postTypeEndpoint?: string;
  postTypeSubtype?: string;
  acf?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Resolved inventory target for the page being optimized. */
export interface ResolvedTargetLike {
  id?: number | string;
  subtype?: string;
  endpoint?: string;
  slug?: string;
  link?: string;
  [key: string]: unknown;
}

export interface PendingOptimization {
  site: WordPressSite;
  url: string;
  /** FIRST step: AI-derived page intent from URL. Overrides prompt_modifier (which is general instructions only). */
  urlDerivedIntent?: string | null;
  updateMode: 'update' | 'draft';
  gscResult: GscResultLike;
  existingPost: WpExistingPostLike;
  resolved: ResolvedTargetLike;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string; postType?: "post" | "page" }>;
  wordPressPagesForOfferTable?: ExtraTextInventoryLinkRow[];
  linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
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
    useAcfKeyword?: boolean;
    inventorySitemapSource?: "posts" | "pages" | "sap";
    seoExtraTextFieldOnly?: boolean;
  };
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
  cleanedTitle?: string; // Cleaned title (without placeholders/locations when entity is N/A)
  extractedEntity?: string | 'N/A'; // Extracted entity or 'N/A' if no entity
  acfFields?: Record<string, unknown>; // Raw ACF for write path
  acfContext?: AIDrivenACFContext; // AI-driven semantic ACF context for prompt/read (no static key names)
  /** Full REST post object from prefetch `getACFFieldsForPost` — skips repeat fetch during upload when post id matches. */
  acfFullPostSnapshot?: Record<string, unknown>;
  focusCategories?: string[]; // Focus categories for selective optimization (SEM task list)
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }; // Full SEM task context
  /** bulk content run: cluster + zone scatter plan from Semrush keywords (feeds content prompt). */
  semrushClusterScatter?: SemrushClusterScatterPlan;
  /** bulk content run: compact Semrush keyword lists JSON string for content RAG (url_organic + phrase_related). */
  semrushKeywordsRag?: string;
  /** Server-filtered external URLs for Semrush - checklist/blueprint must use these hrefs exactly. */
  semrushExternalUrls?: string[];
  /** Deduped Semrush keyword phrases for exact external anchor text (mirrors JSON keyword lists). */
  semrushAnchorPhrases?: string[];
  optimizationChanges?: {
    titleChanged?: boolean;
    metaChanged?: boolean;
    contentChanged?: boolean;
    title?: string;
    meta?: string;
    postUpdated?: boolean;
    promptSent?: { system: string; user: string };
  }; // Track what was actually changed (postUpdated + promptSent from SEO_techspec)
}

export interface BulkOptimizationState {
  urls: string[];
  currentIndex: number;
  urlStatuses: Record<string, 'pending' | 'optimizing' | 'completed' | 'skipped' | 'error'>;
  currentStep: string;
  currentUrl?: string;
  currentProgress?: number; // Current post's progress percentage (0-100)
  currentStepProgress?: OptimizationProgressState; // Detailed step tracking + link check proof
  /** Link check results per URL so completed target summary can show proof (persists after step) */
  urlLinkCheckResults?: Record<string, LinkCheckResult[]>;
  urlKeywords?: Record<string, string>; // Map URL to primary keyword used for optimization
  /** Per URL: merged SERP JSON brief is in the prefetch cache (ACF had seo_research or bulk filled it). */
  urlSerpResearchReady?: Record<string, boolean>;
  urlEntities?: Record<string, string | 'N/A'>; // Map URL to entity (or 'N/A' if no entity)
  /** Generated files per URL (checklist, blueprint, content, meta, wordpress.json, etc.) for bulk downloads */
  urlGeneratedFiles?: Record<string, Array<{ name: string; content: string; mimeType: string }>>;
  /**
   * Local Image: city peer plan + combined CSV once per batch (not per keyword).
   * Shown as download links at the top of Details.
   */
  batchPeerLibraryFiles?: Array<{ name: string; content: string; mimeType: string }>;
  /** Local Image / In Content Image: found (peer) | generated | skipped per URL. */
  urlLocalImageOutcomes?: Record<string, "found" | "generated" | "skipped" | "error">;
  /** @deprecated Prefer batchPeerLibraryFiles; kept for older in-flight state. */
  urlPeerLocalSites?: Record<string, Array<{ name: string; siteUrl: string }>>;
  /** Skip / error reasons shown in Details for skipped/failed URLs. */
  urlSkipReasons?: Record<string, string>;
  /** AI All Meta: persisted harness section list per URL after row completes. */
  urlHarnessSections?: Record<string, HarnessSectionListItem[]>;
  /** Content prep steps 0–1 (inventory, SERP) shared across the batch. */
  /** Set by the UI cancel action; polled by bulk loops through the state setter. */
  cancelRequested?: boolean;
  batchPrepHarnessSections?: HarnessSectionListItem[];
  /** WordPress upload: batch-level CSV harness (not per-URL rows). */
  wpUploadBatchHarnessSections?: HarnessSectionListItem[];
  /** Terminal-style batch rows for Details (WP batch 1/20, etc.). */
  batchPipelineSteps?: MetaPipelineStepUi[];
  /** Bulk keyword approval gate for DFS/PAA expansion. */
  keywordApprovalStatus?: 'pending' | 'approved';
  /** Index of the next target currently in research warmup (preliminary DFS). */
  warmingUpIndex?: number | null;
  /** Second index in research buffer (two posts ahead). */
  warmingUpIndex2?: number | null;
  /** URLs that have completed the research phase and are ready for optimization. */
  researchedUrls?: string[];
  /** Overview AI All Meta harness bulk (no WordPress upload). */
  runKind?: "content" | "extraText" | "aiAllMeta" | "aiTitle" | "aiMeta" | "aiUrl" | "contentKw" | "entityKw" | "aiFaq" | "aiHeaders" | "aiLinks" | "aiWikipediaLink" | "aiAnswer" | "aiOverview" | "aiScenario" | "aiInContentImage" | "aiFeaturedImage" | "contentCleanup" | "research" | "wpUpload";
  /** Timestamp when this harness batch started (auto-open Details drawer). */
  harnessStartedAt?: number;
  /** Content Optimizer: page size when bulk run is paginated (>100 URLs). */
  bulkPageSize?: number;
  /** 1-based page index during paginated bulk processing. */
  currentBulkPage?: number;
  totalBulkPages?: number;
}

export interface RunHistoryEntry {
  ts: number;
  batchIndex?: number;
  batchLabel?: string;
  entityOrTitle?: string;
  site?: string;
  step: string;
  message: string;
  outcome?: 'ok' | 'skip' | 'fail';
  postId?: number;
  permalink?: string;
  acfUpdated?: string[];
  error?: string;
  mode?: 'entity' | 'post';
}

/**
 * Hook for managing optimization state
 * Extracted from use-content-optimization.ts for better organization
 */
export function useOptimizationState() {
  const [isOptimizingContent, setIsOptimizingContent] = useState<Record<string, boolean>>({});
  const [optimizationProgress, setOptimizationProgress] = useState<Record<string, OptimizationProgressState>>({});
  const [optimizationFileManagers, setOptimizationFileManagers] = useState<Record<string, OptimizationFileManager>>({});
  const [pendingOptimization, setPendingOptimization] = useState<Record<string, PendingOptimization>>({});
  const [bulkOptimizationState, setBulkOptimizationState] = useState<Record<string, BulkOptimizationState>>({});

  return {
    isOptimizingContent,
    setIsOptimizingContent,
    optimizationProgress,
    setOptimizationProgress,
    optimizationFileManagers,
    setOptimizationFileManagers,
    pendingOptimization,
    setPendingOptimization,
    bulkOptimizationState,
    setBulkOptimizationState,
  };
}
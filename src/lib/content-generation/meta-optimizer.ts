/**
 * Meta Optimizer - persists SEO AI output to ACF only (see apply-meta-optimizer-to-fields.ts).
 */

import {
  applyMetaOptimizerToACF,
  type ApplyMetaOptimizerToAcfOptions,
  type ApplyMetaOptimizerToAcfResult,
} from "@/lib/content-generation/apply-meta-optimizer-to-fields";
import type { WordPressSite } from "@/components/integrations/types";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WpExistingPostLike } from "@/hooks/content-optimization/use-optimization-state";

export interface MetaOptimizerOptions {
  postId: number;
  markdownContent: string;
  finalTitle: string;
  metaDescription: string | undefined;
  primaryKeyword: string;
  site: WordPressSite;
  postLink: string;
  existingPost?: WpExistingPostLike;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  shouldOptimizeMeta: boolean;
  gscKeywordsContext?: string;
  /** Merged seo_research JSON - same as apply-meta-optimizer-to-fields priorSeoResearchJson. */
  priorSeoResearchJson?: string;
}

export interface MetaOptimizerResult {
  success: boolean;
}

export async function optimizeMetaFields(options: MetaOptimizerOptions): Promise<MetaOptimizerResult> {
  const payload: ApplyMetaOptimizerToAcfOptions = {
    ...options,
    shouldApply: options.shouldOptimizeMeta,
  };
  return applyMetaOptimizerToACF(payload);
}

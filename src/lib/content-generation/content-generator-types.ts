import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { ImageType } from "@/lib/image-section-analyzer";
import type { WordPressSite } from "@/components/integrations/types";
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { AgentConfig } from "@/types/agent-config";
import type { FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";

export interface ContentGeneratorOptions {
  blueprintResult: {
    title?: string;
    purpose?: string;
    agents: AgentConfig[];
    entity?: string;
    h2Outline?: string[];
    blueprintVersion?: number;
    flowFreeform?: { sections: FlowFreeformSectionPlan[] };
  };
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  context: {
    wordPressRAGContext?: string;
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    url: string;
    existingContent: string;
    inContentImageRequest?: { imageType: ImageType; userPrompt?: string };
    acfFields?: Record<string, unknown>;
    acfContext?: AIDrivenACFContext; // When present, use for prompt (no reader call)
    isPage?: boolean;
    /** Real Search Console queries JSON - model picks 10–20 and spreads across sections */
    gscKeywordsContext?: string;
    /** Semrush keyword lists JSON (url_organic + phrase_related) for RAG. */
    semrushKeywordsContext?: string;
    /** Semrush clusters + scatter zones JSON (bulk content run). */
    semrushScatterContext?: string;
    /** Semrush-approved external URLs - prompts + upload sanitizer allowlist. */
    semrushExternalUrls?: string[];
    /** Other managed client domains - never link in prose (mirrors Semrush server filter). */
    portfolioBlockedHosts?: string[];
    /** LLM audit facts for harness (optimizer). */
    llmAuditSummary?: string;
    firstPartyAuthorityBlock?: string;
    llmAuditAuthorityExternalPairs?: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[];
    linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  };
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string; generatedFiles?: ReturnType<OptimizationFileManager["getFiles"]> }) => void;
  onContentChunk?: (chunk: string) => void;
  shouldOptimizeContent: boolean;
  hasEntityOverride?: boolean; // Manual override: true = force entity mode, false = force no entity, undefined = auto-detect
  /** When true, skip parallel meta generation (content-only / optimize-meta off). */
  skipMetaDescriptionGeneration?: boolean;
  /** Harness section lifecycle (same payload shape as bulk SAP/post gen). */
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
}

export interface ContentGeneratorResult {
  markdownContent: string;
  htmlContent: string;
  excerpt: string;
  /** Original image/video URLs from the post (upload sanitizer allowlist only). */
  preservedMediaUrls?: string[];
}

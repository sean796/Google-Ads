import type { OpenRouterModelCatalogEntry } from "@/lib/openrouter-app-api";
import { catalogEntryById } from "@/lib/openrouter-models-catalog";
import { estimateImageOutputCostUsd } from "@/lib/image-model-defaults";
import { estimateVideoCostUsd } from "@/lib/video-generator/video-model-defaults";

export type PipelineAgentKind = "research" | "blog" | "image" | "meta" | "report" | "ads" | "video" | "decision";

/** Reference video workload for the Video agent estimate. */
export const VIDEO_REFERENCE_SECONDS = 30;
const VIDEO_REFERENCE_RESOLUTION = "480p" as const;

/** Competitor/overview-style research pass (context + multi-step report write). */
export const RESEARCH_REFERENCE_INPUT_TOKENS = 120_000;
export const RESEARCH_REFERENCE_OUTPUT_TOKENS = 32_000;

/** One bulk blog row harness (default row output budget from bulk-content-generator). */
export const BLOG_REFERENCE_INPUT_TOKENS = 35_000;
export const BLOG_DEFAULT_OUTPUT_TOKENS = 16_000;

/** Decision tree check batch (Liquid d1.1 question evaluations). */
export const DECISION_REFERENCE_INPUT_TOKENS = 8_000;
export const DECISION_REFERENCE_OUTPUT_TOKENS = 500;

const IMAGE_REFERENCE_ASPECT = "16:9" as const;

export function formatResearchTokenWorkloadHint(): string {
  return `Typical run: ~${Math.round(RESEARCH_REFERENCE_INPUT_TOKENS / 1000)}k input · ~${Math.round(RESEARCH_REFERENCE_OUTPUT_TOKENS / 1000)}k output tokens`;
}

/** Typical bulk harness row; output reference is 16k (Max tokens caps each completion separately). */
export function formatBlogTokenWorkloadHint(): string {
  return `Typical row: ~${Math.round(BLOG_REFERENCE_INPUT_TOKENS / 1000)}k input · ~${Math.round(BLOG_DEFAULT_OUTPUT_TOKENS / 1000)}k output tokens`;
}

export function formatDecisionTokenWorkloadHint(): string {
  return `Typical check batch: ~${Math.round(DECISION_REFERENCE_INPUT_TOKENS / 1000)}k input · ~${DECISION_REFERENCE_OUTPUT_TOKENS} output tokens`;
}

export function estimateTextLlmCostUsd(
  entry: Pick<OpenRouterModelCatalogEntry, "promptUsdPerToken" | "completionUsdPerToken"> | undefined,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!entry) return null;
  const pin = entry.promptUsdPerToken;
  const pout = entry.completionUsdPerToken;
  if (pin == null && pout == null) return null;
  let usd = 0;
  if (pin != null) usd += inputTokens * pin;
  if (pout != null) usd += outputTokens * pout;
  return usd;
}

export function formatEstimateUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

export function estimateAgentRunCostUsd(args: {
  agent: PipelineAgentKind;
  modelId: string;
  catalog?: OpenRouterModelCatalogEntry[] | null;
  blogOutputTokens?: number;
}): { usd: number | null; label: string } {
  const { agent, modelId, catalog, blogOutputTokens } = args;

  if (agent === "image") {
    const usd = estimateImageOutputCostUsd(modelId, IMAGE_REFERENCE_ASPECT);
    return {
      usd,
      label: `Est. ~${formatEstimateUsd(usd)} per typical 16:9 featured image (image output tier)`,
    };
  }

  if (agent === "video") {
    const usd = estimateVideoCostUsd(modelId, VIDEO_REFERENCE_RESOLUTION, VIDEO_REFERENCE_SECONDS);
    if (usd == null) {
      return {
        usd: null,
        label: "Pricing unavailable for this model (OpenRouter video SKUs)",
      };
    }
    return {
      usd,
      label: `Est. ~${formatEstimateUsd(usd)} per ${VIDEO_REFERENCE_SECONDS} s video at ${VIDEO_REFERENCE_RESOLUTION}`,
    };
  }

  const entry = catalogEntryById(catalog ?? null, modelId);
  if (agent === "research" || agent === "report" || agent === "ads") {
    const usd = estimateTextLlmCostUsd(
      entry,
      RESEARCH_REFERENCE_INPUT_TOKENS,
      RESEARCH_REFERENCE_OUTPUT_TOKENS,
    );
    if (usd == null) {
      return {
        usd: null,
        label: "Pricing unavailable for this model (OpenRouter catalog)",
      };
    }
    return {
      usd,
      label: `Est. ~${formatEstimateUsd(usd)} per typical research run (${Math.round(RESEARCH_REFERENCE_INPUT_TOKENS / 1000)}k in, ${Math.round(RESEARCH_REFERENCE_OUTPUT_TOKENS / 1000)}k out)`,
    };
  }

  if (agent === "meta") {
    const usd = estimateTextLlmCostUsd(entry, 8_000, 2_000);
    if (usd == null) {
      return {
        usd: null,
        label: "Pricing unavailable for this model (OpenRouter catalog)",
      };
    }
    return {
      usd,
      label: `Est. ~${formatEstimateUsd(usd)} per typical meta or FAQ batch (~8k in, ~2k out)`,
    };
  }

  if (agent === "decision") {
    const usd = estimateTextLlmCostUsd(
      entry,
      DECISION_REFERENCE_INPUT_TOKENS,
      DECISION_REFERENCE_OUTPUT_TOKENS,
    );
    if (usd == null) {
      return {
        usd: null,
        label: "Pricing unavailable for this model (OpenRouter catalog)",
      };
    }
    return {
      usd,
      label: `Est. ~${formatEstimateUsd(usd)} per decision tree QA batch (~8k in, ~500 out)`,
    };
  }

  const outTokens = blogOutputTokens ?? BLOG_DEFAULT_OUTPUT_TOKENS;
  const usd = estimateTextLlmCostUsd(entry, BLOG_REFERENCE_INPUT_TOKENS, outTokens);
  if (usd == null) {
    return {
      usd: null,
      label: "Pricing unavailable for this model (OpenRouter catalog)",
    };
  }
  return {
    usd,
    label: `Est. ~${formatEstimateUsd(usd)} per typical blog harness row (${Math.round(BLOG_REFERENCE_INPUT_TOKENS / 1000)}k in, ${Math.round(outTokens / 1000)}k out)`,
  };
}

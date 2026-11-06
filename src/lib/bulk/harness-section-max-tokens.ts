import type { AgentConfig } from "@/types/agent-config";
import { BLOG_HARNESS_SUMMARY_AGENT_ID } from "@/lib/bulk/blog-harness-summary-agent";
import { BLOG_HARNESS_ANSWER_AGENT_ID } from "@/lib/bulk/blog-harness-answer-agent";

const TOKEN_SANITY_MIN = 256;
const BASE_NEED_PER_WEIGHT_UNIT = 480;

export type HarnessSectionTokenInput = {
  sectionKey: string;
  agent: AgentConfig;
  isOverview: boolean;
  isAnswer?: boolean;
  isSeoOpener?: boolean;
  importedExcerptChars?: number;
  bodySectionCount?: number;
};

export type HarnessSectionTokenSlot = {
  sectionKey: string;
  maxTokens: number;
  weight: number;
  estimatedNeed: number;
};

function computeSectionWeight(input: HarnessSectionTokenInput): number {
  if (input.isAnswer) return 0.15;
  if (input.isOverview) {
    const n = input.bodySectionCount ?? 0;
    return 0.85 + 0.08 * n;
  }

  let weight = 1;
  const feat = input.agent.features.join(" ").toLowerCase();
  if (feat.includes("[table]")) weight += 0.6;
  if (feat.includes("[list]")) weight += 0.35;
  if (input.agent.h3Enabled) weight += 0.25;
  if ((input.importedExcerptChars ?? 0) > 0) weight += 0.2;
  if (input.isSeoOpener) weight += 0.15;
  return weight;
}

function estimatedNeedForWeight(weight: number, importedExcerptChars: number): number {
  let need = BASE_NEED_PER_WEIGHT_UNIT * weight;
  if (importedExcerptChars > 800) need += 320;
  else if (importedExcerptChars > 400) need += 200;
  else if (importedExcerptChars > 0) need += 120;
  return Math.ceil(need);
}

/** Weighted split of row output budget across harness sections (no fixed per-section caps). */
export function computeHarnessSectionTokenBudgets(
  sections: HarnessSectionTokenInput[],
  totalBudget: number,
): HarnessSectionTokenSlot[] {
  if (!sections.length) return [];
  if (totalBudget < TOKEN_SANITY_MIN * sections.length) {
    throw new Error(
      `Increase max tokens for this row (need at least ${TOKEN_SANITY_MIN * sections.length}, have ${totalBudget} for ${sections.length} sections)`,
    );
  }

  const weighted = sections.map((section) => {
    const weight = computeSectionWeight(section);
    return {
      sectionKey: section.sectionKey,
      weight,
      estimatedNeed: estimatedNeedForWeight(weight, section.importedExcerptChars ?? 0),
      maxTokens: TOKEN_SANITY_MIN,
    };
  });
  const sumWeights = weighted.reduce((sum, slot) => sum + slot.weight, 0);
  for (const slot of weighted) {
    slot.maxTokens = Math.max(TOKEN_SANITY_MIN, Math.floor((totalBudget * slot.weight) / sumWeights));
  }

  const allocated = weighted.reduce((sum, slot) => sum + slot.maxTokens, 0);
  let remainder = totalBudget - allocated;
  const byWeight = [...weighted].sort((a, b) => b.weight - a.weight);
  let idx = 0;
  while (remainder > 0 && byWeight.length) {
    const key = byWeight[idx % byWeight.length]!.sectionKey;
    const slot = weighted.find((s) => s.sectionKey === key);
    if (slot) slot.maxTokens += 1;
    remainder -= 1;
    idx += 1;
  }

  return weighted;
}

export function assertHarnessTokenBudgetPreflight(
  slots: HarnessSectionTokenSlot[],
  totalBudget: number,
  sectionCount: number,
): void {
  const totalNeed = slots.reduce((sum, slot) => sum + slot.estimatedNeed, 0);
  const underfunded = slots.filter((slot) => slot.maxTokens < slot.estimatedNeed);
  if (underfunded.length > 0 || totalBudget < totalNeed) {
    throw new Error(
      `Increase max tokens for this row (need ~${totalNeed}, have ${totalBudget} for ${sectionCount} sections)`,
    );
  }
}

export function isHarnessSeoOpenerBodyAgent(agent: AgentConfig): boolean {
  return (
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID &&
    agent.step === 1
  );
}

export type HarnessSectionTokenUsage = {
  sectionKey: string;
  /** Preflight estimate for this section (slot estimatedNeed). */
  estimatedTokens: number;
  /** Measured estimate from the real prompt text sent (chars / 4). */
  promptTokens: number;
  /** Measured estimate from the real completion text received (chars / 4). */
  completionTokens: number;
  actualTokens: number;
  cumulativeCompletionTokens: number;
  cumulativeActualTokens: number;
  totalBudget: number;
};

export type HarnessTokenBudgetSummary = {
  totalBudget: number;
  estimatedTokens: number;
  promptTokens: number;
  completionTokens: number;
  actualTokens: number;
  records: HarnessSectionTokenUsage[];
};

/** Deterministic token estimate for budget accounting (about 4 chars per token). */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Per-run budget ledger. Records estimated vs actual tokens per section and
 * stops the run with a visible error when measured completion tokens pass the
 * row budget. Estimates are labeled estimates; nothing is silently truncated.
 */
export function createHarnessTokenBudgetTracker(args: {
  totalBudget: number;
  slots: HarnessSectionTokenSlot[];
  onUsage?: (usage: HarnessSectionTokenUsage) => void;
}): {
  record: (sectionKey: string, promptText: string, completionText: string) => HarnessSectionTokenUsage;
  summary: () => HarnessTokenBudgetSummary;
} {
  const estimatedByKey = new Map(args.slots.map((s) => [s.sectionKey, s.estimatedNeed]));
  const records: HarnessSectionTokenUsage[] = [];
  let cumulativeCompletion = 0;
  let cumulativePrompt = 0;

  return {
    record(sectionKey, promptText, completionText) {
      const promptTokens = estimateTokensFromText(promptText);
      const completionTokens = estimateTokensFromText(completionText);
      cumulativePrompt += promptTokens;
      cumulativeCompletion += completionTokens;
      const usage: HarnessSectionTokenUsage = {
        sectionKey,
        estimatedTokens: estimatedByKey.get(sectionKey) ?? 0,
        promptTokens,
        completionTokens,
        actualTokens: promptTokens + completionTokens,
        cumulativeCompletionTokens: cumulativeCompletion,
        cumulativeActualTokens: cumulativePrompt + cumulativeCompletion,
        totalBudget: args.totalBudget,
      };
      records.push(usage);
      args.onUsage?.(usage);
      if (cumulativeCompletion > args.totalBudget) {
        const estimatedTotal = args.slots.reduce((sum, s) => sum + s.estimatedNeed, 0);
        throw new Error(
          `Harness token budget exceeded for this row: measured ~${cumulativeCompletion} completion tokens after section "${sectionKey}" against a budget of ${args.totalBudget} (preflight estimate ~${estimatedTotal}). Run stopped; increase max tokens for this row.`,
        );
      }
      return usage;
    },
    summary() {
      return {
        totalBudget: args.totalBudget,
        estimatedTokens: args.slots.reduce((sum, s) => sum + s.estimatedNeed, 0),
        promptTokens: cumulativePrompt,
        completionTokens: cumulativeCompletion,
        actualTokens: cumulativePrompt + cumulativeCompletion,
        records: [...records],
      };
    },
  };
}

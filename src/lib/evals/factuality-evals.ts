import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import type { OpenRouterAppResponseFormat } from "@/lib/openrouter-app-api";
import { getDecisionModel } from "@/lib/optimization-settings-storage";
import { parseModelJson } from "@/lib/model-json";

/**
 * Post-writing factuality check (Wave 4). A decision-model judge extracts
 * every factual assertion from a finished article and grades each one
 * against the source pack the writers were given: supported (pack states
 * it), contradicted (pack states otherwise), or unsupported (not in the
 * pack at all). Grading after the verdict is deterministic code. This is
 * the retrospective half of factual checks; the pre-writing verification
 * pass in topic-research-fanout-verification.ts can only verify claims
 * someone planned to ask about, never facts invented while drafting.
 */

export const FactualityVerdictSchema = z.object({
  claim: z.string().min(1),
  verdict: z.enum(["supported", "contradicted", "unsupported"]),
  evidence: z.string().optional(),
  reason: z.string().min(1),
});

export const FactualityVerdictsSchema = z.object({
  claims: z.array(FactualityVerdictSchema),
});

export type FactualityClaimVerdict = z.infer<typeof FactualityVerdictSchema>;

export type FactualityIssue = { code: string; detail: string };

export type FactualityReport = {
  pass: boolean;
  claims: FactualityClaimVerdict[];
  supportedCount: number;
  contradictedCount: number;
  unsupportedCount: number;
  issues: FactualityIssue[];
};

/**
 * Wire format for the judge call. The verdict contract itself is the zod
 * schema below; the wire uses json_object (the keyword-intent precedent)
 * because the decision model route does not reliably honor strict
 * json_schema envelopes. The prompt states the exact shape in text.
 */
export const FACTUALITY_VERDICTS_RESPONSE_FORMAT: OpenRouterAppResponseFormat = { type: "json_object" };

export const FACTUALITY_JUDGE_SYSTEM_PROMPT = [
  "You are a strict factuality judge for finished marketing articles.",
  "Extract every factual assertion from the ARTICLE: numbers, dates, prices, service areas, credentials, awards, comparisons, and superlatives. Skip opinions, calls to action, and generic advice that asserts no checkable fact.",
  "Grade each assertion ONLY against the SOURCE PACK below. Your own world knowledge does not count as evidence.",
  "The ARTICLE is never evidence. An evidence quote is valid only if it appears word-for-word in the SOURCE PACK section. If you cannot find the quote in the SOURCE PACK, the verdict must be unsupported.",
  "- supported: the source pack states this claim. You MUST include an exact quote from the source pack in evidence.",
  "- contradicted: the source pack states something incompatible with this claim.",
  "- unsupported: the source pack does not contain this claim at all.",
  "Return ONLY valid JSON matching the verdict schema. One entry per factual assertion, claim text copied from the article.",
  'Output shape: {"claims": [{"claim": string, "verdict": "supported" | "contradicted" | "unsupported", "evidence": string, "reason": string}]}',
].join("\n");

const MAX_ARTICLE_CHARS = 24_000;
const MAX_SOURCE_CHARS = 24_000;

export function buildFactualityJudgeUserPrompt(articleText: string, sourceContext: string): string {
  const article = articleText.trim().slice(0, MAX_ARTICLE_CHARS);
  const source = sourceContext.trim().slice(0, MAX_SOURCE_CHARS);
  return `SOURCE PACK:\n${source}\n\nARTICLE:\n${article}`;
}

function normalizeForCitationCheck(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic grading over judge verdicts. Pass means zero contradicted,
 * zero unsupported, and every supported claim carrying pack evidence. When
 * the source pack is provided, a supported verdict only counts when its
 * evidence quote actually appears in the pack (the judge may not cite the
 * article itself as its own evidence).
 */
export function gradeFactualityVerdicts(
  verdicts: FactualityClaimVerdict[],
  sourceContext?: string,
): FactualityReport {
  const issues: FactualityIssue[] = [];
  const normalizedSource = sourceContext ? normalizeForCitationCheck(sourceContext) : null;
  let supportedCount = 0;
  let contradictedCount = 0;
  let unsupportedCount = 0;

  for (const v of verdicts) {
    if (v.verdict === "supported") {
      if (!v.evidence?.trim()) {
        issues.push({
          code: "supported-without-evidence",
          detail: `Claim graded supported without pack evidence: ${v.claim}`,
        });
      } else if (normalizedSource !== null && !normalizedSource.includes(normalizeForCitationCheck(v.evidence))) {
        issues.push({
          code: "evidence-not-in-pack",
          detail: `Claim graded supported with evidence that is not in the source pack: ${v.claim}`,
        });
      } else {
        supportedCount += 1;
      }
    } else if (v.verdict === "contradicted") {
      contradictedCount += 1;
      issues.push({ code: "contradicted-claim", detail: `${v.claim} (${v.reason})` });
    } else {
      unsupportedCount += 1;
      issues.push({ code: "unsupported-claim", detail: `${v.claim} (${v.reason})` });
    }
  }

  return {
    pass: issues.length === 0,
    claims: verdicts,
    supportedCount,
    contradictedCount,
    unsupportedCount,
    issues,
  };
}

/**
 * Run the decision-model judge over a finished article. Throws visibly on
 * empty inputs or on judge output that does not match the verdict schema.
 */
export async function runFactualityJudge(args: {
  articleText: string;
  sourceContext: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<FactualityReport> {
  const article = args.articleText.trim();
  if (!article) throw new Error("Factuality judge requires a non-empty article.");
  const source = args.sourceContext.trim();
  if (!source) throw new Error("Factuality judge requires a non-empty source pack.");

  const model = args.model ?? getDecisionModel();
  const { content } = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system: FACTUALITY_JUDGE_SYSTEM_PROMPT,
    user: buildFactualityJudgeUserPrompt(article, source),
    temperature: 0,
    maxTokens: 4000,
    responseFormat: FACTUALITY_VERDICTS_RESPONSE_FORMAT,
    signal: args.signal,
  });

  const parsed = parseModelJson(content, FactualityVerdictsSchema, "factuality verdicts");
  return gradeFactualityVerdicts(parsed.claims, source);
}

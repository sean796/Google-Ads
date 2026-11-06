import { logger } from "@/lib/logger";
import { postOpenRouterAppChat, type OpenRouterAppMessage } from '@/lib/openrouter-app-api';
import { GEMINI_FLASH_LITE_MODEL } from "@/lib/global-agent-models";
import { getDecisionModel } from '@/lib/optimization-settings-storage';
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  QuestionResult,
  ClientPolicyOverlay,
} from './decision-tree-types';

export interface DecisionBatchEvaluationPayload {
  brief: DecisionJobBrief;
  draftText?: string;
  metaTitle?: string;
  metaDescription?: string;
  clientOverlay?: ClientPolicyOverlay;
  questions: DecisionQuestionDefinition[];
}

export interface DecisionBatchResponse {
  modelUsed: string;
  results: Record<string, QuestionResult>;
  rawOutput?: string;
}

/**
 * Builds the compact system instruction for the Decision Model (Liquid d1.1).
 * Instructs the model to act as a strict editorial checker and probability rater,
 * outputting ONLY valid JSON without conversational filler or article rewrites.
 */
function buildDecisionModelSystemPrompt(questions: DecisionQuestionDefinition[]): string {
  const schemaGuide = questions
    .map((q) => {
      if (q.kind === 'noul') {
        return `"${q.id}": { "kind": "noul", "yesProbability": number between 0.00 and 1.00, "reasoning": "brief note" }`;
      }
      if (q.kind === 'score') {
        return `"${q.id}": { "kind": "score", "score": number between 0 and ${q.maxScore ?? 3}, "maxScore": ${q.maxScore ?? 3}, "reasoning": "brief note" }`;
      }
      return `"${q.id}": { "kind": "choice", "selectedOption": "${(q.options ?? []).join('|')}", "confidence": number between 0.00 and 1.00, "reasoning": "brief note" }`;
    })
    .join(',\n  ');

  return `You are a high-speed editorial decision model (Checker & Quality Router).
You DO NOT write articles, generate prose, or critique style with long paragraphs.
Your SOLE job is to evaluate the provided content against the defined questions and output strict JSON with calibrated numeric probabilities, category selections, and rubric scores.

Respond ONLY with a valid JSON object adhering to this schema:
{
  ${schemaGuide}
}
Do NOT include markdown backticks around JSON. Return raw valid JSON only.`;
}

/**
 * Builds the state representation for the question batch.
 */
function buildDecisionEvaluationUserMessage(payload: DecisionBatchEvaluationPayload): string {
  const lines: string[] = [];

  lines.push(`=== BRIEF ===`);
  lines.push(`Topic / Title: ${payload.brief.topicTitle || 'N/A'}`);
  lines.push(`Primary Keyword: ${payload.brief.primaryKeyword || 'N/A'}`);
  if (payload.brief.searchIntent) lines.push(`Search Intent: ${payload.brief.searchIntent}`);
  if (payload.brief.audience) lines.push(`Target Audience: ${payload.brief.audience}`);
  if (payload.brief.mustIncludePoints?.length) {
    lines.push(`Must-Include Points:\n- ${payload.brief.mustIncludePoints.join('\n- ')}`);
  }
  if (payload.brief.outline) lines.push(`Brief Outline:\n${payload.brief.outline}`);

  if (payload.clientOverlay) {
    lines.push(`\n=== CLIENT POLICIES ===`);
    if (payload.clientOverlay.brandVoiceRubricText) {
      lines.push(`Brand Voice Rubric: ${payload.clientOverlay.brandVoiceRubricText}`);
    }
    if (payload.clientOverlay.policyRedLines?.length) {
      lines.push(`Red Lines / Disallowed: ${payload.clientOverlay.policyRedLines.join('; ')}`);
    }
    if (payload.clientOverlay.bannedPhrases?.length) {
      lines.push(`Banned Phrases: ${payload.clientOverlay.bannedPhrases.join(', ')}`);
    }
  }

  if (payload.metaTitle || payload.metaDescription) {
    lines.push(`\n=== META ===`);
    if (payload.metaTitle) lines.push(`Title: ${payload.metaTitle}`);
    if (payload.metaDescription) lines.push(`Meta Description: ${payload.metaDescription}`);
  }

  lines.push(`\n=== DRAFT TEXT ===`);
  const draftExcerpt = (payload.draftText || '').trim();
  if (!draftExcerpt) {
    lines.push(`[NO DRAFT PROVIDED]`);
  } else {
    // Truncate to first 12,000 chars for checker efficiency if large
    const bounded = draftExcerpt.length > 12000 ? `${draftExcerpt.slice(0, 12000)}\n\n[...truncated for checker...]` : draftExcerpt;
    lines.push(bounded);
  }

  lines.push(`\n=== QUESTIONS TO EVALUATE ===`);
  for (const q of payload.questions) {
    lines.push(`[${q.id.toUpperCase()}] Kind: ${q.kind}`);
    lines.push(`Question: ${q.prompt}`);
    if (q.criteria) lines.push(`Criteria: ${q.criteria}`);
    if (q.options?.length) lines.push(`Allowed Options: ${q.options.join(', ')}`);
    if (q.maxScore != null) lines.push(`Max Score: ${q.maxScore}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Executes a question batch against the configured Decision Model (Liquid d1.1).
 */
export async function evaluateDecisionBatch(
  payload: DecisionBatchEvaluationPayload,
  siteId?: string | null,
  apiKeyOverride?: string,
): Promise<DecisionBatchResponse> {
  const model = getDecisionModel(siteId);
  const apiKey = apiKeyOverride?.trim() || (await resolveOpenRouterApiKeyForHarness()) || '';

  const system = buildDecisionModelSystemPrompt(payload.questions);
  const user = buildDecisionEvaluationUserMessage(payload);

  const messages: OpenRouterAppMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  let rawOutput = '';
  try {
    const res = await postOpenRouterAppChat({
      apiKey,
      model,
      messages,
      temperature: 0.1, // Near-zero for deterministic calibrations
      maxTokens: 1200,
    });
    rawOutput = res.content || '';
  } catch (err) {
    logger.warn(`[DecisionModel] API call failed for model ${model}, trying high-availability fallback:`, err);
    if (model !== GEMINI_FLASH_LITE_MODEL) {
      try {
        const fallbackRes = await postOpenRouterAppChat({
          apiKey,
          model: GEMINI_FLASH_LITE_MODEL,
          messages,
          temperature: 0.1,
          maxTokens: 1200,
        });
        rawOutput = fallbackRes.content || '';
      } catch (fallbackErr) {
        logger.warn(`[DecisionModel] Fallback model also failed:`, fallbackErr);
      }
    }
  }

  const results: Record<string, QuestionResult> = {};

  // Parse JSON response
  let parsed: Record<string, unknown> = {};
  try {
    const cleaned = rawOutput
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      parsed = JSON.parse(cleaned);
    }
  } catch {
    // Regex fallback if LLM included minor markdown or conversational text
    const match = rawOutput.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        /* ignore */
      }
    }
  }

  // Populate results for all requested questions with safe bounds
  for (const q of payload.questions) {
    const item = parsed[q.id] as
      | {
          yesProbability?: unknown;
          yes?: unknown;
          reasoning?: unknown;
          score?: unknown;
          selectedOption?: unknown;
          confidence?: unknown;
        }
      | number
      | string
      | undefined;
    const itemObj = item && typeof item === "object" ? item : undefined;
    if (q.kind === 'noul') {
      let prob = typeof itemObj?.yesProbability === 'number' ? itemObj.yesProbability : typeof item === 'number' ? item : 0.75;
      if (typeof itemObj?.yes === 'boolean') prob = itemObj.yes ? 0.9 : 0.1;
      prob = Math.max(0, Math.min(1, prob));
      results[q.id] = {
        kind: 'noul',
        yesProbability: prob,
        reasoning: typeof itemObj?.reasoning === 'string' ? itemObj.reasoning : undefined,
      };
    } else if (q.kind === 'score') {
      const maxScore = q.maxScore ?? 3;
      let score = typeof itemObj?.score === 'number' ? itemObj.score : typeof item === 'number' ? item : 2;
      score = Math.max(0, Math.min(maxScore, score));
      results[q.id] = {
        kind: 'score',
        score,
        maxScore,
        reasoning: typeof itemObj?.reasoning === 'string' ? itemObj.reasoning : undefined,
      };
    } else {
      const allowed = q.options ?? [];
      let selected = typeof itemObj?.selectedOption === 'string' ? itemObj.selectedOption : typeof item === 'string' ? item : allowed[0] || '';
      if (!allowed.includes(selected) && allowed.length > 0) {
        selected = allowed[0];
      }
      results[q.id] = {
        kind: 'choice',
        selectedOption: selected,
        confidence: typeof itemObj?.confidence === 'number' ? Math.max(0, Math.min(1, itemObj.confidence)) : 0.8,
        reasoning: typeof itemObj?.reasoning === 'string' ? itemObj.reasoning : undefined,
      };
    }
  }

  return {
    modelUsed: model,
    results,
    rawOutput,
  };
}

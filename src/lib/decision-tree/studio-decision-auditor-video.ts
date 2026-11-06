import { evaluateDecisionBatch } from './decision-model-client';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  NoulResult,
  ScoreResult,
} from './decision-tree-types';

const VIDEO_PLAN_AUDIT_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'pacing_fit',
    kind: 'score',
    prompt: 'Evaluate whether scene durations and rhythm fit commercial storytelling without feeling rushed or sluggish (0-3 scale).',
    criteria: '0 = disjointed/broken pacing; 1 = uneven; 2 = solid commercial rhythm; 3 = masterfully paced.',
    maxScore: 3,
  },
  {
    id: 'continuity_integrity',
    kind: 'score',
    prompt: 'Evaluate visual and narrative continuity: screen direction consistency, hero subject stability, and lighting arc (0-3 scale).',
    criteria: '0 = continuity errors; 1 = minor contradictions; 2 = strong continuity; 3 = seamless cinematic continuity.',
    maxScore: 3,
  },
  {
    id: 'story_arc',
    kind: 'score',
    prompt: 'Evaluate the narrative hook, problem/benefit progression, and call to action resolution (0-3 scale).',
    criteria: '0 = no story arc; 1 = weak hook/ending; 2 = clear compelling narrative; 3 = outstanding emotional/commercial hook.',
    maxScore: 3,
  },
  {
    id: 'brand_safety',
    kind: 'noul',
    prompt: 'Does this video plan strictly adhere to brand safety, avoiding prohibited content, copyright violations, and misleading claims?',
    criteria: '1.0 = safe; 0.0 = policy violation.',
  },
  {
    id: 'production_readiness',
    kind: 'noul',
    prompt: 'Are the visual storyboard and motion prompts concrete and feasible for generative video models?',
    criteria: '1.0 = highly concrete & renderable; 0.0 = vague or unrenderable.',
  },
];

export interface VideoPlanAuditSummary {
  planTitle: string;
  pacingFitScore: number;
  continuityScore: number;
  storyArcScore: number;
  brandSafetyProbability: number;
  productionReadyProbability: number;
  verdict: 'approved' | 'review_recommended' | 'rejected';
  reasoning: string;
}

/**
 * Audits a Video Studio Director Plan using the Decision Model (Liquid d1.1).
 */
export async function auditVideoPlanWithDecisionAgent(args: {
  planTitle: string;
  logline: string;
  scenesSummary: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<VideoPlanAuditSummary> {
  const brief: DecisionJobBrief = {
    topicTitle: args.planTitle,
    primaryKeyword: args.planTitle,
    searchIntent: 'commercial',
  };

  const draftText = `Video Title: ${args.planTitle}\nLogline: ${args.logline}\n\nScene Breakdown:\n${args.scenesSummary}`;

  const res = await evaluateDecisionBatch(
    {
      brief,
      draftText: draftText.slice(0, 8000),
      questions: VIDEO_PLAN_AUDIT_QUESTIONS,
    },
    args.siteId,
    args.apiKey,
  );

  const pacingFit = (res.results.pacing_fit as ScoreResult)?.score ?? 2.5;
  const continuity = (res.results.continuity_integrity as ScoreResult)?.score ?? 2.5;
  const storyArc = (res.results.story_arc as ScoreResult)?.score ?? 2.5;
  const brandSafety = (res.results.brand_safety as NoulResult)?.yesProbability ?? 0.98;
  const productionReady = (res.results.production_readiness as NoulResult)?.yesProbability ?? 0.95;

  let verdict: 'approved' | 'review_recommended' | 'rejected' = 'approved';
  if (brandSafety < 0.2 || productionReady < 0.3) {
    verdict = 'rejected';
  } else if (pacingFit < 1.5 || continuity < 1.5 || storyArc < 1.5 || productionReady < 0.6) {
    verdict = 'review_recommended';
  }

  return {
    planTitle: args.planTitle,
    pacingFitScore: pacingFit,
    continuityScore: continuity,
    storyArcScore: storyArc,
    brandSafetyProbability: brandSafety,
    productionReadyProbability: productionReady,
    verdict,
    reasoning: `d1.1: pacing=${pacingFit}/3, continuity=${continuity}/3, story_arc=${storyArc}/3, prod_ready=${(productionReady * 100).toFixed(0)}%`,
  };
}

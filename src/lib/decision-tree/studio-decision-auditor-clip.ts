import { evaluateDecisionBatch } from './decision-model-client';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  NoulResult,
  ScoreResult,
} from './decision-tree-types';
import { hasNegativePeopleConstraint } from '@/lib/video-generator/video-storyboard-agent';

const CLIP_ANTI_ARTIFACT_AUDIT_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'anti_morphing',
    kind: 'score',
    prompt: 'Evaluate whether the motion instructions lock rigid geometry and prevent architectural walls, cabinets, displays, and products from morphing or dissolving (0-3 scale).',
    criteria: '0 = high morphing risk (vague or metamorphic); 1 = moderate morphing risk; 2 = solid stability; 3 = absolute rigid-body lock with zero morphing.',
    maxScore: 3,
  },
  {
    id: 'artifact_free',
    kind: 'noul',
    prompt: 'Does this prompt strictly avoid hallucinated text, disembodied logos, floating letters in doorways, and weird AI optical glitches?',
    criteria: '1.0 = completely artifact-free and physically grounded; 0.0 = high hallucination risk.',
  },
  {
    id: 'reference_fidelity',
    kind: 'score',
    prompt: 'Evaluate visual fidelity to the reference frame and real setting: does it preserve real architecture and signage without inventing un-photographed rooms or phantom objects (0-3 scale)?',
    criteria: '0 = invents un-photographed rooms or phantom furniture; 1 = partial match; 2 = high fidelity; 3 = 1:1 photoreal match.',
    maxScore: 3,
  },
  {
    id: 'motion_grounding',
    kind: 'score',
    prompt: 'Evaluate camera motion plausibility: is it a smooth, continuous, physically grounded camera move without erratic jumps or wall penetration (0-3 scale)?',
    criteria: '0 = physically impossible or warped; 1 = slightly jerky; 2 = smooth tracking/pan; 3 = cinema-grade grounded dolly/tracking.',
    maxScore: 3,
  },
];

export interface SceneClipAuditSummary {
  sceneTitle: string;
  sceneOrder: number;
  antiMorphingScore: number;
  artifactFreeProbability: number;
  referenceFidelityScore: number;
  motionGroundingScore: number;
  verdict: 'approved' | 'guardrails_injected' | 'review_recommended';
  guardrailText: string;
  enhancedPrompt: string;
  reasoning: string;
}

export const ANTI_MORPHING_GUARDRAIL_CLAUSE =
  'Rigid architecture lock: zero morphing, zero geometric drift, no shifting cabinets or walls, no dissolving objects, no floating text or phantom letters. Maintain strict 1:1 visual fidelity with the reference frame throughout the shot.';

export const ZERO_PEOPLE_GUARDRAIL_CLAUSE =
  'Empty showroom: zero people, nobody at desks, chairs, or doorways. Completely devoid of humans throughout the shot.';

/**
 * Audits a Scene Video Clip prompt using the Decision Model (Liquid d1.1).
 * Detects morphing risks, hallucinated artifacts, and reference drift,
 * and automatically injects strict negative constraints.
 */
export async function auditSceneClipWithDecisionAgent(args: {
  sceneTitle: string;
  sceneOrder: number;
  videoPrompt: string;
  siteId?: string | null;
  apiKey?: string;
  hasReferenceStill?: boolean;
  briefContext?: string;
}): Promise<SceneClipAuditSummary> {
  const cleanPrompt = args.videoPrompt.trim();
  const brief: DecisionJobBrief = {
    topicTitle: `Scene ${args.sceneOrder}: ${args.sceneTitle}`,
    primaryKeyword: args.sceneTitle,
    searchIntent: 'commercial',
  };

  const draftText = `Scene ${args.sceneOrder}: ${args.sceneTitle}\nHas Reference Still: ${args.hasReferenceStill ? 'Yes (Photoreal Reference Locked)' : 'No'}\n\nProposed Video Motion Prompt:\n${cleanPrompt}`;

  const wantsNoPeople =
    hasNegativePeopleConstraint(args.sceneTitle) ||
    hasNegativePeopleConstraint(cleanPrompt) ||
    hasNegativePeopleConstraint(args.briefContext);

  try {
    const res = await evaluateDecisionBatch(
      {
        brief,
        draftText: draftText.slice(0, 8000),
        questions: CLIP_ANTI_ARTIFACT_AUDIT_QUESTIONS,
      },
      args.siteId,
      args.apiKey,
    );

    const antiMorphing = (res.results.anti_morphing as ScoreResult)?.score ?? 2.5;
    const artifactFree = (res.results.artifact_free as NoulResult)?.yesProbability ?? 0.95;
    const referenceFidelity = (res.results.reference_fidelity as ScoreResult)?.score ?? 2.5;
    const motionGrounding = (res.results.motion_grounding as ScoreResult)?.score ?? 2.5;

    let needsGuardrails = false;
    if (antiMorphing < 2.5 || artifactFree < 0.9 || referenceFidelity < 2.5) {
      needsGuardrails = true;
    }

    const alreadyHasGuardrail =
      cleanPrompt.toLowerCase().includes('zero morphing') ||
      cleanPrompt.toLowerCase().includes('rigid architecture lock');

    let enhancedPrompt = cleanPrompt;
    const guardrailParts: string[] = [];

    if (needsGuardrails && !alreadyHasGuardrail) {
      guardrailParts.push(ANTI_MORPHING_GUARDRAIL_CLAUSE);
    }

    const alreadyHasPeopleGuardrail =
      cleanPrompt.toLowerCase().includes('zero people') ||
      cleanPrompt.toLowerCase().includes('no people') ||
      cleanPrompt.toLowerCase().includes('zero humans') ||
      cleanPrompt.toLowerCase().includes('empty showroom');

    if (wantsNoPeople && !alreadyHasPeopleGuardrail) {
      guardrailParts.push(ZERO_PEOPLE_GUARDRAIL_CLAUSE);
    }

    if (guardrailParts.length > 0) {
      enhancedPrompt = `${cleanPrompt} ${guardrailParts.join(' ')}`.trim();
    }

    const guardrailText = guardrailParts.join(' ');

    let verdict: 'approved' | 'guardrails_injected' | 'review_recommended' = 'approved';
    if (guardrailParts.length > 0) {
      verdict = 'guardrails_injected';
    } else if (antiMorphing < 1.0 || artifactFree < 0.5) {
      verdict = 'review_recommended';
    }

    return {
      sceneTitle: args.sceneTitle,
      sceneOrder: args.sceneOrder,
      antiMorphingScore: antiMorphing,
      artifactFreeProbability: artifactFree,
      referenceFidelityScore: referenceFidelity,
      motionGroundingScore: motionGrounding,
      verdict,
      guardrailText,
      enhancedPrompt,
      reasoning: `d1.1 clip audit: anti_morphing=${antiMorphing}/3, artifact_free=${(artifactFree * 100).toFixed(0)}%, ref_fidelity=${referenceFidelity}/3, motion=${motionGrounding}/3${wantsNoPeople ? ', zero_people_enforced' : ''}`,
    };
  } catch (err) {
    // Graceful fallback: ensure guardrail is injected even if network call fails
    const alreadyHasGuardrail =
      cleanPrompt.toLowerCase().includes('zero morphing') ||
      cleanPrompt.toLowerCase().includes('rigid architecture lock');
    const alreadyHasPeopleGuardrail =
      cleanPrompt.toLowerCase().includes('zero people') ||
      cleanPrompt.toLowerCase().includes('no people') ||
      cleanPrompt.toLowerCase().includes('zero humans') ||
      cleanPrompt.toLowerCase().includes('empty showroom');

    const fallbackParts: string[] = [];
    if (!alreadyHasGuardrail) fallbackParts.push(ANTI_MORPHING_GUARDRAIL_CLAUSE);
    if (wantsNoPeople && !alreadyHasPeopleGuardrail) fallbackParts.push(ZERO_PEOPLE_GUARDRAIL_CLAUSE);

    const enhancedPrompt = fallbackParts.length > 0
      ? `${cleanPrompt} ${fallbackParts.join(' ')}`.trim()
      : cleanPrompt;

    return {
      sceneTitle: args.sceneTitle,
      sceneOrder: args.sceneOrder,
      antiMorphingScore: 2.0,
      artifactFreeProbability: 0.9,
      referenceFidelityScore: 2.0,
      motionGroundingScore: 2.0,
      verdict: fallbackParts.length > 0 ? 'guardrails_injected' : 'approved',
      guardrailText: fallbackParts.join(' '),
      enhancedPrompt,
      reasoning: `d1.1 clip audit: fallback guardrails injected`,
    };
  }
}



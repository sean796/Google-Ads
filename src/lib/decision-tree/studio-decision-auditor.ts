/**
 * Studio Decision Auditor
 *
 * Embeds the Decision Agent (Liquid d1.1) throughout Neo Pulse Studios:
 * - Blog Ideas Studio (ideation check, on-brief alignment, CTR score, policy check)
 * - Import Drafts Studio (quality check, depth, voice match)
 * - Press Release Studio (newsworthiness & PR policy)
 * - Proposal Research Studio (relevance & feasibility)
 */

import { evaluateDecisionBatch } from './decision-model-client';
import { runDecisionTreePipeline } from './decision-tree-runner';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  DecisionTreeState,
  NoulResult,
  ScoreResult,
} from './decision-tree-types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import { hasNegativePeopleConstraint } from '@/lib/video-generator/video-storyboard-agent';

export interface IdeaAuditSummary {
  keyword: string;
  title: string;
  onBriefProbability: number;
  intentScore: number;
  clickAppealScore: number;
  policySafeProbability: number;
  verdict: 'approved' | 'review_recommended' | 'rejected';
  reasoning?: string;
}

const IDEA_AUDIT_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'on_brief',
    kind: 'noul',
    prompt: 'Does this proposed blog idea directly align with the target intent, topic angle, and client niche?',
    criteria: '1.0 = highly relevant and targeted; 0.0 = completely off-topic.',
  },
  {
    id: 'intent_fit',
    kind: 'score',
    prompt: 'Evaluate how clearly this title satisfies user search intent (0-3 scale).',
    criteria: '0 = ambiguous or vague; 1 = weak intent; 2 = solid search intent; 3 = outstanding search intent.',
    maxScore: 3,
  },
  {
    id: 'click_appeal',
    kind: 'score',
    prompt: 'Evaluate organic click-through appeal (CTR) and title strength (0-3 scale).',
    criteria: '0 = boring clickbait or unusable; 1 = plain; 2 = compelling; 3 = exceptional high-CTR headline.',
    maxScore: 3,
  },
  {
    id: 'policy_safe',
    kind: 'noul',
    prompt: 'Does the title avoid misleading claims, forbidden competitor names, and policy violations?',
    criteria: '1.0 = safe; 0.0 = policy violation.',
  },
];

/**
 * Audits a batch of generated blog ideas using the Decision Model (Liquid d1.1).
 */
export async function auditBlogIdeasWithDecisionAgent(args: {
  ideas: CSVRow[];
  topic: string;
  apiKey?: string;
  siteId?: string | null;
  clientBrandName?: string;
}): Promise<{
  auditedIdeas: CSVRow[];
  summaries: IdeaAuditSummary[];
}> {
  if (!args.ideas.length) {
    return { auditedIdeas: [], summaries: [] };
  }

  const summaries: IdeaAuditSummary[] = [];
  const auditedIdeas: CSVRow[] = [];

  for (const idea of args.ideas) {
    const brief: DecisionJobBrief = {
      topicTitle: idea.title,
      primaryKeyword: idea.keyword,
      searchIntent: 'informational',
      mustIncludePoints: [args.topic],
    };

    try {
      const res = await evaluateDecisionBatch(
        {
          brief,
          draftText: `Title: ${idea.title}\nTarget Keyword: ${idea.keyword}\nTopic Context: ${args.topic}`,
          questions: IDEA_AUDIT_QUESTIONS,
        },
        args.siteId,
        args.apiKey,
      );

      const onBrief = (res.results.on_brief as NoulResult)?.yesProbability ?? 0.85;
      const intentFit = (res.results.intent_fit as ScoreResult)?.score ?? 2;
      const clickAppeal = (res.results.click_appeal as ScoreResult)?.score ?? 2;
      const policySafe = (res.results.policy_safe as NoulResult)?.yesProbability ?? 0.95;

      let verdict: 'approved' | 'review_recommended' | 'rejected' = 'approved';
      if (policySafe < 0.2 || onBrief < 0.3) {
        verdict = 'rejected';
      } else if (onBrief < 0.6 || intentFit < 1.5 || clickAppeal < 1.0) {
        verdict = 'review_recommended';
      }

      const summary: IdeaAuditSummary = {
        keyword: idea.keyword,
        title: idea.title,
        onBriefProbability: onBrief,
        intentScore: intentFit,
        clickAppealScore: clickAppeal,
        policySafeProbability: policySafe,
        verdict,
        reasoning: `d1.1: on_brief=${onBrief.toFixed(2)}, intent=${intentFit}/3, ctr=${clickAppeal}/3`,
      };

      summaries.push(summary);

      // Attach decision audit JSON to the row so UI and pipeline can display badge
      const updatedRow: CSVRow = {
        ...idea,
        rationale: idea.rationale || summary.reasoning,
        decision_audit_json: JSON.stringify(summary),
      };

      auditedIdeas.push(updatedRow);
    } catch (e) {
      console.warn('[DecisionAgent] Idea audit error for:', idea.title, e);
      auditedIdeas.push(idea);
    }
  }

  return { auditedIdeas, summaries };
}

/**
 * Runs an imported article draft through the full Decision Tree QA Pipeline.
 */
export async function auditImportDraftWithDecisionTree(args: {
  title: string;
  keyword: string;
  content: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.title,
      primaryKeyword: args.keyword,
      existingDraft: args.content,
      searchIntent: 'informational',
    },
    draftText: args.content,
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}

/**
 * Runs a press release draft through the Decision Tree QA Pipeline.
 */
export async function auditPressReleaseWithDecisionTree(args: {
  headline: string;
  body: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.headline,
      primaryKeyword: args.headline,
      existingDraft: args.body,
      searchIntent: 'commercial',
    },
    draftText: args.body,
    thresholds: {
      thinContentFloor: 1.0, // PRs are typically tighter
      publishReadyThreshold: 0.80,
    },
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}

const PROPOSAL_AUDIT_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'strategic_fit',
    kind: 'noul',
    prompt: 'Does this SEO & content strategy proposal directly address the competitive gaps and search demand for the client?',
    criteria: '1.0 = highly relevant, tactical strategy; 0.0 = generic boilerplate.',
  },
  {
    id: 'feasibility_score',
    kind: 'score',
    prompt: 'Evaluate how actionable and realistic the proposed content & technical roadmap is (0-3 scale).',
    criteria: '0 = impossible/unrealistic; 1 = vague; 2 = solid & actionable; 3 = exceptional, high-impact roadmap.',
    maxScore: 3,
  },
  {
    id: 'data_depth_score',
    kind: 'score',
    prompt: 'Evaluate data depth, empirical evidence, and competitive intelligence rigor (0-3 scale).',
    criteria: '0 = surface-level; 1 = basic keywords; 2 = robust competitive data; 3 = world-class empirical depth.',
    maxScore: 3,
  },
  {
    id: 'policy_safe',
    kind: 'noul',
    prompt: 'Does the proposal strictly adhere to search engine guidelines without black-hat risk?',
    criteria: '1.0 = safe and compliant; 0.0 = high-risk practices.',
  },
];

export interface ProposalAuditSummary {
  clientName: string;
  strategicFitProbability: number;
  feasibilityScore: number;
  dataDepthScore: number;
  policySafeProbability: number;
  verdict: 'approved' | 'review_recommended' | 'rejected';
  reasoning: string;
}

/**
 * Audits an SEO proposal or research strategy using the Decision Model (Liquid d1.1).
 */
export async function auditProposalWithDecisionAgent(args: {
  clientName: string;
  proposalText: string;
  targetCompetitors?: string[];
  siteId?: string | null;
  apiKey?: string;
}): Promise<ProposalAuditSummary> {
  const brief: DecisionJobBrief = {
    topicTitle: `Proposal Strategy: ${args.clientName}`,
    primaryKeyword: args.clientName,
    mustIncludePoints: args.targetCompetitors ?? [],
    searchIntent: 'commercial',
  };

  const res = await evaluateDecisionBatch(
    {
      brief,
      draftText: args.proposalText.slice(0, 8000),
      questions: PROPOSAL_AUDIT_QUESTIONS,
    },
    args.siteId,
    args.apiKey,
  );

  const strategicFit = (res.results.strategic_fit as NoulResult)?.yesProbability ?? 0.85;
  const feasibility = (res.results.feasibility_score as ScoreResult)?.score ?? 2.5;
  const dataDepth = (res.results.data_depth_score as ScoreResult)?.score ?? 2.5;
  const policySafe = (res.results.policy_safe as NoulResult)?.yesProbability ?? 0.95;

  let verdict: 'approved' | 'review_recommended' | 'rejected' = 'approved';
  if (policySafe < 0.2 || strategicFit < 0.3) {
    verdict = 'rejected';
  } else if (strategicFit < 0.6 || feasibility < 1.5 || dataDepth < 1.5) {
    verdict = 'review_recommended';
  }

  return {
    clientName: args.clientName,
    strategicFitProbability: strategicFit,
    feasibilityScore: feasibility,
    dataDepthScore: dataDepth,
    policySafeProbability: policySafe,
    verdict,
    reasoning: `d1.1: strategic_fit=${strategicFit.toFixed(2)}, feasibility=${feasibility}/3, depth=${dataDepth}/3`,
  };
}

/**
 * Evaluates a single idea on the fly using the Decision Agent.
 */
export async function auditSingleIdeaWithDecisionAgent(args: {
  title: string;
  keyword: string;
  topic?: string;
  apiKey?: string;
  siteId?: string | null;
}): Promise<IdeaAuditSummary> {
  const topic = args.topic?.trim() || args.keyword;
  const res = await auditBlogIdeasWithDecisionAgent({
    ideas: [{ title: args.title, keyword: args.keyword } as CSVRow],
    topic,
    apiKey: args.apiKey,
    siteId: args.siteId,
  });
  return res.summaries[0] ?? {
    keyword: args.keyword,
    title: args.title,
    onBriefProbability: 0.85,
    intentScore: 2,
    clickAppealScore: 2,
    policySafeProbability: 0.95,
    verdict: 'approved',
    reasoning: 'Default approval',
  };
}

/**
 * Runs the full Decision Tree QA on a generated blog post in the Bulk CSV Pipeline.
 */
export async function auditBulkRowContentWithDecisionTree(args: {
  title: string;
  keyword: string;
  markdownContent: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.title,
      primaryKeyword: args.keyword,
      existingDraft: args.markdownContent,
      searchIntent: 'informational',
    },
    draftText: args.markdownContent,
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}

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



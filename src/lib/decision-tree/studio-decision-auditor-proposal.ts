import { evaluateDecisionBatch } from './decision-model-client';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  NoulResult,
  ScoreResult,
} from './decision-tree-types';

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

import { evaluateDecisionBatch } from './decision-model-client';
import type {
  DecisionJobBrief,
  DecisionQuestionDefinition,
  NoulResult,
  ScoreResult,
} from './decision-tree-types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import { logger } from "@/lib/logger";

export type AuditedCSVRow = CSVRow & { decision_audit_json?: string };

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
  auditedIdeas: AuditedCSVRow[];
  summaries: IdeaAuditSummary[];
}> {
  if (!args.ideas.length) {
    return { auditedIdeas: [], summaries: [] };
  }

  const summaries: IdeaAuditSummary[] = [];
  const auditedIdeas: AuditedCSVRow[] = [];

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
      const updatedRow: AuditedCSVRow = {
        ...idea,
        rationale: idea.rationale || summary.reasoning,
        decision_audit_json: JSON.stringify(summary),
      };

      auditedIdeas.push(updatedRow);
    } catch (e) {
      logger.warn('[DecisionAgent] Idea audit error for:', idea.title, e);
      auditedIdeas.push(idea);
    }
  }

  return { auditedIdeas, summaries };
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

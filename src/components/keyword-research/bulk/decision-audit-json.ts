import type { IdeaAuditSummary } from '@/lib/decision-tree/studio-decision-auditor';

export function parseDecisionAuditJson(raw?: string): IdeaAuditSummary | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('verdict' in parsed || 'terminalState' in parsed || 'pacingFitScore' in parsed)) {
      if ('pacingFitScore' in parsed) {
        return {
          keyword: parsed.planTitle ?? '',
          title: parsed.planTitle ?? '',
          onBriefProbability: parsed.productionReadyProbability ?? 0.95,
          intentScore: parsed.storyArcScore ?? 2.5,
          clickAppealScore: parsed.pacingFitScore ?? 2.5,
          policySafeProbability: parsed.brandSafetyProbability ?? 0.98,
          verdict: parsed.verdict ?? 'approved',
          reasoning: parsed.reasoning ?? '',
        };
      }
      if ('terminalState' in parsed) {
        const isReady = parsed.terminalState === 'PUBLISH_READY';
        const isReview = parsed.terminalState === 'EXIT_HUMAN_REVIEW';
        return {
          keyword: parsed.brief?.primaryKeyword ?? '',
          title: parsed.brief?.topicTitle ?? '',
          onBriefProbability: parsed.thresholds?.onBriefFloor ?? 0.85,
          intentScore: 2.5,
          clickAppealScore: 2.5,
          policySafeProbability: 0.98,
          verdict: isReady ? 'approved' : isReview ? 'review_recommended' : 'rejected',
          reasoning: `Decision Tree: ${parsed.terminalState} (QA: ${(Number(parsed.qaScore ?? 0.85) * 100).toFixed(0)}%)`,
        };
      }
      return parsed as IdeaAuditSummary;
    }
  } catch {
    /* ignore json parse error */
  }
  return null;
}

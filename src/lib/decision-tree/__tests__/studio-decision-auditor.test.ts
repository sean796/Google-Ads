import { describe, it, expect, vi } from 'vitest';
import {
  auditBlogIdeasWithDecisionAgent,
  auditSingleIdeaWithDecisionAgent,
  auditProposalWithDecisionAgent,
} from '../studio-decision-auditor';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';

vi.mock('../decision-model-client', () => ({
  evaluateDecisionBatch: vi.fn().mockResolvedValue({
    batchId: 'mock-batch-1',
    model: 'liquid/d1.1',
    results: {
      on_brief: { yesProbability: 0.94, uncertaintyBand: false, model: 'liquid/d1.1' },
      intent_fit: { score: 2.8, normalized: 0.93, maxScore: 3, model: 'liquid/d1.1' },
      click_appeal: { score: 2.7, normalized: 0.9, maxScore: 3, model: 'liquid/d1.1' },
      policy_safe: { yesProbability: 0.99, uncertaintyBand: false, model: 'liquid/d1.1' },
      strategic_fit: { yesProbability: 0.92, uncertaintyBand: false, model: 'liquid/d1.1' },
      feasibility_score: { score: 2.7, normalized: 0.9, maxScore: 3, model: 'liquid/d1.1' },
      data_depth_score: { score: 2.8, normalized: 0.93, maxScore: 3, model: 'liquid/d1.1' },
    },
    latencyMs: 120,
  }),
}));

describe('Studio Decision Auditor', () => {
  it('audits blog ideas batch and attaches decision audit metadata', async () => {
    const ideas: CSVRow[] = [
      {
        keyword: 'roller blinds motorization',
        title: 'Complete Guide to Motorized Roller Blinds for Modern Homes',
      } as CSVRow,
    ];

    const result = await auditBlogIdeasWithDecisionAgent({
      ideas,
      topic: 'Window coverings guide',
    });

    expect(result.auditedIdeas).toHaveLength(1);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].verdict).toBe('approved');
    expect(result.summaries[0].onBriefProbability).toBeCloseTo(0.94);
    expect(result.summaries[0].intentScore).toBe(2.8);
    expect(result.auditedIdeas[0].decision_audit_json).toBeDefined();

    const parsed = JSON.parse(result.auditedIdeas[0].decision_audit_json!);
    expect(parsed.verdict).toBe('approved');
  });

  it('audits a single idea on the fly', async () => {
    const summary = await auditSingleIdeaWithDecisionAgent({
      title: 'How to Choose Window Shutters',
      keyword: 'window shutters guide',
      topic: 'Window treatments',
    });

    expect(summary.verdict).toBe('approved');
    expect(summary.onBriefProbability).toBe(0.94);
  });

  it('audits proposal research strategy with Decision Agent', async () => {
    const summary = await auditProposalWithDecisionAgent({
      clientName: 'Blind Magic',
      proposalText: '## Executive Strategy Roadmap\nComprehensive SEO expansion targeting custom drapery and motorization.',
      targetCompetitors: ['budgetblinds.com'],
    });

    expect(summary.verdict).toBe('approved');
    expect(summary.strategicFitProbability).toBe(0.92);
    expect(summary.feasibilityScore).toBe(2.7);
    expect(summary.dataDepthScore).toBe(2.8);
    expect(summary.policySafeProbability).toBe(0.99);
  });

  it('audits Video Studio Director Plan with Decision Agent', async () => {
    const { auditVideoPlanWithDecisionAgent } = await import('../studio-decision-auditor');
    const summary = await auditVideoPlanWithDecisionAgent({
      planTitle: 'Automated Window Coverings Showroom Commercial',
      logline: 'Homeowner discovers motorized roller blinds that operate via smartphone.',
      scenesSummary: 'Scene 1: Waking up in bedroom, blinds slowly raise.\nScene 2: Kitchen smart hub controls shade.',
    });

    expect(summary.verdict).toBe('approved');
    expect(summary.pacingFitScore).toBeGreaterThanOrEqual(2);
    expect(summary.continuityScore).toBeGreaterThanOrEqual(2);
    expect(summary.storyArcScore).toBeGreaterThanOrEqual(2);
    expect(summary.brandSafetyProbability).toBeGreaterThan(0.9);
  });
});

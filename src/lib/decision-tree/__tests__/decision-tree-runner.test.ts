import { describe, expect, it, vi } from 'vitest';
import { runDecisionTreePipeline } from '../decision-tree-runner';
import * as decisionModelClient from '../decision-model-client';

describe('Decision Tree Pipeline State Machine', () => {
  it('rejects incomplete brief immediately at INTAKE', async () => {
    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: '',
        primaryKeyword: '',
      },
      draftText: 'Some draft body',
    });

    expect(state.terminalState).toBe('REJECT_INCOMPLETE_BRIEF');
    expect(state.auditTrail.some((e) => e.nodeId === 'INTAKE_FAIL')).toBe(true);
  });

  it('rejects unsafe content at QA_BATCH_CORE without entering fix loops', async () => {
    vi.spyOn(decisionModelClient, 'evaluateDecisionBatch').mockResolvedValueOnce({
      modelUsed: 'liquid/d1.1',
      results: {
        policy_safe: { kind: 'noul', yesProbability: 0.05, reasoning: 'Severe disallowed claim' },
        on_brief: { kind: 'noul', yesProbability: 0.95 },
        intent_match: { kind: 'noul', yesProbability: 0.90 },
        thin_content: { kind: 'score', score: 3, maxScore: 3 },
      },
    });

    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: 'Safe Home Renovations',
        primaryKeyword: 'home renovations',
      },
      draftText: 'Unsafe competitor slander and disallowed claims here.',
    });

    expect(state.terminalState).toBe('REJECT_POLICY');
    expect(state.fixCount).toBe(0); // Zero fix spend on policy violations
    expect(state.auditTrail.some((e) => e.nodeId === 'REJECT_POLICY')).toBe(true);
  });

  it('routes to HUMAN_REVIEW_UNCERTAIN when checker confidence is shaky (40-60%)', async () => {
    vi.spyOn(decisionModelClient, 'evaluateDecisionBatch').mockResolvedValueOnce({
      modelUsed: 'liquid/d1.1',
      results: {
        policy_safe: { kind: 'noul', yesProbability: 0.95 },
        on_brief: { kind: 'noul', yesProbability: 0.50, reasoning: 'Borderline on-brief' },
        intent_match: { kind: 'noul', yesProbability: 0.85 },
        thin_content: { kind: 'score', score: 2, maxScore: 3 },
      },
    });

    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: 'Commercial Plumbing Tips',
        primaryKeyword: 'commercial plumbing',
      },
      draftText: 'General plumbing advice that may or may not fit commercial scale.',
    });

    expect(state.terminalState).toBe('HUMAN_REVIEW_UNCERTAIN');
    expect(state.auditTrail.some((e) => e.nodeId === 'HUMAN_REVIEW_UNCERTAIN')).toBe(true);
  });

  it('triggers FIX_ROUTER and caps loops at HUMAN_REVIEW_EXHAUSTED when fixes fail to resolve', async () => {
    // Repeatedly return thin content on every re-evaluation
    vi.spyOn(decisionModelClient, 'evaluateDecisionBatch').mockResolvedValue({
      modelUsed: 'liquid/d1.1',
      results: {
        policy_safe: { kind: 'noul', yesProbability: 0.95 },
        on_brief: { kind: 'noul', yesProbability: 0.90 },
        intent_match: { kind: 'noul', yesProbability: 0.90 },
        thin_content: { kind: 'score', score: 0.5, maxScore: 3 }, // Fails min floor
      },
    });

    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: 'In-Depth Solar Installation Guide',
        primaryKeyword: 'solar installation',
      },
      draftText: 'Short draft that stays thin.',
      thresholds: { maxFixLoops: 2, maxRepeatedFixLoops: 2 },
      geminiRunner: async () => 'Still thin content after fix',
    });

    expect(state.terminalState).toBe('HUMAN_REVIEW_EXHAUSTED');
    expect(state.fixCount).toBeGreaterThanOrEqual(2);
    expect(state.fixHistory).toContain('expand_body');
  });

  it('passes all gates and auto-publishes when client allows automation', async () => {
    vi.spyOn(decisionModelClient, 'evaluateDecisionBatch')
      // Core batch passes
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          policy_safe: { kind: 'noul', yesProbability: 0.99 },
          on_brief: { kind: 'noul', yesProbability: 0.95 },
          intent_match: { kind: 'noul', yesProbability: 0.92 },
          thin_content: { kind: 'score', score: 3, maxScore: 3 },
        },
      })
      // Brand & SEO batch passes
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          brand_voice: { kind: 'score', score: 3.5, maxScore: 4 },
          local_relevance: { kind: 'noul', yesProbability: 0.90 },
          structure_ok: { kind: 'noul', yesProbability: 0.95 },
          title_meta_fit: { kind: 'score', score: 2.5, maxScore: 3 },
          keyword_natural: { kind: 'noul', yesProbability: 0.95 },
        },
      })
      // Publish ready check passes
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          publish_ready: { kind: 'noul', yesProbability: 0.92 },
        },
      });

    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: 'Top Rated Office Chairs',
        primaryKeyword: 'best office chairs',
      },
      draftText: 'Comprehensive, beautifully formatted and on-brand office chair guide.',
    });

    expect(state.terminalState).toBe('READY_AUTO_PUBLISH');
  });

  it('respects client neverAutoPublish flag even on high pass probability', async () => {
    vi.spyOn(decisionModelClient, 'evaluateDecisionBatch')
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          policy_safe: { kind: 'noul', yesProbability: 0.99 },
          on_brief: { kind: 'noul', yesProbability: 0.95 },
          intent_match: { kind: 'noul', yesProbability: 0.92 },
          thin_content: { kind: 'score', score: 3, maxScore: 3 },
        },
      })
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          brand_voice: { kind: 'score', score: 3.5, maxScore: 4 },
          local_relevance: { kind: 'noul', yesProbability: 0.90 },
          structure_ok: { kind: 'noul', yesProbability: 0.95 },
          title_meta_fit: { kind: 'score', score: 2.5, maxScore: 3 },
          keyword_natural: { kind: 'noul', yesProbability: 0.95 },
        },
      })
      .mockResolvedValueOnce({
        modelUsed: 'liquid/d1.1',
        results: {
          publish_ready: { kind: 'noul', yesProbability: 0.95 },
        },
      });

    const state = await runDecisionTreePipeline({
      brief: {
        topicTitle: 'Medical Equipment Maintenance',
        primaryKeyword: 'medical equipment',
      },
      clientOverlay: {
        neverAutoPublish: true,
      },
      draftText: 'High quality draft for medical client.',
    });

    expect(state.terminalState).toBe('HUMAN_REVIEW_STANDARD');
  });
});

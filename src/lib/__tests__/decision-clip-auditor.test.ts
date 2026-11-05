import { describe, expect, it } from 'vitest';
import {
  auditSceneClipWithDecisionAgent,
  ANTI_MORPHING_GUARDRAIL_CLAUSE,
} from '@/lib/decision-tree/studio-decision-auditor';

describe('Decision Model (Liquid d1.1) Scene Clip Anti-Morphing Auditor', () => {
  it('automatically injects anti-morphing guardrails when prompt lacks rigid lock', async () => {
    const rawPrompt = 'The camera dollies into the showroom entrance as lighting shifts.';
    const audit = await auditSceneClipWithDecisionAgent({
      sceneTitle: 'Showroom Entrance',
      sceneOrder: 1,
      videoPrompt: rawPrompt,
      hasReferenceStill: true,
      apiKey: 'test-key',
    });

    expect(audit.enhancedPrompt).toContain(ANTI_MORPHING_GUARDRAIL_CLAUSE);
    expect(audit.enhancedPrompt).toContain('zero morphing');
    expect(audit.enhancedPrompt).toContain('no floating text or phantom letters');
  });

  it('preserves prompt and avoids duplicate injection if anti-morphing clause already present', async () => {
    const guardedPrompt =
      'The camera dollies slowly into the showroom. Rigid architecture lock: zero morphing, zero geometric drift, no shifting cabinets or walls, no dissolving objects, no floating text or phantom letters. Maintain strict 1:1 visual fidelity with the reference frame throughout the shot.';
    const audit = await auditSceneClipWithDecisionAgent({
      sceneTitle: 'Showroom Entrance',
      sceneOrder: 1,
      videoPrompt: guardedPrompt,
      hasReferenceStill: true,
      apiKey: 'test-key',
    });

    expect(audit.enhancedPrompt).toBe(guardedPrompt);
    const occurrences = audit.enhancedPrompt.split('zero morphing').length - 1;
    expect(occurrences).toBe(1);
  });

  it('automatically injects ZERO_PEOPLE_GUARDRAIL_CLAUSE when brief or prompt specifies no people', async () => {
    const rawPrompt = 'The camera tracks past the display cabinets towards the back office.';
    const audit = await auditSceneClipWithDecisionAgent({
      sceneTitle: 'Showroom Interior (No People)',
      sceneOrder: 2,
      videoPrompt: rawPrompt,
      hasReferenceStill: true,
      briefContext: 'Modern showroom tour. Please ensure NO PEOPLE are visible anywhere.',
      apiKey: 'test-key',
    });

    expect(audit.enhancedPrompt).toContain('zero people');
    expect(audit.enhancedPrompt).toContain('Completely devoid of humans');
    expect(audit.reasoning).toContain('zero_people_enforced');
  });
});

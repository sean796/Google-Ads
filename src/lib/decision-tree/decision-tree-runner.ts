import { logger } from "@/lib/logger";
import { postOpenRouterAppChat, type OpenRouterAppMessage } from '@/lib/openrouter-app-api';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import { evaluateDecisionBatch } from './decision-model-client';
import {
  CONTENT_TYPE_PROFILES,
  DEFAULT_DECISION_THRESHOLDS,
  PUBLISH_READY_QUESTION,
  QA_BATCH_BRAND_SEO_QUESTIONS,
  QA_BATCH_CORE_QUESTIONS,
} from './decision-tree-defaults';
import type {
  ClientPolicyOverlay,
  ContentTypeProfileKey,
  DecisionJobBrief,
  DecisionTreeAuditEntry,
  DecisionTreeState,
  DecisionTreeThresholds,
  FixActionType,
  NoulResult,
  ScoreResult,
  TerminalState,
} from './decision-tree-types';

export interface RunDecisionTreeOptions {
  brief: DecisionJobBrief;
  draftText?: string;
  metaTitle?: string;
  metaDescription?: string;
  clientOverlay?: ClientPolicyOverlay;
  thresholds?: Partial<DecisionTreeThresholds>;
  siteId?: string | null;
  openRouterApiKey?: string;
  onStepAudit?: (entry: DecisionTreeAuditEntry, state: DecisionTreeState) => void;
  /** Optional custom Gemini runner for unit testing or custom environments */
  geminiRunner?: (action: string, prompt: string, currentDraft: string) => Promise<string>;
}

function logAudit(
  state: DecisionTreeState,
  nodeId: string,
  nodeType: DecisionTreeAuditEntry['nodeType'],
  summary: string,
  data?: Record<string, unknown>,
  onStepAudit?: (entry: DecisionTreeAuditEntry, state: DecisionTreeState) => void,
): void {
  const entry: DecisionTreeAuditEntry = {
    timestamp: new Date().toISOString(),
    nodeId,
    nodeType,
    summary,
    data,
  };
  state.auditTrail.push(entry);
  state.currentNode = nodeId;
  onStepAudit?.(entry, state);
}

/**
 * Runs a targeted action using Gemini (Writer & Editor model).
 * Does not judge or score; executes narrow edits directly.
 */
async function callGeminiAction(args: {
  action: FixActionType | 'draft';
  instruction: string;
  brief: DecisionJobBrief;
  draftText: string;
  siteId?: string | null;
  apiKey?: string;
  geminiRunner?: (action: string, prompt: string, currentDraft: string) => Promise<string>;
}): Promise<string> {
  if (args.geminiRunner) {
    return args.geminiRunner(args.action, args.instruction, args.draftText);
  }

  const model = getBlogModel(args.siteId);
  const apiKey = args.apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness()) || '';

  const systemPrompt = `You are a professional editorial writer and copy editor.
Your task is to execute ONE specific edit task instructed by the editorial decision tree.
Follow the instructions precisely. Output ONLY the updated or new text without meta commentary.`;

  const userPrompt = `TASK: ${args.action.toUpperCase()}
SPECIFIC EDIT NOTE: ${args.instruction}

BRIEF CONTEXT:
Topic/Title: ${args.brief.topicTitle}
Primary Keyword: ${args.brief.primaryKeyword}
Must Include: ${args.brief.mustIncludePoints?.join('; ') || 'None'}

EXISTING DRAFT:
${args.draftText || '[EMPTY - WRITE INITIAL DRAFT]'}`;

  const messages: OpenRouterAppMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const res = await postOpenRouterAppChat({
      apiKey,
      model,
      messages,
      temperature: 0.7,
      maxTokens: 4000,
    });
    return res.content?.trim() || args.draftText;
  } catch (err) {
    logger.error(`[GeminiAction] Execution error for action ${args.action}:`, err);
    return args.draftText;
  }
}

/**
 * Deterministically inspects intake fields.
 */
function checkIntakeRequirements(brief: DecisionJobBrief): { ok: boolean; missingFields: string[] } {
  const missing: string[] = [];
  if (!brief.topicTitle?.trim() && !brief.primaryKeyword?.trim()) {
    missing.push('primaryKeyword or topicTitle');
  }
  return {
    ok: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Picks the single most important fix action based on failing dimensions.
 */
function pickFixAction(
  coreResults?: Record<string, unknown>,
  brandResults?: Record<string, unknown>,
  thresholds: DecisionTreeThresholds = DEFAULT_DECISION_THRESHOLDS,
): FixActionType {
  // 1. Thin content takes precedence
  const thin = coreResults?.thin_content as ScoreResult | undefined;
  if (thin && thin.score < thresholds.thinContentFloor) {
    return 'expand_body';
  }

  // 2. Off brief or intent match
  const onBrief = coreResults?.on_brief as NoulResult | undefined;
  if (onBrief && onBrief.yesProbability < thresholds.onBriefFloor) {
    return 'fix_intro';
  }

  // 3. Brand voice off
  const brand = brandResults?.brand_voice as ScoreResult | undefined;
  if (brand && brand.score < thresholds.brandVoiceFloor) {
    return 'fix_brand_voice';
  }

  // 4. Structure off
  const structure = brandResults?.structure_ok as NoulResult | undefined;
  if (structure && structure.yesProbability < 0.5) {
    return 'fix_seo_structure';
  }

  // 5. Meta titles or CTR
  const metaFit = brandResults?.title_meta_fit as ScoreResult | undefined;
  if (metaFit && metaFit.score < 1.5) {
    return 'fix_meta';
  }

  return 'fix_intro';
}

/**
 * Executes the General Content Production Decision Tree end-to-end.
 */
export async function runDecisionTreePipeline(options: RunDecisionTreeOptions): Promise<DecisionTreeState> {
  const thresholds: DecisionTreeThresholds = {
    ...DEFAULT_DECISION_THRESHOLDS,
    ...options.clientOverlay?.thresholdOverrides,
    ...options.thresholds,
  };

  const state: DecisionTreeState = {
    jobId: `tree-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    brief: options.brief,
    clientOverlay: options.clientOverlay,
    draftText: options.draftText || options.brief.existingDraft || '',
    metaTitle: options.metaTitle,
    metaDescription: options.metaDescription,
    currentNode: 'START',
    auditTrail: [],
    fixCount: 0,
    fixHistory: [],
  };

  logAudit(state, 'START', 'deterministic', 'Content job received into decision tree pipeline.', undefined, options.onStepAudit);

  // STEP 1: INTAKE_OK (Deterministic)
  const intakeCheck = checkIntakeRequirements(state.brief);
  if (!intakeCheck.ok) {
    const reason = `Missing required fields: ${intakeCheck.missingFields.join(', ')}`;
    state.terminalState = 'REJECT_INCOMPLETE_BRIEF';
    logAudit(state, 'INTAKE_FAIL', 'terminal', `Intake validation failed: ${reason}`, { missingFields: intakeCheck.missingFields }, options.onStepAudit);
    return state;
  }
  logAudit(state, 'INTAKE_OK', 'deterministic', 'Required fields present and validated.', undefined, options.onStepAudit);

  // STEP 2: CONTENT_TYPE Profile Resolution
  // If client or brief specifies content type, use it; otherwise assign via default profile
  const profileKey: ContentTypeProfileKey = 'blog_long';
  state.contentTypeProfile = CONTENT_TYPE_PROFILES[profileKey];
  logAudit(state, 'CONTENT_TYPE', 'deterministic', `Selected profile: ${state.contentTypeProfile.label} (Word count floor: ${state.contentTypeProfile.minWordCount})`, { profile: state.contentTypeProfile }, options.onStepAudit);

  // STEP 3: NEED_DRAFT (Deterministic check)
  if (!state.draftText.trim()) {
    logAudit(state, 'NEED_DRAFT', 'deterministic', 'No draft provided; routing to Gemini for initial generation.', undefined, options.onStepAudit);
    logAudit(state, 'GEMINI_DRAFT', 'action_gemini', 'Gemini drafting complete article from brief context.', undefined, options.onStepAudit);
    state.draftText = await callGeminiAction({
      action: 'draft',
      instruction: 'Draft a complete, authoritative article based on the brief topic, keywords, and outline.',
      brief: state.brief,
      draftText: '',
      siteId: options.siteId,
      apiKey: options.openRouterApiKey,
      geminiRunner: options.geminiRunner,
    });
  } else {
    logAudit(state, 'NEED_DRAFT', 'deterministic', 'Draft copy supplied. Skipping initial drafting straight to QA.', undefined, options.onStepAudit);
  }

  // QA & Fix Loop
  let passedAllGates = false;

  while (!passedAllGates && !state.terminalState) {
    // STEP 4: QA_BATCH_CORE (Liquid d1.1 Decision Batch)
    logAudit(state, 'QA_BATCH_CORE', 'decision_batch', 'Evaluating core QA batch (policy_safe, on_brief, intent_match, thin_content) via Liquid d1.1.', undefined, options.onStepAudit);

    const coreBatch = await evaluateDecisionBatch(
      {
        brief: state.brief,
        draftText: state.draftText,
        metaTitle: state.metaTitle,
        metaDescription: state.metaDescription,
        clientOverlay: state.clientOverlay,
        questions: QA_BATCH_CORE_QUESTIONS,
      },
      options.siteId,
      options.openRouterApiKey,
    );

    state.latestBatchResults = { ...state.latestBatchResults, ...coreBatch.results };

    const policySafe = coreBatch.results.policy_safe as NoulResult | undefined;
    const onBrief = coreBatch.results.on_brief as NoulResult | undefined;
    const intentMatch = coreBatch.results.intent_match as NoulResult | undefined;
    const thinContent = coreBatch.results.thin_content as ScoreResult | undefined;

    logAudit(state, 'QA_BATCH_CORE_RESULTS', 'decision_batch', `Core batch completed: policy_safe=${policySafe?.yesProbability.toFixed(2)}, on_brief=${onBrief?.yesProbability.toFixed(2)}, thin_content=${thinContent?.score}/${thinContent?.maxScore}`, { results: coreBatch.results }, options.onStepAudit);

    // Policy safety hard floor check
    if (policySafe && policySafe.yesProbability < thresholds.policySafeFloor) {
      state.terminalState = 'REJECT_POLICY';
      logAudit(state, 'REJECT_POLICY', 'terminal', `Rejected: Content policy safety probability (${policySafe.yesProbability.toFixed(2)}) is below hard floor (${thresholds.policySafeFloor}). No automated fix loops for policy violations.`, { policySafe }, options.onStepAudit);
      return state;
    }

    // Uncertainty band check on critical core noul questions
    const [uLow, uHigh] = thresholds.uncertaintyBand;
    if (
      (policySafe && policySafe.yesProbability >= uLow && policySafe.yesProbability <= uHigh) ||
      (onBrief && onBrief.yesProbability >= uLow && onBrief.yesProbability <= uHigh) ||
      (intentMatch && intentMatch.yesProbability >= uLow && intentMatch.yesProbability <= uHigh)
    ) {
      state.terminalState = 'HUMAN_REVIEW_UNCERTAIN';
      logAudit(state, 'HUMAN_REVIEW_UNCERTAIN', 'terminal', `Liquid d1.1 returned a critical score within uncertainty band [${uLow}, ${uHigh}]. Escalating to editorial human review.`, { coreResults: coreBatch.results }, options.onStepAudit);
      return state;
    }

    // Check if core requirements failed
    const minThin = state.clientOverlay?.minThinContentScoreOverride ?? state.contentTypeProfile?.minThinContentScore ?? thresholds.thinContentFloor;
    const coreFailed =
      (onBrief && onBrief.yesProbability < thresholds.onBriefFloor) ||
      (thinContent && thinContent.score < minThin);

    if (coreFailed) {
      const fixAction = pickFixAction(coreBatch.results, undefined, thresholds);
      const fixResult = await applyFixLoop(state, fixAction, options, thresholds);
      if (fixResult === 'exhausted') return state;
      continue; // Re-evaluate core batch
    }

    // STEP 5: QA_BATCH_BRAND_SEO (Liquid d1.1 Decision Batch)
    logAudit(state, 'QA_BATCH_BRAND_SEO', 'decision_batch', 'Evaluating Brand & SEO batch (brand_voice, structure, meta, readability) via Liquid d1.1.', undefined, options.onStepAudit);

    const brandBatch = await evaluateDecisionBatch(
      {
        brief: state.brief,
        draftText: state.draftText,
        metaTitle: state.metaTitle,
        metaDescription: state.metaDescription,
        clientOverlay: state.clientOverlay,
        questions: QA_BATCH_BRAND_SEO_QUESTIONS,
      },
      options.siteId,
      options.openRouterApiKey,
    );

    state.latestBatchResults = { ...state.latestBatchResults, ...brandBatch.results };

    const brandVoice = brandBatch.results.brand_voice as ScoreResult | undefined;
    const structureOk = brandBatch.results.structure_ok as NoulResult | undefined;
    const titleMetaFit = brandBatch.results.title_meta_fit as ScoreResult | undefined;

    logAudit(state, 'QA_BATCH_BRAND_SEO_RESULTS', 'decision_batch', `Brand & SEO batch completed: brand_voice=${brandVoice?.score}/${brandVoice?.maxScore}, structure_ok=${structureOk?.yesProbability.toFixed(2)}, title_meta_fit=${titleMetaFit?.score}/${titleMetaFit?.maxScore}`, { results: brandBatch.results }, options.onStepAudit);

    const brandFailed =
      (brandVoice && brandVoice.score < thresholds.brandVoiceFloor) ||
      (structureOk && structureOk.yesProbability < 0.5) ||
      (titleMetaFit && titleMetaFit.score < 1.0);

    if (brandFailed) {
      const fixAction = pickFixAction(coreBatch.results, brandBatch.results, thresholds);
      const fixResult = await applyFixLoop(state, fixAction, options, thresholds);
      if (fixResult === 'exhausted') return state;
      continue;
    }

    // STEP 6: PUBLISH_READY_CHECK (Final Gate)
    logAudit(state, 'PUBLISH_READY_CHECK', 'decision_batch', 'Evaluating final publish readiness gate with Liquid d1.1.', undefined, options.onStepAudit);

    const readyCheck = await evaluateDecisionBatch(
      {
        brief: state.brief,
        draftText: state.draftText,
        metaTitle: state.metaTitle,
        metaDescription: state.metaDescription,
        clientOverlay: state.clientOverlay,
        questions: [PUBLISH_READY_QUESTION],
      },
      options.siteId,
      options.openRouterApiKey,
    );

    const publishReady = readyCheck.results.publish_ready as NoulResult | undefined;
    const readyProb = publishReady?.yesProbability ?? 0.88;

    logAudit(state, 'PUBLISH_READY_RESULTS', 'decision_batch', `Publish readiness probability: ${readyProb.toFixed(2)}`, { publishReady }, options.onStepAudit);

    // Handle never_auto_publish or YMYL
    if (state.clientOverlay?.neverAutoPublish || state.brief.isYmylOrLegalSensitive) {
      state.terminalState = 'HUMAN_REVIEW_STANDARD';
      logAudit(state, 'HUMAN_REVIEW_STANDARD', 'terminal', 'Piece passed all editorial gates. Routed to human queue per client policy / YMYL sensitivity flag.', undefined, options.onStepAudit);
      return state;
    }

    // High probability auto-publish
    if (readyProb >= thresholds.publishReadyThreshold) {
      state.terminalState = 'READY_AUTO_PUBLISH';
      passedAllGates = true;
      logAudit(state, 'READY_AUTO_PUBLISH', 'terminal', `Passed all quality gates with high readiness probability (${readyProb.toFixed(2)} >= ${thresholds.publishReadyThreshold}). Ready for CMS automated publish.`, undefined, options.onStepAudit);
      return state;
    }

    // Uncertain publish ready
    if (readyProb >= uLow && readyProb <= uHigh) {
      state.terminalState = 'HUMAN_REVIEW_UNCERTAIN';
      logAudit(state, 'HUMAN_REVIEW_UNCERTAIN', 'terminal', `Publish readiness within uncertainty band (${readyProb.toFixed(2)}). Escalating to editorial team.`, undefined, options.onStepAudit);
      return state;
    }

    // Below pass threshold -> route to fix loop if remaining
    const fixAction = pickFixAction(coreBatch.results, brandBatch.results, thresholds);
    const fixResult = await applyFixLoop(state, fixAction, options, thresholds);
    if (fixResult === 'exhausted') return state;
  }

  return state;
}

/**
 * Handles fix loop counting, cap enforcement, and calling Gemini for the targeted fix.
 */
async function applyFixLoop(
  state: DecisionTreeState,
  action: FixActionType,
  options: RunDecisionTreeOptions,
  thresholds: DecisionTreeThresholds,
): Promise<'continue' | 'exhausted'> {
  state.fixCount += 1;
  state.fixHistory.push(action);

  const repeatedCount = state.fixHistory.filter((a) => a === action).length;

  if (state.fixCount > thresholds.maxFixLoops || repeatedCount > thresholds.maxRepeatedFixLoops) {
    state.terminalState = 'HUMAN_REVIEW_EXHAUSTED';
    logAudit(state, 'HUMAN_REVIEW_EXHAUSTED', 'terminal', `Hit maximum fix loop cap (${state.fixCount} total loops, ${repeatedCount} on ${action}). Routing to human editor queue.`, { fixHistory: state.fixHistory, fixCount: state.fixCount }, options.onStepAudit);
    return 'exhausted';
  }

  logAudit(state, 'FIX_ROUTER', 'decision_batch', `FIX_ROUTER selected targeted action: ${action} (Loop ${state.fixCount}/${thresholds.maxFixLoops})`, { action, fixCount: state.fixCount }, options.onStepAudit);

  const instructionMap: Record<FixActionType, string> = {
    fix_intro: 'Rewrite the opening introduction and hook. Ensure the primary search intent and topic are immediately clear and engaging.',
    expand_body: 'Expand thin sections with concrete depth, clear subheadings, and specific practical details answering the brief topic comprehensively.',
    fix_brand_voice: `Revise tone, vocabulary, and phrasing to adhere strictly to the client brand voice rubric: ${state.clientOverlay?.brandVoiceRubricText || 'authoritative, approachable, jargon-free'}.`,
    fix_seo_structure: 'Restructure headers (H2s and H3s) to form a logical hierarchical outline that addresses all key query facets.',
    fix_meta: 'Craft or refine the title and meta description for optimal click-through appeal within standard character limits.',
    add_faq: 'Add a helpful Frequently Asked Questions section with concise, direct answers.',
    factual_escalation: 'Highlight unverified claims for editorial review.',
  };

  logAudit(state, `GEMINI_FIX_${action}`, 'action_gemini', `Gemini executing targeted fix for ${action}: "${instructionMap[action]}"`, undefined, options.onStepAudit);

  state.draftText = await callGeminiAction({
    action,
    instruction: instructionMap[action],
    brief: state.brief,
    draftText: state.draftText || '',
    siteId: options.siteId,
    apiKey: options.openRouterApiKey,
    geminiRunner: options.geminiRunner,
  });

  return 'continue';
}

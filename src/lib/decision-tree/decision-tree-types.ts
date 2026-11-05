/**
 * Core type definitions for the Neo Pulse Decision Tree & Checker Pipeline.
 *
 * Implements a strict separation between:
 * - Decision Model (Liquid d1.1): fixed classifications, yes/no probabilities (noul), rubric scores.
 * - Generative Model (Gemini): writes or rewrites text for targeted fix tasks.
 */

export type QuestionKind = 'noul' | 'choice' | 'score';

export type NoulResult = {
  kind: 'noul';
  /** Calibrated probability that the condition is true (0.0 to 1.0) */
  yesProbability: number;
  reasoning?: string;
};

export type ChoiceResult = {
  kind: 'choice';
  selectedOption: string;
  confidence: number;
  reasoning?: string;
};

export type ScoreResult = {
  kind: 'score';
  score: number;
  maxScore: number;
  reasoning?: string;
};

export type QuestionResult = NoulResult | ChoiceResult | ScoreResult;

export interface DecisionQuestionDefinition {
  id: string;
  kind: QuestionKind;
  prompt: string;
  criteria?: string;
  /** Valid options when kind === 'choice' */
  options?: string[];
  /** Maximum score when kind === 'score' (e.g. 3 or 4) */
  maxScore?: number;
}

export type ContentTypeProfileKey =
  | 'blog_long'
  | 'blog_short'
  | 'service_page'
  | 'landing_page'
  | 'meta_only'
  | 'refresh_existing';

export interface ContentTypeProfile {
  key: ContentTypeProfileKey;
  label: string;
  description: string;
  minWordCount: number;
  minThinContentScore: number;
  requiredBatches: ('core' | 'brand_seo')[];
}

export type TerminalState =
  | 'REJECT_INCOMPLETE_BRIEF'
  | 'REJECT_POLICY'
  | 'HUMAN_REVIEW_UNCERTAIN'
  | 'HUMAN_REVIEW_STANDARD'
  | 'HUMAN_REVIEW_EXHAUSTED'
  | 'READY_AUTO_PUBLISH'
  | 'READY_FOR_SCHEDULING';

export type FixActionType =
  | 'fix_intro'
  | 'expand_body'
  | 'fix_brand_voice'
  | 'fix_seo_structure'
  | 'fix_meta'
  | 'add_faq'
  | 'factual_escalation';

export interface DecisionTreeThresholds {
  /** policy_safe yes probability below this floor triggers immediate REJECT_POLICY (default: 0.15) */
  policySafeFloor: number;
  /** Critical noul probability within [low, high] triggers HUMAN_REVIEW_UNCERTAIN (default: [0.40, 0.60]) */
  uncertaintyBand: [number, number];
  /** on_brief yes probability below this floor routes to fix loop (default: 0.35) */
  onBriefFloor: number;
  /** thin_content minimum score required to pass (default: 1.5 for blog_long) */
  thinContentFloor: number;
  /** brand_voice minimum rubric score (0-4) required to pass (default: 2.0) */
  brandVoiceFloor: number;
  /** publish_ready_check yes probability above which auto-publishing is eligible (default: 0.85) */
  publishReadyThreshold: number;
  /** Max total fix cycles before human escalation (default: 3) */
  maxFixLoops: number;
  /** Max fix cycles on the exact same fix action (default: 2) */
  maxRepeatedFixLoops: number;
}

export interface ClientPolicyOverlay {
  clientId?: string;
  clientName?: string;
  neverAutoPublish?: boolean;
  localRelevanceEnabled?: boolean;
  brandVoiceRubricText?: string;
  brandVoiceRubricDocId?: string;
  policyRedLines?: string[];
  bannedPhrases?: string[];
  minThinContentScoreOverride?: number;
  thresholdOverrides?: Partial<DecisionTreeThresholds>;
}

export interface DecisionJobBrief {
  clientId?: string;
  clientName?: string;
  primaryKeyword: string;
  topicTitle: string;
  searchIntent?: 'informational' | 'transactional' | 'commercial' | 'navigational';
  audience?: string;
  mustIncludePoints?: string[];
  outline?: string;
  existingDraft?: string;
  contentGoal?: 'new' | 'refresh';
  isYmylOrLegalSensitive?: boolean;
  destinationUrl?: string;
}

export interface DecisionTreeAuditEntry {
  timestamp: string;
  nodeId: string;
  nodeType: 'deterministic' | 'decision_batch' | 'action_gemini' | 'terminal';
  summary: string;
  data?: Record<string, unknown>;
}

export interface DecisionTreeState {
  jobId: string;
  brief: DecisionJobBrief;
  clientOverlay?: ClientPolicyOverlay;
  contentTypeProfile?: ContentTypeProfile;
  draftText?: string;
  metaTitle?: string;
  metaDescription?: string;
  currentNode: string;
  terminalState?: TerminalState;
  auditTrail: DecisionTreeAuditEntry[];
  fixCount: number;
  fixHistory: FixActionType[];
  latestBatchResults?: Record<string, QuestionResult>;
}

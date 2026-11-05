import type {
  ContentTypeProfile,
  ContentTypeProfileKey,
  DecisionQuestionDefinition,
  DecisionTreeThresholds,
} from './decision-tree-types';

export const DEFAULT_DECISION_THRESHOLDS: DecisionTreeThresholds = {
  policySafeFloor: 0.15,
  uncertaintyBand: [0.40, 0.60],
  onBriefFloor: 0.35,
  thinContentFloor: 1.5,
  brandVoiceFloor: 2.0,
  publishReadyThreshold: 0.85,
  maxFixLoops: 3,
  maxRepeatedFixLoops: 2,
};

export const CONTENT_TYPE_PROFILES: Record<ContentTypeProfileKey, ContentTypeProfile> = {
  blog_long: {
    key: 'blog_long',
    label: 'Blog Long-Form',
    description: 'Informational or guide-style blog post with multiple sections; depth and comprehensive coverage expected.',
    minWordCount: 1200,
    minThinContentScore: 1.5,
    requiredBatches: ['core', 'brand_seo'],
  },
  blog_short: {
    key: 'blog_short',
    label: 'Blog Short Update',
    description: 'Short update or announcement with lower depth bar.',
    minWordCount: 500,
    minThinContentScore: 1.0,
    requiredBatches: ['core', 'brand_seo'],
  },
  service_page: {
    key: 'service_page',
    label: 'Service Commercial Page',
    description: 'Commercial service description; trust signals, clear CTA, and conversion elements matter.',
    minWordCount: 800,
    minThinContentScore: 2.0,
    requiredBatches: ['core', 'brand_seo'],
  },
  landing_page: {
    key: 'landing_page',
    label: 'Campaign Landing Page',
    description: 'Campaign landing page with tight message match to target offer.',
    minWordCount: 400,
    minThinContentScore: 1.5,
    requiredBatches: ['core', 'brand_seo'],
  },
  meta_only: {
    key: 'meta_only',
    label: 'Meta Titles & Descriptions Only',
    description: 'Meta titles and descriptions only; no article body draft in this job.',
    minWordCount: 0,
    minThinContentScore: 0,
    requiredBatches: ['brand_seo'],
  },
  refresh_existing: {
    key: 'refresh_existing',
    label: 'Content Refresh / Rewrite',
    description: 'Rewrite or expand an existing URL content based on legacy draft and new brief.',
    minWordCount: 1000,
    minThinContentScore: 1.5,
    requiredBatches: ['core', 'brand_seo'],
  },
};

export const QA_BATCH_CORE_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'on_brief',
    kind: 'noul',
    prompt: 'Does the draft address the brief topic, primary keyword, intent, and must-include points?',
    criteria: '1.0 = completely faithful to brief; 0.0 = completely off-topic or ignores mandatory instructions.',
  },
  {
    id: 'policy_safe',
    kind: 'noul',
    prompt: 'Does the draft avoid disallowed claims, competitor disparagement, false guarantees, and client-specific red lines?',
    criteria: '1.0 = completely safe; 0.0 = severe policy violation or dangerous claim.',
  },
  {
    id: 'intent_match',
    kind: 'noul',
    prompt: 'Does the piece match the search or audience intent described in the brief (e.g. informational education vs transactional service evaluation)?',
    criteria: '1.0 = perfect intent alignment; 0.0 = mismatched intent.',
  },
  {
    id: 'thin_content',
    kind: 'score',
    prompt: 'Evaluate depth and completeness against what the content profile expects (0-3 depth scale).',
    criteria: '0 = severely thin, empty fluff; 1 = superficial coverage; 2 = solid standard depth; 3 = comprehensive and authoritative.',
    maxScore: 3,
  },
];

export const QA_BATCH_BRAND_SEO_QUESTIONS: DecisionQuestionDefinition[] = [
  {
    id: 'brand_voice',
    kind: 'score',
    prompt: 'Evaluate the writing voice, perspective, and terminology against the client brand voice rubric (0-4 scale).',
    criteria: '0 = clearly off-brand or generic robot voice; 1 = weak tone; 2 = acceptable baseline; 3 = good match; 4 = strong, distinct brand voice.',
    maxScore: 4,
  },
  {
    id: 'local_relevance',
    kind: 'noul',
    prompt: 'If this client operates in local markets, does the draft naturally incorporate geographic relevance and service context without awkward keyword stuffing?',
    criteria: '1.0 = authentic local relevance; 0.0 = generic or stuffed.',
  },
  {
    id: 'structure_ok',
    kind: 'noul',
    prompt: 'Do headings (H2, H3), lists, and formatting logically organize the material and align with the brief outline?',
    criteria: '1.0 = well-structured with clear hierarchy; 0.0 = disorganized, flat, or missing key sections.',
  },
  {
    id: 'title_meta_fit',
    kind: 'score',
    prompt: 'Evaluate title and meta description quality and search appeal (0-3 scale).',
    criteria: '0 = missing or unusable; 1 = weak CTR or over character limits; 2 = good search snippet; 3 = exceptional CTR appeal.',
    maxScore: 3,
  },
  {
    id: 'keyword_natural',
    kind: 'noul',
    prompt: 'Does the wording read smoothly and naturally for human readers, without unnatural keyword stuffing or robotic cadence?',
    criteria: '1.0 = fluid human readability; 0.0 = stiff, repetitive keyword stuffing.',
  },
];

export const PUBLISH_READY_QUESTION: DecisionQuestionDefinition = {
  id: 'publish_ready',
  kind: 'noul',
  prompt: 'Is this piece ready to publish directly given all client editorial standards and the draft as written?',
  criteria: '1.0 = publication-grade content ready for live visitors; 0.0 = requires editing before publication.',
};

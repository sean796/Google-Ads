/**
 * Global forbidden-word blocklist.
 * OpenRouter system prompts: prepended once via appendUniversalContentRulesToSystemPrompt.
 * Saved artifacts: checklist header + blueprint forbiddenWordsPolicy once (never per-agent features).
 * Upload: scrubForbiddenWordsFromHtml before WordPress publish.
 */

import { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";
import { removeEmDashes } from "@/lib/content-generation/sanitizer/typography-rules";
import { stripIllustrativeMarkersFromChecklistItem } from "@/lib/content-optimization/illustrative-h2";
import { isLlmAuditAuthorityDumpChecklistItem } from "@/lib/content-optimization/harness-heading-titles";

export { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";

/** Single banned words (any use in titles, body, meta, FAQ, rationale). */
export const GLOBAL_FORBIDDEN_WORDS = [
  "delve",
  "leverage",
  "robust",
  "comprehensive",
  "navigate",
  "landscape",
  "tapestry",
  "utilize",
  "seamlessly",
  "cutting-edge",
  "state-of-the-art",
  "ever-evolving",
  "myriad",
  "plethora",
  "paramount",
  "foster",
  "embark",
  "holistic",
  "synergy",
  "elevate",
  "revolutionary",
  "transformative",
  "unlock",
  "crucial",
  "vital",
] as const;

/** Banned multi-word phrases and importance-claim patterns. */
export const GLOBAL_FORBIDDEN_PHRASES = [
  "is crucial for",
  "is crucial to",
  "is vital for",
  "is vital to",
  "understanding these",
  "is essential for",
  "is essential to",
  "is key to",
  "plays a crucial role",
  "plays a vital role",
  "it's crucial that",
  "it is crucial that",
  "it's vital that",
  "it is vital that",
  "crucial to note",
  "vital to note",
  "it's important to note",
  "it is important to note",
  "needless to say",
  "dive into",
  "deep dive",
  "at the end of the day",
  "in today's world",
  "in conclusion",
  "game-changer",
  " for more.",
  "fits your SEO plan",
  "See how",
  "this article explores",
  "this article provides",
  "this article covers",
  "this article outlines",
  "this guide explores",
  "this guide provides",
  "this guide outlines",
  "this guide covers",
  "this article also presents",
  "in this article,",
  "in this guide,",
  "we will explore",
  "let's explore",
  "when it comes to",
  "whether you're looking",
  "look no further",
  "rest assured",
  "tailored to your needs",
  "functional and aesthetic",
  "aesthetic appeal and",
  "we often find",
  "we often observe",
  "we frequently recommend that",
  "we find that many",
  "this guide walks",
  "this guide walks through",
  "families can review",
  "readers can explore",
  "our team",
  "our experts",
  "our professionals",
  "it is worth noting",
  "it's worth noting",
  "in the realm of",
  "at the forefront",
  "stands as a testament",
  "peace of mind",
  "Related reading:",
  "related reading:",
] as const;

const FORBIDDEN_SENTENCE_SHAPES = `- Never write importance-claim openers like "Understanding [topic] is crucial/vital for [audience] to [verb]…". State facts and actions directly.
- Example NEVER to write: "Understanding these reforms is crucial for physicians to adapt their practices effectively."
- Write instead: "Physicians need to update billing workflows before the deadline." (direct fact, no padding.)
- Never open with a dictionary definition ("{topic} offers/are/provide {generic benefit}"). Lead with a sourced fact or number.
- Never use AI-template filler listed above (our team, this article provides, when it comes to, whether you're looking).`;

/** Max uses of understand-forms across one full article (title, body, FAQ, meta). Prefer 1. */
export const UNDERSTAND_FORMS_ARTICLE_MAX = 2;

export const UNDERSTAND_FORMS_USAGE_RULE = `- **HEADINGS (H2/H3/H4): ZERO TOLERANCE**: Never use understand, understanding, understands, understood, navigating, or navigate in any heading or agent title. Use active, direct titles (e.g. "5 New PST Categories", "2026 BC PST Expansion Rules", "How Businesses Comply").
- **Body copy**: understand-forms at most **once** per full article when possible; **hard maximum 2** total. Never repeat in every section.
- **Active voice (mandatory)**: Write direct statements ("Businesses must register by…") not passive padding ("Understanding X is important", "Navigating compliance requires…").`;

export const ACTIVE_VOICE_HEADING_RULE = `[HEADING STYLE]: Active, direct H2/H3 titles only. FORBIDDEN in headings: Understanding, Understand, Navigating, Navigate, Overview (except the fixed Overview block). Good: "5 New PST Categories", "2026 BC PST Rules for Businesses", "How to Register for PST". Bad: "Understanding the 5 New PST Categories", "Navigating the 2026 BC PST Expansion".`;

/** Full policy block (system prompts + saved artifact headers). */
export const GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK = `WORD BLACKLIST (mandatory; all clients, all sitemap/content output):
- Never use these words: ${GLOBAL_FORBIDDEN_WORDS.join(", ")}.
- Never use these phrases: ${GLOBAL_FORBIDDEN_PHRASES.join("; ")}.
- Punctuation: never use em dash (U+2014) or en dash (U+2013). Use a comma, period, or hyphen-minus for short joins. Never use HTML &mdash; or &ndash; entities in output.
- Trademarks & Copyrights (mandatory): always respect and include official registered trademark (®), trademark (™), or copyright (©) symbols on proprietary manufacturer product lines, automation systems, and brand names where applicable (infer from SERP research brief, page context, and official manufacturer naming, including inside link anchor text and prose).
- Customer-facing language in tables and prose (mandatory): never use internal estimator, invoice, or quote-sheet jargon such as "opening" / "openings" (e.g. "(Single Opening)", "(5 Openings)"), internal fabric/swatch SKU codes, or work-order shorthand in tables or prose. Always use plain customer-facing terms (e.g. "single window", "5 windows", or describe the fabric/opacity in plain English).
${FORBIDDEN_SENTENCE_SHAPES}
${UNDERSTAND_FORMS_USAGE_RULE}
- ${ACTIVE_VOICE_HEADING_RULE.replace(/\[HEADING STYLE\]: /, "")}
- Applies to titles, headings, body, meta, FAQ, excerpts, and rationale. Use plain, direct language.`;

export const FORBIDDEN_WORDS_MANDATORY_TAG = "[FORBIDDEN_WORDS - MANDATORY GLOBAL]";

export const FORBIDDEN_WORDS_USER_PROMPT_REMINDER = `[WORD BLACKLIST - NON-NEGOTIABLE]: Obey the full WORD BLACKLIST in the system prompt. Zero banned words in this section (headings, body, lists, link text). Never use crucial, vital, navigate, navigating, understand, understanding, or any word or phrase listed in the system blacklist.`;

export const FORBIDDEN_WORDS_CHECKLIST_SUFFIX = `${FORBIDDEN_WORDS_MANDATORY_TAG}: ${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}`;

export const FORBIDDEN_WORDS_BLUEPRINT_FEATURE = FORBIDDEN_WORDS_CHECKLIST_SUFFIX;

export const ARTICLE_WORD_FREQUENCY_CHECKLIST_ITEM = `[WORD_FREQUENCY]: Full article; understand-forms max ${UNDERSTAND_FORMS_ARTICLE_MAX} in body only (zero in headings). ${ACTIVE_VOICE_HEADING_RULE}`;

const CHECKLIST_FILE_HEADER = `${FORBIDDEN_WORDS_MANDATORY_TAG}\n${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}\n\n---\n\n`;

const FORBIDDEN_TAG = "[FORBIDDEN_WORDS";
const WORD_BLACKLIST_MARKER = "WORD BLACKLIST (mandatory";
const WORD_FREQUENCY_TAG = "[WORD_FREQUENCY]";

const SYSTEM_PROMPT_BLACKLIST_PREFIX = `${FORBIDDEN_WORDS_MANDATORY_TAG}\n${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}\n\n`;

const BLACKLIST_RAG_OPEN = "=== WORD BLACKLIST (READ ONLY: master rule; read fully before any output) ===";
const BLACKLIST_RAG_CLOSE = "=== END WORD BLACKLIST ===";

/** Full policy text for the Content Optimizer Generated files drawer and downloads. */
export function buildWordBlacklistDownloadText(): string {
  return `${FORBIDDEN_WORDS_MANDATORY_TAG}\n${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}\n\n${ARTICLE_WORD_FREQUENCY_CHECKLIST_ITEM}`;
}

/** Read-only RAG doc prepended to content harness user prompts. */
export function buildBlacklistRagBlock(): string {
  return `${BLACKLIST_RAG_OPEN}
${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}
${BLACKLIST_RAG_CLOSE}

You MUST read and obey the WORD BLACKLIST above before writing anything. Zero tolerance for banned words and phrases.`;
}

/** Idempotent: prepends blacklist RAG block to a user prompt. */
export function prependBlacklistRagToUserPrompt(userPrompt: string): string {
  if (userPrompt.includes(BLACKLIST_RAG_OPEN)) {
    return userPrompt;
  }
  return `${buildBlacklistRagBlock()}\n\n${userPrompt}`;
}

export type BlacklistRagMessage = { role: string; content: string };

/** Prepends RAG block to the first user message in an OpenRouter messages array. */
export function injectBlacklistRagIntoMessages<T extends BlacklistRagMessage>(messages: T[]): T[] {
  const idx = messages.findIndex((m) => m.role === "user");
  if (idx < 0) return messages;
  return messages.map((m, i) =>
    i === idx ? { ...m, content: prependBlacklistRagToUserPrompt(m.content) } : m,
  );
}

const SYSTEM_OBEY_USER_BLACKLIST_LINE =
  "Obey the WORD BLACKLIST block in the user message before any output. Zero banned words in titles, headings, body, meta, FAQ, and link text.";

/** Prepend word blacklist once to OpenRouter system prompts (idempotent). */
export function appendUniversalContentRulesToSystemPrompt(systemPrompt: string): string {
  if (systemPrompt.includes(WORD_BLACKLIST_MARKER)) {
    if (!systemPrompt.includes(SYSTEM_OBEY_USER_BLACKLIST_LINE)) {
      return `${SYSTEM_OBEY_USER_BLACKLIST_LINE}\n\n${systemPrompt}`;
    }
    return systemPrompt;
  }
  return `${SYSTEM_PROMPT_BLACKLIST_PREFIX}${SYSTEM_OBEY_USER_BLACKLIST_LINE}\n\n${systemPrompt}`;
}

const FORBIDDEN_HEADING_PREFIX_RE =
  /^(understanding|understand|navigating|navigate)\s+(the\s+|how\s+to\s+|what\s+)?/i;

/** Strips banned understand/navigate phrasing from H2/H3/agent titles. */
export function sanitizeForbiddenHeadingTitle(title: string): string {
  let t = title.trim();
  if (!t) return title;
  if (/^overview$/i.test(t)) return t;
  if (isFaqStyleHeadingTitle(t)) return "";
  const stripped = t.replace(FORBIDDEN_HEADING_PREFIX_RE, "").trim();
  if (!stripped) return title.trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function stripInjectedBlacklistText(item: string): string {
  let out = item.trim();
  const tagIdx = out.indexOf(FORBIDDEN_TAG);
  if (tagIdx !== -1) out = out.slice(0, tagIdx).trimEnd();
  const blIdx = out.indexOf(WORD_BLACKLIST_MARKER);
  if (blIdx !== -1) out = out.slice(0, blIdx).trimEnd();
  const wfIdx = out.indexOf(WORD_FREQUENCY_TAG);
  if (wfIdx !== -1) out = out.slice(0, wfIdx).trimEnd();
  return out.trim();
}

/** Rewrites checklist lines that prescribe forbidden heading titles. Removes any injected blacklist text. */
export function sanitizeForbiddenWordsInChecklistItem(item: string): string {
  let out = stripInjectedBlacklistText(item);
  const fixQuotedHeading = (inner: string) => sanitizeForbiddenHeadingTitle(inner);
  out = out.replace(
    /titled\s+"((?:Understanding|Understand|Navigating|Navigate)[^"]*)"/gi,
    (_m, inner) => `titled "${fixQuotedHeading(inner)}"`,
  );
  out = out.replace(
    /header\s+(?:like\s+)?"((?:Understanding|Understand|Navigating|Navigate)[^"]*)"/gi,
    (_m, inner) => `header like "${fixQuotedHeading(inner)}"`,
  );
  out = out.replace(
    /e\.g\.,\s*"((?:Understanding|Understand|Navigating|Navigate)[^"]*)"/gi,
    (_m, inner) => `e.g., "${fixQuotedHeading(inner)}"`,
  );
  out = out.replace(
    /for\s+H2\s+"((?:Understanding|Understand|Navigating|Navigate)[^"]*)"/gi,
    (_m, inner) => `for H2 "${fixQuotedHeading(inner)}"`,
  );
  out = out.replace(
    /\*\*H2:\s*((?:Understanding|Understand|Navigating|Navigate)[^*]+)\*\*/gi,
    (_m, inner) => `**H2: ${fixQuotedHeading(inner.trim())}**`,
  );
  out = out.replace(
    /\*\*H3:\s*((?:Understanding|Understand|Navigating|Navigate)[^*]+)\*\*/gi,
    (_m, inner) => `**H3: ${fixQuotedHeading(inner.trim())}**`,
  );
  out = out.replace(
    /anchor(?:\s+text)?\s+(?:like\s+)?"((?:understanding|understand|navigating|navigate)[^"]*)"/gi,
    (_m, inner) => {
      const cleaned = inner.replace(/\b(understanding|understand|navigating|navigate)\b/gi, "").trim();
      return cleaned ? `anchor text like "${cleaned}"` : 'anchor text like "compliance steps"';
    },
  );
  out = out.replace(/\bhow we understand the area\b/gi, "how we serve businesses in the area");
  out = out.replace(/\bexplain(?:ing)? how we understand\b/gi, "explain how we serve");
  out = out.replace(/\bunderstand the area\b/gi, "serve the local market");
  out = out.replace(
    /(\[LIST\]:[^\n]*)\bunderstand\b/gi,
    (_m, prefix: string) => `${prefix.replace(/\bunderstand\b/gi, "serve")}`,
  );
  return out;
}

function checklistItemHasFaqStyleHeading(item: string): boolean {
  for (const match of item.matchAll(/"([^"]+)"/g)) {
    if (isFaqStyleHeadingTitle(match[1] ?? "")) return true;
  }
  if (/\[FAQ\]/i.test(item)) return true;
  return false;
}

/** Clean checklist for LLM pipeline (blueprint gen). Sanitize only; no blacklist text. */
export function prepareChecklistForPipeline(
  checklist: string[],
  options?: { allowFaqItems?: boolean; sapEntity?: string },
): string[] {
  if (checklist.length === 0) return checklist;
  const sapEntity = options?.sapEntity?.trim();
  let out = checklist.map(sanitizeForbiddenWordsInChecklistItem);
  if (sapEntity) {
    out = out.slice(0, 7);
  }
  const firstIllustrative = out.findIndex(
    (item) => /\[illustrative\]/i.test(item) && !/\[FAQ\]/i.test(item),
  );
  out = out.map((item, index) => {
    if (/\[FAQ\]/i.test(item)) return item;
    if (firstIllustrative >= 0 && index !== firstIllustrative) {
      return stripIllustrativeMarkersFromChecklistItem(item);
    }
    return item;
  });
  return out.filter((item) => {
      if (item.length === 0) return false;
      if (isLlmAuditAuthorityDumpChecklistItem(item)) return false;
      if (options?.allowFaqItems) return true;
      return !checklistItemHasFaqStyleHeading(item);
    });
}

/** Saved checklist download: prepend full policy header once, then numbered content lines. */
export function formatChecklistFileContent(checklist: string[]): string {
  const sanitized = checklist.map(sanitizeForbiddenWordsInChecklistItem).filter((item) => item.length > 0);
  const numbered = sanitized.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return `${CHECKLIST_FILE_HEADER}${numbered}`;
}

/** Saved blueprint JSON: forbiddenWordsPolicy once at top; agents without blacklist features. */
export function formatBlueprintFileContent(blueprint: Record<string, unknown>): string {
  const bp = blueprint as BlueprintLike & Record<string, unknown>;
  const { forbiddenWordsPolicy: _drop, ...rest } = bp;
  const agents = sanitizeBlueprintAgentsForPipeline(bp.agents ?? []);
  return JSON.stringify(
    {
      forbiddenWordsPolicy: GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK,
      ...rest,
      agents,
    },
    null,
    2,
  );
}

const UNDERSTAND_FORMS_RE = /\b(understand(?:ing|s)?|understood)\b/gi;
const HEADING_TAG_RE = /<(h[2-4])([^>]*)>([\s\S]*?)<\/\1>/gi;

const PROMPT_INPUT_REPLACEMENTS: [RegExp, string][] = [
  [/\bnavigating\b/gi, "managing"],
  [/\bnavigate\b/gi, "manage"],
  [/\bcrucial\b/gi, "required"],
  [/\bvital\b/gi, "required"],
  [/\bunderstanding\b/gi, "reviewing"],
  [/\bunderstands\b/gi, "reviews"],
  [/\bunderstood\b/gi, "reviewed"],
  [/\bunderstand\b/gi, "review"],
];

/** Clean blueprint features/descriptions before they enter section prompts. */
export function sanitizeForbiddenWordsInPromptText(text: string): string {
  let out = text;
  for (const [re, rep] of PROMPT_INPUT_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  for (const phrase of GLOBAL_FORBIDDEN_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  for (const word of GLOBAL_FORBIDDEN_WORDS) {
    if (word === "navigate" || word === "crucial" || word === "vital") continue;
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

export function countUnderstandFormsInHtml(html: string): number {
  const plain = html.replace(/<[^>]+>/g, " ");
  const matches = plain.match(UNDERSTAND_FORMS_RE);
  return matches?.length ?? 0;
}

export function listForbiddenWordViolations(
  html: string,
  options?: { priorUnderstandCount?: number },
): string[] {
  if (!html.trim()) return [];
  const violations: string[] = [];
  const headingRe = new RegExp(HEADING_TAG_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const inner = m[3].replace(/<[^>]+>/g, "").trim();
    if (headingHasForbiddenWords(inner)) {
      violations.push(`forbidden heading: ${inner.slice(0, 80)}`);
    }
  }
  const lower = html.toLowerCase();
  for (const word of GLOBAL_FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      violations.push(`banned word: ${word}`);
    }
  }
  for (const phrase of GLOBAL_FORBIDDEN_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(`banned phrase: ${phrase}`);
    }
  }
  const prior = options?.priorUnderstandCount ?? 0;
  const understandInSection = countUnderstandFormsInHtml(html);
  if (prior + understandInSection > UNDERSTAND_FORMS_ARTICLE_MAX) {
    violations.push(
      `understand-forms exceed article limit (${prior + understandInSection} > ${UNDERSTAND_FORMS_ARTICLE_MAX})`,
    );
  }
  return violations;
}

function stripForbiddenWordsFromText(text: string): string {
  let out = text;
  for (const phrase of GLOBAL_FORBIDDEN_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  for (const word of GLOBAL_FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

function headingHasForbiddenWords(inner: string): boolean {
  if (/\b(understand(?:ing|s)?|understood)\b/i.test(inner)) return true;
  const lower = inner.toLowerCase();
  for (const word of GLOBAL_FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) return true;
  }
  return false;
}

/** True when section HTML violates heading, hard-ban word, or article understand limits. */
export function sectionHtmlHasForbiddenWords(
  html: string,
  priorUnderstandCount?: number,
): boolean {
  return listForbiddenWordViolations(html, { priorUnderstandCount }).length > 0;
}

/** Deterministic scrub after LLM output: em/en dashes, then banned words/phrases. */
export function scrubOverviewContentOutput(html: string): string {
  if (!html.trim()) return html;
  return scrubForbiddenWordsFromHtml(removeEmDashes(html));
}

/** Deterministic scrub of banned words/phrases before WordPress upload. */
export function scrubForbiddenWordsFromHtml(html: string): string {
  if (!html.trim()) return html;
  let out = removeEmDashes(html);
  out = out.replace(HEADING_TAG_RE, (_full, tag: string, attrs: string, inner: string) => {
    const plain = inner.replace(/<[^>]+>/g, "").trim();
    let fixed = sanitizeForbiddenHeadingTitle(plain);
    fixed = stripForbiddenWordsFromText(fixed);
    return `<${tag}${attrs}>${fixed}</${tag}>`;
  });
  for (const phrase of GLOBAL_FORBIDDEN_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  for (const word of GLOBAL_FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, "");
  }
  let understandCount = 0;
  out = out.replace(UNDERSTAND_FORMS_RE, (match) => {
    understandCount += 1;
    if (understandCount <= UNDERSTAND_FORMS_ARTICLE_MAX) return match;
    return "";
  });
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1");
}

/** Alias: sanitize checklist lines only. */
export function enforceForbiddenWordsOnChecklist(checklist: string[]): string[] {
  return prepareChecklistForPipeline(checklist);
}

type BlueprintAgentLike = { title?: string; description?: string; features?: unknown[] };
type BlueprintLike = { agents?: BlueprintAgentLike[]; forbiddenWordsPolicy?: string };

export function stripForbiddenWordsFeatures(features: unknown[]): unknown[] {
  if (!Array.isArray(features)) return [];
  return features.filter(
    (f) => !(typeof f === "string" && f.trim().toLowerCase().startsWith("[forbidden_words")),
  );
}

function agentHasFaqFeature(features: unknown[]): boolean {
  return features.some(
    (f) => typeof f === "string" && /^\[FAQ\]/i.test(f.trim()),
  );
}

/** Pipeline/in-memory: sanitize titles, descriptions, features; strip blacklist metadata. */
function agentHasIllustrativeFeature(features: unknown[]): boolean {
  return features.some(
    (f) => typeof f === "string" && f.toLowerCase().trim().startsWith("[illustrative]"),
  );
}

function stripIllustrativeFeatures(features: unknown[]): unknown[] {
  return features.filter((f) => {
    if (typeof f !== "string") return true;
    const lo = f.toLowerCase().trim();
    return !lo.startsWith("[illustrative]") && !lo.startsWith("[blockquote]");
  });
}

export function sanitizeBlueprintAgentsForPipeline<T extends BlueprintAgentLike>(
  agents: T[],
  options?: { allowFaqAgents?: boolean; sapEntity?: string },
): T[] {
  const sapEntity = options?.sapEntity?.trim();
  const firstIllustrative = !sapEntity
    ? agents.findIndex((agent) => agentHasIllustrativeFeature(Array.isArray(agent.features) ? agent.features : []))
    : -1;
  return agents
    .filter((agent) => {
      if (options?.allowFaqAgents) return true;
      const title = typeof agent.title === "string" ? agent.title.trim() : "";
      if (title && isFaqStyleHeadingTitle(title)) return false;
      const features = Array.isArray(agent.features) ? agent.features : [];
      if (agentHasFaqFeature(features)) return false;
      return true;
    })
    .map((agent, index) => {
      const rawTitle = typeof agent.title === "string" ? agent.title : "";
      const features = Array.isArray(agent.features) ? agent.features : [];
      const sanitizedTitle = rawTitle ? sanitizeForbiddenHeadingTitle(rawTitle) : agent.title;
      const title =
        typeof sanitizedTitle === "string" && sanitizedTitle.trim() ? sanitizedTitle : agent.title;
      const description =
        typeof agent.description === "string"
          ? sanitizeForbiddenWordsInPromptText(agent.description)
          : agent.description;
      const rawFeatures = stripForbiddenWordsFeatures(features);
      let sanitizedFeatures = rawFeatures.map((f) =>
        typeof f === "string" ? sanitizeForbiddenWordsInPromptText(f) : f,
      );
      const keepIllustrative = sapEntity
        ? index === 3
        : index === firstIllustrative;
      if (!keepIllustrative) {
        sanitizedFeatures = stripIllustrativeFeatures(sanitizedFeatures);
      }
      return {
        ...agent,
        step: index + 1,
        title,
        description,
        features: sanitizedFeatures,
      };
    });
}

/** @deprecated Use sanitizeBlueprintAgentsForPipeline; kept for existing imports. */
export function enforceForbiddenWordsOnBlueprintAgents<T extends BlueprintAgentLike>(agents: T[]): T[] {
  return sanitizeBlueprintAgentsForPipeline(agents);
}

/** In-memory blueprint after generation: sanitize titles; no forbiddenWordsPolicy on object. */
export function enforceForbiddenWordsOnBlueprint<T extends BlueprintLike>(
  blueprint: T,
  options?: { sapEntity?: string },
): T {
  const { forbiddenWordsPolicy: _drop, ...rest } = blueprint as T & { forbiddenWordsPolicy?: string };
  return {
    ...rest,
    agents: sanitizeBlueprintAgentsForPipeline(blueprint.agents ?? [], {
      sapEntity: options?.sapEntity,
    }),
  } as T;
}

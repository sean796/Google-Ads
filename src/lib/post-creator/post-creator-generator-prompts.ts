/**
 * Generator checklist/blueprint prompt assembly (single source for client + server export).
 */
import type { KeywordData } from "@/lib/keyword-types";
import {
  ARTICLE_MAX_WORDS,
  buildArticleLengthChecklistBlock,
  buildBlueprintArticleLengthBlock,
  buildFocusedArticlePurpose,
} from "@/lib/content-generation/article-length-policy";
import { INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX } from "@/lib/content-generation/internal-link-placeholders";
import { formatBlogPlayLinkTargetsPrompt } from "@/lib/bulk/bulk-generation-wp-inventory";
import { GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK } from "@/lib/content-word-blocklist";
import { AUTHENTICITY_CHECKLIST_RULE } from "@/lib/prompt-builders/core";
import { formatResearchAsOfLabel } from "@/lib/content-optimization/topic-research-fanout";
import {
  formatSapChecklistExample,
  formatSapPageChecklistBlock,
} from "@/lib/prompt-builders/sap-page-template";
import { isCompetitorCsvKeyword } from "@/lib/competitor-research/competitor-csv-row";
import {
  formatCompetitorComparisonChecklistBlock,
  formatCompetitorChecklistExample,
} from "@/lib/prompt-builders/competitor-comparison-page-template";

const LINK_FEATURE_PLACEHOLDER = `[LINK]: ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}`;

export type GeneratorWordPressPost = {
  id?: number;
  slug?: string;
  title: string;
  excerpt?: string;
  link: string;
  date_gmt?: string;
  collection?: string;
  postType?: string;
};

export type ChecklistPromptContext = {
  title: string;
  keywordData: KeywordData;
  selectedKeywords: string[];
  selectedH2Sections: string[];
  userPrompt?: string;
  connectedSite?: { name: string; siteUrl: string };
  wordPressPosts?: GeneratorWordPressPost[];
  paaQuestions?: Array<{ question: string }>;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  bucketReadFirstBlock?: string;
  entity?: string;
  firstPartyAuthorityBlock?: string;
};

export type BlueprintPromptContext = {
  title: string;
  purpose: string;
  keyword: string;
  checklist: string[];
  userPrompt?: string;
  connectedSite?: { name: string; siteUrl: string };
  wordPressPosts?: GeneratorWordPressPost[];
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  firstPartyAuthorityBlock?: string;
};

function keywordSection(keywordData: KeywordData, selectedKeywords: string[]): string {
  const primary = keywordData.keyword.toLowerCase();
  const selected = selectedKeywords.map((k) => k.toLowerCase()).join(", ") || "None";
  return `--- Keyword Context ---
Primary Keyword: ${primary}
Search Volume: ${keywordData.searchVolume?.toLocaleString?.() ?? keywordData.searchVolume ?? "N/A"}
Difficulty: ${keywordData.difficulty ?? "N/A"}/100
Intent: ${keywordData.intent ?? "N/A"}
Selected Keywords: ${selected}

FOCUS KEYWORD DENSITY: Target minimum ~1.0% focus keyword density (exact phrase + combinations), not ~0.5%. For connected-site homeowner articles with first-party authority: prefer semantic variants; exact phrase in Answer plus at most ~4 additional natural body mentions; article-wide cap ~5 exact-phrase uses in prose.
EXACT PRIMARY PER H2: Include the exact primary keyword phrase once in every H2 section body when natural (not in every sentence). Skip exact phrase in a section if the prior body section already used it. Intro: at most one exact primary, not required in sentence one.
PARAGRAPH LENGTH: Moderately short paragraphs (~2-4 sentences); split long blocks.`;
}

function wordPressPostsBlock(posts: GeneratorWordPressPost[], _siteName: string): string {
  return formatBlogPlayLinkTargetsPrompt(posts);
}

function checklistFormatExample(h2Sample: string): string {
  return `CRITICAL FORMAT REQUIREMENT:
Format your response as a numbered list, one item per line. Do NOT use ## markdown headings in checklist items.

Example (NOTE: numbered lines only — no ##). Use SERP H2 OUTLINE titles when present (never "What is X" or "Your Guide to X"):
1. ${h2Sample || "Section Topic"} [STRUCTURE]: 2-3 paragraphs. [LIST]: components. Opener leads with a sourced fact, then the topic (not keyword-first, not a dictionary definition). [FIRST-PARTY AUTHORITY]. [EXACT PRIMARY PER H2]: exact primary once later in the intro body. [FOCUS KEYWORD DENSITY]: ~1%+ across article. [LINK]: 3-5 [[LINK:query|anchor]] placeholders.
2. Next SERP outline H2 [STRUCTURE]: 2-3 paragraphs. [TABLE] or [DECISION]: criteria. [EXACT PRIMARY PER H2]. [LINK]: 3-5 internal links.
3. Unique topical H2 for the one worked example [STRUCTURE]: 1 intro paragraph, then scenario in body (not in the H2). [ILLUSTRATIVE]: labeled hypothetical. [BLOCKQUOTE]. Short unique H2. No links in H2 or H3. Forbidden: Section N or a second homeowner H2. [EXACT PRIMARY PER H2]. [LINK]: 3-5 in body only.
4. Next SERP outline H2 [LIST]: numbered steps. [EXACT PRIMARY PER H2]. [LINK]: 3-5 internal links.
5. Next SERP outline H2 [NUMBERS] or [TRADEOFF]: when it fails. [EXACT PRIMARY PER H2]. [LINK]: 3-5 internal links.
6. What we recommend [STRUCTURE]: 1-2 paragraphs. [RECOMMENDATION]: site-first recommendation. [EXACT PRIMARY PER H2]. [LINK]: CTA internal links.

Output ONLY the numbered checklist items, no additional text.`;
}

export function buildChecklistPromptMessages(ctx: ChecklistPromptContext): { system: string; user: string } {
  const competitorComparison = isCompetitorCsvKeyword(ctx.keywordData.keyword) && Boolean(ctx.entity?.trim());
  const isServiceArea = Boolean(ctx.entity?.trim()) && !competitorComparison;
  const h2Section =
    ctx.selectedH2Sections.length > 0
      ? `\n--- Selected H2 Sections ---\n${ctx.selectedH2Sections.map((h2, i) => `${i + 1}. ${h2}`).join("\n")}\n`
      : "";

  const siteBlock = ctx.connectedSite
    ? `\n=== TARGET SITE ===\n${ctx.connectedSite.name} (${ctx.connectedSite.siteUrl.replace(/\/+$/, "")})\n=== END TARGET SITE ===\n`
    : "";

  const postsBlock = ctx.connectedSite && ctx.wordPressPosts?.length
    ? wordPressPostsBlock(ctx.wordPressPosts, ctx.connectedSite.name)
    : "";

  const paaBlock =
    ctx.paaQuestions && ctx.paaQuestions.length > 0
      ? `\n--- People Also Ask (flo-faq append only, NOT body H2s) ---\n${ctx.paaQuestions.map((p) => `- ${p.question}`).join("\n")}\n`
      : "";

  const semrushBlock = [
    ctx.semrushKeywordsContext?.trim()
      ? `\n--- Semrush keyword research (JSON) ---\n${ctx.semrushKeywordsContext}\n`
      : "",
    ctx.semrushScatterContext?.trim()
      ? `\n--- Semrush cluster scatter (JSON) ---\n${ctx.semrushScatterContext}\n`
      : "",
  ].join("");

  const modifierBlock = ctx.userPrompt?.trim()
    ? `\n--- PROMPT MODIFIER (PRIMARY FOCUS) ---\n${ctx.userPrompt.trim()}\n--- END ---\n`
    : "";

  const system = `You are an expert blog content strategist and blueprint architect. Create a detailed checklist for generating a blog template blueprint.

${keywordSection(ctx.keywordData, ctx.selectedKeywords)}

**FORBIDDEN BODY H2 HEADERS**: Never FAQ, Q&A, Frequently Asked Questions as body sections. FAQ is appended later as flo-faq.

--- Blog Title ---
${ctx.title}
${siteBlock}${postsBlock}${h2Section}${paaBlock}${modifierBlock}${semrushBlock}

${buildArticleLengthChecklistBlock(isServiceArea)}

Harness contract: Each checklist item = exactly one H2 harness pass (~${Math.floor(ARTICLE_MAX_WORDS / 6)} words). Max 2 [TABLE] in entire article.
Post generation date: ${formatResearchAsOfLabel(new Date())}. Every checklist item must include [WRITING DATE]: all section prose is published on this date.
Each item must include [STRUCTURE], [EXACT PRIMARY PER H2], [FOCUS KEYWORD DENSITY], [PARAGRAPH LENGTH], [WRITING DATE], and [LINK]: 3-5 [[LINK:query|anchor]].
Include at least one [TABLE], one [LIST]: bullet, and one [LIST]: number across the article.
Put [DECISION] on exactly one item and [TRADEOFF] on exactly one item.
First H2: NEVER title it Introduction or Intro — use SEO-friendly active title.
Conclusion H2 with exact primary keyword once in body.
FORBIDDEN: Never start a checklist line with "Create an agent", "Create a first section agent", or similar. Each line begins with the exact H2 heading text.

${AUTHENTICITY_CHECKLIST_RULE}

${ctx.firstPartyAuthorityBlock?.trim() ? `${ctx.firstPartyAuthorityBlock.trim()}\n\n` : ""}${
  competitorComparison
    ? formatCompetitorChecklistExample(ctx.entity!.trim(), ctx.title)
    : isServiceArea
      ? formatSapChecklistExample(ctx.entity!.trim(), ctx.title)
      : checklistFormatExample(ctx.selectedH2Sections[0] ?? "Section Topic")
}

${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}`;

  let user = "";
  if (ctx.bucketReadFirstBlock?.trim()) {
    user += ctx.bucketReadFirstBlock.trim() + "\n\n";
  }
  user += `Generate a focused checklist for creating a blog template blueprint.

${
  competitorComparison
    ? formatCompetitorComparisonChecklistBlock(ctx.entity!.trim(), ctx.connectedSite?.name ?? "")
    : isServiceArea
      ? formatSapPageChecklistBlock(ctx.entity!.trim())
      : ""
}

${buildArticleLengthChecklistBlock(isServiceArea || competitorComparison)}

Blog Details:
- Title: "${ctx.title}"
- H2 Sections to cover: ${ctx.selectedH2Sections.join(", ") || "(derive from keyword research)"}
- Primary Keyword: "${ctx.keywordData.keyword}"
- Related Keywords: ${ctx.selectedKeywords.slice(0, 5).join(", ") || ctx.keywordData.keyword}

Requirements:
1. Create ${competitorComparison ? "9" : isServiceArea ? "6-7" : "5-6"} checklist items. ${competitorComparison ? "Follow COMPETITOR COMPARISON PAGE TEMPLATE (provider comparison, not SAP geo)." : isServiceArea ? "Follow SAP PAGE TEMPLATE (local problem, sourced local conditions, What We Offer, Local Recommendation table, Next Steps). Do not emit encyclopedia how-it-works jobs." : "Use the SERP H2 OUTLINE titles exactly as the first words on each checklist line. First H2 is never Introduction/Intro/What is X/Your Guide to X."}
2. Each item must include mandatory markers: [STRUCTURE], [EXACT PRIMARY PER H2], [FOCUS KEYWORD DENSITY], [PARAGRAPH LENGTH], [WRITING DATE], [LINK].
3. Include at least one [TABLE], one [LIST]: bullet, and one [LIST]: number (max 2 [TABLE] total). ${isServiceArea ? "The two tables are What We Offer and Local Recommendation (Product | Best for | Budget | Reason)." : "Put [DECISION] on one item, [TRADEOFF] on one item, [ILLUSTRATIVE] on one item, and [RECOMMENDATION] on the last item."}
4. ${isServiceArea ? "Local Recommendation H2: four-column table plus connected business name." : "Last H2: site-first [RECOMMENDATION] with exact primary keyword once in body."}
5. Output ONLY numbered checklist lines. Do NOT use ## markdown headings in items.`;

  if (ctx.userPrompt?.trim()) {
    user += `\n\n--- CRITICAL: USER-SPECIFIED REQUIREMENTS ---\n${ctx.userPrompt.trim()}`;
  }
  if (ctx.firstPartyAuthorityBlock?.trim()) {
    user += `\n\n${ctx.firstPartyAuthorityBlock.trim()}`;
  }

  user += `\n\n--- MANDATORY: INTERNAL LINK REQUIREMENTS ---
Every H2 section MUST include "[LINK]: 3-5 internal links via [[LINK:query|anchor]] placeholders."
Use WordPress posts from the system prompt when suggesting link topics.`;

  return { system, user };
}

export function buildBlueprintPromptMessages(ctx: BlueprintPromptContext): { system: string; user: string } {
  const siteUrl = ctx.connectedSite?.siteUrl?.replace(/\/+$/, "") ?? "";
  const siteBlock = ctx.connectedSite
    ? `\n=== TARGET SITE ===\n${ctx.connectedSite.name} (${siteUrl})\n=== END ===\n`
    : "";
  const postsBlock =
    ctx.connectedSite && ctx.wordPressPosts?.length
      ? wordPressPostsBlock(ctx.wordPressPosts, ctx.connectedSite.name)
      : "";

  const semrushBlock = [
    ctx.semrushKeywordsContext?.trim()
      ? `\n--- Semrush keyword research (JSON) ---\n${ctx.semrushKeywordsContext}\n`
      : "",
    ctx.semrushScatterContext?.trim()
      ? `\n--- Semrush cluster scatter (JSON) ---\n${ctx.semrushScatterContext}\n`
      : "",
  ].join("");

  const modifierBlock = ctx.userPrompt?.trim()
    ? `\n--- PROMPT MODIFIER ---\n${ctx.userPrompt.trim()}\n--- END ---\n`
    : "";
  const firstPartyBlock = ctx.firstPartyAuthorityBlock?.trim()
    ? `\n${ctx.firstPartyAuthorityBlock.trim()}\n`
    : "";

  const system = `You are the Blueprint Architect AI. Return valid JSON only.

--- Flow Context ---
Title: ${ctx.title}
Purpose: ${ctx.purpose}
Primary Keyword: ${ctx.keyword}
${siteBlock}${postsBlock}${modifierBlock}${firstPartyBlock}${semrushBlock}

--- Template Checklist ---
${ctx.checklist.map((item, i) => `${i + 1}. ${item}`).join("\n")}

${buildBlueprintArticleLengthBlock()}

One agent per checklist item. Do NOT add Overview or FAQ agents.
Rename Introduction/Intro to SEO-friendly H2 titles (never drop intro sections).
Every agent MUST include "${LINK_FEATURE_PLACEHOLDER}" in features.
NEVER use FAQ-style agent titles.

Agent JSON schema:
{"title":"","purpose":"","agents":[{"id":"section-1","step":1,"title":"","description":"","features":["[LINK]: [[LINK:query|anchor]] placeholders"],"headingLevel":2}]}

CRITICAL — agent.title: ONLY the H2 heading phrase (checklist text before the first [STRUCTURE]/[LINK]/[TABLE]/[LIST]/[EXACT]/[DECISION]/[TRADEOFF] marker). Never copy [STRUCTURE], paragraph counts, or other harness tags into title.

Copy [DECISION] and [TRADEOFF] from checklist items into that agent's features array when present.

${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}`;

  const user = `Build a JSON blueprint for "${ctx.title}" (keyword: ${ctx.keyword}).
Purpose must be: ${ctx.purpose || buildFocusedArticlePurpose(ctx.keyword)}
${ctx.userPrompt?.trim() ? `Prompt modifier focus: ${ctx.userPrompt.trim()}\n` : ""}
Checklist:
${ctx.checklist.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Return JSON with one agent per checklist item. Rename Intro/Introduction titles. Each agent needs [LINK] in features. Each agent.title = H2 heading only (text before first [ marker in that checklist line).`;

  return { system, user };
}

export function buildKeywordAnalysisUserPrompt(keyword: string, serpExcerpt: string): string {
  return `Analyze the primary keyword "${keyword}" for blog content planning.

SERP excerpt:
${serpExcerpt.slice(0, 8000)}

Return JSON only:
{
  "h2Suggestions": ["SEO H2 topic 1", "..."],
  "keywordSuggestions": { "primary": "...", "variations": ["..."], "longTail": ["..."] },
  "peopleAlsoAsk": [{ "question": "...", "answer": "..." }],
  "contentGaps": ["..."]
}

h2Suggestions: prefer how to choose / vs / cost factors / process / when not worth it. Forbidden as the whole outline: definitional "What is X", "Your Guide to X", or "Benefits of X".
contentGaps: include buyer-decision gaps (which option, when not worth it, cost drivers), not only missing topics.`;
}

export function buildKeywordAnalysisSystemPrompt(): string {
  return "You are an SEO keyword analyst. Return valid JSON only. Suggest 5-7 H2 section topics (no FAQ titles). Prefer jobs-to-be-done headings (choose / vs / cost / process / when not) over definitional titles. Forbidden: What is X, Your Guide to X. Include keyword variations and PAA questions from SERP context. contentGaps must include buyer-decision gaps.";
}

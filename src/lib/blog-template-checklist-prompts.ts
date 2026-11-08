import { streamChatCompletion, loadApiKey } from "./api";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { clampOpenRouterMaxTokens } from "@/lib/openrouter-stream-chat-core";
import type { KeywordData, BlogTemplateChecklist, PeopleAlsoAsk } from "./keyword-types";
import type { AgentConfig } from "@/types/agent-config";
import {
  BULK_WORDPRESS_POST_TITLE_RULE,
  CRITICAL_LINK_RULE,
  NO_FAKE_TESTIMONIALS_RULE,
  TITLE_WELL_KNOWN_ACRONYMS_RULE,
  AUTHENTICITY_CHECKLIST_RULE,
} from "./prompt-builders";
import { formatResearchAsOfLabel } from "@/lib/content-optimization/topic-research-fanout";
import { TABLE_NO_LINK_ONLY_COLUMN_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import { getResearchModel } from "./optimization-settings-storage";
import {
  formatBlogPlayLinkTargetsPrompt,
  INTERNAL_LINK_INTENT_ROUTING_RULE,
  keepBlogPlayLinkTargets,
} from "./bulk/bulk-generation-wp-inventory";
import { getLocalEntityPhraseExamples, getLocalExpertisePhrase, getLocalGeneralPhrase } from "./local-entity-phrases";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import type { CheckedExternalLink } from "./external-research";
import { formatImportedDraftLinksForPrompt, type ImportedDraftLink } from "./bulk/blog-import-draft-links";
import {
  formatModifierExternalLinksForPrompt,
  formatLlmAuditAuthorityLinksForPrompt,
  type ModifierExternalLink,
  type LlmAuditAuthorityLinkLike,
} from "./bulk/modifier-external-links";
import type { ExternalLinkPair } from "./content-generation/external-link-placeholders";
import { formatMandatoryEntityWikipediaForPrompt } from "./bulk/entity-wikipedia-prompt";
import {
  deriveSerpH2Outline,
  formatSerpH2OutlineBlock,
  validateSerpH2OutlineTitles,
} from "@/lib/content-optimization/serp-h2-outline";
import {
  formatSapChecklistExample,
  formatSapPageChecklistBlock,
} from "@/lib/prompt-builders/sap-page-template";
import {
  ARTICLE_MAX_WORDS,
  buildArticleLengthChecklistBlock,
  buildBlueprintArticleLengthBlock,
} from "@/lib/content-generation/article-length-policy";
import {
  INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX,
} from "@/lib/content-generation/internal-link-placeholders";
import {
  appendUniversalContentRulesToSystemPrompt,
  enforceForbiddenWordsOnBlueprint,
  sanitizeBlueprintAgentsForPipeline,
  sanitizeForbiddenHeadingTitle,
  sanitizeForbiddenWordsInChecklistItem,
  injectBlacklistRagIntoMessages,
} from "@/lib/content-word-blocklist";
import { isFaqStyleHeadingTitle } from "@/lib/content-generation/faq-heading-policy";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import {
  extractChecklistItemTitle,
  parseBlogTemplateChecklist as parseBlogTemplateChecklistFromModule,
} from "@/lib/post-creator/post-creator-checklist-post-process";
import {
  FORBIDDEN_H2_PLACEHOLDER_PROMPT_LINE,
  isLlmAuditAuthorityDumpChecklistItem,
  isLlmAuditAuthorityDumpTitle,
} from "@/lib/content-optimization/harness-heading-titles";
import { AISO_CHECKLIST_KEYWORD_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import {
  ensureConnectedSiteHarnessMarkers,
} from "@/lib/bulk/connected-site-harness-markers";
import { buildPredeterminedBlogBodyHarnessTitlesFromOutline } from "@/lib/overview/overview-content-optimize-pipeline";
import type { BlogTemplateContext } from "./blog-template-builder-types";

const LINK_FEATURE_PLACEHOLDER = `[LINK]: ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}`;

/**
 * Converts a keyword to proper/title case
 * Capitalizes the first letter of each word, except for common prepositions/articles
 */
export function toProperCase(keyword: string): string {
  if (!keyword) return keyword;
  
  // Words that should remain lowercase (unless at the start)
  const lowercaseWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'near', 'of', 'on', 'or', 'the', 'to', 'with'];
  
  return keyword
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Always capitalize first word, or if word is not in lowercase list
      if (index === 0 || !lowercaseWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

export function buildSemrushExactPromptParts(options: {
  semrushApprovedExternalUrls?: string[];
  semrushAnchorPhrases?: string[];
  userExternalLinks?: ExternalLinkPair[];
  normalizedSiteUrl: string;
}): {
  semrushExactBlock: string;
  hasSemrushExactMode: boolean;
  externalLinksPolicyBlock: string;
  linksBulletExternal: string;
  externalCompetitorBlock: string;
} {
  const userLinks = (options.userExternalLinks ?? []).filter(
    (link) => link.url.trim() && link.anchor.trim(),
  );
  const semrushUrlList =
    userLinks.length > 0
      ? userLinks.map((link) => link.url.trim())
      : (options.semrushApprovedExternalUrls ?? [])
          .map((u) => String(u).trim())
          .filter(Boolean)
          .slice(0, 80);
  const semrushAnchorList =
    userLinks.length > 0
      ? userLinks.map((link) => link.anchor.trim())
      : (options.semrushAnchorPhrases ?? [])
          .map((a) => String(a).trim())
          .filter(Boolean)
          .slice(0, 150);
  const hasSemrushExactMode = semrushUrlList.length > 0 && semrushAnchorList.length > 0;
  const siteRef = options.normalizedSiteUrl || "the target website";

  const semrushExactBlock = hasSemrushExactMode
    ? `
=== SEMRUSH - CONTENT OPTIMIZATION (EXACT URL + ANCHOR LOCK) ===
**HREF**: Copy URLs below character-for-character for every third-party external link. No edits to scheme, host, path, or query.
**ANCHOR**: For each Semrush external link, anchor text MUST be copied EXACTLY from the anchor phrase list below (verbatim spelling, spacing, casing). Use the full phrase even if longer than 5 words. For internal links, keep anchors short (2-5 words) as usual.
**SEMRUSH - APPROVED EXTERNAL URLs**
${semrushUrlList.map((u, i) => `${i + 1}. ${u}`).join("\n") || "(none)"}
**SEMRUSH - APPROVED ANCHOR PHRASES (KEYWORDS)**
${semrushAnchorList.map((a, i) => `${i + 1}. ${a}`).join("\n") || "(none)"}

**CHECKLIST / BLUEPRINT - NO HALLUCINATED EXTERNAL URLS (NON-NEGOTIABLE)**:
- Do NOT type, guess, paraphrase, or invent any third-party https:// URL in checklist or blueprint output unless it is **copied character-for-character** from the numbered **SEMRUSH - APPROVED EXTERNAL URLs** list above (same string, including scheme and path).
- **FORBIDDEN**: placeholder domains, "e.g." external URLs, competitor sites not in the list, nytimes.com/hunterdouglas.com or any domain unless that **exact** URL string appears in the list above.
- **ALLOWED**: (1) Paste the full URL verbatim from the list into a checklist item; OR (2) Reference by index only, e.g. "[EXTERNAL_SEMRUSH]: use SEMRUSH approved URL #2 and anchor phrase #2 from the lists above" - **without writing a URL string you did not copy from the list**.
- Anchor phrases in checklists: same rule - only verbatim copies from **SEMRUSH - APPROVED ANCHOR PHRASES**, or reference by index; never invent anchor text for external sites.
- Feature tag form (when listing concrete pairs): "[EXTERNAL_SEMRUSH]: href=<paste exact URL from list> | anchor=<paste exact phrase from list>" - both sides must be **lifted from the lists**, not improvised. Section body must insert **[[EXTERNAL:exact-url|exact-anchor]]** (same pair) woven mid-sentence — never <a href> for third-party URLs.

=== END SEMRUSH EXACT ===
`
    : "";

  const externalLinksPolicyBlock = hasSemrushExactMode
    ? `**EXTERNAL LINKS - SEMRUSH APPROVED + ENTITY WIKIPEDIA**:
- Third-party links: ONLY URLs from the "SEMRUSH - APPROVED EXTERNAL URLs" section above (exact href). Anchor text: ONLY exact strings from the "SEMRUSH - APPROVED ANCHOR PHRASES" section above.
- When an entity exists, you may also link to its Wikipedia page when provided in context above.
- Do NOT link to any other external domain. Do NOT invent or hallucinate URLs.
- NEVER create "External Resources" sections for random sites.
- **ABSOLUTELY FORBIDDEN: example.com** - NEVER use example.com, example.org, or any placeholder domain.
- Internal links to ${siteRef} are REQUIRED (2-4 per body H2 section) via [[LINK:query|anchor]] from PAGES and BLOG POSTS titles. ${INTERNAL_LINK_INTENT_ROUTING_RULE}
- **CHECKLIST (CRITICAL)**: Every numbered checklist item MUST require BOTH internal links AND at least one Semrush external citation - never output items that only say "internal links" or "WordPress URLs only". Use the tags **[LINK]** (internal) and **[EXTERNAL_SEMRUSH]** (outbound) in each item.
- **NEVER hallucinate external URLs in the checklist**: Any third-party URL shown in a checklist item must be copied verbatim from **SEMRUSH - APPROVED EXTERNAL URLs** above, or omit the URL string and only reference "URL #N from Semrush list".
- **Tone**: In blueprint/checklist instructions, describe Semrush links as **neutral reference / knowledge-base** citations only - not as retail recommendations, "where to buy", or "where not to buy".`
    : `**EXTERNAL LINKS - WIKIPEDIA ONLY**:
- The ONLY allowed external link is the entity's Wikipedia page (when an entity exists).
- NO other external sites. Do NOT invent, hallucinate, or fabricate any external URL.
- NEVER create "External Resources" sections.
- NEVER link to competitors, manufacturers, or any other external domain.
- **ABSOLUTELY FORBIDDEN: example.com** - NEVER use example.com, example.org, or any placeholder domain.
- Internal links to ${siteRef} are REQUIRED (2-4 per body H2 section).`;

  const linksBulletExternal = hasSemrushExactMode
    ? `- Every section MUST specify BOTH:
  - **${LINK_FEATURE_PLACEHOLDER}**
  - **[EXTERNAL_SEMRUSH]: at least 1 outbound citation** - href MUST be the **exact string** from a line in "SEMRUSH - APPROVED EXTERNAL URLs" above (copy-paste only), OR say "SEMRUSH URL #N and anchor #N" without typing a URL you did not copy from that list. Anchor: exact phrase from "SEMRUSH - APPROVED ANCHOR PHRASES" only.
- **Spread outbound links**: include **[EXTERNAL_SEMRUSH]** in the majority of H2 sections (at least half the checklist items, or 6+ items when the checklist is long). Rotate different **numbered** Semrush URLs across sections - do not cite only one external domain in the whole article.
- Internal links: WordPress posts ONLY. Third-party externals: Semrush lists ONLY (plus entity Wikipedia when provided in context). **Never fabricate or example third-party URLs.**`
    : `- Every section: "${LINK_FEATURE_PLACEHOLDER}"
- Internal links come from WordPress posts ONLY. External links come ONLY from the pre-validated AI Mode research list above (if provided).`;

  const externalCompetitorBlock = `**CRITICAL - NEVER MENTION EXTERNAL SITES OR COMPETITORS**:
- **NEVER create H2 or H3 headings that mention external websites** (e.g., "Topic - Houzz", "Topic - Reddit", "Topic - Pinterest", "According to [Site Name]")
- **NEVER create dedicated sections about external platforms** like Houzz, Reddit, Pinterest, Yelp, Amazon, or any third-party website
- **NEVER mention competitor business names** in headings or as focal points of sections
- **NEVER reference people's names** (bloggers, influencers, experts from other sites) in headings or dedicated content
- The blog is ONLY about the target site's products/services - external citations are brief supporting links only; do not promote third-party sites as the main topic
- If research mentions external sources, do NOT create sections dedicated to what those external sites say
${
  hasSemrushExactMode
    ? `- Third-party external links: ONLY Semrush-approved URLs from the "SEMRUSH - APPROVED EXTERNAL URLs" block above (exact href) with anchor text copied EXACTLY from the "SEMRUSH - APPROVED ANCHOR PHRASES" block. You may also use the entity Wikipedia link when provided in context above. Do NOT link to any other external domain.
- Semrush external links may be used for authority in body copy but NEVER as the topic of an H2 or H3 heading`
    : `- ONLY Wikipedia links are allowed as external links - NO OTHER EXTERNAL SITES (pfwbs.org, cpsc.gov, nbcnews.com, windowcoverings.org, manufacturers, etc. are FORBIDDEN)
- External links (Wikipedia only) can be used for authority but NEVER as the topic of a heading or section`
}
- Focus ONLY on the target site's expertise, products, services, and value proposition
- Example of FORBIDDEN headings: "What Houzz Says About...", "Topic - Reddit Community", "According to [Competitor]..."
- Example of ALLOWED headings: "Types of Window Treatments", "Benefits of Professional Installation", "How to Choose the Right Blinds"
- **SEO HEADING HIERARCHY**: H2 = main sections. H3 = subsections under H2. H4 = sub-subsections. NEVER use H3 for main sections. NEVER flatten everything to H3. Each heading = one short phrase (3-10 words).
${NO_FAKE_TESTIMONIALS_RULE}`;

  return {
    semrushExactBlock,
    hasSemrushExactMode,
    externalLinksPolicyBlock,
    linksBulletExternal,
    externalCompetitorBlock,
  };
}

export const buildBlogTemplateSystemPrompt = (
  flowTitle: string,
  flowPurpose: string,
  keywordData?: KeywordData
): string => {
  const keywordSection = keywordData
    ? `
--- Keyword Context ---
Primary Keyword: ${keywordData.keyword}
Search Volume: ${keywordData.searchVolume?.toLocaleString() || "N/A"}
Difficulty: ${keywordData.difficulty || "N/A"}/100
Intent: ${keywordData.intent || "N/A"}
`
    : "";

  return `You are an expert blog content strategist and blueprint architect. Your role is to analyze user requirements and create a detailed checklist for generating a blog template blueprint.

Flow Context:
- Title: ${flowTitle || "Untitled"}
- Purpose: ${flowPurpose || "Not specified"}
${keywordSection}

Your task is to:
1. Analyze the user's description of their blog template needs
2. Create a focused, actionable checklist (5-6 items) that will guide blueprint generation
3. Each checklist item should specify what section/agent should be included and what it should cover
4. The checklist will be used to generate a blueprint with multiple agents (sections)

CRITICAL FORMAT REQUIREMENT:
Format your response as a numbered list, one item per line. Each item should be a clear, actionable instruction.

Example format:
1. Create an introduction section that hooks the reader and introduces the main topic
2. Add a section covering [specific topic] with examples and practical tips
3. Include a comparison section between [options]
4. Add a conclusion section that summarizes key points and includes a call-to-action

Output ONLY the numbered checklist items, no additional text or explanations.`;
};

/**
 * Builds a user prompt for blog template checklist generation
 */
export const buildBlogTemplateUserPrompt = (
  context: BlogTemplateContext
): string => {
  const parts: string[] = [];

  parts.push(`Generate a focused checklist (max ${ARTICLE_MAX_WORDS}-word article) for creating a blog template blueprint based on the following requirements:\n`);

  if (context.userPrompt && context.userPrompt.trim()) {
    parts.push(`User Requirements: ${context.userPrompt.trim()}\n`);
  }

  parts.push("\nThe checklist should specify:");
  parts.push("1. What sections/agents should be included in the blog");
  parts.push("2. What content each section should cover");
  parts.push("3. How sections should be structured");
  parts.push("4. Any specific features or requirements for each section");

  parts.push("\nGenerate 5-6 detailed, actionable checklist items that will guide the blueprint generation.");
  parts.push("Each item should be a clear instruction for what to include in the blog template.");

  return parts.join("\n");
};

/**
 * Parses checklist from AI response
 */
export function parseBlogTemplateChecklist(aiResponse: string, _keywords: string[] = []): string[] {
  return parseBlogTemplateChecklistFromModule(aiResponse);
}

export { LINK_FEATURE_PLACEHOLDER };

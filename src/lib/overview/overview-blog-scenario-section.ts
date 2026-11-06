/**
 * Regenerate only the [ILLUSTRATIVE] body H2 in existing post HTML.
 */

import type { AgentConfig } from "@/types/agent-config";
import type { WordPressSite } from "@/components/integrations/types";
import { buildSystemPrompt, buildBulkHarnessSectionUserPrompt, generateSingleSectionPrompt } from "@/lib/prompt-builders";
import { runHarnessOpenRouterSection, resolveHarnessHttpReferer } from "@/lib/bulk/harness-openrouter-worker-client";
import { ensureConnectedSiteHarnessMarkers } from "@/lib/bulk/connected-site-harness-markers";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import { injectBlacklistRagIntoMessages } from "@/lib/content-word-blocklist";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import {
  extractIllustrativeExample,
  buildIllustrativeExampleResearchQuery,
  formatResearchAsOfLabel,
} from "@/lib/content-optimization/topic-research-fanout";
import {
  firstPartyAuthorityBlockFromBrief,
  formatIllustrativePersonaPromptBlock,
  ILLUSTRATIVE_BLOCKQUOTE_RULE,
  ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE,
  ILLUSTRATIVE_SCENARIO_PERSONA_RULE,
} from "@/lib/content-optimization/first-party-authority-prompt";
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from "@/lib/content-optimization/page-local-context";
import { formatAnswerGroundingForIllustrativePromptBlock } from "@/lib/content-optimization/defensible-specificity-prompt";
import { parseSeoResearchBrief, llmAuditSummaryFromSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import { formatEntityReferencePromptBlock } from "@/lib/entity-place-reference";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  findH2OpenPositions,
  extractAnswerSectionHtml,
  outlineFromBodyH2Titles,
  type OverviewHarnessPageKind,
} from "@/lib/overview/overview-blog-overview-prepend";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { formatOutlineTitlesForHarnessPrompt } from "@/lib/bulk/bulk-harness-outline";
import { findServiceAreaPageForPlace } from "@/lib/bulk/bulk-generation-wp-inventory";
import { getSiteCache } from "@/lib/wordpress-site-cache";
import { analyzeScenarioInsertionPlan } from "@/lib/overview/overview-blog-scenario-placement-agent";
import { insertScenarioSectionAfterH2 } from "@/lib/overview/overview-blog-scenario-insert";

export const SCENARIO_H2_PREFIX = "Scenario:";

/** Canonical H2 for every scenario section: `Scenario: {topical title}`. */
export function formatScenarioH2Title(topic: string): string {
  let t = (topic ?? "").trim();
  if (!t) t = "Local decision example";
  t = t.replace(/^scenario\s*:\s*/i, "").trim();
  return `${SCENARIO_H2_PREFIX} ${t}`;
}

export function isScenarioHeadingTitle(title: string): boolean {
  const key = title.trim().toLowerCase();
  if (!key || key === "answer" || key === "overview") return false;
  if (key.startsWith("scenario:")) return true;
  if (key.includes("local homeowner example")) return true;
  if (key.includes("realistic local")) return true;
  if (key.includes("local situation")) return true;
  if (key.includes("local scenario")) return true;
  return false;
}

export type IllustrativeH2Bounds = {
  openAt: number;
  endAt: number;
  title: string;
};

function scenarioSectionEndAt(html: string, openAt: number): number {
  const positions = findH2OpenPositions(html);
  for (const pos of positions) {
    if (pos <= openAt) continue;
    return pos;
  }
  return html.length;
}

function sectionLooksIllustrative(htmlSlice: string, title: string): boolean {
  if (isScenarioHeadingTitle(title)) return true;
  const titleKey = title.trim().toLowerCase();
  if (titleKey === "answer" || titleKey === "overview") return false;
  if (/<blockquote/i.test(htmlSlice)) return true;
  const hasRecommendationH3 = /<h3[^>]*>\s*recommendation\s*:/i.test(htmlSlice);
  const hasLegacyScenarioH3 = /<h3[^>]*>\s*scenario\s*:/i.test(htmlSlice);
  return hasLegacyScenarioH3 || hasRecommendationH3;
}

/** Drop legacy `<h3>Scenario:` blocks and prose before Recommendation or the next heading. */
export function stripLegacyScenarioH3Blocks(html: string): string {
  let s = (html ?? "").trim();
  if (!s) return s;

  for (let guard = 0; guard < 20; guard += 1) {
    const match = /<h3\b[^>]*>\s*scenario\s*:/i.exec(s);
    if (!match || match.index == null) break;
    const start = match.index;
    const rest = s.slice(start);
    const recommendationAt = rest.search(/<h3\b[^>]*>\s*recommendation\s*:/i);
    const nextH2At = rest.search(/<h2\b/i);
    let end = s.length;
    if (recommendationAt > 0) end = start + recommendationAt;
    else if (nextH2At > 0) end = start + nextH2At;
    s = `${s.slice(0, start)}${s.slice(end)}`.trim();
  }

  return s.replace(/<h3\b[^>]*>\s*scenario\s*:[\s\S]*?<\/h3>\s*/gi, "").trim();
}

function scenarioSectionHtmlFromModel(raw: string): string {
  let text = (raw ?? "").trim();
  const fence = text.match(/^```(?:html|markdown)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1]!.trim();
  return stripLegacyScenarioH3Blocks(text);
}

/** Remove every existing scenario H2 block so only one can remain after insert. */
export function stripAllScenarioSections(html: string): string {
  let src = (html ?? "").trim();
  if (!src) return src;

  for (let guard = 0; guard < 20; guard += 1) {
    const positions = findH2OpenPositions(src);
    let removed = false;
    for (const openAt of positions) {
      const endAt = scenarioSectionEndAt(src, openAt);
      const slice = src.slice(openAt, endAt);
      const titles = extractH2TextsFromHtml(slice);
      const title = titles[0]?.trim() ?? "";
      if (!sectionLooksIllustrative(slice, title)) continue;
      src = `${src.slice(0, openAt)}${src.slice(endAt)}`.trim();
      removed = true;
      break;
    }
    if (!removed) break;
  }

  return stripLegacyScenarioH3Blocks(src);
}

/** Locate the body H2 whose section is the [ILLUSTRATIVE] block (blockquote + Recommendation h3, or legacy Scenario h3). */
export function findIllustrativeH2Bounds(html: string): IllustrativeH2Bounds | null {
  const src = (html ?? "").trim();
  if (!src) return null;
  const positions = findH2OpenPositions(src);
  for (let i = 0; i < positions.length; i += 1) {
    const openAt = positions[i]!;
    const endAt = i + 1 < positions.length ? positions[i + 1]! : src.length;
    const slice = src.slice(openAt, endAt);
    const titles = extractH2TextsFromHtml(slice);
    const title = titles[0]?.trim() ?? "";
    if (!sectionLooksIllustrative(slice, title)) continue;
    return { openAt, endAt, title };
  }
  return null;
}

export function extractIllustrativeSectionHtml(html: string): string {
  const bounds = findIllustrativeH2Bounds(html);
  if (!bounds) return "";
  return html.slice(bounds.openAt, bounds.endAt).trim();
}

export function replaceIllustrativeSectionHtml(fullHtml: string, newSectionHtml: string): string {
  const bounds = findIllustrativeH2Bounds(fullHtml);
  const replacement = newSectionHtml.trim();
  if (!bounds || !replacement) return fullHtml;
  return `${fullHtml.slice(0, bounds.openAt)}${replacement}${fullHtml.slice(bounds.endAt)}`;
}

/** Same agent shape as blog harness [ILLUSTRATIVE] body sections (post-creator checklist). */
function buildIllustrativeHarnessAgent(h2Title: string): AgentConfig {
  const [agent] = ensureConnectedSiteHarnessMarkers([
    {
      id: "body-illustrative-regen",
      step: 2,
      title: h2Title,
      description: "Local scenario",
      features: [
        "[STRUCTURE]: 1 general intro paragraph (no persona name), then named persona in blockquote.",
        "[ILLUSTRATIVE]: labeled hypothetical worked example.",
        "[BLOCKQUOTE]: scenario in the quote, not in the heading.",
      ],
      headingLevel: 2,
      h3Enabled: true,
      h2Count: 1,
      h3Count: 1,
      maxTokens: 1400,
    },
  ]);
  return agent!;
}

export type GenerateScenarioSectionArgs = {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  illustrativeH2Title?: string;
  pageUrl?: string;
  site: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** When false, only generate scenarioHtml (Elementor applies the slice separately). */
  mergeIntoSource?: boolean;
};

async function generateIllustrativeSectionHtml(args: GenerateScenarioSectionArgs): Promise<string> {
  const keyword =
    String(args.focusKeyword ?? "").trim() || String(args.articleTitle ?? "").trim() || "this topic";
  const h2Title = (args.illustrativeH2Title ?? "").trim();

  const bodyH2Titles = extractH2TextsFromHtml(args.sourceHtml).filter(
    (t) => t.trim().toLowerCase() !== "answer" && t.trim().toLowerCase() !== "overview",
  );
  const outline = outlineFromBodyH2Titles(bodyH2Titles);
  const outlineBlock = formatOutlineTitlesForHarnessPrompt(outline);
  const siblingTitles = bodyH2Titles.filter((t) => t.trim() !== h2Title);
  const sectionIndex = Math.max(0, bodyH2Titles.findIndex((t) => t.trim() === h2Title));
  const totalSections = bodyH2Titles.length + 2;
  const publishedTitles = ["Answer", "Overview", ...bodyH2Titles];

  const brief = args.seoResearchBrief?.trim() ? parseSeoResearchBrief(args.seoResearchBrief) : null;
  const researchAsOf =
    brief?.queryFanout?.researchAsOf?.trim() || formatResearchAsOfLabel(new Date());
  const pageCtx = resolvePageLocalContext({
    keyword,
    site: args.site,
    entity: args.pageKind === "entity" ? args.entity : undefined,
  });
  const location =
    pageCtx.prosePlaceLabel || pageCtx.primaryCity || "";
  const researchTopic = pageCtx.serviceTopic || keyword;
  const illustrativeExampleQuery =
    brief?.queryFanout?.illustrativeExampleQuery?.trim()
    || buildIllustrativeExampleResearchQuery({
      topic: researchTopic,
      location: location || researchTopic,
      asOfLabel: researchAsOf,
    });

  const persona = await extractIllustrativeExample({
    keyword,
    location,
    researchAsOf,
    companyName: args.site.name.trim(),
    illustrativeExampleQuery,
    pageUrl: args.pageUrl,
    entity: args.pageKind === "entity" ? args.entity : undefined,
    serpByQuery: brief?.queryFanout?.serpByQuery,
    chatGptByQuery: brief?.queryFanout?.chatGptByQuery,
    illustrativeH2Title: h2Title,
    pageTitle: args.articleTitle,
    siteId: args.site.id,
    site: args.site,
    pageLocalContext: pageCtx,
    answerSectionHtml: extractAnswerSectionHtml(args.sourceHtml),
  });

  const cityPlace =
    (args.pageKind === "entity" ? args.entity?.trim() : "")
    || pageCtx.prosePlaceLabel
    || pageCtx.primaryCity;
  const cityServiceArea = findServiceAreaPageForPlace(
    getSiteCache(args.site.id)?.posts ?? [],
    cityPlace,
  );
  const personaBlock = [
    formatPageLocalContextPromptBlock(pageCtx),
    formatIllustrativePersonaPromptBlock(
      persona,
      researchAsOf,
      cityServiceArea
        ? { pageTitle: cityServiceArea.title, anchor: cityServiceArea.anchor }
        : undefined,
    ),
  ].join("\n\n");

  const agent = buildIllustrativeHarnessAgent(h2Title);
  const sectionPrompt = generateSingleSectionPrompt(
    agent,
    "html",
    undefined,
    undefined,
    keyword,
  );
  const connectedSite = { name: args.site.name, siteUrl: args.site.siteUrl };
  const entity = args.pageKind === "entity" ? args.entity?.trim() : undefined;

  let userPrompt = buildBulkHarnessSectionUserPrompt(
    args.articleTitle.trim() || keyword,
    buildFocusedArticlePurpose(keyword),
    sectionPrompt,
    outlineBlock,
    siblingTitles,
    sectionIndex + 2,
    totalSections,
    connectedSite,
    entity,
    { keywordFocus: keyword, seoResearch: args.seoResearchBrief },
    true,
    args.pageUrl,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    h2Title,
    keyword,
    publishedTitles,
    args.seoResearchBrief ? llmAuditSummaryFromSeoResearchBrief(args.seoResearchBrief) : undefined,
    undefined,
    args.seoResearchBrief ? firstPartyAuthorityBlockFromBrief(brief, "") : undefined,
    formatAnswerGroundingForIllustrativePromptBlock(extractAnswerSectionHtml(args.sourceHtml)),
  );
  userPrompt += `\n\n${personaBlock}`;
  userPrompt += `\n\n=== WRITE THIS ILLUSTRATIVE SECTION (HTML ONLY) ===
${ILLUSTRATIVE_SCENARIO_PERSONA_RULE}
${ILLUSTRATIVE_BLOCKQUOTE_RULE}
${ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE}
Mandatory HTML: <h2>${h2Title}</h2> (exact title — must start with "Scenario: ") then <p> situationHook only — 1-2 sentences introducing the general decision context for readers (no persona name, no question, no repeat of blockquote), then <blockquote><p>personaName + scenarioNarrative (+ scenarioQuestion as a sentence inside the quote when assigned)</p></blockquote>, then <h3>Recommendation: recommendationTitle</h3>, then <p> recommendationParagraph. Forbidden: persona name in intro p; intro repeating blockquote; scenario story outside <blockquote>. Forbidden: skipping <blockquote> tags. Forbidden: "Scenario:" in H3 or body paragraphs.`;

  if (entity) {
    const canonical = normalizeEntityHintCommaLabel(entity);
    const referenceBlock = formatEntityReferencePromptBlock({
      entity: canonical,
      keyword,
    });
    if (referenceBlock) userPrompt += `\n\n${referenceBlock}`;
  }

  const illustrativeHarnessRules = `${ILLUSTRATIVE_SCENARIO_PERSONA_RULE}\n${ILLUSTRATIVE_BLOCKQUOTE_RULE}\n${ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE}`;
  const systemPrompt = await buildSystemPrompt(
    "",
    args.apiKey,
    connectedSite,
    undefined,
    args.pageUrl,
    entity,
    args.site.id,
    keyword,
    undefined,
    undefined,
    undefined,
    undefined,
    "harness_section",
    illustrativeHarnessRules,
    undefined,
  );

  const model = args.model?.trim() || getProductionModel();
  const result = await runHarnessOpenRouterSection({
    sectionIndex: sectionIndex + 2,
    apiKey: args.apiKey,
    model,
    messages: injectBlacklistRagIntoMessages([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]),
    temperature: 0.85,
    maxTokens: 1400,
    topP: 0.9,
    httpReferer: resolveHarnessHttpReferer(),
  });

  return scenarioSectionHtmlFromModel(result.content || "");
}

export type ReplaceScenarioResult = {
  html: string;
  scenarioHtml: string;
  illustrativeH2Title: string;
};

/** Plan H2 via OpenRouter, persona extract, section write; strip old scenario blocks then insert one. */
export async function generateAndReplaceScenarioSectionHtml(
  args: GenerateScenarioSectionArgs,
): Promise<ReplaceScenarioResult> {
  const sourceHtml = args.sourceHtml.trim();
  const strippedHtml = stripAllScenarioSections(sourceHtml);
  const plan = await analyzeScenarioInsertionPlan({
    html: strippedHtml,
    focusKeyword: args.focusKeyword,
    pageTitle: args.articleTitle,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
  });
  const illustrativeH2Title = formatScenarioH2Title(plan.illustrativeH2Title);
  const scenarioHtml = stripLegacyScenarioH3Blocks(
    await generateIllustrativeSectionHtml({
      ...args,
      sourceHtml: strippedHtml,
      illustrativeH2Title,
    }),
  );
  if (args.mergeIntoSource === false) {
    return {
      html: sourceHtml,
      scenarioHtml,
      illustrativeH2Title,
    };
  }
  const html = stripLegacyScenarioH3Blocks(
    insertScenarioSectionAfterH2(strippedHtml, plan.afterSectionHeader, scenarioHtml),
  );
  return {
    html,
    scenarioHtml,
    illustrativeH2Title,
  };
}

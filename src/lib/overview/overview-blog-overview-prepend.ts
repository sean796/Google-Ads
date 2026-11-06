/**
 * Content Optimizer: generate AI Overview HTML and prepend it to existing post body.
 * Stages on the grid; WordPress write happens via Upload (same as Headers/Links).
 */

import { BLOG_HARNESS_SUMMARY_TITLE, buildBlogHarnessSummaryAgent } from "@/lib/bulk/blog-harness-summary-agent";
import { HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";
import { HARNESS_OVERVIEW_ANCHOR_ID, buildHarnessSectionAnchorMap, formatHarnessInPageAnchorBlock, injectHarnessSectionH2AnchorId, type HarnessSectionAnchorEntry } from "@/lib/bulk/harness-section-anchor-ids";
import { ensureOverviewBulletBoldLabels } from "@/lib/overview/overview-bullet-bold-labels";
import { applyOverviewHarnessScrollLinks } from "@/lib/overview/overview-harness-scroll-links";
import { completeOverviewScrollLinks, overviewBulletsHaveRequiredScrollLinks } from "@/lib/prompt-builders/overview-link-rules";
import { wrapOverviewSectionHtml } from "@/lib/overview/wrap-overview-section-html";
import { formatOutlineTitlesForHarnessPrompt, stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { ensureHarnessSectionLengthCompliance } from "@/lib/bulk/harness-section-length-agent";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { generateSingleSectionPrompt } from "@/lib/prompt-builders/core";
import { buildBulkHarnessSectionUserPrompt } from "@/lib/prompt-builders/system-user";
import { llmAuditSummaryFromSeoResearchBrief, parseSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import { firstPartyAuthorityBlockFromBrief, PRIMARY_CITY_CONSISTENCY_RULE } from "@/lib/content-optimization/first-party-authority-prompt";
import { formatAnswerGroundingForIllustrativePromptBlock } from "@/lib/content-optimization/defensible-specificity-prompt";
import { formatPageLocalContextPromptBlock, resolvePageLocalContext } from "@/lib/content-optimization/page-local-context";
import type { WordPressSite } from "@/components/integrations/types";
import { formatEntityReferencePromptBlock } from "@/lib/entity-place-reference";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { enforceHarnessAnswerBeforeOverview, harnessPageKindLabel, injectBodyH2AnchorIds, isAnswerHeadingTitle, isOverviewHeadingTitle, looksLikeBlockedHostHtml, outlineFromBodyH2Titles, stripLeadingAnswerSection, stripLeadingOverviewSection, type OverviewHarnessPageKind } from "@/lib/overview/overview-harness-html-sections";
import { generateAnswerSectionHtml } from "@/lib/overview/overview-blog-answer-prepend";
export { dedupeStackedOverviewSections, enforceHarnessAnswerBeforeOverview, extractAnswerSectionHtml, extractOverviewSectionHtml, findH2OpenPositions, harnessPageKindLabel, injectBodyH2AnchorIds, injectHarnessH2AnchorIdsForStitchedBlog, isAnswerHeadingTitle, isAnswerOnlyHarnessBody, isOverviewHeadingTitle, looksLikeBlockedHostHtml, outlineFromBodyH2Titles, stripLeadingAnswerSection, stripLeadingDuplicateArticleTitleHeading, stripLeadingOverviewSection } from "@/lib/overview/overview-harness-html-sections";
export type { OverviewHarnessPageKind } from "@/lib/overview/overview-harness-html-sections";
export { generateAndPrependAnswerHtml, generateAnswerSectionHtml } from "@/lib/overview/overview-blog-answer-prepend";
export type { GenerateAnswerSectionArgs, PrependAnswerResult } from "@/lib/overview/overview-blog-answer-prepend";

function appendHarnessBriefGroundingToPrompt(userPrompt: string, seoResearchBrief?: string): string {
  const raw = seoResearchBrief?.trim();
  if (!raw) return userPrompt;
  const brief = parseSeoResearchBrief(raw);
  if (!brief) return userPrompt;
  const llmAuditSummary = llmAuditSummaryFromSeoResearchBrief(raw);
  const firstPartyAuthorityBlock = firstPartyAuthorityBlockFromBrief(brief, "");
  const parts = [userPrompt];
  if (llmAuditSummary) {
    parts.push(`\n\n--- SEO RESEARCH (LLM audit facts) ---\n${llmAuditSummary}`);
  }
  if (firstPartyAuthorityBlock?.trim()) {
    parts.push(`\n\n${firstPartyAuthorityBlock.trim()}`);
  }
  return parts.join("");
}

function entityHarnessPromptAddendum(
  entity: string | undefined,
  connectedSite: { name: string; siteUrl: string } | undefined,
  keyword?: string,
): string {
  const place = entity?.trim();
  const company = connectedSite?.name?.trim();
  if (!place && !company) return "";
  const canonical = place ? normalizeEntityHintCommaLabel(place) : "";
  const referenceBlock = canonical
    ? formatEntityReferencePromptBlock({
        entity: canonical,
        keyword: keyword?.trim() || undefined,
      })
    : "";
  const lines = ["*** ENTITY PAGE (SAP) ***"];
  if (canonical) lines.push(`Place entity: ${canonical}`);
  if (company) lines.push(`Connected business: ${company}`);
  lines.push("Write for a near-me local entity landing page; name the place with comma grammar from the entity block above.");
  const body = [lines.join("\n"), referenceBlock].filter(Boolean).join("\n\n");
  return `\n\n${body}`;
}

export function resolveOverviewSourceHtml(row: {
  postContentOptimized?: string;
  postContent?: string;
}, fetchedHtml?: string): string {
  return (
    row.postContentOptimized?.trim() ||
    row.postContent?.trim() ||
    fetchedHtml?.trim() ||
    ""
  );
}

/** Existing post body for Answer/Overview prepend — scraped content first, not prior harness output. */
export function resolveHarnessPrependSourceHtml(row: {
  postContent?: string;
  postContentOptimized?: string;
}, fetchedHtml?: string): string {
  return (
    row.postContent?.trim() ||
    fetchedHtml?.trim() ||
    row.postContentOptimized?.trim() ||
    ""
  );
}

export type PrependOverviewResult = {
  html: string;
  bodyH2Titles: string[];
  anchorMap: HarnessSectionAnchorEntry[];
};

/**
 * Pure stitch path used by tests: strip Overview, inject body ids, prepend Overview HTML.
 */
export function stitchOverviewOntoBody(args: {
  sourceHtml: string;
  overviewHtml: string;
  answerHtml?: string;
}): PrependOverviewResult {
  const stripped = stripLeadingOverviewSection(stripLeadingAnswerSection(args.sourceHtml));
  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  const outline = outlineFromBodyH2Titles(bodyH2Titles);
  const anchorMap = buildHarnessSectionAnchorMap(outline);
  const bodyWithIds = injectBodyH2AnchorIds(stripped, anchorMap);
  const overviewWithId = wrapOverviewSectionHtml(
    injectHarnessSectionH2AnchorId(
      args.overviewHtml.trim(),
      HARNESS_OVERVIEW_ANCHOR_ID,
    ),
  );
  const pieces: string[] = [];
  if (args.answerHtml?.trim()) {
    pieces.push(
      injectHarnessSectionH2AnchorId(args.answerHtml.trim(), HARNESS_ANSWER_ANCHOR_ID),
    );
  }
  pieces.push(overviewWithId, bodyWithIds);
  return {
    html: stitchHarnessSections(pieces),
    bodyH2Titles,
    anchorMap,
  };
}

export async function generateAndPrependOverviewHtml(args: {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  pregeneratedAnswerHtml?: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<PrependOverviewResult | null> {
  const stripped = stripLeadingOverviewSection(stripLeadingAnswerSection(args.sourceHtml));
  if (!stripped.trim()) {
    return null;
  }
  if (looksLikeBlockedHostHtml(stripped)) {
    throw new Error(
      "Page body looks like a Cloudflare block page, not WordPress content. Re-scrape or reload inventory, then retry Overview.",
    );
  }

  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  if (!bodyH2Titles.length) {
    throw new Error("No H2 headings to cite from Overview");
  }

  const keyword = args.focusKeyword.trim() || args.articleTitle.trim() || "this topic";
  const pageLabel = harnessPageKindLabel(args.pageKind);
  const purpose =
    args.pageKind === "entity" && args.entity?.trim()
      ? `AI Overview opener for "${keyword}" on an existing ${pageLabel} near ${args.entity.trim()} that cites body sections via same-page #anchors.`
      : `AI Overview opener for "${keyword}" that maps remaining body sections via same-page #anchors.`;
  const outline = outlineFromBodyH2Titles(bodyH2Titles);
  const outlineBlock = formatOutlineTitlesForHarnessPrompt(outline);
  const anchorMap = buildHarnessSectionAnchorMap(outline);
  const bodyWithIds = injectBodyH2AnchorIds(stripped, anchorMap);
  const anchorBlock = formatHarnessInPageAnchorBlock(anchorMap);
  const totalSections = outline.length + 2;
  const publishedTitles = ["Answer", "Overview", ...bodyH2Titles];

  const model = args.model?.trim() || getProductionModel();
  let answerHtml = args.pregeneratedAnswerHtml?.trim() || "";
  if (!answerHtml) {
    answerHtml = await generateAnswerSectionHtml({
      articleTitle: args.articleTitle,
      focusKeyword: args.focusKeyword,
      bodyH2Titles,
      includeOverviewInOutline: true,
      pageUrl: args.pageUrl,
      connectedSite: args.connectedSite,
      site: args.site,
      entity: args.entity,
      pageKind: args.pageKind,
      seoResearchBrief: args.seoResearchBrief,
      apiKey: args.apiKey,
      model: args.model,
      signal: args.signal,
    });
  }
  if (!answerHtml.trim()) {
    throw new Error("Answer section could not be generated (single pass)");
  }
  answerHtml = injectHarnessSectionH2AnchorId(answerHtml, HARNESS_ANSWER_ANCHOR_ID);

  const overviewAgent = buildBlogHarnessSummaryAgent();
  const sectionPrompt = generateSingleSectionPrompt(overviewAgent, "html");
  let userPrompt = buildBulkHarnessSectionUserPrompt(
    args.articleTitle.trim() || keyword,
    purpose,
    sectionPrompt,
    outlineBlock,
    bodyH2Titles,
    1,
    totalSections,
    args.connectedSite,
    args.pageKind === "entity" ? args.entity?.trim() : undefined,
    { keywordFocus: keyword },
    true,
    args.pageUrl,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    anchorBlock,
    undefined,
    undefined,
    keyword,
    publishedTitles,
    undefined,
    undefined,
    undefined,
    formatAnswerGroundingForIllustrativePromptBlock(answerHtml),
  );
  userPrompt = appendHarnessBriefGroundingToPrompt(userPrompt, args.seoResearchBrief);
  if (args.pageKind === "entity") {
    userPrompt += entityHarnessPromptAddendum(args.entity, args.connectedSite, keyword);
  }
  const pageCtx = resolvePageLocalContext({
    keyword,
    site: args.site,
    entity: args.pageKind === "entity" ? args.entity : undefined,
  });
  if (pageCtx.primaryCity) {
    userPrompt += `\n\n${formatPageLocalContextPromptBlock(pageCtx)}`;
  }

  const entityCanonicalOverview =
    args.pageKind === "entity" && args.entity?.trim()
      ? normalizeEntityHintCommaLabel(args.entity.trim())
      : "";
  const system =
    entityCanonicalOverview
      ? `You write the Overview (AI Overview) harness section for an existing service-area entity page near ${entityCanonicalOverview}. Output HTML only for this section. Follow the section contract exactly. Primary keyword: ${keyword}. Refer to the place with comma grammar from the entity label, not slug-style concatenation. Do not recap the published Answer.

BOLD LABELS (NON-NEGOTIABLE): Every key-point <li> MUST start with a bold label tag, then a colon: <li><strong>Label</strong>: description…</li>. Example: <li><strong>Cost Breakdown</strong>: discover average costs and what influences them.</li>. Never put a comma after </strong>. Plain text without <strong> is INVALID. Do not skip <strong>.
${pageCtx.primaryCity ? `\n${PRIMARY_CITY_CONSISTENCY_RULE}` : ""}`
      : `You write the Overview (AI Overview) harness section for an existing page. Output HTML only for this section. Follow the section contract exactly. Primary keyword: ${keyword}. Do not recap the published Answer.

BOLD LABELS (NON-NEGOTIABLE): Every key-point <li> MUST start with a bold label tag, then a colon: <li><strong>Label</strong>: description…</li>. Example: <li><strong>Cost Breakdown</strong>: discover average costs and what influences them.</li>. Never put a comma after </strong>. Plain text without <strong> is INVALID. Do not skip <strong>.
${pageCtx.primaryCity ? `\n${PRIMARY_CITY_CONSISTENCY_RULE}` : ""}`;

  const overviewResult = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system,
    user: userPrompt,
    maxTokens: 768,
    temperature: 0.35,
    signal: args.signal,
  });

  let overviewHtml = (overviewResult.content || "").trim();
  if (!overviewHtml) {
    throw new Error("Overview agent returned empty HTML");
  }
  overviewHtml = await ensureHarnessSectionLengthCompliance({
    sectionHtml: overviewHtml,
    sectionTitle: BLOG_HARNESS_SUMMARY_TITLE,
    siblingSectionTitles: bodyH2Titles,
    articleTitle: args.articleTitle.trim() || keyword,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
    isOverviewSection: true,
    inPageAnchorBlock: anchorBlock,
    overviewBulletCount: anchorMap.length,
  });

  overviewHtml = ensureOverviewBulletBoldLabels(overviewHtml);
  if (anchorMap.length === 0) {
    throw new Error("No body H2 anchors to cite from Overview");
  }
  if (!overviewBulletsHaveRequiredScrollLinks(overviewHtml, anchorMap)) {
    overviewHtml = await applyOverviewHarnessScrollLinks({
      html: overviewHtml,
      anchorMap,
      articleTitle: args.articleTitle.trim() || keyword,
      keyword,
      apiKey: args.apiKey,
      model: args.model,
      signal: args.signal,
      inPageAnchorBlock: anchorBlock,
    });
  }
  overviewHtml = completeOverviewScrollLinks(overviewHtml, anchorMap);
  overviewHtml = ensureOverviewBulletBoldLabels(overviewHtml);
  overviewHtml = injectHarnessSectionH2AnchorId(overviewHtml, HARNESS_OVERVIEW_ANCHOR_ID);
  overviewHtml = wrapOverviewSectionHtml(overviewHtml);

  return {
    html: enforceHarnessAnswerBeforeOverview(
      stitchHarnessSections([answerHtml, overviewHtml, bodyWithIds]),
    ),
    bodyH2Titles,
    anchorMap,
  };
}

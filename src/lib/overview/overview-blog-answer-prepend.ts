import { BLOG_HARNESS_ANSWER_TITLE, HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";
import { injectHarnessSectionH2AnchorId } from "@/lib/bulk/harness-section-anchor-ids";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { prepareHarnessSectionHtml } from "@/lib/bulk/harness-section-validate";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  formatAnswerMoneyPageLinksPromptBlock,
  rankFuzzyMoneyPageLinksForAnswer,
  resolveSitemapFuzzyLinkPool,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";
import type { WordPressSite } from "@/components/integrations/types";
import { enforceHarnessAnswerBeforeOverview, extractAnswerSectionHtml, extractOverviewSectionHtml, harnessPageKindLabel, isAnswerHeadingTitle, isOverviewHeadingTitle, stripLeadingAnswerSection, stripLeadingDuplicateArticleTitleHeading, type OverviewHarnessPageKind } from "@/lib/overview/overview-harness-html-sections";

export type GenerateAnswerSectionArgs = {
  articleTitle: string;
  focusKeyword: string;
  bodyH2Titles: string[];
  includeOverviewInOutline?: boolean;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  previousAnswerHtml?: string;
  moneyPageCandidates?: SitemapFuzzyLinkCandidate[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
};

/** Generate the Answer section HTML. One write. No retries, no name checks. */
export async function generateAnswerSectionHtml(args: GenerateAnswerSectionArgs): Promise<string> {
  const keyword = args.focusKeyword.trim() || args.articleTitle.trim() || "this topic";
  const title = args.articleTitle.trim() || keyword;
  const businessName = args.connectedSite?.name?.trim() || "";
  const entityCanonical =
    args.pageKind === "entity" && args.entity?.trim()
      ? normalizeEntityHintCommaLabel(args.entity.trim())
      : "";
  const pageLabel = harnessPageKindLabel(args.pageKind);

  let moneyPages = args.moneyPageCandidates ?? [];
  if (moneyPages.length === 0 && (args.site?.id || args.connectedSite?.siteUrl)) {
    const pool = await resolveSitemapFuzzyLinkPool({
      site: args.site,
      siteId: args.site?.id ?? null,
      pageUrl: args.pageUrl,
    });
    moneyPages = rankFuzzyMoneyPageLinksForAnswer({
      pool,
      articleTitle: title,
      focusKeyword: keyword,
      bodyH2Titles: args.bodyH2Titles,
      pageUrl: args.pageUrl,
      limit: 6,
    });
  }
  const moneyPageLinksBlock = formatAnswerMoneyPageLinksPromptBlock(moneyPages);
  const linkRule = moneyPages.length > 0
    ? " Weave 1 contextual <a href=\"...\">product/service anchor</a> link from PAGE SITEMAP MONEY PAGE TARGETS in the Answer paragraph to support the customer's transaction."
    : "";

  const answerSystem = entityCanonical
    ? `You write a brand-new Answer section from scratch for an existing ${pageLabel}. Output HTML only: <h2>Answer</h2> and one <p> with two or three sentences. No other headings. Primary keyword: ${keyword}. Place entity (comma label): ${entityCanonical}. Mention the connected business name somewhere in the Answer paragraph when one is listed.${linkRule} Respect official ® / ™ / © symbols on proprietary product lines and automation systems where applicable. Never copy or paraphrase a previous Answer block.`
    : `You write a brand-new Answer section from scratch for an existing ${pageLabel}. Output HTML only: <h2>Answer</h2> and one <p> with two or three sentences. No other headings. Primary keyword: ${keyword}. Mention the connected business name somewhere in the Answer paragraph when one is listed.${linkRule} Respect official ® / ™ / © symbols on proprietary product lines and automation systems where applicable. Never copy or paraphrase a previous Answer block.`;
  const answerUserPrompt = [
    `Title: ${title}`,
    `Keyword: ${keyword}`,
    businessName ? `Business name (mention somewhere in the Answer): ${businessName}` : "",
    entityCanonical ? `Place entity: ${entityCanonical}` : "",
    args.bodyH2Titles.length > 0
      ? `Article H2 sections covered: ${args.bodyH2Titles.join(" | ")}`
      : "",
    moneyPageLinksBlock,
    args.previousAnswerHtml?.trim()
      ? `Legacy Answer to replace completely (do NOT copy or synonym-swap its sentences):\n${args.previousAnswerHtml.trim()}`
      : "",
    args.pageKind === "entity" ? "This is a service-area entity page." : "",
    "Write the brand-new Answer HTML from scratch now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = args.model?.trim() || getProductionModel();
  const answerResult = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system: answerSystem,
    user: answerUserPrompt,
    maxTokens: 384,
    temperature: 0.6,
    signal: args.signal,
  });
  const rawAnswer = (answerResult.content || "").trim();
  if (!rawAnswer) {
    throw new Error("Answer section could not be generated");
  }
  const prepared = prepareHarnessSectionHtml(rawAnswer, {
    title: BLOG_HARNESS_ANSWER_TITLE,
    isOverview: false,
    isAnswer: true,
  });
  return prepared.trim() || rawAnswer;
}

export type PrependAnswerResult = {
  html: string;
  answerHtml: string;
};

/** Generate Answer only and prepend onto existing page HTML (preserves Overview + body). */
export async function generateAndPrependAnswerHtml(args: {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  connectedSite?: { name: string; siteUrl: string };
  site?: WordPressSite;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
  previousAnswerHtml?: string;
  moneyPageCandidates?: SitemapFuzzyLinkCandidate[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<PrependAnswerResult> {
  const existingAnswer = args.previousAnswerHtml?.trim() || extractAnswerSectionHtml(args.sourceHtml ?? "");
  const stripped = stripLeadingDuplicateArticleTitleHeading(
    stripLeadingAnswerSection(args.sourceHtml ?? ""),
    args.articleTitle,
  );
  if (!stripped.trim()) {
    throw new Error(
      "Post body HTML is required before Answer can be prepended. Load inventory with content, then retry.",
    );
  }
  const bodyH2Titles = extractH2TextsFromHtml(stripped).filter(
    (t) => !isOverviewHeadingTitle(t) && !isAnswerHeadingTitle(t),
  );
  const hasOverview = Boolean(extractOverviewSectionHtml(stripped).trim());

  const answerHtml = await generateAnswerSectionHtml({
    articleTitle: args.articleTitle,
    focusKeyword: args.focusKeyword,
    bodyH2Titles,
    includeOverviewInOutline: hasOverview,
    pageUrl: args.pageUrl,
    connectedSite: args.connectedSite,
    site: args.site,
    entity: args.entity,
    pageKind: args.pageKind,
    seoResearchBrief: args.seoResearchBrief,
    previousAnswerHtml: existingAnswer || undefined,
    moneyPageCandidates: args.moneyPageCandidates,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
  });

  const answerWithId = injectHarnessSectionH2AnchorId(answerHtml.trim(), HARNESS_ANSWER_ANCHOR_ID);
  return {
    html: enforceHarnessAnswerBeforeOverview(stitchHarnessSections([answerWithId, stripped])),
    answerHtml: answerWithId,
  };
}

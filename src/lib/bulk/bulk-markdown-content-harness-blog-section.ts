import type { AgentConfig } from '@/types/agent-config';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import type { BulkHarnessOutlineSection } from './bulk-harness-outline';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { runHarnessOpenRouterSection } from '@/lib/bulk/harness-openrouter-worker-client';
import {
  assertHarnessIllustrativeSectionHtml,
  harnessSectionPreparedValid,
  prepareHarnessSectionHtml,
  validateHarnessSectionOrThrow,
} from '@/lib/bulk/harness-section-validate';
import { injectBlacklistRagIntoMessages } from '@/lib/content-word-blocklist';
import { findImportedSectionBody } from '@/lib/bulk/blog-import-parser';
import {
  formatImportedToneForHarnessPrompt,
  getImportedToneFromRow,
} from '@/lib/bulk/blog-import-tone';
import { formatMandatoryEntityWikipediaForPrompt } from '@/lib/bulk/entity-wikipedia-prompt';
import { findServiceAreaPageForPlace } from '@/lib/bulk/bulk-generation-wp-inventory';
import { formatAnswerGroundingForIllustrativePromptBlock } from '@/lib/content-optimization/defensible-specificity-prompt';
import {
  extractIllustrativeExample,
  formatResearchAsOfLabel,
  buildIllustrativeExampleResearchQuery,
} from '@/lib/content-optimization/topic-research-fanout';
import { formatIllustrativePersonaPromptBlock, formatOverviewPersonaTeaserBlock } from '@/lib/content-optimization/first-party-authority-prompt';
import type { IllustrativeExample } from '@/lib/overview-seo-content-brief';
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from '@/lib/content-optimization/page-local-context';
import { parseSeoResearchBrief } from '@/lib/content-optimization/seo-research-brief-for-optimize';
import { resolveSiteLocationLabel } from '@/lib/llm-audit/resolve-site-location-label';
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { formatLinkTargetsPlanForSection } from "@/lib/bulk/bulk-generation-wp-inventory";
import { buildFocusedArticlePurpose } from '@/lib/content-generation/article-length-policy';
import type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
import {
  agentHasIllustrativeFeature,
  isCompletionTruncatedByTokenLimit,
} from '@/lib/bulk/bulk-markdown-content-harness-utils';
import type { createHarnessTokenBudgetTracker } from '@/lib/bulk/harness-section-max-tokens';

type PromptBuildersModule = typeof import("../prompt-builders");

export function createBlogHarnessSectionRuntime(args: {
  blueprint: { title?: string; purpose?: string; agents: AgentConfig[] };
  row: CSVRow;
  keywordData: KeywordData;
  options: BulkProcessingOptions;
  harnessRowIndex: number;
  connectedSite?: { name: string; siteUrl: string };
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  semrushExternalUrls?: string[];
  promptEnv?: HarnessPromptEnv;
  systemPrompt: string;
  harnessFormat: "markdown" | "html";
  releaseTopic: string;
  entity: string | undefined;
  entityWikipediaUrl: string | undefined;
  acfContext: AIDrivenACFContext;
  portfolioBlocked: BulkProcessingOptions["portfolioBlockedHosts"];
  harnessPageLocalBlock: string;
  competitorComparisonHarness: boolean;
  outlineBlock: string;
  totalSections: number;
  publishedSectionTitles: string[];
  tokenBudgetTracker: ReturnType<typeof createHarnessTokenBudgetTracker>;
  httpReferer: string;
  bodyAgents: AgentConfig[];
  bodyOutline: BulkHarnessOutlineSection[];
  harnessPrimaryKeyword: string;
  buildBulkHarnessSectionUserPrompt: PromptBuildersModule["buildBulkHarnessSectionUserPrompt"];
  generateSingleSectionPrompt: PromptBuildersModule["generateSingleSectionPrompt"];
}) {
  const { blueprint, row, keywordData, options, harnessRowIndex, connectedSite, wordPressPosts, semrushKeywordsContext, semrushScatterContext, semrushExternalUrls, promptEnv, systemPrompt, harnessFormat, releaseTopic, entity, entityWikipediaUrl, acfContext, portfolioBlocked, harnessPageLocalBlock, competitorComparisonHarness, outlineBlock, totalSections, publishedSectionTitles, tokenBudgetTracker, httpReferer, bodyAgents, bodyOutline, harnessPrimaryKeyword, buildBulkHarnessSectionUserPrompt, generateSingleSectionPrompt } = args;
  let cachedIllustrativePersonaBlock: string | null = null;
  let cachedOverviewPersonaTeaser: string | null = null;

  const ensureIllustrativePersonaCached = async (answerSectionHtml?: string): Promise<void> => {
    if (cachedIllustrativePersonaBlock) return;
    if (!bodyAgents.some(agentHasIllustrativeFeature)) return;
    const companyName = connectedSite?.name?.trim();
    if (!companyName) {
      throw new Error("Harness: [ILLUSTRATIVE] requires a connected site name");
    }
    const illustrativeAgentIndex = bodyAgents.findIndex(agentHasIllustrativeFeature);
    const illustrativeTitle =
      illustrativeAgentIndex >= 0
        ? bodyOutline[illustrativeAgentIndex]!.displayTitle.trim()
        : "";
    if (!illustrativeTitle) {
      throw new Error("Harness: [ILLUSTRATIVE] section is missing a planner H2 title");
    }
    const brief = acfContext?.seoResearch?.trim()
      ? parseSeoResearchBrief(acfContext.seoResearch)
      : null;
    const researchAsOf =
      brief?.queryFanout?.researchAsOf?.trim() || formatResearchAsOfLabel(new Date());
    const pageCtx = resolvePageLocalContext({
      keyword: harnessPrimaryKeyword,
      site: promptEnv?.wordpressSite,
      entity,
    });
    const location =
      pageCtx.prosePlaceLabel
      || pageCtx.primaryCity
      || entity?.trim()
      || acfContext?.serviceArea?.trim()
      || resolveSiteLocationLabel(promptEnv?.wordpressSite, harnessPrimaryKeyword)
      || "";
    const researchTopic = pageCtx.serviceTopic || harnessPrimaryKeyword;
    const illustrativeExampleQuery =
      brief?.queryFanout?.illustrativeExampleQuery?.trim()
      || buildIllustrativeExampleResearchQuery({
        topic: researchTopic,
        location: location || researchTopic,
        asOfLabel: researchAsOf,
      });
    const personaFromBrief = brief?.queryFanout?.illustrativeExample;
    let persona: IllustrativeExample | undefined =
      personaFromBrief?.illustrativeH2Title?.trim() ? personaFromBrief : undefined;
    if (!persona) {
      try {
        persona = await extractIllustrativeExample({
          keyword: harnessPrimaryKeyword,
          location,
          researchAsOf,
          companyName,
          illustrativeExampleQuery,
          pageUrl: promptEnv?.currentPageUrl,
          entity,
          serpByQuery: brief?.queryFanout?.serpByQuery,
          chatGptByQuery: brief?.queryFanout?.chatGptByQuery,
          illustrativeH2Title: illustrativeTitle,
          pageTitle: blueprint.title || row.title,
          siteId: promptEnv?.siteId,
          site: promptEnv?.wordpressSite,
          pageLocalContext: pageCtx,
          answerSectionHtml,
        });
      } catch (err) {
        console.warn("[Harness] Illustrative persona extract failed; continuing article plan:", err);
        persona = undefined;
      }
    }
    const cityPlace =
      entity?.trim()
      || pageCtx.prosePlaceLabel
      || pageCtx.primaryCity
      || location;
    const cityServiceArea = wordPressPosts?.length
      ? findServiceAreaPageForPlace(wordPressPosts, cityPlace)
      : undefined;
    if (persona?.illustrativeH2Title?.trim()) {
      cachedIllustrativePersonaBlock = [
        formatPageLocalContextPromptBlock(pageCtx),
        formatIllustrativePersonaPromptBlock(
          persona,
          researchAsOf,
          cityServiceArea
            ? { pageTitle: cityServiceArea.title, anchor: cityServiceArea.anchor }
            : undefined,
        ),
      ].join("\n\n");
      cachedOverviewPersonaTeaser = formatOverviewPersonaTeaserBlock(persona.personaName ?? "");
    } else {
      cachedIllustrativePersonaBlock = [
        formatPageLocalContextPromptBlock(pageCtx),
        [
          "--- ILLUSTRATIVE EXAMPLE (planner fallback — persona extract unavailable) ---",
          `target H2: ${illustrativeTitle} (exact — use this checklist title verbatim in <h2>)`,
          `Connected business: ${companyName}`,
          "Write the [ILLUSTRATIVE] section from the Answer section and blueprint. One named local homeowner scenario, blockquote story, then site-first recommendation from the connected business. Do not stop the article; complete the full section.",
          "--- END ILLUSTRATIVE EXAMPLE ---",
        ].join("\n"),
      ].join("\n\n");
      cachedOverviewPersonaTeaser = "";
      console.warn("[Harness] Using illustrative planner fallback (no DFS/OpenRouter persona JSON)");
    }
  };

  const runBlogHarnessSection = async (
    agent: AgentConfig,
    sectionIndex: number,
    titleForCb: string,
    opts: {
      maxTokens: number;
      isOverviewSection: boolean;
      isAnswerSection?: boolean;
      inPageAnchorBlock?: string;
      publishedPlanIndex: number;
      otherSectionTitles: string[];
      /** Published Answer HTML — grounds later sections so they do not recap; illustrative also uses economic ceiling. */
      answerSectionHtml?: string;
    },
  ): Promise<string> => {
    options.onHarnessSection?.({
      rowIndex: harnessRowIndex,
      sectionIndex,
      totalSections,
      title: titleForCb,
      phase: 'start',
    });

    const singleSectionPrompt = generateSingleSectionPrompt(
      agent,
      harnessFormat,
      promptEnv?.contentKind,
      releaseTopic,
      harnessPrimaryKeyword || undefined,
    );
    let illustrativePersonaBlock = "";
    if (agentHasIllustrativeFeature(agent)) {
      illustrativePersonaBlock = cachedIllustrativePersonaBlock ?? "";
      if (!illustrativePersonaBlock.trim()) {
        console.warn("[Harness] [ILLUSTRATIVE] section running without persona block; using blueprint only");
      }
    }
    const sectionLinkTargetsBlock =
      promptEnv?.linkTargetsPlan &&
      !opts.isOverviewSection &&
      !opts.isAnswerSection &&
      titleForCb.trim()
        ? formatLinkTargetsPlanForSection(promptEnv.linkTargetsPlan, titleForCb)
        : undefined;

    let userPrompt = buildBulkHarnessSectionUserPrompt(
      blueprint.title || row.title,
      blueprint.purpose || buildFocusedArticlePurpose(keywordData.keyword),
      singleSectionPrompt,
      outlineBlock,
      opts.otherSectionTitles,
      opts.publishedPlanIndex,
      totalSections,
      connectedSite,
      entity,
      acfContext,
      !!wordPressPosts?.length,
      promptEnv?.currentPageUrl,
      promptEnv?.gscKeywordsContext,
      semrushKeywordsContext,
      semrushScatterContext,
      semrushExternalUrls,
      portfolioBlocked,
      promptEnv?.contentKind,
      releaseTopic,
      opts.inPageAnchorBlock,
      opts.isOverviewSection && entity && entityWikipediaUrl ? entityWikipediaUrl : undefined,
      opts.isOverviewSection || opts.isAnswerSection ? undefined : titleForCb,
      promptEnv?.primaryKeyword?.trim() || row.keyword_focus?.trim() || row.keyword?.trim() || undefined,
      publishedSectionTitles,
      promptEnv?.llmAuditSummary,
      promptEnv?.dfsArticleAuditBlock,
      promptEnv?.firstPartyAuthorityBlock,
      formatAnswerGroundingForIllustrativePromptBlock(
        opts.isAnswerSection ? undefined : opts.answerSectionHtml,
      ),
      promptEnv?.llmAuditAuthorityExternalPairs,
      sectionLinkTargetsBlock,
      competitorComparisonHarness,
    );
    if (harnessPageLocalBlock) {
      userPrompt += `\n\n${harnessPageLocalBlock}`;
    }
    if (illustrativePersonaBlock) {
      userPrompt += `\n\n${illustrativePersonaBlock}`;
    }
    if (opts.isOverviewSection && cachedOverviewPersonaTeaser) {
      userPrompt += `\n\n${cachedOverviewPersonaTeaser}`;
    }
    if (opts.isOverviewSection && entity && entityWikipediaUrl) {
      const wikiBlock = formatMandatoryEntityWikipediaForPrompt({
        entity,
        wikipediaUrl: entityWikipediaUrl,
        wikipediaTitle: row.wikipedia_title?.trim() || undefined,
      });
      if (wikiBlock) {
        userPrompt += `\n\n${wikiBlock}`;
      }
    }
    const importedTone = getImportedToneFromRow(row);
    if (importedTone) {
      userPrompt += `\n\n${formatImportedToneForHarnessPrompt(importedTone)}`;
    }
    if (!opts.isOverviewSection && !opts.isAnswerSection) {
      const importedExcerpt = findImportedSectionBody(row, titleForCb);
      if (importedExcerpt) {
        userPrompt += `\n\n--- Imported draft excerpt (use facts from this excerpt only for this assigned section; do NOT copy headings, lists, or paragraphs belonging to other sections; output only the assigned ## block) ---\n${importedExcerpt}`;
      }
    }

    const isIllustrative = agentHasIllustrativeFeature(agent);
    const sectionLabel = opts.isAnswerSection
      ? "Answer"
      : opts.isOverviewSection
        ? "Overview"
        : isIllustrative
          ? "[ILLUSTRATIVE]"
          : titleForCb;

    // Section call failure fails the row visibly. No synthesized substitute
    // section is generated.
    const result = await runHarnessOpenRouterSection({
      sectionIndex,
      apiKey: options.openRouterApiKey,
      model: getBlogModel(promptEnv?.siteId),
      messages: injectBlacklistRagIntoMessages([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]),
      temperature: options.temperature || 1.0,
      maxTokens: opts.maxTokens,
      topP: options.topP || 0.9,
      httpReferer,
    });
    const sectionContent = (result.content || '').trim();
    const finishReason = result.finishReason;
    if (!sectionContent) {
      throw new Error(`Harness: section "${sectionLabel}" returned no content`);
    }
    const truncated = isCompletionTruncatedByTokenLimit(finishReason);

    const prepared = prepareHarnessSectionHtml(sectionContent, {
      title: titleForCb,
      isOverview: opts.isOverviewSection,
      isAnswer: opts.isAnswerSection,
      isIllustrative,
    });
    if (!prepared.trim()) {
      throw new Error(`Harness: section "${sectionLabel}" produced no HTML`);
    }
    if (!harnessSectionPreparedValid(prepared, { isIllustrative })) {
      console.warn(`[Bulk Harness] Section "${sectionLabel}" did not strictly match illustrative sub-tags; keeping section HTML.`);
    }
    // Publish gate: truncated or incomplete sections fail the row here,
    // before stitching and WordPress upload.
    validateHarnessSectionOrThrow(prepared, {
      title: titleForCb,
      finishReason,
      isOverview: opts.isOverviewSection,
      isAnswer: opts.isAnswerSection,
    });
    if (isIllustrative) {
      assertHarnessIllustrativeSectionHtml(prepared);
    }

    const budgetSectionKey = opts.isAnswerSection
      ? "Answer"
      : opts.isOverviewSection
        ? "Overview"
        : titleForCb;
    tokenBudgetTracker.record(budgetSectionKey, `${systemPrompt}\n${userPrompt}`, prepared);

    options.onHarnessSection?.({
      rowIndex: harnessRowIndex,
      sectionIndex,
      totalSections,
      title: titleForCb,
      phase: 'done',
      markdownSlice: prepared,
      truncated,
    });

    return prepared;
  };

  return { ensureIllustrativePersonaCached, runBlogHarnessSection };
}

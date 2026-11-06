import type { AgentConfig } from '@/types/agent-config';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import {
  buildBulkHarnessOutlineFromAgents,
  formatOutlineTitlesForHarnessPrompt,
  stitchHarnessSections,
} from './bulk-harness-outline';
import { formatSapPageWriterBlock } from '@/lib/prompt-builders/sap-page-template';
import { formatCompetitorComparisonWriterBlock } from '@/lib/prompt-builders/competitor-comparison-page-template';
import { isCompetitorComparisonRow } from '@/lib/competitor-research/competitor-csv-row';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { resolveHarnessHttpReferer } from '@/lib/bulk/harness-openrouter-worker-client';
import {
  assertStitchedHarnessArticle,
} from '@/lib/bulk/harness-section-validate';
import { runHarnessHtmlQualityControl } from '@/lib/content-generation/harness-html-quality-control';
import { findImportedSectionBody } from '@/lib/bulk/blog-import-parser';
import {
  ensureBlogHarnessSummaryLast,
  splitBlogHarnessBodyAndOverview,
} from '@/lib/bulk/blog-harness-summary-agent';
import { buildBlogHarnessAnswerAgent } from '@/lib/bulk/blog-harness-answer-agent';
import {
  buildHarnessSectionAnchorMap,
  formatHarnessInPageAnchorBlock,
} from '@/lib/bulk/harness-section-anchor-ids';
import {
  assertHarnessTokenBudgetPreflight,
  computeHarnessSectionTokenBudgets,
  createHarnessTokenBudgetTracker,
  isHarnessSeoOpenerBodyAgent,
} from '@/lib/bulk/harness-section-max-tokens';
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from '@/lib/content-optimization/page-local-context';
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { resolveAgentsForBulk } from "./bulk-blueprint-agents";
import type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
import { agentHasIllustrativeFeature, stripTrailingCopyrightBoilerplate } from '@/lib/bulk/bulk-markdown-content-harness-utils';
import { runPressReleaseHarnessContent } from '@/lib/bulk/bulk-markdown-content-harness-press';
import { createBlogHarnessSectionRuntime } from '@/lib/bulk/bulk-markdown-content-harness-blog-section';

export type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
export { stripTrailingCopyrightBoilerplate } from '@/lib/bulk/bulk-markdown-content-harness-utils';

export async function generateMarkdownContentHarnessed(
  blueprint: { title?: string; purpose?: string; agents: AgentConfig[] },
  row: CSVRow,
  keywordData: KeywordData,
  knowledgeFiles: Array<{ name: string; content: string }>,
  activeKnowledgeBaseText: string,
  options: BulkProcessingOptions,
  harnessRowIndex: number,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  siteSummary?: string,
  semrushKeywordsContext?: string,
  semrushScatterContext?: string,
  semrushExternalUrls?: string[],
  promptEnv?: HarnessPromptEnv,
): Promise<string> {
  void knowledgeFiles;
  void activeKnowledgeBaseText;
  const { buildSystemPrompt, buildBulkHarnessSectionUserPrompt, generateSingleSectionPrompt } =
    await import('../prompt-builders');
  const knowledgeBaseContext =
    typeof promptEnv?.knowledgeBaseContext === 'string' && promptEnv.knowledgeBaseContext.trim().length > 0
      ? promptEnv.knowledgeBaseContext.trim()
      : '';

  const rawAgentsForBulk = resolveAgentsForBulk(blueprint);
  if (rawAgentsForBulk.length === 0) {
    throw new Error('Harness: blueprint has no agents to generate');
  }
  const agentsForBulk = ensureBlogHarnessSummaryLast(rawAgentsForBulk, promptEnv?.contentKind);

  const isPressReleaseHarness = promptEnv?.contentKind === "press_release";
  const releaseTopic =
    promptEnv?.primaryKeyword?.trim() || row.keyword?.trim() || row.keyword_focus?.trim() || "";
  const bulkPrimaryKw =
    promptEnv?.primaryKeyword?.trim() || row.keyword?.trim() || row.keyword_focus?.trim() || "";

  const finalizeStitchedHarnessHtml = async (stitchedHtml: string): Promise<string> => {
    if (isPressReleaseHarness) return stitchedHtml;
    options.onProgress?.(harnessRowIndex, 0, 'Quality control: checking HTML...');
    // QC failure throws and fails the row; un-QC'd HTML never uploads.
    return runHarnessHtmlQualityControl({
      html: stitchedHtml,
      apiKey: options.openRouterApiKey,
      model: getBlogModel(promptEnv?.siteId),
    });
  };

  const entityFromRow =
    row.entity &&
    row.entity.trim() &&
    row.entity.trim() !== 'N/A'
      ? row.entity.trim()
      : undefined;
  const harnessEntity = promptEnv?.harnessEntity?.trim();
  const entity =
    harnessEntity && harnessEntity !== 'N/A'
      ? harnessEntity
      : entityFromRow;
  const entityWikipediaUrl = row.wikipedia_url?.trim() || undefined;

  const harnessKeyword =
    promptEnv?.primaryKeyword?.trim()
    || row.keyword_focus?.trim()
    || row.keyword?.trim()
    || "";
  const harnessPageCtx = promptEnv?.wordpressSite
    ? resolvePageLocalContext({
        keyword: harnessKeyword,
        site: promptEnv.wordpressSite,
        entity,
      })
    : null;
  const harnessPageLocalBlock =
    harnessPageCtx?.primaryCity ? formatPageLocalContextPromptBlock(harnessPageCtx) : "";

  const competitorComparisonHarness = isCompetitorComparisonRow(row);
  const acfContext: AIDrivenACFContext =
    promptEnv?.acfContextOverride ??
    ({
      promptModifier: mergeOptimizerInstructions(options.optionalPrompt, row.prompt_modifier),
      keywordFocus: row.keyword_focus?.trim() || undefined,
      serviceArea: competitorComparisonHarness
        ? row.competitor_fields?.trim() || undefined
        : row.service_area_fields?.trim() || undefined,
    } satisfies AIDrivenACFContext);

  const portfolioBlocked = options.portfolioBlockedHosts;

  let systemPrompt = await buildSystemPrompt(
    knowledgeBaseContext,
    options.openRouterApiKey,
    connectedSite,
    wordPressPosts,
    promptEnv?.currentPageUrl,
    entity,
    promptEnv?.siteId,
    promptEnv?.primaryKeyword,
    siteSummary,
    semrushExternalUrls,
    portfolioBlocked,
    promptEnv?.contentKind,
    'harness_section',
    '',
    promptEnv?.llmAuditAuthorityExternalPairs,
    promptEnv?.linkTargetsPlan,
  );


  if (entity && !isPressReleaseHarness) {
    systemPrompt += competitorComparisonHarness
      ? `\n${formatCompetitorComparisonWriterBlock(entity, connectedSite?.name)}`
      : `\n${formatSapPageWriterBlock(entity)}`;
  }

  const totalBudget = options.maxTokens || 16000;
  const httpReferer = resolveHarnessHttpReferer();
  const harnessFormat = isPressReleaseHarness ? ("markdown" as const) : ("html" as const);

  if (isPressReleaseHarness) {
    return runPressReleaseHarnessContent({
      blueprint,
      row,
      keywordData,
      options,
      harnessRowIndex,
      connectedSite,
      wordPressPosts,
      semrushKeywordsContext,
      semrushScatterContext,
      semrushExternalUrls,
      promptEnv,
      agentsForBulk,
      systemPrompt,
      totalBudget,
      httpReferer,
      harnessFormat,
      releaseTopic,
      entity,
      acfContext,
      portfolioBlocked,
      competitorComparisonHarness,
      buildBulkHarnessSectionUserPrompt,
      generateSingleSectionPrompt,
    });
  }

  const { bodyAgents, overviewAgent } = splitBlogHarnessBodyAndOverview(agentsForBulk);
  if (!overviewAgent) {
    throw new Error('Harness: missing Overview agent');
  }
  if (bodyAgents.length === 0) {
    throw new Error('Harness: no body sections to generate');
  }

  const answerAgent = buildBlogHarnessAnswerAgent();
  const bodyOutline = buildBulkHarnessOutlineFromAgents(bodyAgents);
  const bodyAnchors = buildHarnessSectionAnchorMap(bodyOutline);
  const publishedSectionTitles = ['Answer', 'Overview', ...bodyOutline.map((x) => x.displayTitle)];
  const totalSections = bodyAgents.length + 2;
  const outlineBlock = formatOutlineTitlesForHarnessPrompt(bodyOutline);

  const harnessTokenSlots = computeHarnessSectionTokenBudgets(
    [
      {
        sectionKey: 'Answer',
        agent: answerAgent,
        isOverview: false,
        isAnswer: true,
      },
      {
        sectionKey: 'Overview',
        agent: overviewAgent,
        isOverview: true,
        bodySectionCount: bodyAgents.length,
      },
      ...bodyAgents.map((agent, bi) => ({
        sectionKey: bodyOutline[bi]!.displayTitle,
        agent,
        isOverview: false,
        isSeoOpener: isHarnessSeoOpenerBodyAgent(agent),
        importedExcerptChars: findImportedSectionBody(row, bodyOutline[bi]!.displayTitle)?.length ?? 0,
      })),
    ],
    totalBudget,
  );
  assertHarnessTokenBudgetPreflight(harnessTokenSlots, totalBudget, totalSections);
  const harnessTokenBySectionKey = new Map(
    harnessTokenSlots.map((slot) => [slot.sectionKey, slot.maxTokens]),
  );
  const tokenBudgetTracker = createHarnessTokenBudgetTracker({
    totalBudget,
    slots: harnessTokenSlots,
    onUsage: options.onHarnessTokenUsage,
  });
  const logTokenBudgetSummary = () => {
    const s = tokenBudgetTracker.summary();
    console.info(
      `[Bulk Harness] Token usage for row ${harnessRowIndex}: estimated ~${s.estimatedTokens}, actual ~${s.actualTokens} (prompt ~${s.promptTokens} + completion ~${s.completionTokens}) of budget ${s.totalBudget}`,
    );
  };

  const harnessPrimaryKeyword =
    promptEnv?.primaryKeyword?.trim()
    || row.keyword_focus?.trim()
    || row.keyword?.trim()
    || keywordData.keyword?.trim()
    || "";
  const { ensureIllustrativePersonaCached, runBlogHarnessSection } = createBlogHarnessSectionRuntime({
    blueprint,
    row,
    keywordData,
    options,
    harnessRowIndex,
    connectedSite,
    wordPressPosts,
    semrushKeywordsContext,
    semrushScatterContext,
    semrushExternalUrls,
    promptEnv,
    systemPrompt,
    harnessFormat,
    releaseTopic,
    entity,
    entityWikipediaUrl,
    acfContext,
    portfolioBlocked,
    harnessPageLocalBlock,
    competitorComparisonHarness,
    outlineBlock,
    totalSections,
    publishedSectionTitles,
    tokenBudgetTracker,
    httpReferer,
    bodyAgents,
    bodyOutline,
    harnessPrimaryKeyword,
    buildBulkHarnessSectionUserPrompt,
    generateSingleSectionPrompt,
  });

  if (options.sequentialHarnessSections) {
    const overviewInPageAnchorBlock = formatHarnessInPageAnchorBlock(bodyAnchors, { contextOnly: true });
    const answerMaxTokens = harnessTokenBySectionKey.get("Answer");
    if (answerMaxTokens == null) {
      throw new Error("Harness: missing token budget for Answer");
    }
    const overviewMaxTokens = harnessTokenBySectionKey.get("Overview");
    if (overviewMaxTokens == null) {
      throw new Error("Harness: missing token budget for Overview");
    }
    const sequentialPieces: string[] = [
      await runBlogHarnessSection(answerAgent, 0, "Answer", {
        maxTokens: answerMaxTokens,
        isOverviewSection: false,
        isAnswerSection: true,
        publishedPlanIndex: 0,
        otherSectionTitles: ["Overview", ...bodyOutline.map((x) => x.displayTitle)],
      }),
    ];
    const answerMd = sequentialPieces[0] ?? "";
    await ensureIllustrativePersonaCached(answerMd);
    sequentialPieces.push(
      await runBlogHarnessSection(overviewAgent, 1, "Overview", {
        maxTokens: overviewMaxTokens,
        isOverviewSection: true,
        inPageAnchorBlock: overviewInPageAnchorBlock,
        publishedPlanIndex: 1,
        otherSectionTitles: bodyOutline.map((x) => x.displayTitle),
        answerSectionHtml: answerMd,
      }),
    );
    for (let bi = 0; bi < bodyAgents.length; bi++) {
      const agent = bodyAgents[bi]!;
      const o = bodyOutline[bi]!;
      const titleForCb = o.displayTitle;
      const otherSectionTitles = bodyOutline.filter((_, j) => j !== bi).map((x) => x.displayTitle);
      const maxTokens = harnessTokenBySectionKey.get(titleForCb);
      if (maxTokens == null) {
        throw new Error(`Harness: missing token budget for section "${titleForCb}"`);
      }
      sequentialPieces.push(
        await runBlogHarnessSection(agent, bi + 2, titleForCb, {
          maxTokens,
          isOverviewSection: false,
          publishedPlanIndex: bi + 2,
          otherSectionTitles,
          answerSectionHtml: answerMd,
        }),
      );
    }
    const requireIllustrative = bodyAgents.some(agentHasIllustrativeFeature);
    const sequentialHtml = stripTrailingCopyrightBoilerplate(stitchHarnessSections(sequentialPieces));
    assertStitchedHarnessArticle(sequentialHtml, { requireIllustrative });
    logTokenBudgetSummary();
    return finalizeStitchedHarnessHtml(sequentialHtml);
  }

  const overviewInPageAnchorBlock = formatHarnessInPageAnchorBlock(bodyAnchors, { contextOnly: true });
  const answerMaxTokens = harnessTokenBySectionKey.get('Answer');
  if (answerMaxTokens == null) {
    throw new Error('Harness: missing token budget for Answer');
  }
  const overviewMaxTokens = harnessTokenBySectionKey.get('Overview');
  if (overviewMaxTokens == null) {
    throw new Error('Harness: missing token budget for Overview');
  }
  const answerMd = await runBlogHarnessSection(answerAgent, 0, 'Answer', {
    maxTokens: answerMaxTokens,
    isOverviewSection: false,
    isAnswerSection: true,
    publishedPlanIndex: 0,
    otherSectionTitles: ['Overview', ...bodyOutline.map((x) => x.displayTitle)],
  });

  await ensureIllustrativePersonaCached(answerMd);

  const overviewMd = await runBlogHarnessSection(overviewAgent, 1, 'Overview', {
    maxTokens: overviewMaxTokens,
    isOverviewSection: true,
    inPageAnchorBlock: overviewInPageAnchorBlock,
    publishedPlanIndex: 1,
    otherSectionTitles: bodyOutline.map((x) => x.displayTitle),
    answerSectionHtml: answerMd,
  });
  const bodyPieces: Awaited<ReturnType<typeof runBlogHarnessSection>>[] = [];
  for (const [bi, agent] of bodyAgents.entries()) {
    const titleForCb = bodyOutline[bi].displayTitle;
    const otherSectionTitles = bodyOutline.filter((_, j) => j !== bi).map((x) => x.displayTitle);
    const maxTokens = harnessTokenBySectionKey.get(titleForCb);
    if (maxTokens == null) {
      throw new Error(`Harness: missing token budget for section "${titleForCb}"`);
    }
    bodyPieces.push(
      await runBlogHarnessSection(agent, bi + 2, titleForCb, {
        maxTokens,
        isOverviewSection: false,
        publishedPlanIndex: bi + 2,
        otherSectionTitles,
        answerSectionHtml: answerMd,
      }),
    );
  }

  const stitched = stitchHarnessSections([answerMd, overviewMd, ...bodyPieces]);
  if (!stitched?.trim()) {
    throw new Error("Harness: stitched article is empty");
  }
  const html = stripTrailingCopyrightBoilerplate(stitched);
  const requireIllustrativeParallel = bodyAgents.some(agentHasIllustrativeFeature);
  assertStitchedHarnessArticle(html, { requireIllustrative: requireIllustrativeParallel });
  logTokenBudgetSummary();
  return finalizeStitchedHarnessHtml(html);
}

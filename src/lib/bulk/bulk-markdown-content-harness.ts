import pLimit from "p-limit";
import { OVERVIEW_AI_COPY_STREAM_CONCURRENCY } from "@/lib/overview/overview-ai-copy-concurrency";
import type { AgentConfig } from '@/types/agent-config';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import {
  buildBulkHarnessOutlineFromAgents,
  formatOutlineTitlesForHarnessPrompt,
  formatPressReleaseOutlineForHarnessPrompt,
  stitchHarnessSections,
} from './bulk-harness-outline';
import { ensurePressReleaseSectionHeading } from '@/lib/press-release/press-release-heading-guard';
import { pressReleaseHarnessSectionLabel } from '@/lib/press-release/press-release-harness-prompts';
import { buildFocusedArticlePurpose } from '@/lib/content-generation/article-length-policy';
import { formatSapPageWriterBlock } from '@/lib/prompt-builders/sap-page-template';
import { formatCompetitorComparisonWriterBlock } from '@/lib/prompt-builders/competitor-comparison-page-template';
import { isCompetitorComparisonRow } from '@/lib/competitor/competitor-csv-row';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { resolveHarnessHttpReferer, runHarnessOpenRouterSection } from '@/lib/bulk/harness-openrouter-worker-client';
import {
  harnessSectionPreparedValid,
  prepareHarnessSectionHtml,
  stitchedHarnessArticleValid,
} from '@/lib/bulk/harness-section-validate';
import { runHarnessHtmlQualityControl } from '@/lib/content-generation/harness-html-quality-control';
import { injectBlacklistRagIntoMessages } from '@/lib/content-word-blocklist';
import { findImportedSectionBody } from '@/lib/bulk/blog-import-parser';
import {
  formatImportedToneForHarnessPrompt,
  getImportedToneFromRow,
} from '@/lib/bulk/blog-import-tone';
import {
  ensureBlogHarnessSummaryFirst,
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
  isHarnessSeoOpenerBodyAgent,
} from '@/lib/bulk/harness-section-max-tokens';
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
import type { WordPressSite } from '@/components/integrations/types';
import type { AIDrivenACFContext } from "@/lib/prompt-builders/system-user";
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { resolveAgentsForBulk } from "./bulk-blueprint-agents";
import { formatLinkTargetsPlanForSection } from "@/lib/bulk/bulk-generation-wp-inventory";

function agentHasIllustrativeFeature(agent: AgentConfig): boolean {
  return (
    agent.features?.some(
      (f) => typeof f === "string" && f.toLowerCase().trim().startsWith("[illustrative]"),
    ) ?? false
  );
}

/** Extra prompt wiring for WordPress content optimizer (RAG page URL, GSC, shared ACF context). */
export type HarnessPromptEnv = {
  knowledgeBaseContext?: string;
  currentPageUrl?: string;
  gscKeywordsContext?: string;
  /** Overrides CSV row entity logic when set (optimizer blueprint entity). */
  harnessEntity?: string;
  acfContextOverride?: AIDrivenACFContext;
  /** Optimizer: passed to buildSystemPrompt for cache-scoped internal link list. */
  siteId?: string;
  primaryKeyword?: string;
  /** Predetermined page/blog link plan from Link targets harness step. */
  linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  /** Relaxes blog SEO rules (per-H2 exact keyword, etc.) for press releases */
  contentKind?: "press_release";
  /** Merged multi-platform LLM audit — mandatory local facts in harness sections. */
  llmAuditSummary?: string;
  dfsArticleAuditBlock?: string;
  firstPartyAuthorityBlock?: string;
  llmAuditAuthorityExternalPairs?: import("@/lib/content-generation/external-link-placeholders").ExternalLinkPair[];
  /** Full site record for primary city resolution (not { name, siteUrl } alone). */
  wordpressSite?: WordPressSite;
};

/** Last-line / last-paragraph © or "All rights reserved" blocks (model hallucination). */
export function stripTrailingCopyrightBoilerplate(content: string): string {
  let s = content.trimEnd();
  const htmlPs = [
    /<p[^>]*>\s*(?:©|&(?:copy|#169);)\s*\d{2,4}\s*[^<]{0,160}<\/p>\s*$/i,
    /<p[^>]*>\s*Copyright\s*(?:©|&(?:copy|#169);)?\s*\d{2,4}[^<]{0,220}<\/p>\s*$/i,
    /<p[^>]*>[^<]{0,240}All rights reserved\.?\s*<\/p>\s*$/i,
  ];
  const mdLines = [
    /\n(?:©|Copyright)\s*(?:©)?\s*\d{2,4}[^\n]{0,200}\s*$/i,
    /\n[^\n]{0,240}All rights reserved\.?\s*$/i,
  ];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const re of htmlPs) {
      const n = s.replace(re, "");
      if (n !== s) {
        s = n.trimEnd();
        changed = true;
      }
    }
    for (const re of mdLines) {
      const n = s.replace(re, "");
      if (n !== s) {
        s = n.trimEnd();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return s;
}


function isCompletionTruncatedByTokenLimit(finishReason?: string): boolean {
  if (typeof finishReason !== 'string' || !finishReason.trim()) return false;
  const lo = finishReason.trim().toLowerCase().replace(/-/g, '_');
  if (lo === 'length' || lo === 'max_tokens' || lo === 'max_output_tokens') return true;
  if (lo.includes('max_tokens') || lo.includes('length_limit')) return true;
  return false;
}

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

  const finalizeStitchedHarnessHtml = async (stitchedHtml: string): Promise<string> => {
    if (isPressReleaseHarness) return stitchedHtml;
    options.onProgress?.(harnessRowIndex, 0, 'Quality control: checking HTML...');
    try {
      return await runHarnessHtmlQualityControl({
        html: stitchedHtml,
        apiKey: options.openRouterApiKey,
        model: getBlogModel(promptEnv?.siteId),
      });
    } catch (err) {
      console.warn('[Bulk Harness] HTML quality control failed (non-fatal, keeping stitched HTML):', err);
      return stitchedHtml;
    }
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
    const outline = buildBulkHarnessOutlineFromAgents(agentsForBulk);
    const outlineBlock = formatPressReleaseOutlineForHarnessPrompt(outline);
    const n = agentsForBulk.length;
    const perSectionMax = Math.min(1400, Math.max(640, Math.floor(totalBudget / Math.max(n, 1))));
    const totalSections = agentsForBulk.length;

    const pieces = await Promise.all(
      agentsForBulk.map(async (agent, i) => {
        const o = outline[i];
        const titleForCb = pressReleaseHarnessSectionLabel(i);

        options.onHarnessSection?.({
          rowIndex: harnessRowIndex,
          sectionIndex: i,
          totalSections,
          title: titleForCb,
          phase: 'start',
        });

        const singleSectionPrompt = generateSingleSectionPrompt(
          agent,
          harnessFormat,
          promptEnv?.contentKind,
          releaseTopic,
        );
        let userPrompt = buildBulkHarnessSectionUserPrompt(
          blueprint.title || row.title,
          blueprint.purpose || buildFocusedArticlePurpose(keywordData.keyword),
          singleSectionPrompt,
          outlineBlock,
          [],
          i,
          agentsForBulk.length,
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
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          promptEnv?.llmAuditSummary,
          promptEnv?.dfsArticleAuditBlock,
          promptEnv?.firstPartyAuthorityBlock,
          promptEnv?.llmAuditAuthorityExternalPairs,
          undefined,
          competitorComparisonHarness,
        );
        const importedTone = getImportedToneFromRow(row);
        if (importedTone) {
          userPrompt += `\n\n${formatImportedToneForHarnessPrompt(importedTone)}`;
        }
        const importedExcerpt = findImportedSectionBody(row, o.displayTitle);
        if (importedExcerpt) {
          userPrompt += `\n\n--- Imported draft excerpt ---\n${importedExcerpt}`;
        }

        const result = await runHarnessOpenRouterSection({
          sectionIndex: i,
          apiKey: options.openRouterApiKey,
          model: getBlogModel(promptEnv?.siteId),
          messages: injectBlacklistRagIntoMessages([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ]),
          temperature: options.temperature || 1.0,
          maxTokens: perSectionMax,
          topP: options.topP || 0.9,
          httpReferer,
        });

        let sectionContent = (result.content || '').trim();
        if (!sectionContent) {
          sectionContent = `# ${titleForCb}\n\n`;
        }

        if (releaseTopic) {
          sectionContent = await ensurePressReleaseSectionHeading({
            sectionMarkdown: sectionContent,
            topic: releaseTopic,
            headlineHint: blueprint.title || row.title,
            sectionIntent: agent.description ?? "",
            apiKey: options.openRouterApiKey,
            model: getBlogModel(promptEnv?.siteId),
          });
        }

        const truncated = isCompletionTruncatedByTokenLimit(result.finishReason);
        if (truncated) {
          console.warn(`[Bulk Harness] Section ${i + 1} may be truncated (finish_reason: ${result.finishReason})`);
        }

        options.onHarnessSection?.({
          rowIndex: harnessRowIndex,
          sectionIndex: i,
          totalSections,
          title: titleForCb,
          phase: 'done',
          markdownSlice: sectionContent,
          truncated,
        });

        return sectionContent;
      }),
    );

    const stitched = stitchHarnessSections(pieces);
    if (!stitched?.trim()) {
      return stripTrailingCopyrightBoilerplate(pieces.filter(Boolean).join("\n\n"));
    }
    return stripTrailingCopyrightBoilerplate(stitched);
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

  const harnessPrimaryKeyword =
    promptEnv?.primaryKeyword?.trim()
    || row.keyword_focus?.trim()
    || row.keyword?.trim()
    || keywordData.keyword?.trim()
    || "";

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

    let sectionContent = '';
    let finishReason: string | undefined;
    try {
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
      sectionContent = (result.content || '').trim();
      finishReason = result.finishReason;
    } catch (err) {
      console.warn(`[Bulk Harness] Section "${sectionLabel}" OpenRouter call encountered an error; falling back to synthesis:`, err);
    }

    if (!sectionContent) {
      const primaryKw = bulkPrimaryKw || titleForCb;
      sectionContent = `## ${titleForCb}\n\nUnderstanding the essentials of ${primaryKw} helps make informed decisions. Key factors include quality craftsmanship, tailored dimensions, professional assessment, and long-term durability. Exploring tailored options ensures practical functionality and elevated design.`;
    }
    const truncated = isCompletionTruncatedByTokenLimit(finishReason);

    let prepared = prepareHarnessSectionHtml(sectionContent, {
      title: titleForCb,
      isOverview: opts.isOverviewSection,
      isAnswer: opts.isAnswerSection,
      isIllustrative,
    });
    if (!prepared.trim()) {
      prepared = `<h2>${titleForCb}</h2>\n<p>Comprehensive insights and practical details regarding ${bulkPrimaryKw || titleForCb}.</p>`;
    }
    if (!harnessSectionPreparedValid(prepared, { isIllustrative })) {
      console.warn(`[Bulk Harness] Section "${sectionLabel}" did not strictly match illustrative sub-tags; keeping section HTML.`);
    }

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
    if (!stitchedHarnessArticleValid(sequentialHtml, { requireIllustrative })) {
      console.warn("[Bulk Harness] Sequential stitched article missing optional sub-markers; keeping stitched HTML.");
    }
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

  const sectionLimit = pLimit(OVERVIEW_AI_COPY_STREAM_CONCURRENCY);
  const [overviewMd, ...bodyPieces] = await Promise.all([
    runBlogHarnessSection(overviewAgent, 1, 'Overview', {
      maxTokens: overviewMaxTokens,
      isOverviewSection: true,
      inPageAnchorBlock: overviewInPageAnchorBlock,
      publishedPlanIndex: 1,
      otherSectionTitles: bodyOutline.map((x) => x.displayTitle),
      answerSectionHtml: answerMd,
    }),
    ...bodyAgents.map((agent, bi) =>
      sectionLimit(async () => {
        const o = bodyOutline[bi];
        const titleForCb = o.displayTitle;
        const otherSectionTitles = bodyOutline.filter((_, j) => j !== bi).map((x) => x.displayTitle);
        const maxTokens = harnessTokenBySectionKey.get(titleForCb);
        if (maxTokens == null) {
          throw new Error(`Harness: missing token budget for section "${titleForCb}"`);
        }
        return runBlogHarnessSection(agent, bi + 2, titleForCb, {
          maxTokens,
          isOverviewSection: false,
          publishedPlanIndex: bi + 2,
          otherSectionTitles,
          answerSectionHtml: answerMd,
        });
      }),
    ),
  ]);

  const stitched = stitchHarnessSections([answerMd, overviewMd, ...bodyPieces]);
  if (!stitched?.trim()) {
    throw new Error("Harness: stitched article is empty");
  }
  const html = stripTrailingCopyrightBoilerplate(stitched);
  const requireIllustrativeParallel = bodyAgents.some(agentHasIllustrativeFeature);
  if (!stitchedHarnessArticleValid(html, { requireIllustrative: requireIllustrativeParallel })) {
    console.warn(
      "[Bulk Harness] Stitched article missing optional sub-markers; keeping stitched HTML.",
    );
  }
  return finalizeStitchedHarnessHtml(html);
}

import type { AgentConfig } from '@/types/agent-config';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import {
  buildBulkHarnessOutlineFromAgents,
  formatPressReleaseOutlineForHarnessPrompt,
  stitchHarnessSections,
} from './bulk-harness-outline';
import { ensurePressReleaseSectionHeading } from '@/lib/press-release/press-release-heading-guard';
import { pressReleaseHarnessSectionLabel } from '@/lib/press-release/press-release-harness-prompts';
import { buildFocusedArticlePurpose } from '@/lib/content-generation/article-length-policy';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { runHarnessOpenRouterSection } from '@/lib/bulk/harness-openrouter-worker-client';
import { injectBlacklistRagIntoMessages } from '@/lib/content-word-blocklist';
import { findImportedSectionBody } from '@/lib/bulk/blog-import-parser';
import {
  formatImportedToneForHarnessPrompt,
  getImportedToneFromRow,
} from '@/lib/bulk/blog-import-tone';
import {
  createHarnessTokenBudgetTracker,
} from '@/lib/bulk/harness-section-max-tokens';
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-acf-reader";
import type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
import {
  isCompletionTruncatedByTokenLimit,
  stripTrailingCopyrightBoilerplate,
} from '@/lib/bulk/bulk-markdown-content-harness-utils';

type PromptBuildersModule = typeof import("../prompt-builders");

export async function runPressReleaseHarnessContent(args: {
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
  agentsForBulk: AgentConfig[];
  systemPrompt: string;
  totalBudget: number;
  httpReferer: string;
  harnessFormat: "markdown" | "html";
  releaseTopic: string;
  entity: string | undefined;
  acfContext: AIDrivenACFContext;
  portfolioBlocked: BulkProcessingOptions["portfolioBlockedHosts"];
  competitorComparisonHarness: boolean;
  buildBulkHarnessSectionUserPrompt: PromptBuildersModule["buildBulkHarnessSectionUserPrompt"];
  generateSingleSectionPrompt: PromptBuildersModule["generateSingleSectionPrompt"];
}): Promise<string> {
  const { blueprint, row, keywordData, options, harnessRowIndex, connectedSite, wordPressPosts, semrushKeywordsContext, semrushScatterContext, semrushExternalUrls, promptEnv, agentsForBulk, systemPrompt, totalBudget, httpReferer, harnessFormat, releaseTopic, entity, acfContext, portfolioBlocked, competitorComparisonHarness, buildBulkHarnessSectionUserPrompt, generateSingleSectionPrompt } = args;
  const outline = buildBulkHarnessOutlineFromAgents(agentsForBulk);
  const outlineBlock = formatPressReleaseOutlineForHarnessPrompt(outline);
  const n = agentsForBulk.length;
  const perSectionMax = Math.min(1400, Math.max(640, Math.floor(totalBudget / Math.max(n, 1))));
  const totalSections = agentsForBulk.length;
  const pressTokenTracker = createHarnessTokenBudgetTracker({
    totalBudget,
    slots: agentsForBulk.map((_, i) => ({
      sectionKey: pressReleaseHarnessSectionLabel(i),
      maxTokens: perSectionMax,
      weight: 1,
      estimatedNeed: perSectionMax,
    })),
    onUsage: options.onHarnessTokenUsage,
  });

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
        undefined,
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
        throw new Error(`Harness: section "${titleForCb}" returned no content`);
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

      pressTokenTracker.record(titleForCb, `${systemPrompt}\n${userPrompt}`, sectionContent);

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

  const pressSummary = pressTokenTracker.summary();
  console.info(
    `[Bulk Harness] Token usage for row ${harnessRowIndex}: estimated ~${pressSummary.estimatedTokens}, actual ~${pressSummary.actualTokens} (prompt ~${pressSummary.promptTokens} + completion ~${pressSummary.completionTokens}) of budget ${pressSummary.totalBudget}`,
  );
  const stitched = stitchHarnessSections(pieces);
  if (!stitched?.trim()) {
    return stripTrailingCopyrightBoilerplate(pieces.filter(Boolean).join("\n\n"));
  }
  return stripTrailingCopyrightBoilerplate(stitched);
}

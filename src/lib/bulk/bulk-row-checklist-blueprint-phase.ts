import { injectImportedLinksIntoChecklist } from "./blog-import-draft-links";
import type { ImportedDraftLink } from "./blog-import-draft-links";
import { injectEntityWikipediaIntoChecklist } from "./entity-wikipedia-prompt";
import {
  injectModifierExternalLinksIntoChecklist,
  injectLlmAuditAuthorityLinksIntoChecklist,
} from "./modifier-external-links";
import type { ModifierExternalLink } from "./modifier-external-links";
import {
  formatChecklistFileContent,
  GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK,
  prepareChecklistForPipeline,
} from "@/lib/content-word-blocklist";
import { generateChecklistFromSelections, generateBlueprintFromTemplate } from "../blog-template-builder";
import type { ImageChecklistItem } from "../image-checklist-builder";
import type { KeywordData } from "../keyword-types";
import { BulkFileManager, type BulkGeneratedFile } from "../bulk-file-manager";
import { sanitizeWordPressSlugSegment } from "../rank-math-redirect-csv";
import { bulkPostsToExtraTextLinkRows, emitEntitySapPipelineHarnessDone } from "@/lib/bulk/bulk-harness-progress";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import type { BulkProcessingOptions } from "./bulk-auto-generate-types";
import type { CSVRow } from "./bulk-csv-parser";
import { runBulkRowBlueprintDraftPhase } from "./bulk-row-blueprint-draft-phase";
import { keepBlogPlayLinkTargets, inventoryRowsToWordPressLinkables } from "./bulk-generation-wp-inventory";
import type { LinkTargetsPlan } from "./bulk-generation-wp-inventory";
import { getBulkGenerationWpInventoryIfReady } from "./bulk-generation-inventory-cache-store";
import { runContentLinkTargetsHarness } from "../overview/overview-content-link-targets-harness-run";
import { OptimizationFileManager } from "../optimization-file-manager";
import { resolveBulkPrimaryKeyword } from "./bulk-primary-keyword";
import { bulkRowSerpLocationName } from "./bulk-row-research-enrichment";
import type { ExternalLinkPair } from "../content-generation/external-link-placeholders";
import type { LlmAuditAuthorityLinkLike } from "./modifier-external-links";

export type BulkRowChecklistBlueprintPhaseResult = {
  enrichedRow: CSVRow;
  checklistResult: Awaited<ReturnType<typeof generateChecklistFromSelections>>;
  checklist: string[];
  linkTargetsPlan: LinkTargetsPlan | undefined;
  flowPurposeStr: string;
  outlineTextForImage: string;
  entityForImage: string | undefined;
  useGoogleMaps: boolean;
  useAiImagePath: boolean;
  preBlogSeoSkeleton: ReturnType<typeof buildPreBlogSeoResearchSkeleton>;
  blueprintResult: Awaited<ReturnType<typeof generateBlueprintFromTemplate>> & { h2Outline?: string[] };
  precomputedImageChecklist: ImageChecklistItem[];
  precomputedMetaDescription: string | undefined;
  flowTitleForBlueprint: string;
  flowPurposeResolved: string;
  bulkPrimaryKwResolved: string;
  bulkResolvedPostTitle: string;
};

export async function runBulkRowChecklistAndBlueprintPhase(input: {
  rowIndex: number;
  row: CSVRow;
  enrichedRow: CSVRow;
  keywordData: KeywordData;
  options: BulkProcessingOptions;
  fileManager: BulkFileManager;
  timestamp: number;
  generatedFiles: BulkGeneratedFile[];
  connectedSite?: { name: string; siteUrl: string; id?: string };
  postsForInternalLinks: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  paaRawResponse: unknown;
  selectedKeywords: string[];
  selectedH2Sections: string[];
  selectedPeopleAlsoAsk: string[];
  selectedResearchLinks: string[];
  importedDraftLinks: ImportedDraftLink[];
  modifierExternalLinks: ModifierExternalLink[];
  importedH2Outline: string[];
  rowExplicitExternalPairs: ExternalLinkPair[];
  prefilledRowContract: string;
  pipelineResearchModel: string;
  pipelineBlogModel: string;
  pipelineSiteId: string | undefined;
  entityForLocalTemplate: string | undefined;
  entityWikiUrl: string | undefined;
  entityWikiTitle: string | undefined;
  llmAuditSummaryPrompt: string;
  dfsArticleAuditBlock: string;
  firstPartyAuthorityBlock: string;
  llmAuditAuthorityLinks: LlmAuditAuthorityLinkLike[];
  serpLlmBriefJson: string;
  serpLlmBrief: SeoContentBriefV1;
  serpStoredFile: string | null;
  llmOkCount: number;
  destinationPageUrl: string;
  serpSite: import("@/components/integrations/types").WordPressSite | undefined;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
}): Promise<BulkRowChecklistBlueprintPhaseResult> {
  let {
    rowIndex,
    row,
    enrichedRow,
    keywordData,
    options,
    fileManager,
    timestamp,
    generatedFiles,
    connectedSite,
    postsForInternalLinks,
    paaRawResponse,
    selectedKeywords,
    selectedH2Sections,
    selectedPeopleAlsoAsk,
    selectedResearchLinks,
    importedDraftLinks,
    modifierExternalLinks,
    importedH2Outline,
    rowExplicitExternalPairs,
    prefilledRowContract,
    pipelineResearchModel,
    pipelineBlogModel,
    pipelineSiteId,
    entityForLocalTemplate,
    entityWikiUrl,
    entityWikiTitle,
    llmAuditSummaryPrompt,
    dfsArticleAuditBlock,
    firstPartyAuthorityBlock,
    llmAuditAuthorityLinks,
    serpLlmBriefJson,
    serpLlmBrief,
    serpStoredFile,
    llmOkCount,
    destinationPageUrl,
    serpSite,
    semrushKeywordsContext,
    semrushScatterContext,
  } = input;

    // Generate checklist (after SERP + LLM brief)
    options.onProgress?.(rowIndex, 0, 'Generating checklist...');
    const prosePrimaryKeyword = resolveBulkPrimaryKeyword(row, enrichedRow, keywordData, enrichedRow.title);

    let checklistResult = await generateChecklistFromSelections(
      selectedKeywords,
      selectedH2Sections,
      enrichedRow.title,
      keywordData,
      {
        apiKey: options.openRouterApiKey,
        model: pipelineResearchModel,
        temperature: options.temperature || 1.0,
        maxTokens: Math.max(options.maxTokens || 0, 16000),
        topP: options.topP || 0.9,
        userPrompt: enrichedRow.prompt_modifier || enrichedRow.modifier, // Use prompt_modifier if available, fallback to modifier
        entity: entityForLocalTemplate,
        serpData: paaRawResponse,
        selectedPeopleAlsoAsk,
        selectedResearchLinks,
        connectedSite,
        postsForInternalLinks,
        runExternalResearch: rowExplicitExternalPairs.length > 0,
        locationName: bulkRowSerpLocationName(enrichedRow),
        languageCode: "en",
        importedDraftLinks: importedDraftLinks.length ? importedDraftLinks : undefined,
        modifierExternalLinks: modifierExternalLinks.length ? modifierExternalLinks : undefined,
        userExternalLinks: rowExplicitExternalPairs.length ? rowExplicitExternalPairs : undefined,
        wikipediaUrl: entityWikiUrl,
        wikipediaTitle: entityWikiTitle,
        prefilledRowContract: prefilledRowContract || undefined,
        llmAuditSummary: llmAuditSummaryPrompt || undefined,
        dfsArticleAuditBlock: dfsArticleAuditBlock || undefined,
        firstPartyAuthorityBlock: firstPartyAuthorityBlock || undefined,
        siteId: serpSite?.id ?? connectedSite?.id,
        primaryKeyword: prosePrimaryKeyword,
        currentPageUrl: destinationPageUrl || undefined,
        ...(llmAuditAuthorityLinks.length ? { llmAuditAuthorityLinks } : {}),
        ...(importedH2Outline.length ? { importedH2Outline } : {}),
        ...(!entityForLocalTemplate ? { serpResearchBriefJson: serpLlmBriefJson } : {}),
        ...(options.forbiddenLiveH2s?.length ? { forbiddenLiveH2s: options.forbiddenLiveH2s } : {}),
      }
    );
    let checklist = injectImportedLinksIntoChecklist(checklistResult.items, importedDraftLinks);
    checklist = injectModifierExternalLinksIntoChecklist(checklist, modifierExternalLinks);
    checklist = injectLlmAuditAuthorityLinksIntoChecklist(checklist, llmAuditAuthorityLinks);
    if (entityForLocalTemplate && entityWikiUrl) {
      checklist = injectEntityWikipediaIntoChecklist(checklist, {
        entity: entityForLocalTemplate,
        wikipediaUrl: entityWikiUrl,
        wikipediaTitle: entityWikiTitle,
      });
    }
    const pipelineChecklistOpts = {
      sapEntity: entityForLocalTemplate || undefined,
    };
    const pipelineChecklist = prepareChecklistForPipeline(checklist, pipelineChecklistOpts);

    if (pipelineChecklist.length === 0) {
      throw new Error('Failed to generate checklist');
    }

    const checklistFileName = BulkFileManager.generateFileName(enrichedRow, 'blog_checklist', timestamp);
    const checklistFileId = BulkFileManager.createFileId(rowIndex, 'blog-checklist', timestamp);
    const checklistFile: BulkGeneratedFile = {
      id: checklistFileId,
      rowIndex,
      fileName: checklistFileName,
      content: JSON.stringify(
        {
          forbiddenWordsPolicy: GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK,
          generatedAt: new Date().toISOString(),
          title: enrichedRow.title,
          serpStoredFile,
          llmAuditPlatformCount: llmOkCount,
          lines: pipelineChecklist,
          downloadText: formatChecklistFileContent(checklist),
        },
        null,
        2
      ),
      mimeType: 'application/json',
      status: 'completed',
      timestamp,
      rowData: row,
    };
    checklist = pipelineChecklist;
    fileManager.addFile(checklistFile);
    generatedFiles.push(checklistFile);
    emitEntitySapPipelineHarnessDone(options, rowIndex, enrichedRow, "Checklist");
    options.onProgress?.(rowIndex, 0, 'Blog checklist ready');

    let linkTargetsPlan: LinkTargetsPlan | undefined;
    const linkSiteId = serpSite?.id ?? connectedSite?.id;
    const linkApiKey = options.openRouterApiKey || loadApiKey();
    let linkPoolSource: BulkInternalLinkRow[] = postsForInternalLinks;
    if (!linkPoolSource.length && linkSiteId) {
      const invRows = getBulkGenerationWpInventoryIfReady(linkSiteId);
      if (invRows?.length) {
        linkPoolSource = keepBlogPlayLinkTargets(inventoryRowsToWordPressLinkables(invRows));
      }
    }
    const bodyTitlesForLinkPlan = checklistResult.h2Outline?.length
      ? checklistResult.h2Outline
      : selectedH2Sections;
    if (
      linkSiteId &&
      linkApiKey?.trim() &&
      linkPoolSource.length > 0 &&
      bodyTitlesForLinkPlan.length > 0
    ) {
      options.onProgress?.(rowIndex, 0, "Planning internal link targets...");
      try {
        const linkOptFileManager = new OptimizationFileManager();
        const linkFileSlug =
          sanitizeWordPressSlugSegment(enrichedRow.target_slug ?? "") ||
          sanitizeWordPressSlugSegment(keywordData.keyword) ||
          "article";
        linkTargetsPlan = await runContentLinkTargetsHarness({
          apiKey: linkApiKey,
          siteId: linkSiteId,
          primaryKeyword: prosePrimaryKeyword,
          bodySectionTitles: bodyTitlesForLinkPlan,
          linkPool: bulkPostsToExtraTextLinkRows(linkPoolSource),
          fileManager: linkOptFileManager,
          fileSlug: linkFileSlug,
        });
        const linkTargetsOptFile = linkOptFileManager
          .getFiles()
          .find((file) => file.name.toLowerCase().startsWith("link-targets-"));
        if (linkTargetsOptFile) {
          const linkTargetsFile: BulkGeneratedFile = {
            id: BulkFileManager.createFileId(rowIndex, "link-targets", timestamp),
            rowIndex,
            fileName: linkTargetsOptFile.name,
            content: linkTargetsOptFile.content,
            mimeType: linkTargetsOptFile.mimeType,
            status: "completed",
            timestamp,
            rowData: enrichedRow,
          };
          fileManager.addFile(linkTargetsFile);
          generatedFiles.push(linkTargetsFile);
          emitEntitySapPipelineHarnessDone(
            options,
            rowIndex,
            enrichedRow,
            "Link targets",
            checklistResult.h2Outline ?? [],
          );
        }
      } catch (e) {
        console.warn("[Bulk Auto-Generate] Internal link target planning failed (non-fatal):", e);
      }
    }

    const blueprintDraft = await runBulkRowBlueprintDraftPhase({
      rowIndex,
      row,
      enrichedRow,
      keywordData,
      options,
      fileManager,
      timestamp,
      generatedFiles,
      connectedSite,
      checklistResult,
      pipelineChecklist,
      importedDraftLinks,
      modifierExternalLinks,
      rowExplicitExternalPairs,
      prefilledRowContract,
      pipelineResearchModel,
      pipelineBlogModel,
      pipelineSiteId,
      entityForLocalTemplate,
      entityWikiUrl,
      entityWikiTitle,
      llmAuditSummaryPrompt,
      dfsArticleAuditBlock,
      firstPartyAuthorityBlock,
      llmAuditAuthorityLinks,
      serpLlmBrief,
      semrushKeywordsContext,
      semrushScatterContext,
    });
    enrichedRow = blueprintDraft.enrichedRow;

  return {
    enrichedRow,
    checklistResult,
    checklist,
    linkTargetsPlan,
    ...blueprintDraft,
  };
}

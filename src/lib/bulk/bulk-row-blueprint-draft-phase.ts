import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import { injectImportedLinksIntoBlueprintAgents } from "./blog-import-draft-links";
import type { ImportedDraftLink } from "./blog-import-draft-links";
import { injectEntityWikipediaIntoBlueprintAgents } from "./entity-wikipedia-prompt";
import {
  injectModifierExternalLinksIntoBlueprintAgents,
  injectLlmAuditAuthorityLinksIntoBlueprintAgents,
} from "./modifier-external-links";
import type { ModifierExternalLink } from "./modifier-external-links";
import {
  enforceForbiddenWordsOnBlueprint,
  formatBlueprintFileContent,
} from "@/lib/content-word-blocklist";
import { hasCsvFilledMeta } from "./prefilled-bulk-row-contract";
import { generateBlueprintFromTemplate, generateChecklistFromSelections } from "../blog-template-builder";
import type { BlogTemplateContext } from "../blog-template-builder";
import type { ImageChecklistItem } from "../image-checklist-builder";
import { generateImageChecklist } from "./bulk-image-generator";
import type { KeywordData } from "../keyword-types";
import { BulkFileManager, type BulkGeneratedFile } from "../bulk-file-manager";
import { rowUsesGoogleImageFeatured } from "../overview/overview-content-optimize-pipeline";
import { emitEntitySapPipelineHarnessDone } from "@/lib/bulk/bulk-harness-progress";
import {
  buildPreBlogSeoResearchSkeleton,
  mergeBlueprintIntoPreBlogSkeleton,
} from "@/lib/content-generation/bulk-acf-seo-bundle";
import { generateMetaDescription } from "@/lib/content-generation/content-generator";
import { resolveBulkWordPressPostTitle } from "@/lib/bulk/bulk-post-title-agent";
import { loadApiKey } from "../api";
import { mergeSeoBriefIntoBulkSkeleton } from "@/lib/llm-audit/fetch-merged-seo-content-brief";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { acfOriginAppliesForSitemapType } from "@/lib/acf-origin-applies";
import type { BulkProcessingOptions } from "./bulk-auto-generate-types";
import type { CSVRow } from "./bulk-csv-parser";
import { resolveBulkPrimaryKeyword } from "./bulk-primary-keyword";
import { resolveRankMathFromKeywordResearch } from "@/lib/bulk/bulk-keyword-research-artifacts";
import type { ExternalLinkPair } from "../content-generation/external-link-placeholders";
import type { LlmAuditAuthorityLinkLike } from "./modifier-external-links";

export type BulkRowBlueprintDraftPhaseResult = {
  enrichedRow: CSVRow;
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

export async function runBulkRowBlueprintDraftPhase(input: {
  rowIndex: number;
  row: CSVRow;
  enrichedRow: CSVRow;
  keywordData: KeywordData;
  options: BulkProcessingOptions;
  fileManager: BulkFileManager;
  timestamp: number;
  generatedFiles: BulkGeneratedFile[];
  connectedSite?: { name: string; siteUrl: string; id?: string };
  checklistResult: Awaited<ReturnType<typeof generateChecklistFromSelections>>;
  pipelineChecklist: string[];
  importedDraftLinks: ImportedDraftLink[];
  modifierExternalLinks: ModifierExternalLink[];
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
  serpLlmBrief: SeoContentBriefV1;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
}): Promise<BulkRowBlueprintDraftPhaseResult> {
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
  } = input;

  const harnessKeywordData: KeywordData = {
    ...keywordData,
    keyword: resolveBulkPrimaryKeyword(row, enrichedRow, keywordData) || keywordData.keyword,
  };
  const flowPurposeStr =
    options.flowPurpose || buildFocusedArticlePurpose(harnessKeywordData.keyword);
  const outlineTextForImage = `Blog checklist outline:\n${pipelineChecklist.join("\n")}`;

  const entityForImage =
    enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== "N/A"
      ? enrichedRow.entity.trim()
      : row.entity && row.entity.trim() && row.entity.trim() !== "N/A"
        ? row.entity.trim()
        : undefined;
  const useGoogleMaps = rowUsesGoogleImageFeatured(row, options.featuredImageType) && !!entityForImage;
  if (rowUsesGoogleImageFeatured(row, options.featuredImageType) && !entityForImage) {
    throw new Error(
      `Google Maps image requested but no entity found for row ${rowIndex + 1}. Add an entity to the row or use AI-generated images.`,
    );
  }
  const useAiImagePath = row.featuredImage !== "n" && !useGoogleMaps;

  const imageChecklistLlmOptions = {
    apiKey: options.openRouterApiKey,
    model: pipelineResearchModel,
    temperature: options.temperature || 1.0,
    maxTokens: options.maxTokens || 4000,
    topP: options.topP || 0.9,
  };

  const sequentialDraft = Boolean(useGoogleMaps || options.sequentialHarnessSections);
  options.onProgress?.(
    rowIndex,
    0,
    sequentialDraft ? "Blueprint + SEO draft..." : "Blueprint + SEO draft (parallel)...",
  );
  const baseUserPrompt = enrichedRow.prompt_modifier || enrichedRow.modifier;
  const context: BlogTemplateContext = {
    flowTitle: enrichedRow.title,
    flowPurpose: flowPurposeStr,
    keywordData: harnessKeywordData,
    userPrompt: baseUserPrompt?.trim() || undefined,
    prefilledRowContract: prefilledRowContract || undefined,
  };

  const metaTitleForBulk = enrichedRow.title || harnessKeywordData.keyword;
  const metaContextBulk = `Blog post title: "${metaTitleForBulk}". Primary keyword: "${harnessKeywordData.keyword}".`;
  const csvMetaDescription = hasCsvFilledMeta(enrichedRow) ? enrichedRow.meta_description!.trim() : "";

  const blueprintTemplateArgs = {
    apiKey: options.openRouterApiKey,
    model: pipelineResearchModel,
    temperature: options.temperature || 1.0,
    maxTokens: options.maxTokens || 8000,
    topP: options.topP || 0.9,
    connectedSite,
    entity: entityForLocalTemplate,
    importedDraftLinks: importedDraftLinks.length ? importedDraftLinks : undefined,
    modifierExternalLinks: modifierExternalLinks.length ? modifierExternalLinks : undefined,
    userExternalLinks: rowExplicitExternalPairs.length ? rowExplicitExternalPairs : undefined,
    wikipediaUrl: entityWikiUrl,
    wikipediaTitle: entityWikiTitle,
    llmAuditSummary: llmAuditSummaryPrompt || undefined,
    dfsArticleAuditBlock: dfsArticleAuditBlock || undefined,
    firstPartyAuthorityBlock: firstPartyAuthorityBlock || undefined,
    ...(llmAuditAuthorityLinks.length ? { llmAuditAuthorityLinks } : {}),
  };
  const preBlogSeoSkeleton = buildPreBlogSeoResearchSkeleton({
    keywordData: harnessKeywordData,
    enrichedRow,
    semrushKeywordsContext,
    semrushScatterContext,
    flowTitle: enrichedRow.title,
  });

  let blueprintResultRaw: Awaited<ReturnType<typeof generateBlueprintFromTemplate>>;
  let precomputedImageChecklist: ImageChecklistItem[];
  let precomputedMetaDescription: string | undefined;

  if (sequentialDraft) {
    blueprintResultRaw = await generateBlueprintFromTemplate(pipelineChecklist, context, blueprintTemplateArgs);
    precomputedImageChecklist = useAiImagePath
      ? await generateImageChecklist(
          enrichedRow.title,
          flowPurposeStr,
          outlineTextForImage,
          imageChecklistLlmOptions,
        ).catch(() => [])
      : [];
    precomputedMetaDescription = csvMetaDescription
      ? csvMetaDescription
      : await generateMetaDescription(
          metaContextBulk,
          harnessKeywordData.keyword,
          options.openRouterApiKey,
          pipelineSiteId,
          metaTitleForBulk,
          false,
        ).catch(() => "");
  } else {
    [blueprintResultRaw, precomputedImageChecklist, , precomputedMetaDescription] = await Promise.all([
      generateBlueprintFromTemplate(pipelineChecklist, context, blueprintTemplateArgs),
      useAiImagePath
        ? generateImageChecklist(
            enrichedRow.title,
            flowPurposeStr,
            outlineTextForImage,
            imageChecklistLlmOptions,
          ).catch(() => [] as ImageChecklistItem[])
        : Promise.resolve([] as ImageChecklistItem[]),
      Promise.resolve(preBlogSeoSkeleton),
      csvMetaDescription
        ? Promise.resolve(csvMetaDescription)
        : generateMetaDescription(
            metaContextBulk,
            harnessKeywordData.keyword,
            options.openRouterApiKey,
            pipelineSiteId,
            metaTitleForBulk,
            false,
          ).catch(() => ""),
    ]);
  }
  const blueprintAgentsWithImports = injectImportedLinksIntoBlueprintAgents(
    blueprintResultRaw.agents,
    importedDraftLinks,
  );
  const blueprintAgentsWithModifierLinks = injectModifierExternalLinksIntoBlueprintAgents(
    blueprintAgentsWithImports,
    modifierExternalLinks,
  );
  const blueprintAgentsWithAuthorityLinks = injectLlmAuditAuthorityLinksIntoBlueprintAgents(
    blueprintAgentsWithModifierLinks,
    llmAuditAuthorityLinks,
  );
  const blueprintAgentsLinked =
    entityForLocalTemplate && entityWikiUrl
      ? injectEntityWikipediaIntoBlueprintAgents(blueprintAgentsWithAuthorityLinks, {
          entity: entityForLocalTemplate,
          wikipediaUrl: entityWikiUrl,
          wikipediaTitle: entityWikiTitle,
        })
      : blueprintAgentsWithAuthorityLinks;
  const blueprintResult = entityForLocalTemplate
    ? {
        ...blueprintResultRaw,
        agents: blueprintAgentsLinked,
      }
    : enforceForbiddenWordsOnBlueprint(
        {
          ...blueprintResultRaw,
          agents: blueprintAgentsLinked,
        },
        { sapEntity: undefined },
      );
  if (checklistResult.h2Outline?.length) {
    (blueprintResult as { h2Outline?: string[] }).h2Outline = checklistResult.h2Outline;
  }

  mergeBlueprintIntoPreBlogSkeleton(preBlogSeoSkeleton, blueprintResult.title, blueprintResult.purpose);
  mergeSeoBriefIntoBulkSkeleton(preBlogSeoSkeleton, serpLlmBrief);

  if (blueprintResult.agents.length === 0) {
    throw new Error("No agents generated from template");
  }

  const agentsWithoutLinks = blueprintResult.agents.filter((agent) => {
    const features = Array.isArray(agent.features) ? agent.features : [];
    const hasLinkFeature = features.some(
      (f: string) => typeof f === "string" && f.toLowerCase().trim().startsWith("[link]"),
    );
    return !hasLinkFeature;
  });

  if (agentsWithoutLinks.length > 0) {
    console.error(
      `[Bulk Generate] ⚠️ ${agentsWithoutLinks.length} agent(s) missing [LINK] feature after generation. This should not happen - validation should have caught this.`,
    );
  } else {
    console.log(`[Bulk Generate] ✅ All ${blueprintResult.agents.length} agents have [LINK] features`);
  }

  const blueprintFileName = BulkFileManager.generateFileName(row, "blueprint", timestamp);
  const blueprintFileId = BulkFileManager.createFileId(rowIndex, "blueprint", timestamp);

  const blueprintFile: BulkGeneratedFile = {
    id: blueprintFileId,
    rowIndex,
    fileName: blueprintFileName,
    content: formatBlueprintFileContent({
      title: blueprintResult.title || enrichedRow.title,
      purpose: blueprintResult.purpose,
      agents: blueprintResult.agents,
      keyword: harnessKeywordData.keyword,
      entity: enrichedRow.entity,
      acfFields: {
        date_modifier: enrichedRow.date_modifier,
        prompt_modifier: enrichedRow.prompt_modifier,
        service_area_fields: enrichedRow.service_area_fields,
        ...(acfOriginAppliesForSitemapType(enrichedRow.sitemap_type) && enrichedRow.origin
          ? { origin: enrichedRow.origin }
          : {}),
      },
    }),
    mimeType: "application/json",
    status: "completed",
    timestamp,
    rowData: enrichedRow,
  };

  fileManager.addFile(blueprintFile);
  generatedFiles.push(blueprintFile);
  emitEntitySapPipelineHarnessDone(
    options,
    rowIndex,
    enrichedRow,
    "Blueprint",
    checklistResult.h2Outline ?? [],
  );

  const flowTitleForBlueprint = blueprintResult.title || enrichedRow.title;
  const flowPurposeResolved = blueprintResult.purpose || flowPurposeStr;

  const bulkPrimaryKwResolved = resolveBulkPrimaryKeyword(row, enrichedRow, keywordData, blueprintResult.title);
  const rankMetaForTitle = resolveRankMathFromKeywordResearch(keywordData);
  let bulkResolvedPostTitle: string;
  if (options.optimizePreserveTitle?.trim()) {
    bulkResolvedPostTitle = options.optimizePreserveTitle.trim();
    options.onProgress?.(rowIndex, 0, "Using existing post title for optimize upload");
  } else {
    const entityPlace =
      enrichedRow.entity?.trim() && enrichedRow.entity.trim() !== "N/A" ? enrichedRow.entity.trim() : undefined;
    options.onProgress?.(rowIndex, 0, "Writing post title...");
    bulkResolvedPostTitle = await resolveBulkWordPressPostTitle({
      apiKey: options.openRouterApiKey || loadApiKey(),
      focusKeyword: bulkPrimaryKwResolved,
      entity: entityPlace,
      siteId: pipelineSiteId,
      model: pipelineBlogModel,
      candidates: {
        researchSeoTitle: rankMetaForTitle.seoTitle,
        csvTitle: enrichedRow.title,
        blueprintTitle: blueprintResult.title,
      },
    }).catch(() => enrichedRow.title?.trim() || blueprintResult.title?.trim() || bulkPrimaryKwResolved);
    enrichedRow = { ...enrichedRow, title: bulkResolvedPostTitle };
  }

  return {
    enrichedRow,
    flowPurposeStr,
    outlineTextForImage,
    entityForImage,
    useGoogleMaps,
    useAiImagePath,
    preBlogSeoSkeleton,
    blueprintResult,
    precomputedImageChecklist,
    precomputedMetaDescription,
    flowTitleForBlueprint,
    flowPurposeResolved,
    bulkPrimaryKwResolved,
    bulkResolvedPostTitle,
  };
}

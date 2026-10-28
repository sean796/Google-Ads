import { KeywordData, KeywordAIAnalysis } from '../keyword-types';
import { BulkFileManager } from '../bulk-file-manager';
import { BulkGeneratedFile } from '../bulk-file-manager';
import { SemrushBulkEnrichmentResult } from '../wordpress-api/semrush';
import { IntelligentKeywordResearchMergeResult } from './intelligent-keyword-research-merge';
import { BulkProcessingOptions, PrefetchedBulkKeywordResearch } from './bulk-auto-generate-types';
import type { CSVRow } from './bulk-csv-parser';
import { keepBlogPlayLinkTargets } from './bulk-generation-wp-inventory';
import { populateACFFieldsFromDFS } from '@/lib/bulk/bulk-row-acf-meta';
import { isCompetitorCsvKeyword } from '@/lib/competitor/competitor-csv-row';
import { buildSitesToPostFromPosting } from '@/lib/bulk/bulk-wordpress-link-prefetch';
import { publishBulkRowToWordPressSites } from '@/lib/bulk/bulk-wordpress-publish-row';
import { runBulkRowResearchEnrichmentPhase } from './bulk-row-research-enrichment';
import { runBulkRowChecklistAndBlueprintPhase } from './bulk-row-checklist-blueprint-phase';
import { runBulkRowContentAndMediaPhase } from './bulk-row-content-media-phase';

/**
 * Writes full DataForSEO / keyword-research payload to the bulk file list as soon as research completes,
 * before Semrush enrichment, checklist, or blueprint (so the UI can show downloads immediately).
 */
export function addKeywordResearchSnapshotToBulkFiles(
  rowIndex: number,
  row: CSVRow,
  fileManager: BulkFileManager,
  options: Pick<BulkProcessingOptions, 'onProgress'>,
  timestamp: number,
  payload: {
    keywordData: KeywordData;
    aiAnalysis: KeywordAIAnalysis;
    keywordsVolumeData: KeywordData[];
    paaRawResponse: unknown;
    primaryKeyword?: string;
    semrush?: SemrushBulkEnrichmentResult | null;
    intelligentMerge?: IntelligentKeywordResearchMergeResult | null;
    primaryExternalCitationUrl?: string | null;
  }
): BulkGeneratedFile {
  const fileName = BulkFileManager.generateFileName(row, 'dfs_research', timestamp);
  const id = BulkFileManager.createFileId(rowIndex, 'dfs-research', timestamp);
  const body = {
    generatedAt: new Date().toISOString(),
    primaryKeyword: payload.primaryKeyword ?? row.keyword,
    dataforseo: {
      keywordData: payload.keywordData,
      aiAnalysis: payload.aiAnalysis,
      keywordsVolumeData: payload.keywordsVolumeData,
      paaRawResponse: payload.paaRawResponse,
    },
    semrush: payload.semrush ?? null,
    intelligentMerge: payload.intelligentMerge ?? null,
    primaryExternalCitationUrl: payload.primaryExternalCitationUrl ?? null,
    keywordData: payload.keywordData,
    aiAnalysis: payload.aiAnalysis,
    keywordsVolumeData: payload.keywordsVolumeData,
    paaRawResponse: payload.paaRawResponse,
  };
  let content: string;
  try {
    content = JSON.stringify(body, null, 2);
  } catch {
    content = JSON.stringify(
      {
        generatedAt: body.generatedAt,
        primaryKeyword: body.primaryKeyword,
        error: 'Could not stringify full DFS snapshot (payload too large or circular)',
        keywordData: payload.keywordData,
      },
      null,
      2
    );
  }
  const file: BulkGeneratedFile = {
    id,
    rowIndex,
    fileName,
    content,
    mimeType: 'application/json',
    status: 'completed',
    timestamp,
    rowData: row,
  };
  fileManager.addFile(file);
  options.onProgress?.(rowIndex, 0, 'Keyword research ready');
  return file;
}

/**
 * Generate blueprint and content for a row (after keyword research is complete).
 */
export async function generateBlueprintAndContent(
  rowIndex: number,
  row: CSVRow,
  keywordData: KeywordData,
  aiAnalysis: KeywordAIAnalysis,
  keywordsWithVolumeData: any[],
  paaRawResponse: any,
  options: BulkProcessingOptions,
  fileManager: BulkFileManager,
  knowledgeFiles: Array<{ name: string; content: string }> = [],
  activeKnowledgeBaseText: string = '',
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  prefetchedResearch?: PrefetchedBulkKeywordResearch | null
): Promise<BulkGeneratedFile[]> {
  const timestamp = Date.now();
  const generatedFiles: BulkGeneratedFile[] = [];
  let semrushKeywordsContext: string | undefined;
  let semrushScatterContext: string | undefined;
  let rowExternalUrlsForSanitize: string[] = [];
  let semrushSnapshotForAcf: SemrushBulkEnrichmentResult | undefined;
  let semrushCitationForAcf: string | null = null;
  let intelligentMergeForAcf: IntelligentKeywordResearchMergeResult | null = null;

  const acfFieldsFromDFS = populateACFFieldsFromDFS(row, keywordData, aiAnalysis, keywordsWithVolumeData);
  let enrichedRow: CSVRow = {
    ...row,
    ...acfFieldsFromDFS,
    date_modifier: row.date_modifier || acfFieldsFromDFS.date_modifier,
    prompt_modifier: row.prompt_modifier || acfFieldsFromDFS.prompt_modifier,
    service_area_fields: row.service_area_fields || acfFieldsFromDFS.service_area_fields,
    competitor: row.competitor || acfFieldsFromDFS.competitor,
    competitor_fields: row.competitor_fields || acfFieldsFromDFS.competitor_fields,
    ...(!isCompetitorCsvKeyword(row.keyword) &&
    (row.sitemap_type === 'entity' || acfFieldsFromDFS.origin)
      ? { origin: row.origin || acfFieldsFromDFS.origin }
      : {}),
  };

  const rowEntity = enrichedRow.entity?.trim() ?? "";
  const sitesToPostForTemplate = buildSitesToPostFromPosting(options.wordPressPosting, enrichedRow.entity);
  const hasRowEntity = Boolean(rowEntity && rowEntity !== "N/A");
  const useEntitySitemapTemplate =
    hasRowEntity &&
    (enrichedRow.sitemap_type === "entity" ||
      sitesToPostForTemplate.some((s) => s.sitemapType === "entity") ||
      options.useEntitySitemapTemplate === true);
  let entityForLocalTemplate = hasRowEntity ? rowEntity : undefined;
  const entityWikiUrl = options.skipWikipediaLookup
    ? undefined
    : enrichedRow.wikipedia_url?.trim() || undefined;
  const entityWikiTitle = options.skipWikipediaLookup
    ? undefined
    : enrichedRow.wikipedia_title?.trim() || undefined;
  const bulkOptions: BulkProcessingOptions = {
    ...options,
    useEntitySitemapTemplate,
  };
  const postsForInternalLinks = keepBlogPlayLinkTargets(wordPressPosts ?? []);

  try {
    const researchPhase = await runBulkRowResearchEnrichmentPhase({
      rowIndex,
      row,
      enrichedRow,
      keywordData,
      aiAnalysis,
      keywordsWithVolumeData,
      paaRawResponse,
      options,
      fileManager,
      timestamp,
      generatedFiles,
      connectedSite,
      prefetchedResearch,
      entityForLocalTemplate,
      entityWikiUrl,
      entityWikiTitle,
    });
    enrichedRow = researchPhase.enrichedRow;
    semrushKeywordsContext = researchPhase.semrushKeywordsContext;
    semrushScatterContext = researchPhase.semrushScatterContext;
    rowExternalUrlsForSanitize = researchPhase.rowExternalUrlsForSanitize;
    semrushSnapshotForAcf = researchPhase.semrushSnapshotForAcf;
    semrushCitationForAcf = researchPhase.semrushCitationForAcf;
    intelligentMergeForAcf = researchPhase.intelligentMergeForAcf;
    const selectedKeywords = researchPhase.selectedKeywords;
    const selectedH2Sections = researchPhase.selectedH2Sections;
    const selectedPeopleAlsoAsk = researchPhase.selectedPeopleAlsoAsk;
    const importedDraftLinks = researchPhase.importedDraftLinks;
    const importedH2Outline = researchPhase.importedH2Outline;
    const modifierExternalLinks = researchPhase.modifierExternalLinks;
    const rowExplicitExternalPairs = researchPhase.rowExplicitExternalPairs;
    const prefilledRowContract = researchPhase.prefilledRowContract;
    const pipelineSiteId = researchPhase.pipelineSiteId;
    const pipelineResearchModel = researchPhase.pipelineResearchModel;
    const pipelineBlogModel = researchPhase.pipelineBlogModel;
    const pipelineImageModel = researchPhase.pipelineImageModel;
    const serpLlmBrief = researchPhase.serpLlmBrief;
    const serpLlmBriefJson = researchPhase.serpLlmBriefJson;
    const serpStoredFile = researchPhase.serpStoredFile;
    const llmOkCount = researchPhase.llmOkCount;
    const llmAuditSummaryPrompt = researchPhase.llmAuditSummaryPrompt;
    const dfsArticleAuditBlock = researchPhase.dfsArticleAuditBlock;
    const firstPartyAuthorityBlock = researchPhase.firstPartyAuthorityBlock;
    const llmAuditAuthorityLinks = researchPhase.llmAuditAuthorityLinks;
    const selectedResearchLinks = researchPhase.selectedResearchLinks;
    const destinationPageUrl = researchPhase.destinationPageUrl;
    entityForLocalTemplate = researchPhase.entityForLocalTemplate;
    const serpSite = researchPhase.serpSite;
    const draftPhase = await runBulkRowChecklistAndBlueprintPhase({
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
    });
    enrichedRow = draftPhase.enrichedRow;
    const {
      blueprintResult,
      bulkPrimaryKwResolved,
      bulkResolvedPostTitle,
      precomputedMetaDescription,
      entityForImage,
      useGoogleMaps,
      useAiImagePath,
    } = draftPhase;

    const { markdownContent, precomputedAcfSeoBundle } = await runBulkRowContentAndMediaPhase({
      rowIndex,
      row,
      enrichedRow,
      keywordData,
      options,
      bulkOptions,
      fileManager,
      timestamp,
      generatedFiles,
      connectedSite,
      postsForInternalLinks,
      knowledgeFiles,
      activeKnowledgeBaseText,
      rowExplicitExternalPairs,
      pipelineBlogModel,
      pipelineResearchModel,
      pipelineImageModel,
      serpSite,
      serpLlmBriefJson,
      llmAuditSummaryPrompt,
      dfsArticleAuditBlock,
      firstPartyAuthorityBlock,
      llmAuditAuthorityLinks,
      semrushKeywordsContext,
      semrushScatterContext,
      rowExternalUrlsForSanitize,
      semrushCitationForAcf,
      intelligentMergeForAcf,
      semrushSnapshotForAcf,
      draft: draftPhase,
    });

    if (options.wordPressPosting?.enabled && markdownContent) {
      const wpPublish = await publishBulkRowToWordPressSites({
        options,
        rowIndex,
        row,
        enrichedRow,
        markdownContent,
        generatedFiles,
        fileManager,
        timestamp,
        bulkPrimaryKwResolved,
        bulkResolvedPostTitle,
        blueprintResult,
        keywordData,
        postsForInternalLinks,
        rowExplicitExternalPairs,
        pipelineBlogModel,
        precomputedMetaDescription,
        useGoogleMaps,
        entityForImage,
        useAiImagePath,
        precomputedAcfSeoBundle,
        semrushCitationForAcf,
        intelligentMergeForAcf,
        semrushSnapshotForAcf,
        semrushKeywordsContext,
        semrushScatterContext,
        rowExternalUrlsForSanitize,
      });
      if (wpPublish.earlyExit) {
        return generatedFiles;
      }
    }
    return generatedFiles;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  }
}

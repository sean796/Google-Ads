import { generateRowOutputs, generateBlueprintAndContent, addKeywordResearchSnapshotToBulkFiles, emitEntitySapPipelineHarnessDone, type CSVRow, type BulkProcessingOptions, type BulkHarnessSectionPayload } from '@/lib/bulk-auto-generate';
import { reduceHarnessSectionList } from '@/lib/bulk/harness-sections-reducer';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { reassembleChunkedFiles } from '@/lib/utils';
import { getStoredSites } from '@/components/integrations/storage';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { fetchGoogleMapsImageForEntityWithFallback } from '@/lib/content-generation/google-maps-image-api';
import { resolveSiteLocationLabel } from '@/lib/llm-audit/resolve-site-location-label';
import { buildContentOptimizeHarnessPayload, buildGoogleImageEntitySapPipelineTitles, rowUsesGoogleImageFeatured } from '@/lib/overview/overview-content-optimize-pipeline';
import { sapMapsImageFileName } from '@/lib/bulk/sap-maps-media-bank';
import { buildBlogImportKeywordResearchStub, rowHasImportedBlogSections } from '@/lib/bulk/blog-import-parse';
import { resolveBlogImportRowViaOpenRouter } from '@/lib/bulk/blog-import-openrouter-run';
import { fileFromStoredImportRow, processDirectBlogImportRow, rowHasDirectImportSource } from '@/lib/bulk/blog-import-direct';
import { resolveRowPostDestination } from '@/lib/bulk-post-destination-normalize';
import type { KeywordAnalysisOptions, KeywordAnalysisComplete } from '@/lib/keyword-types';
import { logger } from "@/lib/logger";
import { logBulkRunStep } from "@/lib/bulk/bulk-run-step-log";
import type { Dispatch, SetStateAction } from 'react';

export type BulkHarnessSectionUi = {
  sectionIndex: number;
  title: string;
  status: 'waiting' | 'generating' | 'done';
  markdown?: string;
  truncated?: boolean;
};

export interface BulkSingleRowProcessorDeps {
  fileManager: BulkFileManager;
  analyzeKeyword: (keyword: string, analysisOptions: KeywordAnalysisOptions) => Promise<KeywordAnalysisComplete | null>;
  paaRawResponse: unknown;
  clearResults: () => void;
  connectedSite?: ConnectedSiteSummary;
  selectedModel?: string;
  setRows: Dispatch<SetStateAction<CSVRow[]>>;
  updateRowHarness: (rowIndex: number, update: (prev: BulkHarnessSectionUi[]) => BulkHarnessSectionUi[]) => void;
  setHarnessPlannedSectionCount: Dispatch<SetStateAction<number | null>>;
  setFilesTick: Dispatch<SetStateAction<number>>;
}

const KB_FILES_STORAGE_KEY = 'kb_files';
const KB_PROFILES_STORAGE_KEY = 'kb_profiles';

interface KnowledgeProfile {
  id: string;
  name: string;
  content: string;
}

/**
 * Load knowledge base files and text from localStorage
 * Returns knowledgeFiles array and activeKnowledgeBaseText string
 */
export function loadKnowledgeBaseFromStorage(): {
  knowledgeFiles: Array<{ name: string; content: string }>;
  activeKnowledgeBaseText: string;
} {
  try {
    // Load knowledge files
    const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    
    // Convert StoredFile[] to Array<{ name: string; content: string }>
    const knowledgeFiles = storedFiles.map(file => ({
      name: file.name,
      content: file.content,
    }));

    // Load knowledge profiles and combine their content
    const storedProfilesString = localStorage.getItem(KB_PROFILES_STORAGE_KEY) || '[]';
    const profiles = JSON.parse(storedProfilesString) as KnowledgeProfile[];
    const manualText = profiles.map(p => p.content).filter(Boolean).join('\n\n---\n\n');

    // Reassemble chunked files (handles CSV chunks, etc.)
    const fileContents = reassembleChunkedFiles(storedFiles);

    // Combine manual text and file contents (same pattern as Index.tsx)
    const activeKnowledgeBaseText = [manualText, fileContents].filter(Boolean).join('\n\n---\n\n');

    return {
      knowledgeFiles,
      activeKnowledgeBaseText,
    };
  } catch (error) {
    logger.error('Error loading knowledge base from storage:', error);
    return {
      knowledgeFiles: [],
      activeKnowledgeBaseText: '',
    };
  }
}

export async function processBulkSingleRow(
  deps: BulkSingleRowProcessorDeps,
  rowIndex: number,
  row: CSVRow,
  options: BulkProcessingOptions,
): Promise<BulkGeneratedFile[]> {
  const { fileManager, analyzeKeyword, paaRawResponse, clearResults, connectedSite, selectedModel, setRows, updateRowHarness, setHarnessPlannedSectionCount, setFilesTick } = deps;
    const allFiles: BulkGeneratedFile[] = [];

    logBulkRunStep("processBulkSingleRow entered", {
      rowIndex,
      keyword: row.keyword,
      title: row.title,
    });

    try {
      clearResults();

      const dest = resolveRowPostDestination(
        row,
        options.headerPostDestination ?? options.wordPressPosting?.headerPostDestination ?? options.wordPressPosting?.postDestination ?? "wordpress",
      );
      if (dest === "direct" || rowHasDirectImportSource(row)) {
        return processDirectBlogImportRow({
          rowIndex,
          row,
          options,
          fileManager,
          analyzeKeyword,
        });
      }
      if (dest === "local") {
        options = { ...options, wordPressPosting: undefined };
      }

      let activeRow = row;
      if (!rowHasImportedBlogSections(row)) {
        const sourceFile = fileFromStoredImportRow(row) ?? options.blogImportSourceFile ?? null;
        if (sourceFile && options.blogImportForm) {
          options.onProgress?.(rowIndex, 0, "Sending local file to OpenRouter...");
          activeRow = await resolveBlogImportRowViaOpenRouter(
            sourceFile,
            options.blogImportForm,
            options.openRouterApiKey,
            options.selectedModel || selectedModel,
          );
          setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, ...activeRow } : r)));
        }
      }

      const pushHarness = (payload: BulkHarnessSectionPayload) => {
        setHarnessPlannedSectionCount(payload.totalSections);
        updateRowHarness(rowIndex, (prev) => reduceHarnessSectionList(prev, payload));
      };

      let googleMapsImagePromise: Promise<void> | undefined;
      let googleMapsSerpLocationForRow: string | undefined;
      if (rowUsesGoogleImageFeatured(activeRow, options.featuredImageType)) {
        const entity = activeRow.entity?.trim();
        if (entity && entity !== "N/A") {
          const pipelineTitles = buildGoogleImageEntitySapPipelineTitles([]);
          const harnessStart = buildContentOptimizeHarnessPayload(
            rowIndex,
            0,
            "start",
            undefined,
            pipelineTitles,
          );
          pushHarness(harnessStart);
          options.onHarnessSection?.(harnessStart);
          options.onProgress?.(rowIndex, 0, `Google Image for ${entity}...`);

          const seedForLocation =
            activeRow.keyword?.trim() || activeRow.keyword_focus?.trim() || "";
          const storedSite = connectedSite
            ? getStoredSites().find(
                (s) =>
                  s.siteUrl.replace(/\/+$/, "").toLowerCase() ===
                  connectedSite.siteUrl.replace(/\/+$/, "").toLowerCase(),
              )
            : undefined;
          const cityLabel = resolveSiteLocationLabel(storedSite, seedForLocation) || "";
          const cityToken = cityLabel.split(",")[0]?.trim().toLowerCase() || "";
          googleMapsSerpLocationForRow =
            cityLabel && cityToken && !entity.toLowerCase().includes(cityToken)
              ? `${entity}, ${cityLabel}`
              : cityLabel || undefined;

          googleMapsImagePromise = fetchGoogleMapsImageForEntityWithFallback(
            entity,
            googleMapsSerpLocationForRow,
          ).then((mapsPayload) => {
            if (!mapsPayload?.imageBase64?.trim()) return;
            const mimeType = mapsPayload.mimeType || "image/jpeg";
            const extension = mimeType === "image/jpeg" ? "jpg" : "png";
            const timestamp = Date.now();
            const imageFile: BulkGeneratedFile = {
              id: BulkFileManager.createFileId(rowIndex, "image", timestamp),
              rowIndex,
              fileName: sapMapsImageFileName(entity, extension),
              content: `data:${mimeType};base64,${mapsPayload.imageBase64}`,
              mimeType,
              status: "completed",
              timestamp,
              rowData: activeRow,
            };
            fileManager.addFile(imageFile);
            const harnessDone = buildContentOptimizeHarnessPayload(
              rowIndex,
              0,
              "done",
              undefined,
              pipelineTitles,
            );
            pushHarness(harnessDone);
            options.onHarnessSection?.(harnessDone);
            setFilesTick((t) => t + 1);
          });
        }
      }

      // Step 1: Fetch Wikipedia and run keyword research
      let initialFiles: BulkGeneratedFile[] = [];
      const rowOut = await generateRowOutputs(
        rowIndex,
        activeRow,
        options,
        fileManager,
        analyzeKeyword,
      );
      initialFiles = rowOut.files;
      const keywordResearchFromRow = rowOut.research;
      allFiles.push(...initialFiles);

      const useOpenRouterOnly = Boolean(options.openRouterOnly);
      let finalKeywordData: import('@/lib/keyword-types').KeywordData;
      let finalAiAnalysis: import('@/lib/keyword-types').KeywordAIAnalysis;
      const primaryExternalCitationUrl: string | null = null;
      let volumeDataForBlueprint: import('@/lib/keyword-types').KeywordData[];

      if (useOpenRouterOnly) {
        options.onProgress?.(rowIndex, 0, 'OpenRouter generation...');
        const stub = buildBlogImportKeywordResearchStub(activeRow);
        finalKeywordData = stub.keywordData;
        finalAiAnalysis = stub.aiAnalysis;
        volumeDataForBlueprint = [];

        const dfsSnapshotTs = Date.now();
        const dfsFile = addKeywordResearchSnapshotToBulkFiles(
          rowIndex,
          activeRow,
          fileManager,
          options,
          dfsSnapshotTs,
          {
            keywordData: stub.keywordData,
            aiAnalysis: stub.aiAnalysis,
            keywordsVolumeData: [],
            paaRawResponse: null,
            primaryKeyword: stub.primaryKeyword,
            semrush: null,
            intelligentMerge: null,
            primaryExternalCitationUrl,
          },
        );
        allFiles.push(dfsFile);
        emitEntitySapPipelineHarnessDone(options, rowIndex, activeRow, "Keyword research");
      } else {
        const csvPrimary = activeRow.keyword?.trim() || activeRow.keyword_focus?.trim() || '';
        if (!keywordResearchFromRow?.result?.keywordData || !keywordResearchFromRow.aiAnalysis) {
          throw new Error("Keyword research did not return keyword data for this row");
        }
        finalKeywordData = {
          ...keywordResearchFromRow.result.keywordData,
          keyword: csvPrimary || keywordResearchFromRow.result.keywordData.keyword,
        };
        finalAiAnalysis = keywordResearchFromRow.aiAnalysis;
        const rowPaaRawResponse = keywordResearchFromRow?.paaRawResponse ?? paaRawResponse;
        volumeDataForBlueprint = keywordResearchFromRow?.keywordsVolumeData ?? [];

        const dfsSnapshotTs = Date.now();
        const dfsFile = addKeywordResearchSnapshotToBulkFiles(
          rowIndex,
          row,
          fileManager,
          options,
          dfsSnapshotTs,
          {
            keywordData: finalKeywordData,
            aiAnalysis: finalAiAnalysis,
            keywordsVolumeData: volumeDataForBlueprint,
            paaRawResponse: rowPaaRawResponse,
            primaryKeyword: csvPrimary || keywordResearchFromRow?.result?.primaryKeyword || finalKeywordData.keyword,
            semrush: null,
            intelligentMerge: null,
            primaryExternalCitationUrl,
          },
        );
        allFiles.push(dfsFile);
        emitEntitySapPipelineHarnessDone(options, rowIndex, activeRow, "Keyword research");
      }

      // Step 3: Load knowledge base from localStorage (+ Wikipedia artifact from generateRowOutputs)
      const { knowledgeFiles, activeKnowledgeBaseText } = loadKnowledgeBaseFromStorage();
      for (const f of initialFiles) {
        if (f.mimeType.includes("csv") && f.fileName.toLowerCase().includes("wikipedia")) {
          knowledgeFiles.push({ name: f.fileName, content: f.content });
        }
      }

      // Step 4: Retrieve WordPress posts for this keyword (if available)
      const keywordLower = activeRow.keyword.toLowerCase().trim();
      const wordPressPosts = options.wordPressPostsByKeyword?.get(keywordLower);

      // Step 5: Generate blueprint and content with knowledge base (including Wikipedia and WordPress posts)
      updateRowHarness(rowIndex, (prev) =>
        prev.filter(
          (section) =>
            section.title === "Google Image" &&
            (section.status === "done" || section.status === "generating"),
        ),
      );
      setHarnessPlannedSectionCount(null);
      options.onProgress?.(rowIndex, 0, 'Generating checklist and blueprint...');
      const optionsWithHarness: BulkProcessingOptions = {
        ...options,
        openRouterOnly: Boolean(options.openRouterOnly),
        googleMapsImagePromise,
        googleMapsImageSerpLocation: googleMapsSerpLocationForRow,
        onHarnessSection: (payload: BulkHarnessSectionPayload) => {
          options.onHarnessSection?.(payload);
          setHarnessPlannedSectionCount(payload.totalSections);
          updateRowHarness(rowIndex, (prev) => reduceHarnessSectionList(prev, payload));
          if (payload.phase === 'start') {
            options.onProgress?.(
              rowIndex,
              0,
              `Harness ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}…`,
            );
          }
        },
      };

      const blueprintFiles = await generateBlueprintAndContent(
        rowIndex,
        activeRow,
        finalKeywordData,
        finalAiAnalysis,
        volumeDataForBlueprint,
        keywordResearchFromRow?.paaRawResponse ?? paaRawResponse,
        optionsWithHarness,
        fileManager,
        knowledgeFiles,
        activeKnowledgeBaseText,
        connectedSite,
        wordPressPosts,
        null
      );
      allFiles.push(...blueprintFiles);

      return allFiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      options.onError?.(rowIndex, error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
}

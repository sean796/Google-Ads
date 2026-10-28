import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { buildBulkRunContentCsv } from '@/lib/bulk-run-content-csv';
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_INTERNAL_ERROR_ROW_INDEX_MAPPING_DOES_NO, NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A, NOTIFY_LOADING_WORDPRESS_SITE_INVENTORY_ONE_REQ, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED, NOTIFY_PROCESSING_CANCELLED_BY_USER, notifyBulkProcessingCompleteXFilesGenerat, notifyBulkProcessingFailedX, notifyLoadedXLinkableUrlsFromSiteInvento, notifyRowXFailedX, notifyRowXXCompletedXFilesGenerated, notifyWordpressFetchFailedX, notifyWordpressSiteNotFoundX } from "@/lib/notify-messages";
import {
  parseCsvStatic,
  generateRowOutputs,
  generateBlueprintAndContent,
  clearBulkUploadValidationCache,
  addKeywordResearchSnapshotToBulkFiles,
  emitEntitySapPipelineHarnessDone,
  buildSitesToPostFromPosting,
  prefetchBulkWordPressLinkValidationForRun,
  type CSVRow,
  type BulkProcessingOptions,
  type BulkHarnessSectionPayload,
  type WordPressPostingOptions,
  type WordPressPostDestination,
} from '@/lib/bulk-auto-generate';
import { reduceHarnessSectionList } from '@/lib/bulk/harness-sections-reducer';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { enrichCsvRowsFromSheet } from '@/lib/bulk/bulk-csv-enrich';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { useKeywordResearch } from './use-keyword-research';
import type { KeywordData, KeywordAIAnalysis } from '@/lib/keyword-types';
import type { StoredFile } from '@/components/KnowledgeBaseTab';
import { reassembleChunkedFiles } from '@/lib/utils';
import {
  ensureBulkGenerationWpInventory,
  loadBlogPlayLinkablesForSite,
} from '@/lib/bulk/bulk-generation-wp-inventory';
import { getStoredSites } from '@/components/integrations/storage';
import { buildPortfolioBlockedHosts } from '@/lib/portfolio-link-blocklist';
import type { ConnectedSiteSummary, WordPressSite } from '@/components/integrations/types';
import { getPublicSiteUrl } from '@/lib/wordpress-site-public-url';
import {
  clearGoogleMapsImageSessionCache,
  fetchGoogleMapsImageForEntityWithFallback,
} from '@/lib/content-generation/google-maps-image-api';
import { resolveSiteLocationLabel } from '@/lib/llm-audit/resolve-site-location-label';
import {
  buildContentOptimizeHarnessPayload,
  buildGoogleImageEntitySapPipelineTitles,
  rowUsesGoogleImageFeatured,
} from '@/lib/overview/overview-content-optimize-pipeline';
import { sapMapsImageFileName } from '@/lib/bulk/sap-maps-media-bank';
import {
  countSapMapsRowsByEntity,
  createSapMapsMediaBank,
} from '@/lib/bulk/sap-maps-media-bank';
import {
  createPeerFeaturedImageReportCollector,
  formatPeerFeaturedImageReportMarkdown,
  peerFeaturedImageReportHasContent,
  PEER_FEATURED_IMAGE_REPORT_FILENAME,
} from '@/lib/bulk/peer-featured-image-report';
import type { PeerFeaturedLibraryCsvFile } from '@/lib/overview/sap-peer-featured-image-search';

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
function loadKnowledgeBaseFromStorage(): {
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
    console.error('Error loading knowledge base from storage:', error);
    return {
      knowledgeFiles: [],
      activeKnowledgeBaseText: '',
    };
  }
}

import { buildBulkBaseRows } from '@/lib/bulk-processing-order';
import { buildWordPressPostingFromSelection } from '@/lib/build-wordpress-bulk-posting';
import {
  applyRowSitemapToPosting,
  defaultBulkSitemapMode,
  resolveRowSitemapType,
  resolveSiteSitemapMode,
} from '@/lib/bulk/bulk-sitemap-mode';
import type { BulkRowSitemapType } from '@/lib/bulk/bulk-sitemap-mode';
import { resolveBulkWordPressPublishDate, type ScheduleFrequency } from '@/lib/wordpress-scheduler';
import {
  buildBlogImportKeywordResearchStub,
  rowHasImportedBlogSections,
} from '@/lib/bulk/blog-import-parse';
import { resolveBlogImportRowViaOpenRouter } from '@/lib/bulk/blog-import-openrouter-run';
import {
  fileFromStoredImportRow,
  processDirectBlogImportRow,
  rowHasDirectImportSource,
} from '@/lib/bulk/blog-import-direct';
import { resolveRowPostDestination } from '@/lib/bulk-post-destination-normalize';
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import { loadDataForSEOApiKey } from '@/lib/api';
import { setRuntimeDataForSeoApiKey } from '@/lib/integration-api-keys-runtime';

export type BulkHarnessSectionUi = {
  sectionIndex: number;
  title: string;
  status: 'waiting' | 'generating' | 'done';
  markdown?: string;
  truncated?: boolean;
};

export interface UseBulkAutoGenerateProps {
  apiKey?: string; // DataForSEO API key
  openRouterApiKey?: string; // OpenRouter API key
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  connectedSite?: ConnectedSiteSummary;
  /** Bulk WordPress form state - posting options are built from this and the current row preview (no hidden defaults). */
  inputMode?: 'csv' | 'prompt';
  selectedBlogIndices?: Set<number>;
  generatedRows?: CSVRow[];
  selectedWordPressSites?: Set<string>;
  siteConfigs?: Record<string, { sitemapType: 'post' | 'entity' | 'custom' }>;
  scheduleFrequency?: ScheduleFrequency;
  customInterval?: number;
  dayOfWeek?: number;
  startDateOption?: 'immediate' | 'custom';
  customStartDate?: Date;
  startTime?: string;
  useCsvPublishDates?: boolean;
  wordpressDraftOnly?: boolean;
  bulkPostDestination?: WordPressPostDestination;
  blogImportSourceFile?: File | null;
  blogImportForm?: {
    focusKeyword: string;
    titleOverride: string;
    featuredImageMode: "y" | "n" | "google-maps";
    entity: string;
  };
}

export function useBulkAutoGenerate({
  apiKey,
  openRouterApiKey,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  flowPurpose,
  featuredImageType = 'ai-generated',
  connectedSite,
  inputMode = 'csv',
  selectedBlogIndices = new Set(),
  generatedRows = [],
  selectedWordPressSites = new Set(),
  siteConfigs = {},
  scheduleFrequency = 'daily',
  customInterval = 1,
  dayOfWeek = 1,
  startDateOption = 'immediate',
  customStartDate = new Date(),
  startTime = '09:00',
  useCsvPublishDates = true,
  wordpressDraftOnly = false,
  bulkPostDestination = 'wordpress',
  blogImportSourceFile = null,
  blogImportForm,
}: UseBulkAutoGenerateProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRow, setCurrentRow] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [processingStepLog, setProcessingStepLog] = useState<string[]>([]);
  const [harnessSections, setHarnessSections] = useState<BulkHarnessSectionUi[]>([]);
  const [harnessByRow, setHarnessByRow] = useState<Map<number, BulkHarnessSectionUi[]>>(
    () => new Map(),
  );
  const harnessSectionsRef = useRef<BulkHarnessSectionUi[]>([]);
  /** Fixed blueprint section count for the current row's harness (not `harnessSections.length`, which grows one-at-a-time). */
  const [harnessPlannedSectionCount, setHarnessPlannedSectionCount] = useState<number | null>(null);
  const [fileManager] = useState(() => new BulkFileManager());
  /** Bumps when BulkFileManager mutates so derived file lists re-render without relying only on onProgress. */
  const [filesTick, setFilesTick] = useState(0);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [failedRowIndices, setFailedRowIndices] = useState<Set<number>>(() => new Set());
  const [failedRowMessages, setFailedRowMessages] = useState<Record<number, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Sync lock: React `isProcessing` is too late to stop overlapping play starts. */
  const processingInFlightRef = useRef(false);

  const appendProcessingStep = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setProcessingStepLog((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]));
  }, []);

  const recordRunStatus = useCallback((message: string) => {
    setStatus(message);
  }, []);

  useEffect(() => {
    harnessSectionsRef.current = harnessSections;
  }, [harnessSections]);

  const snapshotHarnessForRow = useCallback((rowIndex: number) => {
    const sections = harnessSectionsRef.current;
    if (sections.length === 0) return;
    setHarnessByRow((prev) => {
      const next = new Map(prev);
      next.set(rowIndex, [...sections]);
      return next;
    });
  }, []);

  const wordPressPosting = useMemo((): WordPressPostingOptions | undefined => {
    const b = buildBulkBaseRows(inputMode, rows, generatedRows, selectedBlogIndices);
    const totalRows = b.ok ? b.baseRows.length : 0;
    return buildWordPressPostingFromSelection({
      selectedSiteIds: selectedWordPressSites,
      siteConfigs,
      scheduleFrequency,
      customInterval,
      dayOfWeek,
      startDateOption,
      customStartDate,
      startTime,
      totalRows,
      useCsvPublishDates,
      postDestination: bulkPostDestination,
      draftOnly: wordpressDraftOnly,
    });
  }, [
    inputMode,
    rows,
    generatedRows,
    selectedBlogIndices,
    selectedWordPressSites,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    useCsvPublishDates,
    bulkPostDestination,
    wordpressDraftOnly,
  ]);

  useEffect(() => {
    fileManager.setOnMutation(() => setFilesTick((t) => t + 1));
    return () => fileManager.setOnMutation(undefined);
  }, [fileManager]);

  const stats = useMemo(() => fileManager.getStats(), [fileManager, filesTick]);
  const filesByRow = useMemo(() => fileManager.getFilesByRow(), [fileManager, filesTick]);

  /** After a run ends, offer one CSV with every post body for manual import if upload failed. */
  const runContentCsvAvailable = useMemo(() => {
    if (isProcessing) return false;
    const { rowCount } = buildBulkRunContentCsv(fileManager.getAllFiles());
    return rowCount > 0;
  }, [fileManager, filesTick, isProcessing]);

  const downloadRunContentCsv = useCallback(() => {
    fileManager.downloadRunContentCsv();
  }, [fileManager]);

  // Use keyword research hook for each row
  const {
    analyzeKeyword,
    isAnalyzing,
    isAnalyzingWithAI,
    currentResult,
    aiAnalysis,
    keywordsVolumeData,
    paaRawResponse,
    clearResults,
  } = useKeywordResearch({
    apiKey,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    connectedSite,
  });

  useEffect(() => {
    const key = apiKey?.trim() || loadDataForSEOApiKey()?.trim() || "";
    setRuntimeDataForSeoApiKey(key);
  }, [apiKey]);

  // Use refs to track current state values for polling loop
  const isAnalyzingRef = useRef(isAnalyzing);
  const isAnalyzingWithAIRef = useRef(isAnalyzingWithAI);
  const currentResultRef = useRef(currentResult);
  const aiAnalysisRef = useRef(aiAnalysis);

  // Update refs when state changes
isAnalyzingRef.current = isAnalyzing;
  isAnalyzingWithAIRef.current = isAnalyzingWithAI;
  currentResultRef.current = currentResult;
  aiAnalysisRef.current = aiAnalysis;

  const [isCsvEnriching, setIsCsvEnriching] = useState(false);

  /**
   * Load CSV file: Papa static parse first, then optional OpenRouter enrich for missing fields.
   */
  const loadCSV = useCallback(async (file: File): Promise<CSVRow[]> => {
    try {
      const staticRows = await parseCsvStatic(file);
      if (staticRows.length === 0) {
        notifyHeaderError("Bulk generate failed", "CSV file is empty");
        return [];
      }
      setRows(staticRows);
      setTotalRows(staticRows.length);

      let apiKey = "";
      try {
        apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
      } catch {
        apiKey = "";
      }
      if (apiKey) {
        setIsCsvEnriching(true);
        try {
          const sites = getStoredSites();
          const normalizeSiteUrl = (url: string) =>
            url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
          const matched = connectedSite
            ? sites.find((s) => normalizeSiteUrl(s.siteUrl) === normalizeSiteUrl(connectedSite.siteUrl))
            : undefined;
          const gridLocations = [
            ...new Set(staticRows.map((r) => r.entity?.trim()).filter(Boolean)),
          ] as string[];
          const enriched = await enrichCsvRowsFromSheet(staticRows, {
            apiKey,
            model: selectedModel || getResearchModel(),
            siteId: matched?.id,
            siteName: matched?.name || connectedSite?.siteUrl || "",
            gridLocations,
            onRowsUpdate: (next) => {
              setRows(next);
              setTotalRows(next.length);
            },
          });
          return enriched;
        } finally {
          setIsCsvEnriching(false);
        }
      }
      return staticRows;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load CSV";
      notifyHeaderError("Bulk generate failed", errorMessage);
      return [];
    }
  }, [openRouterApiKey, selectedModel, connectedSite]);

  /**
   * Process a single row completely
   */
  const processRow = useCallback(async (
    rowIndex: number,
    row: CSVRow,
    options: BulkProcessingOptions
  ): Promise<BulkGeneratedFile[]> => {
    const allFiles: BulkGeneratedFile[] = [];

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
        setHarnessSections((prev) => reduceHarnessSectionList(prev, payload));
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
      let { knowledgeFiles, activeKnowledgeBaseText } = loadKnowledgeBaseFromStorage();
      for (const f of initialFiles) {
        if (f.mimeType.includes("csv") && f.fileName.toLowerCase().includes("wikipedia")) {
          knowledgeFiles.push({ name: f.fileName, content: f.content });
        }
      }

      // Step 4: Retrieve WordPress posts for this keyword (if available)
      const keywordLower = activeRow.keyword.toLowerCase().trim();
      const wordPressPosts = options.wordPressPostsByKeyword?.get(keywordLower);

      // Step 5: Generate blueprint and content with knowledge base (including Wikipedia and WordPress posts)
      setHarnessSections((prev) =>
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
          setHarnessSections((prev) => {
            const next = reduceHarnessSectionList(prev, payload);
            return next;
          });
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
  }, [
    fileManager,
    analyzeKeyword,
    keywordsVolumeData,
    paaRawResponse,
    clearResults,
    connectedSite,
    openRouterApiKey,
    selectedModel,
    appendProcessingStep,
    setRows,
  ]);

  /**
   * Process all rows sequentially
   */
  const processAllRows = useCallback(async (
    csvRows: CSVRow[],
    wordPressPostingOverride?: WordPressPostingOptions,
    rowDisplayIndices?: number[]
  ): Promise<void> => {
    if (processingInFlightRef.current) {
      return;
    }
    processingInFlightRef.current = true;
    let effectiveOpenRouterKey = "";
    try {
      effectiveOpenRouterKey = (await resolveOpenRouterApiKeyForHarness()).trim();
    } catch (e) {
      processingInFlightRef.current = false;
      const msg = e instanceof Error ? e.message : NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED;
      notifyHeaderError("Play failed", msg);
      return;
    }

    const effectiveDataForSeoKey = apiKey?.trim() || loadDataForSEOApiKey()?.trim() || "";
    setRuntimeDataForSeoApiKey(effectiveDataForSeoKey);

    const displayIndices =
      rowDisplayIndices ?? csvRows.map((_, idx) => idx);
    if (displayIndices.length !== csvRows.length) {
      processingInFlightRef.current = false;
      notify.error(NOTIFY_INTERNAL_ERROR_ROW_INDEX_MAPPING_DOES_NO);
      return;
    }

    setIsProcessing(true);
    recordRunStatus("Creating posts...");
    setRows(csvRows);
    setCurrentRow(0);
    setTotalRows(csvRows.length);
    setHarnessSections([]);
    setHarnessPlannedSectionCount(null);
    setHarnessByRow(new Map());
    setProcessingStepLog([]);
    setFailedRowIndices(new Set());
    setFailedRowMessages({});
    fileManager.clear();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const storedSitesForPortfolio = getStoredSites();
    const normalizeSite = (url: string) =>
      url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    const matchedWpSite = connectedSite
      ? storedSitesForPortfolio.find((s) => normalizeSite(s.siteUrl) === normalizeSite(connectedSite.siteUrl))
      : undefined;
    const portfolioBlockedHostsList = buildPortfolioBlockedHosts(storedSitesForPortfolio, {
      excludeSiteId: matchedWpSite?.id,
      excludeSiteUrl: connectedSite?.siteUrl,
    });
    const portfolioBlockedHostsOpt =
      portfolioBlockedHostsList.length > 0 ? portfolioBlockedHostsList : undefined;

    const postingBase = wordPressPostingOverride || wordPressPosting;

    const postingForLoop = postingBase;

    const selectedSiteId = Array.from(selectedWordPressSites)[0];
    const entitySitemapAvailable = Boolean(matchedWpSite?.entitySitemapUrl?.trim());
    const siteSitemapMode = resolveSiteSitemapMode(
      siteConfigs,
      selectedWordPressSites,
      entitySitemapAvailable,
    );
    const rowSitemapFallback: BulkRowSitemapType = defaultBulkSitemapMode();

    const wordPressPostsByKeyword = new Map<string, Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string; collection?: string; postType?: string }>>();
    let wordPressInventoryLoaded = false;

    let wordPressSiteForRun: ReturnType<typeof getStoredSites>[number] | undefined;
    if (connectedSite) {
      const normalizeDomain = (url: string): string =>
        url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      const connectedDomain = normalizeDomain(connectedSite.siteUrl);
      if (connectedDomain === 'example.com' || connectedDomain.endsWith('.example.com')) {
        notify.error(NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A);
        processingInFlightRef.current = false;
        setIsProcessing(false);
        return;
      }
      const sites = getStoredSites();
      wordPressSiteForRun = sites.find((s) => {
        const normalize = (url: string) =>
          url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
        return normalize(s.siteUrl) === normalize(connectedSite.siteUrl);
      });
      if (!wordPressSiteForRun) {
        notify.warning(notifyWordpressSiteNotFoundX(connectedSite.siteUrl));
      }
    }

    clearGoogleMapsImageSessionCache();
    const sapMapsMediaBank = createSapMapsMediaBank();
    const sapMapsEntityRowCounts = countSapMapsRowsByEntity(csvRows);

    const peerFeaturedReport = createPeerFeaturedImageReportCollector();
    const peerFeaturedCsvByName = new Map<string, string>();
    const mergePeerFeaturedCsv = (file: PeerFeaturedLibraryCsvFile) => {
      const existing = peerFeaturedCsvByName.get(file.name);
      if (!existing) {
        peerFeaturedCsvByName.set(file.name, file.content);
        return;
      }
      const merged = existing.split('\n');
      const seen = new Set(merged);
      const incoming = file.content.split('\n');
      for (let li = 1; li < incoming.length; li += 1) {
        const line = incoming[li]!;
        if (line && !seen.has(line)) {
          seen.add(line);
          merged.push(line);
        }
      }
      peerFeaturedCsvByName.set(file.name, merged.join('\n'));
    };

    let linkPrefetchPromise: Promise<void> | undefined;
    if (postingForLoop?.enabled) {
      const sitesToPost = buildSitesToPostFromPosting(postingForLoop);
      if (sitesToPost.length > 0) {
        linkPrefetchPromise = prefetchBulkWordPressLinkValidationForRun(sitesToPost);
      }
    }

    try {
      let runHadFailure = false;

      for (let i = 0; i < csvRows.length; i++) {
        if (controller.signal.aborted) {
          throw new Error('Processing cancelled');
        }

        setCurrentRow(i);
        setHarnessSections([]);
        setHarnessPlannedSectionCount(null);

        if (
          !wordPressInventoryLoaded &&
          wordPressSiteForRun?.username &&
          wordPressSiteForRun.appPassword
        ) {
          wordPressInventoryLoaded = true;
          try {
            notify.info(NOTIFY_LOADING_WORDPRESS_SITE_INVENTORY_ONE_REQ);
            const inv = await ensureBulkGenerationWpInventory(wordPressSiteForRun, (msg) =>
              notify.info(msg),
            );
            if (inv.error?.trim()) {
              notify.warning(inv.error.trim());
            }
            const allLinkables = await loadBlogPlayLinkablesForSite(
              wordPressSiteForRun,
              inv.rows ?? [],
            );
            const uniqueKeywords = new Set(csvRows.map((r) => r.keyword.toLowerCase().trim()));
            for (const keyword of uniqueKeywords) {
              wordPressPostsByKeyword.set(keyword, allLinkables);
            }
            notify.success(
              notifyLoadedXLinkableUrlsFromSiteInvento(allLinkables.length, uniqueKeywords.size),
            );
          } catch (error) {
            console.error('[WordPress] Inventory fetch error:', error);
            notify.warning(
              notifyWordpressFetchFailedX(error instanceof Error ? error.message : 'Unknown error'),
            );
          }
        }

        const rowSitemapType = resolveRowSitemapType(
          siteSitemapMode,
          csvRows[i]!,
          rowSitemapFallback,
        );
        const rowWordPressPosting = applyRowSitemapToPosting(postingForLoop, rowSitemapType);

        const options: BulkProcessingOptions = {
          apiKey: effectiveDataForSeoKey,
          openRouterApiKey: effectiveOpenRouterKey,
          blogImportSourceFile,
          blogImportForm,
          selectedModel,
          temperature,
          maxTokens,
          topP,
          flowPurpose,
          featuredImageType,
          wordPressPosting: rowWordPressPosting,
          headerPostDestination: bulkPostDestination,
          wordPressPostsByKeyword: wordPressPostsByKeyword.size > 0 ? wordPressPostsByKeyword : undefined,
          portfolioBlockedHosts: portfolioBlockedHostsOpt,
          bulkScheduleSlotIndex: i,
          sapMapsMediaBank,
          sapMapsEntityRowCounts,
          peerFeaturedReport,
          onPeerFeaturedCsv: mergePeerFeaturedCsv,
          linkPrefetchPromise,
          // Inner pipeline passes the *storage* row index (displayRows index). Progress UI must stay batch-based (i).
          onProgress: (_storageRowIndex, _total, statusText) => {
            setCurrentRow(i);
            recordRunStatus(statusText);
          },
          onRowComplete: (_rowIndex, files) => {
            notify.success(notifyRowXXCompletedXFilesGenerated(i + 1, csvRows.length, files.length));
          },
          onError: (_rowIndex, error) => {
            console.warn(`Row ${i + 1} step error (row may still complete):`, error.message);
          },
        };

        try {
          const files = await processRow(i, csvRows[i], options);
          snapshotHarnessForRow(i);
          // Only mark as complete if we got files back (all generation succeeded)
          if (files && files.length > 0) {
            options.onRowComplete?.(i, files);
          }
        } catch (error) {
          snapshotHarnessForRow(i);
          setFailedRowIndices((prev) => new Set(prev).add(i));
          runHadFailure = true;
          const msg = error instanceof Error ? error.message : String(error);
          setFailedRowMessages((prev) => ({ ...prev, [i]: msg }));
          recordRunStatus(`Failed: ${msg}`);
          notify.error(notifyRowXFailedX(i + 1, msg));
          console.error(`Error processing row ${i + 1}:`, error);
        }

      }

      if (!runHadFailure) {
        recordRunStatus("All rows processed");
        notify.success(notifyBulkProcessingCompleteXFilesGenerat(fileManager.getStats().completed, ""));
      } else {
        recordRunStatus("Bulk run finished with row errors");
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Processing cancelled') {
        notify.warning(NOTIFY_PROCESSING_CANCELLED_BY_USER);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        recordRunStatus(`Failed: ${errorMessage}`);
        notify.error(notifyBulkProcessingFailedX(errorMessage));
      }
    } finally {
      // Surface the searched peer libraries and the featured image source report as run files.
      const runFileTimestamp = Date.now();
      for (const [name, content] of peerFeaturedCsvByName) {
        fileManager.addFile({
          id: `bulk-peer-featured-csv-${name}`,
          rowIndex: 0,
          fileName: name,
          content,
          mimeType: 'text/csv;charset=utf-8',
          status: 'completed',
          timestamp: runFileTimestamp,
          rowData: { keyword: 'peer featured library', title: 'Peer featured library' },
        });
      }
      if (peerFeaturedImageReportHasContent(peerFeaturedReport)) {
        fileManager.addFile({
          id: 'bulk-peer-featured-report',
          rowIndex: 0,
          fileName: PEER_FEATURED_IMAGE_REPORT_FILENAME,
          content: formatPeerFeaturedImageReportMarkdown(peerFeaturedReport),
          mimeType: 'text/markdown',
          status: 'completed',
          timestamp: runFileTimestamp,
          rowData: { keyword: 'featured image sources', title: 'Featured image sources' },
        });
      }
      clearGoogleMapsImageSessionCache();
      if (postingForLoop?.enabled) {
        const siteIds: string[] = postingForLoop.sites?.map((s) => s.site.id).filter(Boolean) ?? [];
        if (siteIds.length === 0 && postingForLoop.site?.id) siteIds.push(postingForLoop.site.id);
        if (siteIds.length > 0) clearBulkUploadValidationCache(siteIds);
      }
      setIsProcessing(false);
      setCurrentRow(0);
      abortControllerRef.current = null;
      processingInFlightRef.current = false;
    }
  }, [apiKey, openRouterApiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, fileManager, processRow, connectedSite, wordPressPosting, siteConfigs, selectedWordPressSites, blogImportSourceFile, blogImportForm, bulkPostDestination, recordRunStatus, snapshotHarnessForRow]);

  /**
   * Cancel processing
   */
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      recordRunStatus('Cancelled');
    }
  }, [recordRunStatus]);

  /**
   * Download a file
   */
  const downloadFile = useCallback((file: BulkGeneratedFile) => {
    fileManager.downloadFile(file);
  }, [fileManager]);

  /**
   * Download all files for a row
   */
  const downloadRowFiles = useCallback((rowIndex: number) => {
    fileManager.downloadRowFiles(rowIndex);
  }, [fileManager]);

  /**
   * Download all files
   */
  const downloadAllFiles = useCallback(() => {
    fileManager.downloadAllFiles();
  }, [fileManager]);

  return {
    // State
    isProcessing,
    setIsProcessing,
    currentRow,
    setCurrentRow,
    totalRows,
    setTotalRows,
    status,
    processingStepLog,
    harnessSections,
    harnessByRow,
    harnessPlannedSectionCount,
    rows,
    setRows,
    fileManager,
    
    isCsvEnriching,

    // Actions
    loadCSV,
    processAllRows,
    cancelProcessing,
    downloadFile,
    downloadRowFiles,
    downloadAllFiles,
    downloadRunContentCsv,
    runContentCsvAvailable,
    
    // Stats (derived; filesTick ensures updates when BulkFileManager changes)
    stats,
    filesByRow,
    failedRowIndices,
    failedRowMessages,
  };
}


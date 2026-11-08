import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { buildBulkRunContentCsv } from '@/lib/bulk-run-content-csv';
import { notifyHeaderError } from "@/lib/app-notifications";
import { parseCsvStatic, type CSVRow, type BulkProcessingOptions, type WordPressPostingOptions, type WordPressPostDestination } from '@/lib/bulk-auto-generate';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import { enrichCsvRowsFromSheet } from '@/lib/bulk/bulk-csv-enrich';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { useKeywordResearch } from './use-keyword-research';
import { getStoredSites } from '@/components/integrations/storage';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { buildBulkBaseRows } from '@/lib/bulk-processing-order';
import { buildWordPressPostingFromSelection } from '@/lib/build-wordpress-bulk-posting';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import { loadDataForSEOApiKey } from '@/lib/api';
import { setRuntimeDataForSeoApiKey } from '@/lib/integration-api-keys-runtime';
import { processBulkSingleRow, type BulkHarnessSectionUi } from '@/lib/bulk/bulk-single-row-processor';
import { runBulkBatchRows } from '@/lib/bulk/bulk-batch-run-context';
import { logBulkRunStep } from '@/lib/bulk/bulk-run-step-log';
export { loadKnowledgeBaseFromStorage, processBulkSingleRow, type BulkSingleRowProcessorDeps, type BulkHarnessSectionUi } from '@/lib/bulk/bulk-single-row-processor';
export { runBulkBatchRows, type BulkBatchRunContext } from '@/lib/bulk/bulk-batch-run-context';

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
    logBulkRunStep(trimmed);
  }, []);

  const recordRunStatus = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setStatus(trimmed);
    logBulkRunStep(trimmed);
  }, []);

  /** Rows run in parallel: each row keeps its own harness sections; the drawer shows the row that updated last. */
  const harnessRowSectionsRef = useRef(new Map<number, BulkHarnessSectionUi[]>());
  const updateRowHarness = useCallback(
    (rowIndex: number, update: (prev: BulkHarnessSectionUi[]) => BulkHarnessSectionUi[]) => {
      const next = update(harnessRowSectionsRef.current.get(rowIndex) ?? []);
      harnessRowSectionsRef.current.set(rowIndex, next);
      setHarnessSections(next);
      setHarnessByRow((prev) => new Map(prev).set(rowIndex, next));
    },
    [],
  );

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

  const stats = useMemo(() => {
    void filesTick;
    return fileManager.getStats();
  }, [fileManager, filesTick]);
  const filesByRow = useMemo(() => {
    void filesTick;
    return fileManager.getFilesByRow();
  }, [fileManager, filesTick]);

  /** After a run ends, offer one CSV with every post body for manual import if upload failed. */
  const runContentCsvAvailable = useMemo(() => {
    void filesTick;
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

      const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
      // Wave 0: enrichment runs keyless through the server transport.
      {
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
  }, [selectedModel, connectedSite]);


  const processRow = useCallback(async (
    rowIndex: number,
    row: CSVRow,
    options: BulkProcessingOptions,
  ): Promise<BulkGeneratedFile[]> => {
    return processBulkSingleRow(
      { fileManager, analyzeKeyword, paaRawResponse, clearResults, connectedSite, selectedModel, setRows, updateRowHarness, setHarnessPlannedSectionCount, setFilesTick },
      rowIndex,
      row,
      options,
    );
  }, [
    fileManager,
    analyzeKeyword,
    paaRawResponse,
    clearResults,
    connectedSite,
    selectedModel,
    setRows,
    updateRowHarness,
  ]);

  const processAllRows = useCallback(async (
    csvRows: CSVRow[],
    wordPressPostingOverride?: WordPressPostingOptions,
    rowDisplayIndices?: number[],
  ): Promise<void> => {
    return runBulkBatchRows(
      { apiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, featuredImageType, fileManager, processRow, connectedSite, wordPressPosting, siteConfigs, selectedWordPressSites, blogImportSourceFile, blogImportForm, bulkPostDestination, recordRunStatus, appendProcessingStep, processingInFlightRef, abortControllerRef, harnessRowSectionsRef, setIsProcessing, setCurrentRow, setTotalRows, setRows, setHarnessSections, setHarnessPlannedSectionCount, setHarnessByRow, setProcessingStepLog, setFailedRowIndices, setFailedRowMessages },
      csvRows,
      wordPressPostingOverride,
      rowDisplayIndices,
    );
  }, [apiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, featuredImageType, fileManager, processRow, connectedSite, wordPressPosting, siteConfigs, selectedWordPressSites, blogImportSourceFile, blogImportForm, bulkPostDestination, recordRunStatus, appendProcessingStep]);

  /**
   * Cancel processing
   */
  const cancelProcessing = useCallback(() => {
    abortControllerRef.current?.abort();
    processingInFlightRef.current = false;
    setIsProcessing(false);
    recordRunStatus('Cancelled');
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


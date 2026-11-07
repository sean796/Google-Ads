import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { parseCsvStatic, type CSVRow } from "@/lib/bulk-auto-generate";
import { getStoredSites } from "@/components/integrations/storage";
import {
  resolveRecommendedAuthorWithDetails,
  type ResolvedAuthorForDisplay,
} from "@/lib/wordpress-api/author-resolver";
import { loadApiKey } from "@/lib/api";
import { allRowIndicesSet } from "@/lib/bulk-processing-order";
import { defaultBulkSitemapMode } from "@/lib/bulk/bulk-sitemap-mode";
import type { BulkGeneratorWorkspaceBindings } from "./bulk-generator-workspace-bindings";
import type { useBulkAutoGenerate } from "@/hooks/use-bulk-auto-generate";
import type { usePromptBulkGenerate } from "@/hooks/use-prompt-bulk-generate";
import type { usePromptBulkSiteContext } from "@/hooks/use-prompt-bulk-site-context";
import type { useBulkSiteAndSapScheduleSync } from "./use-bulk-site-and-sap-schedule-sync";
import type { useBulkCsvSitemapAndRowHandlers } from "./use-bulk-csv-sitemap-and-row-handlers";

export interface UsePublishBulkWorkspaceBindingsArgs {
  bulkGeneratorWorkspace: boolean;
  onBulkGeneratorWorkspaceBindings?: (
    bindings: BulkGeneratorWorkspaceBindings,
  ) => void;
  inputMode: "csv" | "prompt";
  displayRows: CSVRow[];
  csvFile: File | null;
  csvParsing: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  numberOfBlogs: number;
  generalIntent: string;
  setGeneralIntent: Dispatch<SetStateAction<string>>;
  optionalPrompt: string;
  setOptionalPrompt: Dispatch<SetStateAction<string>>;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: Dispatch<SetStateAction<boolean>>;
  featuredImageType: "ai-generated" | "google-maps";
  setFeaturedImageType: Dispatch<SetStateAction<"ai-generated" | "google-maps">>;
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: Dispatch<SetStateAction<Set<number>>>;
  checklistPhase: string;
  checklistProgressPct?: number;
  openRouterApiKey?: string;
  setCsvFile: Dispatch<SetStateAction<File | null>>;
  setCsvParsing: Dispatch<SetStateAction<boolean>>;
  setNumberOfBlogs: Dispatch<SetStateAction<number>>;
  scheduleOccupancy: import("@/lib/bulk-schedule-gap").ScheduleOccupancy | null;
  scheduleOccupancyLoading: boolean;
  bulk: ReturnType<typeof useBulkAutoGenerate>;
  prompt: ReturnType<typeof usePromptBulkGenerate>;
  promptSiteContext: ReturnType<typeof usePromptBulkSiteContext>;
  siteSchedule: ReturnType<typeof useBulkSiteAndSapScheduleSync>;
  csvSitemap: ReturnType<typeof useBulkCsvSitemapAndRowHandlers>;
}

export function usePublishBulkWorkspaceBindings(
  args: UsePublishBulkWorkspaceBindingsArgs,
) {
  const {
    bulkGeneratorWorkspace, onBulkGeneratorWorkspaceBindings, inputMode,
    displayRows, csvFile, csvParsing, numberOfBlogs, generalIntent,
    optionalPrompt, featuredImagePerBlog, featuredImageType,
    selectedBlogIndices, setSelectedBlogIndices, checklistPhase,
    checklistProgressPct, openRouterApiKey, promptSiteContext,
    scheduleOccupancy, scheduleOccupancyLoading,
  } = args;
  const argsRef = useRef(args);
  argsRef.current = args;
  const {
    wordPressSite, connectedSite, bulkPostDestination,
    selectedWordPressSites, siteConfigs, scheduleFrequency, customInterval,
    dayOfWeek, startDateOption, customStartDate, startTime,
    useCsvPublishDates, wordpressDraftOnly, rowOrder,
  } = args.siteSchedule;
  const {
    isProcessing, status, processingStepLog, currentRow, totalRows, stats,
    harnessSections, harnessByRow, harnessPlannedSectionCount, rows,
    fileManager, cancelProcessing, isCsvEnriching, loadCSV, setCurrentRow,
    setRows, setTotalRows, filesByRow, failedRowIndices, failedRowMessages,
    downloadFile, downloadRowFiles, downloadAllFiles, downloadRunContentCsv,
    runContentCsvAvailable,
  } = args.bulk;
  const {
    generatedRows, isGeneratingChecklist, hasGeneratedChecklist,
    setHasGeneratedChecklist, setGeneratedRows, resetPromptGeneration,
  } = args.prompt;
  const {
    previewRowsForWp, publishDateLabelByGeneratedIndex, sitemapMode,
    siteFallbackSitemapType, applyCsvSitemapInference, handleRowSitemapChange,
    handleSwitchToCustom, handleCsvRowChange, handleGeneratedRowChange,
    handleBatchDisplayRowsChange, handleStartProcessing, handleApprove,
    handleGenerateChecklistAndSelectAll, handleNumberOfBlogsChange,
  } = args.csvSitemap;

  const [resolvedAuthor, setResolvedAuthor] = useState<ResolvedAuthorForDisplay | null>(null);
  const [isResolvingAuthor, setIsResolvingAuthor] = useState<boolean>(false);
  const lastResolvedSiteRef = useRef<string | null>(null);

  // Resolve author for display when we have generated ideas and a connected WordPress site.
  // Use stable primitive deps (siteUrl) to avoid re-running when wordPressSite gets new refs from polling.
  const siteUrlForAuthor = wordPressSite?.siteUrl ?? connectedSite?.siteUrl ?? null;
  // Deps intentionally omit resolvedAuthor and full wordPressSite to avoid resolve loops (see comment above).
  useEffect(() => {
    if (!hasGeneratedChecklist || generatedRows.length === 0 || !siteUrlForAuthor) {
      setResolvedAuthor(null);
      setIsResolvingAuthor(false);
      lastResolvedSiteRef.current = null;
      return;
    }
    // Skip re-resolution if we already have a result for this site (stops glitching)
    const siteKey = siteUrlForAuthor.trim().toLowerCase().replace(/\/$/, '');
    if (lastResolvedSiteRef.current === siteKey && resolvedAuthor) {
      return;
    }
    const sites = getStoredSites();
    const normalize = (url: string) =>
      url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    const wpSite = wordPressSite?.username && wordPressSite?.appPassword
      ? wordPressSite
      : sites.find((s) => normalize(s.siteUrl) === normalize(siteUrlForAuthor)) ?? sites[0] ?? null;
    if (!wpSite?.username || !wpSite?.appPassword) {
      setResolvedAuthor(null);
      setIsResolvingAuthor(false);
      lastResolvedSiteRef.current = null;
      return;
    }
    let cancelled = false;
    lastResolvedSiteRef.current = siteKey;
    setIsResolvingAuthor(true);
    resolveRecommendedAuthorWithDetails({
      site: wpSite,
      postTypeEndpoint: 'posts',
      apiKey: openRouterApiKey || loadApiKey(),
      siteId: wpSite.id,
    })
      .then((author) => {
        if (!cancelled) {
          setResolvedAuthor(author ?? null);
          setIsResolvingAuthor(false);
          if (!author) lastResolvedSiteRef.current = null;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedAuthor(null);
          setIsResolvingAuthor(false);
          lastResolvedSiteRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable author resolution; see block comment above
  }, [hasGeneratedChecklist, generatedRows.length, siteUrlForAuthor, wordPressSite?.username, wordPressSite?.appPassword, wordPressSite?.id, openRouterApiKey]);

  useEffect(() => {
    const { fileInputRef, setCsvFile, setCsvParsing, setGeneralIntent, setNumberOfBlogs, setOptionalPrompt, setFeaturedImagePerBlog, setFeaturedImageType, setSelectedBlogIndices } = argsRef.current;
    const { setBulkPostDestination, setCustomInterval, setCustomStartDate, setDayOfWeek, setRowOrder, setScheduleFrequency, setSelectedWordPressSites, setSiteConfigs, setStartDateOption, setStartTime, setUseCsvPublishDates, setWordpressDraftOnly } = argsRef.current.siteSchedule;
    if (!bulkGeneratorWorkspace || !onBulkGeneratorWorkspaceBindings) return;
    onBulkGeneratorWorkspaceBindings({
      inputMode,
      isProcessing,
      status,
      processingStepLog,
      currentRow,
      totalRows,
      stats,
      harnessSections,
      harnessByRow,
      harnessPlannedSectionCount,
      rows,
      displayRows,
      generatedRows,
      handleStartProcessing,
      handleApprove,
      cancelProcessing,
      bulkPostDestination,
      setBulkPostDestination,
      selectedWordPressSites,
      setSelectedWordPressSites,
      siteConfigs,
      setSiteConfigs,
      scheduleFrequency,
      setScheduleFrequency,
      customInterval,
      setCustomInterval,
      dayOfWeek,
      setDayOfWeek,
      startDateOption,
      setStartDateOption,
      customStartDate,
      setCustomStartDate,
      startTime,
      setStartTime,
      useCsvPublishDates,
      setUseCsvPublishDates,
      wordpressDraftOnly,
      setWordpressDraftOnly,
      previewRows: previewRowsForWp,
      rowOrder,
      setRowOrder,
      connectedSite,
      wordPressSite,
      scheduleOccupancy,
      scheduleOccupancyLoading,
      csvFileName: csvFile?.name ?? null,
      csvLoading: csvParsing,
      csvEnrichingTitlesUrls: Boolean(isCsvEnriching),
      onPickCsvFile: async (file: File, importRaw?: boolean) => {
        setCsvFile(file);
        setCsvParsing(true);
        try {
          if (importRaw) {
            const staticRows = await parseCsvStatic(file);
            const withRaw = staticRows.map((r) => ({ ...r, import_raw: true }));
            if (withRaw.length > 0) {
              const quick = applyCsvSitemapInference(withRaw);
              setRows(quick);
              setGeneratedRows(quick);
              setHasGeneratedChecklist(true);
              setSelectedBlogIndices(allRowIndicesSet(quick.length));
              setTotalRows(quick.length);
            }
            return;
          }
          const staticRows = await parseCsvStatic(file);
          if (staticRows.length > 0) {
            const quick = applyCsvSitemapInference(staticRows);
            setRows(quick);
            setGeneratedRows(quick);
            setHasGeneratedChecklist(true);
            setSelectedBlogIndices(allRowIndicesSet(quick.length));
            setTotalRows(quick.length);
          }
        } finally {
          setCsvParsing(false);
        }
        if (!importRaw) {
          void loadCSV(file).then((parsed) => {
            if (parsed.length === 0) return;
            const normalized = applyCsvSitemapInference(parsed);
            setRows(normalized);
            setGeneratedRows(normalized);
            setHasGeneratedChecklist(true);
            setSelectedBlogIndices(allRowIndicesSet(normalized.length));
            setTotalRows(normalized.length);
          });
        }
      },
      onLoadImportRows: (imported: CSVRow[]) => {
        if (imported.length === 0) return;
        const normalized = applyCsvSitemapInference(imported);
        setRows(normalized);
        setGeneratedRows(normalized);
        setHasGeneratedChecklist(true);
        setSelectedBlogIndices(allRowIndicesSet(normalized.length));
        setTotalRows(normalized.length);
      },
      onClearCsv: () => {
        setCsvFile(null);
        setRows([]);
        setTotalRows(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
        const siteId = wordPressSite?.id ?? Array.from(selectedWordPressSites)[0];
        if (siteId) {
          setSiteConfigs((prev) => ({
            ...prev,
            [siteId]: { ...prev[siteId], sitemapType: defaultBulkSitemapMode() },
          }));
        }
      },
      onClearPrompt: () => {
        if (isProcessing) cancelProcessing();
        fileManager.clear();
        resetPromptGeneration();
        setSelectedBlogIndices(new Set());
        setRowOrder([]);
        setGeneralIntent("");
        setNumberOfBlogs(0);
        setGeneratedRows([]);
        setTotalRows(0);
        setCurrentRow(0);
        setOptionalPrompt("");
        setFeaturedImagePerBlog(true);
        setFeaturedImageType("ai-generated");
      },
      numberOfBlogs,
      setNumberOfBlogs: handleNumberOfBlogsChange,
      generalIntent,
      setGeneralIntent,
      isGeneratingChecklist,
      checklistPhase,
      checklistProgressPct,
      hasGeneratedChecklist,
      handleGenerateChecklist: handleGenerateChecklistAndSelectAll,
      sitemapInventoryLinks: promptSiteContext.sitemapInventoryLinks,
      gscHostedLink: promptSiteContext.gscHostedLink,
      sitemapInventoryLoading: promptSiteContext.sitemapInventoryLoading,
      promptSiteContextReady: promptSiteContext.promptSiteContextReady,
      selectedBlogIndices,
      setSelectedBlogIndices,
      optionalPrompt,
      setOptionalPrompt,
      featuredImagePerBlog,
      setFeaturedImagePerBlog,
      featuredImageType,
      setFeaturedImageType,
      filesByRow,
      failedRowIndices,
      failedRowMessages,
      downloadFile,
      downloadRowFiles,
      downloadAllFiles,
      downloadRunContentCsv,
      runContentCsvAvailable,
      sitemapMode,
      siteFallbackSitemapType,
      onRowSitemapChange: handleRowSitemapChange,
      onSwitchToCustom: handleSwitchToCustom,
      onCsvRowChange: handleCsvRowChange,
      onDisplayRowChange: (rowIndex, patch) => {
        if (inputMode === "csv") {
          handleCsvRowChange(rowIndex, patch);
        } else {
          handleGeneratedRowChange(rowIndex, patch);
        }
      },
      onBatchDisplayRowsChange: handleBatchDisplayRowsChange,
      publishDateLabelByIndex: publishDateLabelByGeneratedIndex,
    });
  }, [
    bulkGeneratorWorkspace,
    onBulkGeneratorWorkspaceBindings,
    inputMode,
    isProcessing,
    status,
    currentRow,
    totalRows,
    stats,
    harnessSections,
    harnessByRow,
    harnessPlannedSectionCount,
    rows,
    displayRows,
    generatedRows,
    handleStartProcessing,
    handleApprove,
    cancelProcessing,
    bulkPostDestination,
    selectedWordPressSites,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    useCsvPublishDates,
    wordpressDraftOnly,
    previewRowsForWp,
    rowOrder,
    connectedSite,
    wordPressSite,
    scheduleOccupancy,
    scheduleOccupancyLoading,
    csvFile,
    csvParsing,
    isCsvEnriching,
    loadCSV,
    applyCsvSitemapInference,
    resetPromptGeneration,
    numberOfBlogs,
    handleNumberOfBlogsChange,
    generalIntent,
    isGeneratingChecklist,
    checklistPhase,
    checklistProgressPct,
    hasGeneratedChecklist,
    handleGenerateChecklistAndSelectAll,
    promptSiteContext.sitemapInventoryLinks,
    promptSiteContext.gscHostedLink,
    promptSiteContext.sitemapInventoryLoading,
    promptSiteContext.promptSiteContextReady,
    selectedBlogIndices,
    setSelectedBlogIndices,
    optionalPrompt,
    featuredImagePerBlog,
    featuredImageType,
    filesByRow,
    failedRowIndices,
    failedRowMessages,
    downloadFile,
    downloadRowFiles,
    downloadAllFiles,
    downloadRunContentCsv,
    runContentCsvAvailable,
    sitemapMode,
    siteFallbackSitemapType,
    handleRowSitemapChange,
    handleSwitchToCustom,
    handleCsvRowChange,
    handleGeneratedRowChange,
    handleBatchDisplayRowsChange,
    publishDateLabelByGeneratedIndex,
    fileManager,
    processingStepLog,
    setCurrentRow,
    setGeneratedRows,
    setHasGeneratedChecklist,
    setRows,
    setTotalRows,
  ]);
}

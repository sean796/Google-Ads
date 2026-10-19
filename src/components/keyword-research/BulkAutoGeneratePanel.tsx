import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import type { CSVRow, WordPressPostDestination } from '@/lib/bulk-auto-generate';
import {
  BLOG_IMPORT_POST_DESTINATION_CHOICES,
  BULK_POST_DESTINATION_CHOICES,
} from '@/lib/bulk-auto-generate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Upload, 
  Play, 
  Square, 
  Download, 
  FileText,
  Loader2,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { computePublishDateLabelsByGeneratedIndex } from '@/lib/bulk/bulk-slot-publish-dates';
import { getFirstOfThisMonthDate, type ScheduleFrequency } from '@/lib/wordpress-scheduler';
import { loadSapBulkSchedulePrefs, saveSapBulkSchedulePrefs } from '@/lib/bulk-schedule-prefs';
import { normalizeBulkPostDestination } from '@/lib/bulk-post-destination-normalize';
import { useBulkProcessing } from './bulk/useBulkProcessing';
import { useBulkAutoGenerate } from '@/hooks/use-bulk-auto-generate';
import { usePromptBulkGenerate } from '@/hooks/use-prompt-bulk-generate';
import { usePromptBulkSiteContext } from '@/hooks/use-prompt-bulk-site-context';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { CSVUploadSection } from './bulk/CSVUploadSection';
import { PromptInputSection } from './bulk/PromptInputSection';
import { GeneratedBlogIdeasList } from './bulk/GeneratedBlogIdeasList';
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from '@/components/keyword-research/blog-generator-tab-classes';
import { GeneratedFilesDisplay } from './bulk/GeneratedFilesDisplay';
import { ProgressAndStatsDisplay } from './bulk/ProgressAndStatsDisplay';
import { CSVProcessingControls } from './bulk/CSVProcessingControls';
import { useBulkScheduleOccupancy } from '@/hooks/use-bulk-schedule-occupancy';
import { resolveRecommendedAuthorWithDetails, type ResolvedAuthorForDisplay } from '@/lib/wordpress-api/author-resolver';
import { loadApiKey } from '@/lib/api';
import { notify } from '@/lib/app-notifications';
import { notifyLoadedXRowSFromSitemapMergePlan } from "@/lib/notify-messages";
import { consumeEntityBulkCsvAutoRun, consumeSitemapOptimizerBulkCsvSeed } from '@/lib/sitemap-optimizer/sitemap-optimizer-bulk-handoff';
import type { BulkGeneratorWorkspaceBindings } from './bulk/bulk-generator-workspace-bindings';
import type { BulkRowSitemapType, BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';
import {
  defaultBulkSitemapMode,
  inferBulkSitemapModeFromRows,
  resolveSiteSitemapMode,
  rowHasUploadEntity,
  seedCustomRowSitemaps,
} from '@/lib/bulk/bulk-sitemap-mode';
import { cn } from '@/lib/utils';
import { seedPromptBlogSlots, syncPromptBlogRowsToCount } from '@/lib/bulk/prompt-blog-slots';
import { buildBulkBaseRows, identityRowOrder, allRowIndicesSet } from '@/lib/bulk-processing-order';
interface BulkAutoGeneratePanelProps {
  openRouterApiKey?: string;
  /** Non-generator integrations (SAP, legacy bulk) may still pass DataForSEO. */
  apiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  /**
   * Locks the panel to CSV or prompt mode and hides the in-panel method toggle.
   * Blog Generator shell uses CSV upload vs Prompt generator side tabs.
   */
  forcedInputMode?: "csv" | "prompt" | "blog-import";
  /** Hides CSV vs prompt toggle; keeps CSV pipeline with optional slot instead of file upload. */
  sapMode?: boolean;
  replaceCsvFileUploadWith?: ReactNode;
  /** When `sapMode`, bulk rows are set from these in-memory CSV rows (SAP generator). */
  sapSyncedRows?: CSVRow[];
  /** In-memory rows (SAP generator, blog import) — skips CSV file requirement when set. */
  injectedRows?: CSVRow[];
  /** Blog import: local file held until Run (OpenRouter reads it). */
  blogImportSourceFile?: File | null;
  blogImportForm?: {
    focusKeyword: string;
    titleOverride: string;
    featuredImageMode: "y" | "n" | "google-maps";
    entity: string;
  };
  /** Initial export destination (e.g. blog import defaults to local). */
  initialBulkPostDestination?: WordPressPostDestination;
  /** Export radios to show (blog import: WP, bank, local only). */
  postDestinationChoices?: WordPressPostDestination[];
  /** Unified header for Blog Generator shell. */
  bulkGeneratorWorkspace?: boolean;
  onBulkGeneratorWorkspaceBindings?: (bindings: BulkGeneratorWorkspaceBindings) => void;
}

export const BulkAutoGeneratePanel: React.FC<BulkAutoGeneratePanelProps> = ({
  openRouterApiKey,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowPurpose,
  forcedInputMode,
  sapMode = false,
  replaceCsvFileUploadWith,
  sapSyncedRows,
  injectedRows,
  blogImportSourceFile = null,
  blogImportForm,
  initialBulkPostDestination,
  postDestinationChoices = BULK_POST_DESTINATION_CHOICES,
  bulkGeneratorWorkspace = false,
  onBulkGeneratorWorkspaceBindings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"csv" | "prompt">(() =>
    sapMode ? "csv" : forcedInputMode === "prompt" ? "prompt" : "csv",
  );
  
  // Blog generation settings
  const [numberOfBlogs, setNumberOfBlogs] = useState<number>(1);
  const [optionalPrompt, setOptionalPrompt] = useState<string>('');
  const [featuredImagePerBlog, setFeaturedImagePerBlog] = useState<boolean>(true);
  const [featuredImageType, setFeaturedImageType] = useState<'ai-generated' | 'google-maps'>('ai-generated');
  const [generalIntent, setGeneralIntent] = useState<string>('');
  const [checklistPhase, setChecklistPhase] = useState("");
  const [checklistProgressPct, setChecklistProgressPct] = useState<number | undefined>(undefined);

  // Selection state for blog ideas
  const [selectedBlogIndices, setSelectedBlogIndices] = useState<Set<number>>(new Set());
  
  // Connected WordPress site (for target topic)
  const [connectedSite, setConnectedSite] = useState<ConnectedSiteSummary | null>(null);
  
  // WordPress posting options - Multiple sites support
  const [selectedWordPressSites, setSelectedWordPressSites] = useState<Set<string>>(new Set());
  const [siteConfigs, setSiteConfigs] = useState<
    Record<string, import("@/components/keyword-research/bulk/BulkGeneratorSitemapMenu").BulkSiteSitemapConfig>
  >({});
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('daily');
  const [customInterval, setCustomInterval] = useState<number>(1);
  /** Permutation: processing slot i uses base row at index rowOrder[i]. */
  const [rowOrder, setRowOrder] = useState<number[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [startDateOption, setStartDateOption] = useState<'immediate' | 'custom'>('immediate');
  const [customStartDate, setCustomStartDate] = useState<Date>(() => getFirstOfThisMonthDate('09:00'));
  const [startTime, setStartTime] = useState<string>('09:00');
  const [useCsvPublishDates, setUseCsvPublishDates] = useState(false);
  const [wordpressDraftOnly, setWordpressDraftOnly] = useState(false);
  const [bulkPostDestination, setBulkPostDestination] = useState<WordPressPostDestination>(() => {
    if (initialBulkPostDestination) return normalizeBulkPostDestination(initialBulkPostDestination);
    return 'wordpress';
  });

  // Legacy single site state for backward compatibility
  const [wordPressSite, setWordPressSite] = useState<WordPressSite | null>(null);
  const [resolvedAuthor, setResolvedAuthor] = useState<ResolvedAuthorForDisplay | null>(null);
  const [isResolvingAuthor, setIsResolvingAuthor] = useState<boolean>(false);
  const lastResolvedSiteRef = useRef<string | null>(null);

  useEffect(() => {
    if (sapMode) setFeaturedImageType("google-maps");
  }, [sapMode]);

  // Track the currently ENABLED site (the active/current site)
  // When a site is enabled, all others are disabled - so there's only one enabled site at a time
  useEffect(() => {
    const updateToEnabledSite = () => {
      const sites = getStoredSites();
      
      // Priority 1: Find enabled site with successful connection status
      let enabledSite = sites.find(s => s.connectionStatus === 'success' && s.enabled !== false);
      
      // Priority 2: If no enabled site with success, find ANY enabled site (newly connected sites may not be tested yet)
      if (!enabledSite) {
        enabledSite = sites.find(s => s.enabled !== false);
      }
      
      if (enabledSite) {
        const newConnectedSite: ConnectedSiteSummary = {
          name: enabledSite.name,
          siteUrl: enabledSite.siteUrl,
          productionSiteUrl: enabledSite.productionSiteUrl,
        };
        
        setConnectedSite(prev => {
          // Only update if the site has actually changed
          if (
            !prev ||
            prev.name !== newConnectedSite.name ||
            prev.siteUrl !== newConnectedSite.siteUrl ||
            prev.productionSiteUrl !== newConnectedSite.productionSiteUrl
          ) {
            return newConnectedSite;
          }
          return prev;
        });
        setWordPressSite(enabledSite);
      } else if (sites.length > 0) {
        // Fallback: if no enabled site, use most recent successfully connected site
        const connectedSites = sites.filter(s => s.connectionStatus === 'success');
        const fallbackSite = connectedSites.length > 0 
          ? connectedSites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0]
          : sites.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0];
        
        if (fallbackSite) {
          const newConnectedSite: ConnectedSiteSummary = {
            name: fallbackSite.name,
            siteUrl: fallbackSite.siteUrl,
            productionSiteUrl: fallbackSite.productionSiteUrl,
          };
          setConnectedSite(prev => {
            if (
              !prev ||
              prev.name !== newConnectedSite.name ||
              prev.siteUrl !== newConnectedSite.siteUrl ||
              prev.productionSiteUrl !== newConnectedSite.productionSiteUrl
            ) {
              return newConnectedSite;
            }
            return prev;
          });
          setWordPressSite(fallbackSite);
        }
      } else {
        // No sites available
        setConnectedSite(null);
        setWordPressSite(null);
      }
    };

    // Initial load
    updateToEnabledSite();

    // Listen for storage changes (when sites are enabled/disabled)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'wordpress_sites' || e.key?.includes('wordpress') || e.key?.includes('site')) {
        updateToEnabledSite();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Empty deps - effect manages its own state updates

  /** SAP generator: restore schedule from localStorage or apply defaults (custom times/month, start 1st of this month, 09:00). */
  useEffect(() => {
    if (!sapMode) return;
    const stored = loadSapBulkSchedulePrefs();
    if (stored) {
      setScheduleFrequency(stored.scheduleFrequency);
      setCustomInterval(stored.customInterval);
      setDayOfWeek(stored.dayOfWeek);
      setStartDateOption(stored.startDateOption);
      setCustomStartDate(new Date(stored.customStartDateIso));
      setStartTime(stored.startTime);
      setUseCsvPublishDates(false);
      if (stored.postDestination != null) {
        setBulkPostDestination(normalizeBulkPostDestination(stored.postDestination));
      }
    } else {
      setScheduleFrequency('custom');
      setCustomInterval(4);
      setStartDateOption('custom');
      setCustomStartDate(getFirstOfThisMonthDate('09:00'));
      setStartTime('09:00');
    }
  }, [sapMode]);

  /** SAP: default site + sitemap from prefs or entity when available. */
  useEffect(() => {
    if (!sapMode || !wordPressSite) return;
    const stored = loadSapBulkSchedulePrefs();
    if (stored) {
      setSelectedWordPressSites(new Set([wordPressSite.id]));
      setSiteConfigs({
        [wordPressSite.id]: { sitemapType: stored.sitemapType },
      });
    } else {
      setSelectedWordPressSites(new Set([wordPressSite.id]));
      setSiteConfigs({
        [wordPressSite.id]: { sitemapType: wordPressSite.entitySitemapUrl ? 'entity' : 'post' },
      });
    }
  }, [sapMode, wordPressSite]);

  /** Blog generator workspace: auto-select connected site for posting.
   * WordPressPostingConfig may not mount until the details panel opens. */
  useEffect(() => {
    if (sapMode || !wordPressSite) return;
    setSelectedWordPressSites((prev) => {
      if (prev.has(wordPressSite.id)) return prev;
      return new Set([wordPressSite.id]);
    });
    setSiteConfigs((prev) => {
      if (prev[wordPressSite.id]) return prev;
      return {
        ...prev,
        [wordPressSite.id]: {
          sitemapType: defaultBulkSitemapMode(),
          ...(forcedInputMode === "prompt" ? { scopeTags: ["posts"] as const } : {}),
        },
      };
    });
  }, [sapMode, wordPressSite, forcedInputMode]);

  /** Persist SAP bulk schedule + WP choices. */
  useEffect(() => {
    if (!sapMode) return;
    const selectedId = Array.from(selectedWordPressSites)[0] ?? null;
    const t = window.setTimeout(() => {
      saveSapBulkSchedulePrefs({
        v: 1,
        scheduleFrequency,
        customInterval,
        dayOfWeek,
        startDateOption,
        customStartDateIso: customStartDate.toISOString(),
        startTime,
        selectedSiteId: selectedId,
        sitemapType: selectedId ? (siteConfigs[selectedId]?.sitemapType ?? 'post') : 'post',
        useCsvPublishDates,
        postDestination: bulkPostDestination,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    sapMode,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    selectedWordPressSites,
    siteConfigs,
    useCsvPublishDates,
    bulkPostDestination,
  ]);

  const effectiveFlowPurpose = inputMode === 'prompt' ? (generalIntent?.trim() || flowPurpose || '') : (flowPurpose || '');

  const promptSiteContext = usePromptBulkSiteContext(
    inputMode === 'prompt' ? wordPressSite : null,
  );

  const {
    userInput,
    setUserInput,
    isGeneratingChecklist,
    hasGeneratedChecklist,
    generatedRows,
    setGeneratedRows,
    wordPressPostsMetadata,
    lastInventorySentToAiCount,
    handleGenerateChecklist,
    resetPromptGeneration,
    handleRegenerateUnselected,
  } = usePromptBulkGenerate({
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose: effectiveFlowPurpose,
    numberOfBlogs,
    optionalPrompt,
    featuredImagePerBlog,
    connectedSite: connectedSite || undefined,
    siteConfigs,
    selectedWordPressSites,
    promptIdeasContext: promptSiteContext.ideasContext,
    promptSiteContextReady: promptSiteContext.promptSiteContextReady,
    sitemapInventoryLoading: promptSiteContext.sitemapInventoryLoading,
    onProgress: (step, progress) => {
      setChecklistPhase(step);
      setChecklistProgressPct(progress);
    },
  });

  useEffect(() => {
    if (!isGeneratingChecklist) {
      setChecklistPhase("");
      setChecklistProgressPct(undefined);
    }
  }, [isGeneratingChecklist]);

  const prevForcedInputModeRef = useRef(forcedInputMode);

  useEffect(() => {
    if (sapMode) {
      setInputMode("csv");
      return;
    }
    if (forcedInputMode === undefined) return;

    const enteredPrompt =
      forcedInputMode === "prompt" && prevForcedInputModeRef.current !== "prompt";
    prevForcedInputModeRef.current = forcedInputMode;

    if (forcedInputMode === "prompt") {
      setInputMode("prompt");
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (enteredPrompt) {
        setSiteConfigs((prev) => {
          const siteId = wordPressSite?.id ?? Array.from(selectedWordPressSites)[0];
          if (!siteId || prev[siteId]?.sitemapType === "post") return prev;
          return {
            ...prev,
            [siteId]: { ...prev[siteId], sitemapType: "post" },
          };
        });
      }
    } else {
      setInputMode("csv");
      resetPromptGeneration();
      setSelectedBlogIndices(new Set());
    }
  }, [sapMode, forcedInputMode, resetPromptGeneration, wordPressSite, selectedWordPressSites]);

  const {
    isProcessing,
    setIsProcessing,
    currentRow,
    setCurrentRow,
    totalRows,
    status,
    processingStepLog,
    harnessSections,
    harnessByRow,
    harnessPlannedSectionCount,
    rows,
    setRows,
    setTotalRows,
    fileManager,
    loadCSV,
    processAllRows,
    cancelProcessing,
    downloadFile,
    downloadRowFiles,
    downloadAllFiles,
    downloadRunContentCsv,
    runContentCsvAvailable,
    stats,
    filesByRow,
    failedRowIndices,
    failedRowMessages,
  } = useBulkAutoGenerate({
    apiKey,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose: effectiveFlowPurpose,
    featuredImageType,
    connectedSite: connectedSite || undefined,
    inputMode,
    selectedBlogIndices,
    generatedRows,
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
    blogImportSourceFile,
    blogImportForm,
  });

  const bulkPreviewBuilt = useMemo(
    () => buildBulkBaseRows(inputMode, rows, generatedRows, selectedBlogIndices),
    [inputMode, rows, generatedRows, selectedBlogIndices]
  );
  const previewRowsForWp = bulkPreviewBuilt.ok ? bulkPreviewBuilt.baseRows : [];

  const gapScheduleSite = useMemo(() => {
    const all = getStoredSites();
    const firstId = Array.from(selectedWordPressSites)[0];
    if (!firstId) return null;
    return all.find((s) => s.id === firstId) ?? null;
  }, [selectedWordPressSites]);

  const gapScheduleEnabled =
    startDateOption === 'immediate' &&
    scheduleFrequency !== 'custom' &&
    bulkPostDestination !== 'local' &&
    scheduleFrequency !== 'immediately' &&
    selectedWordPressSites.size > 0;

  const {
    occupancy: scheduleOccupancy,
    loading: scheduleOccupancyLoading,
    refresh: refreshScheduleOccupancy,
  } = useBulkScheduleOccupancy({
    site: gapScheduleSite,
    enabled: gapScheduleEnabled,
  });

  const batchKey = useMemo(() => {
    const sel = Array.from(selectedBlogIndices)
      .sort((a, b) => a - b)
      .join(',');
    return `${inputMode}|${csvFile?.name ?? ''}|${rows.length}|${generatedRows.length}|${sel}`;
  }, [inputMode, csvFile?.name, rows.length, generatedRows.length, selectedBlogIndices]);

  useEffect(() => {
    setRowOrder(identityRowOrder(previewRowsForWp.length));
  }, [batchKey, previewRowsForWp.length]);

  const publishDateLabelByGeneratedIndex = useMemo(() => {
    if (wordpressDraftOnly && bulkPostDestination !== "local") {
      const rowCount =
        inputMode === "csv"
          ? bulkPreviewBuilt.ok
            ? bulkPreviewBuilt.baseRows.length
            : 0
          : generatedRows.length;
      if (rowCount === 0) return {};
      return Object.fromEntries(Array.from({ length: rowCount }, (_, i) => [i, "Draft"]));
    }

    if (!bulkPreviewBuilt.ok || bulkPreviewBuilt.baseRows.length === 0) return {};

    const scheduleInput = {
      scheduleFrequency,
      customInterval,
      dayOfWeek,
      startDateOption,
      customStartDate,
      startTime,
      useCsvPublishDates: false,
      useGapScheduling: gapScheduleEnabled && Boolean(scheduleOccupancy),
      scheduleOccupancy,
    };
    const rowCount =
      inputMode === "csv" ? bulkPreviewBuilt.baseRows.length : generatedRows.length;
    if (rowCount === 0) return {};
    const labels = computePublishDateLabelsByGeneratedIndex(
      rowCount,
      bulkPreviewBuilt.baseRows,
      bulkPreviewBuilt.baseDisplayIndices,
      rowOrder,
      scheduleInput,
    );
    return labels;
  }, [
    inputMode,
    generatedRows.length,
    bulkPreviewBuilt,
    rowOrder,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    gapScheduleEnabled,
    scheduleOccupancy,
    wordpressDraftOnly,
    bulkPostDestination,
  ]);

  const effectiveInjectedRows = injectedRows ?? (sapMode ? sapSyncedRows : undefined);

  useEffect(() => {
    if (effectiveInjectedRows === undefined) return;
    setRows(effectiveInjectedRows);
    setTotalRows(effectiveInjectedRows.length);
  }, [effectiveInjectedRows, setRows, setTotalRows]);

  const entitySitemapAvailable = Boolean(wordPressSite?.entitySitemapUrl?.trim());
  const sitemapMode = useMemo(
    () =>
      resolveSiteSitemapMode(siteConfigs, selectedWordPressSites, entitySitemapAvailable),
    [siteConfigs, selectedWordPressSites, entitySitemapAvailable],
  );
  const siteFallbackSitemapType: BulkRowSitemapType =
    sapMode && entitySitemapAvailable ? "entity" : defaultBulkSitemapMode();

  const applyCsvSitemapInference = useCallback(
    (parsed: CSVRow[]): CSVRow[] => {
      const { mode, rows: normalized } = inferBulkSitemapModeFromRows(parsed);
      const selectedId = Array.from(selectedWordPressSites)[0] ?? wordPressSite?.id;
      if (selectedId) {
        setSiteConfigs((prev) => ({
          ...prev,
          [selectedId]: { ...prev[selectedId], sitemapType: mode },
        }));
      }
      if (mode === "entity" || mode === "custom") {
        setFeaturedImageType("google-maps");
        setFeaturedImagePerBlog(true);
        return normalized.map((row) =>
          rowHasUploadEntity(row.entity) ? { ...row, featuredImage: "google-maps" } : row,
        );
      }
      return normalized;
    },
    [selectedWordPressSites, wordPressSite?.id],
  );

  useEffect(() => {
    if (sitemapMode !== "entity") return;
    setFeaturedImageType("google-maps");
    setFeaturedImagePerBlog(true);
  }, [sitemapMode]);

  const handleRowSitemapChange = useCallback(
    (rowIndex: number, value: BulkRowSitemapType) => {
      const update = (prev: CSVRow[]) =>
        prev.map((r, i) => (i === rowIndex ? { ...r, sitemap_type: value } : r));
      if (inputMode === 'csv') {
        setRows(update);
      } else {
        setGeneratedRows(update);
      }
    },
    [inputMode, setRows, setGeneratedRows],
  );

  const handleSwitchToCustom = useCallback(
    (defaultRowType: BulkRowSitemapType) => {
      const seedRows = (prev: CSVRow[]) => seedCustomRowSitemaps(prev, defaultRowType);
      if (inputMode === 'csv') {
        setRows(seedRows);
      } else {
        setGeneratedRows(seedRows);
      }
    },
    [inputMode, setRows, setGeneratedRows],
  );

  const sitemapSeedLoadedRef = useRef(false);
  const pendingEntityAutoRunRef = useRef(false);
  useEffect(() => {
    if (sapMode || forcedInputMode === "prompt" || sitemapSeedLoadedRef.current) return;
    const csv = consumeSitemapOptimizerBulkCsvSeed();
    if (!csv?.trim()) return;
    sitemapSeedLoadedRef.current = true;
    const autoRun = consumeEntityBulkCsvAutoRun();
    const file = new File([csv], "sitemap-merge-content-upload.csv", { type: "text/csv" });
    void loadCSV(file).then((parsed) => {
      const normalized = applyCsvSitemapInference(parsed);
      if (normalized.length > 0) {
        setCsvFile(file);
        if (normalized !== parsed) {
          setRows(normalized);
          setTotalRows(normalized.length);
        }
        if (autoRun) {
          pendingEntityAutoRunRef.current = true;
        } else {
          notify.success(notifyLoadedXRowSFromSitemapMergePlan(normalized.length));
        }
      }
    });
  }, [sapMode, forcedInputMode, loadCSV, applyCsvSitemapInference]);

  const { handleStartProcessing } = useBulkProcessing({
    inputMode,
    rows,
    generatedRows,
    selectedBlogIndices,
    rowOrder,
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
    scheduleOccupancy,
    useGapScheduling: gapScheduleEnabled,
    refreshScheduleOccupancy,
    apiKey,
    openRouterApiKey,
    selectedModel,
    processAllRows,
    setIsProcessing,
    setCurrentRow,
  });

  const handleApprove = useCallback(async () => {
    await handleStartProcessing();
  }, [handleStartProcessing]);

  const handleCsvRowChange = useCallback(
    (rowIndex: number, patch: Partial<CSVRow>) => {
      setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row)));
    },
    [setRows],
  );

  const handleGenerateChecklistAndSelectAll = useCallback(async () => {
    const result = await handleGenerateChecklist();
    if (result?.length) {
      setSelectedBlogIndices(allRowIndicesSet(result.length));
    }
    return result;
  }, [handleGenerateChecklist]);

  const handleNumberOfBlogsChange = useCallback(
    (value: number) => {
      setNumberOfBlogs(value);
      if (hasGeneratedChecklist) {
        setGeneratedRows((prev) => (prev.length > value ? prev.slice(0, value) : prev));
        setSelectedBlogIndices((prev) => {
          const next = new Set<number>();
          for (const i of prev) {
            if (i < value) next.add(i);
          }
          return next;
        });
      }
    },
    [setGeneratedRows, hasGeneratedChecklist],
  );

  useEffect(() => {
    if (!pendingEntityAutoRunRef.current || rows.length === 0) return;
    pendingEntityAutoRunRef.current = false;
    void handleStartProcessing();
  }, [rows, handleStartProcessing]);

  const handleGeneratedRowChange = useCallback(
    (index: number, patch: Partial<CSVRow>) => {
      setGeneratedRows((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) return prev;
        next[index] = { ...current, ...patch };
        return next;
      });
    },
    [setGeneratedRows],
  );

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

  // Get the rows to display
  const displayRows = inputMode === 'csv' ? rows : generatedRows;

  useEffect(() => {
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
      onPickCsvFile: async (file: File) => {
        setCsvFile(file);
        const parsed = await loadCSV(file);
        const normalized = applyCsvSitemapInference(parsed);
        if (normalized !== parsed) {
          setRows(normalized);
          setTotalRows(normalized.length);
        }
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
        setNumberOfBlogs(3);
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
    publishDateLabelByGeneratedIndex,
  ]);

  if (bulkGeneratorWorkspace && (inputMode === "csv" || inputMode === "prompt")) {
    return null;
  }

  return (
    <div className={cn('space-y-4', (sapMode || bulkGeneratorWorkspace) && 'space-y-2')}>
      <Card
        variant="default"
        className={cn(
          'border-0 bg-transparent !shadow-none',
          sapMode || bulkGeneratorWorkspace ? 'p-2 sm:p-2' : 'p-3 sm:p-4'
        )}
      >
        <div className={cn('space-y-3', (sapMode || bulkGeneratorWorkspace) && 'space-y-2')}>
          {/* Input method toggle - only when the panel is not locked by shell tabs or SAP */}
          {!sapMode && forcedInputMode === undefined && (
          <div className="space-y-1.5">
            <Label className="text-base font-medium">Input method</Label>
            <RadioGroup value={inputMode} onValueChange={(value) => {
              setInputMode(value as 'csv' | 'prompt');
              if (value === 'csv') {
                resetPromptGeneration();
                setSelectedBlogIndices(new Set());
              } else if (value === 'prompt') {
                setCsvFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }
            }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="mode-csv" />
                <Label htmlFor="mode-csv" className="cursor-pointer flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  CSV Upload
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prompt" id="mode-prompt" />
                <Label htmlFor="mode-prompt" className="cursor-pointer flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  Prompt Input
                </Label>
              </div>
            </RadioGroup>
          </div>
          )}

          {/* CSV Upload Mode */}
          {inputMode === 'csv' && (
            <CSVUploadSection
              csvFile={csvFile}
              setCsvFile={setCsvFile}
              fileInputRef={fileInputRef}
              rows={rows}
              loadCSV={loadCSV}
              connectedSite={connectedSite}
              isProcessing={isProcessing}
              selectedWordPressSites={selectedWordPressSites}
              setSelectedWordPressSites={setSelectedWordPressSites}
              siteConfigs={siteConfigs}
              setSiteConfigs={setSiteConfigs}
              scheduleFrequency={scheduleFrequency}
              setScheduleFrequency={setScheduleFrequency}
              customInterval={customInterval}
              setCustomInterval={setCustomInterval}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              startDateOption={startDateOption}
              setStartDateOption={setStartDateOption}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              startTime={startTime}
              setStartTime={setStartTime}
              useCsvPublishDates={useCsvPublishDates}
              setUseCsvPublishDates={setUseCsvPublishDates}
              wordpressDraftOnly={wordpressDraftOnly}
              setWordpressDraftOnly={setWordpressDraftOnly}
              previewRows={previewRowsForWp}
              rowOrder={rowOrder}
              replaceFileUploadWith={replaceCsvFileUploadWith}
              sapMode={sapMode}
              postDestination={bulkPostDestination}
              setPostDestination={setBulkPostDestination}
              postDestinationChoices={postDestinationChoices}
              scheduleOccupancy={scheduleOccupancy}
              scheduleOccupancyLoading={scheduleOccupancyLoading}
              hideFileUploadSlot={bulkGeneratorWorkspace}
              hideWordPressPostingInBody={bulkGeneratorWorkspace}
            />
          )}

          {/* Prompt Input Mode */}
          {inputMode === 'prompt' && (
            <>
              {!bulkGeneratorWorkspace ? (
              <div>
                <Input
                  id="general-intent"
                  placeholder="General intent / topic (optional) - e.g. interior design; steers ideas & keywords"
                  value={generalIntent}
                  onChange={(e) => setGeneralIntent(e.target.value)}
                  className="h-9 w-full min-w-0 border-0 bg-muted/55 text-base font-medium text-foreground shadow-none ring-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0"
                  aria-label="General intent or content topic"
                />
              </div>
              ) : null}

              {!bulkGeneratorWorkspace ? (
              <PromptInputSection
                numberOfBlogs={numberOfBlogs}
                setNumberOfBlogs={handleNumberOfBlogsChange}
                optionalPrompt={optionalPrompt}
                setOptionalPrompt={setOptionalPrompt}
                featuredImagePerBlog={featuredImagePerBlog}
                setFeaturedImagePerBlog={setFeaturedImagePerBlog}
                featuredImageType={featuredImageType}
                setFeaturedImageType={setFeaturedImageType}
                connectedSite={connectedSite}
                selectedWordPressSites={selectedWordPressSites}
                setSelectedWordPressSites={setSelectedWordPressSites}
                siteConfigs={siteConfigs}
                setSiteConfigs={setSiteConfigs}
                scheduleFrequency={scheduleFrequency}
                setScheduleFrequency={setScheduleFrequency}
                customInterval={customInterval}
                setCustomInterval={setCustomInterval}
                dayOfWeek={dayOfWeek}
                setDayOfWeek={setDayOfWeek}
                startDateOption={startDateOption}
                setStartDateOption={setStartDateOption}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                startTime={startTime}
                setStartTime={setStartTime}
                useCsvPublishDates={useCsvPublishDates}
                setUseCsvPublishDates={setUseCsvPublishDates}
                wordpressDraftOnly={wordpressDraftOnly}
                setWordpressDraftOnly={setWordpressDraftOnly}
                previewRows={previewRowsForWp}
                rowOrder={rowOrder}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                apiKey={apiKey}
                openRouterApiKey={openRouterApiKey}
                handleGenerateChecklist={handleGenerateChecklistAndSelectAll}
                setSelectedBlogIndices={setSelectedBlogIndices}
                postDestination={bulkPostDestination}
                setPostDestination={setBulkPostDestination}
                postDestinationChoices={postDestinationChoices}
                scheduleOccupancy={scheduleOccupancy}
                scheduleOccupancyLoading={scheduleOccupancyLoading}
              />
              ) : null}

              <GeneratedBlogIdeasList
                hasGeneratedChecklist={hasGeneratedChecklist}
                slotMode={!hasGeneratedChecklist}
                placeholderCount={BULK_GENERATOR_EMPTY_ROW_COUNT}
                generatedRows={generatedRows}
                selectedBlogIndices={selectedBlogIndices}
                setSelectedBlogIndices={setSelectedBlogIndices}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                publishDateLabelByIndex={publishDateLabelByGeneratedIndex}
                draftOnly={wordpressDraftOnly && bulkPostDestination !== "local"}
                onRowChange={handleGeneratedRowChange}
              />
            </>
          )}

          {/* Progress and Stats Display */}
          {!bulkGeneratorWorkspace ? (
          <ProgressAndStatsDisplay
            isProcessing={isProcessing}
            currentRow={currentRow}
            totalRows={totalRows}
            status={status}
            stats={stats}
            fileManager={fileManager}
            selectedWordPressSites={selectedWordPressSites}
            harnessSections={harnessSections}
            harnessPlannedSectionCount={harnessPlannedSectionCount}
          />
          ) : null}

          {/* Generated files: legacy panel when not using workspace chrome */}
          {!bulkGeneratorWorkspace ? (
          <GeneratedFilesDisplay
            filesByRow={filesByRow}
            displayRows={displayRows}
            stats={stats}
            downloadFile={downloadFile}
            downloadRowFiles={downloadRowFiles}
            downloadAllFiles={downloadAllFiles}
            downloadRunContentCsv={downloadRunContentCsv}
            runContentCsvAvailable={runContentCsvAvailable}
            isProcessing={isProcessing}
            processingStatus={status}
          />
          ) : null}

          {/* Controls - Only show for CSV mode */}
          {!bulkGeneratorWorkspace ? (
          <CSVProcessingControls
            inputMode={inputMode}
            rows={rows}
            displayRows={displayRows}
            isProcessing={isProcessing}
            apiKey={apiKey}
            openRouterApiKey={openRouterApiKey}
            handleStartProcessing={handleStartProcessing}
            cancelProcessing={cancelProcessing}
          />
          ) : null}
        </div>
      </Card>

    </div>
  );
};

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { notify } from "@/lib/app-notifications";
import { notifyLoadedXRowSFromSitemapMergePlan } from "@/lib/notify-messages";
import {
  consumeEntityBulkCsvAutoRun,
  consumeSitemapOptimizerBulkCsvSeed,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-bulk-handoff";
import type { BulkRowSitemapType } from "@/lib/bulk/bulk-sitemap-mode";
import {
  defaultBulkSitemapMode,
  inferBulkSitemapModeFromRows,
  resolveSiteSitemapMode,
  rowHasUploadEntity,
  seedCustomRowSitemaps,
} from "@/lib/bulk/bulk-sitemap-mode";
import {
  allRowIndicesSet,
  buildBulkBaseRows,
  identityRowOrder,
} from "@/lib/bulk-processing-order";
import { computePublishDateLabelsByGeneratedIndex } from "@/lib/bulk/bulk-slot-publish-dates";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkSiteSitemapConfig } from "@/components/keyword-research/bulk/BulkGeneratorSitemapMenu";
import type { ScheduleFrequency } from "@/lib/wordpress-scheduler";
import type { ScheduleOccupancy } from "@/lib/bulk-schedule-gap";
import type { useBulkAutoGenerate } from "@/hooks/use-bulk-auto-generate";
import type { usePromptBulkGenerate } from "@/hooks/use-prompt-bulk-generate";
import type { useBulkScheduleOccupancy } from "@/hooks/use-bulk-schedule-occupancy";
import { useBulkProcessing } from "./useBulkProcessing";

export interface UseBulkCsvSitemapAndRowHandlersArgs {
  bulk: ReturnType<typeof useBulkAutoGenerate>;
  prompt: ReturnType<typeof usePromptBulkGenerate>;
  inputMode: "csv" | "prompt";
  sapMode: boolean;
  csvFile: File | null;
  injectedRows?: CSVRow[];
  sapSyncedRows?: CSVRow[];
  wordPressSite: WordPressSite | null;
  selectedWordPressSites: Set<string>;
  selectedBlogIndices: Set<number>;
  siteConfigs: Record<string, BulkSiteSitemapConfig>;
  setSiteConfigs: Dispatch<SetStateAction<Record<string, BulkSiteSitemapConfig>>>;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: "immediate" | "custom";
  customStartDate: Date;
  startTime: string;
  useCsvPublishDates: boolean;
  bulkPostDestination: WordPressPostDestination;
  wordpressDraftOnly: boolean;
  rowOrder: number[];
  setRowOrder: Dispatch<SetStateAction<number[]>>;
  gapScheduleEnabled: boolean;
  scheduleOccupancy: ScheduleOccupancy | null;
  refreshScheduleOccupancy: ReturnType<typeof useBulkScheduleOccupancy>["refresh"];
  apiKey?: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  setSelectedBlogIndices: Dispatch<SetStateAction<Set<number>>>;
  setCsvFile: Dispatch<SetStateAction<File | null>>;
  setFeaturedImageType: Dispatch<SetStateAction<"ai-generated" | "google-maps">>;
  setFeaturedImagePerBlog: Dispatch<SetStateAction<boolean>>;
  setNumberOfBlogs: Dispatch<SetStateAction<number>>;
}

export function useBulkCsvSitemapAndRowHandlers(
  args: UseBulkCsvSitemapAndRowHandlersArgs,
) {
  const {
    bulk, prompt, inputMode, sapMode, csvFile, injectedRows, sapSyncedRows,
    wordPressSite, selectedWordPressSites, selectedBlogIndices, siteConfigs,
    setSiteConfigs, scheduleFrequency, customInterval, dayOfWeek,
    startDateOption, customStartDate, startTime, useCsvPublishDates,
    bulkPostDestination, wordpressDraftOnly, rowOrder, gapScheduleEnabled,
    scheduleOccupancy, refreshScheduleOccupancy, apiKey, openRouterApiKey,
    selectedModel,
  } = args;
  const argsRef = useRef(args);
  argsRef.current = args;
  const {
    rows, setRows, setTotalRows, loadCSV, processAllRows, setIsProcessing,
    setCurrentRow,
  } = bulk;
  const {
    generatedRows, setGeneratedRows, setHasGeneratedChecklist,
    handleGenerateChecklist, hasGeneratedChecklist,
  } = prompt;

  const bulkPreviewBuilt = useMemo(
    () => buildBulkBaseRows(inputMode, rows, generatedRows, selectedBlogIndices),
    [inputMode, rows, generatedRows, selectedBlogIndices]
  );
  const previewRowsForWp = useMemo(
    () => (bulkPreviewBuilt.ok ? bulkPreviewBuilt.baseRows : []),
    [bulkPreviewBuilt],
  );

  const batchKey = useMemo(() => {
    const sel = Array.from(selectedBlogIndices)
      .sort((a, b) => a - b)
      .join(',');
    return `${inputMode}|${csvFile?.name ?? ''}|${rows.length}|${generatedRows.length}|${sel}`;
  }, [inputMode, csvFile?.name, rows.length, generatedRows.length, selectedBlogIndices]);

  useEffect(() => {
    const { setRowOrder } = argsRef.current;
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
      const { setSiteConfigs, setFeaturedImageType, setFeaturedImagePerBlog } = argsRef.current;
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
    const { setFeaturedImageType, setFeaturedImagePerBlog } = argsRef.current;
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

  const ingestSeedCsvString = useCallback(
    (csv: string, autoRun = false) => {
      const { setCsvFile, setSelectedBlogIndices } = argsRef.current;
      const file = new File([csv], "local-grid-bulk-template.csv", { type: "text/csv" });
      void loadCSV(file).then((parsed) => {
        const normalized = applyCsvSitemapInference(parsed);
        if (normalized.length > 0) {
          setCsvFile(file);
          if (inputMode === "prompt") {
            setGeneratedRows(normalized);
            setHasGeneratedChecklist(true);
            setSelectedBlogIndices(allRowIndicesSet(normalized.length));
            setTotalRows(normalized.length);
          } else {
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
    },
    [loadCSV, applyCsvSitemapInference, inputMode, setGeneratedRows, setHasGeneratedChecklist, setRows, setTotalRows],
  );

  useEffect(() => {
    if (sapMode) return;
    const onGridCsv = (event: Event) => {
      const custom = event as CustomEvent<{ csv?: string }>;
      const raw = custom.detail?.csv?.trim() || consumeSitemapOptimizerBulkCsvSeed();
      if (!raw) return;
      sitemapSeedLoadedRef.current = true;
      ingestSeedCsvString(raw, false);
    };
    window.addEventListener("neo-pulse:open-bulk-csv-from-grid", onGridCsv);
    return () => window.removeEventListener("neo-pulse:open-bulk-csv-from-grid", onGridCsv);
  }, [sapMode, ingestSeedCsvString]);

  useEffect(() => {
    if (sapMode || sitemapSeedLoadedRef.current) return;
    const csv = consumeSitemapOptimizerBulkCsvSeed();
    if (!csv?.trim()) return;
    sitemapSeedLoadedRef.current = true;
    const autoRun = consumeEntityBulkCsvAutoRun();
    ingestSeedCsvString(csv, autoRun);
  }, [sapMode, ingestSeedCsvString]);

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
      setRows((prev) => {
        const current = prev[rowIndex];
        if (!current) return prev;
        let hasChange = false;
        for (const [k, v] of Object.entries(patch)) {
          if (current[k as keyof CSVRow] !== v) {
            hasChange = true;
            break;
          }
        }
        if (!hasChange) return prev;
        return prev.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row));
      });
    },
    [setRows],
  );

  const handleGenerateChecklistAndSelectAll = useCallback(async () => {
    const { setSelectedBlogIndices } = argsRef.current;
    const result = await handleGenerateChecklist();
    if (result?.length) {
      setSelectedBlogIndices(allRowIndicesSet(result.length));
    }
    return result;
  }, [handleGenerateChecklist]);

  const handleNumberOfBlogsChange = useCallback(
    (value: number) => {
      const { setNumberOfBlogs, setSelectedBlogIndices } = argsRef.current;
      const nextCount = Math.max(1, Math.floor(value) || 1);
      setNumberOfBlogs(nextCount);
      if (hasGeneratedChecklist) {
        setGeneratedRows((prev) => (prev.length > nextCount ? prev.slice(0, nextCount) : prev));
        setSelectedBlogIndices((prev) => {
          const next = new Set<number>();
          for (const i of prev) {
            if (i < nextCount) next.add(i);
          }
          return next;
        });
      }
    },
    [setGeneratedRows, hasGeneratedChecklist],
  );

  useEffect(() => {
    const activeCount = inputMode === "prompt" ? generatedRows.length : rows.length;
    if (!pendingEntityAutoRunRef.current || activeCount === 0) return;
    pendingEntityAutoRunRef.current = false;
    void handleStartProcessing();
  }, [inputMode, rows.length, generatedRows.length, handleStartProcessing]);

  const handleGeneratedRowChange = useCallback(
    (index: number, patch: Partial<CSVRow>) => {
      setGeneratedRows((prev) => {
        const current = prev[index];
        if (!current) return prev;
        let hasChange = false;
        for (const [k, v] of Object.entries(patch)) {
          if (current[k as keyof CSVRow] !== v) {
            hasChange = true;
            break;
          }
        }
        if (!hasChange) return prev;
        const next = [...prev];
        next[index] = { ...current, ...patch };
        return next;
      });
    },
    [setGeneratedRows],
  );

  const handleBatchDisplayRowsChange = useCallback(
    (patches: Array<{ index: number; patch: Partial<CSVRow> }>) => {
      if (patches.length === 0) return;
      if (inputMode === "csv") {
        setRows((prev) => {
          let changed = false;
          const next = [...prev];
          for (const { index, patch } of patches) {
            const current = next[index];
            if (!current) continue;
            let rowChanged = false;
            for (const [k, v] of Object.entries(patch)) {
              if (current[k as keyof CSVRow] !== v) {
                rowChanged = true;
                break;
              }
            }
            if (rowChanged) {
              next[index] = { ...current, ...patch };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } else {
        setGeneratedRows((prev) => {
          let changed = false;
          const next = [...prev];
          for (const { index, patch } of patches) {
            const current = next[index];
            if (!current) continue;
            let rowChanged = false;
            for (const [k, v] of Object.entries(patch)) {
              if (current[k as keyof CSVRow] !== v) {
                rowChanged = true;
                break;
              }
            }
            if (rowChanged) {
              next[index] = { ...current, ...patch };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    },
    [inputMode, setGeneratedRows, setRows],
  );

  return {
    previewRowsForWp, publishDateLabelByGeneratedIndex, sitemapMode,
    siteFallbackSitemapType, applyCsvSitemapInference, handleRowSitemapChange,
    handleSwitchToCustom, handleStartProcessing, handleApprove,
    handleCsvRowChange, handleGenerateChecklistAndSelectAll,
    handleNumberOfBlogsChange, handleGeneratedRowChange,
    handleBatchDisplayRowsChange,
  };
}

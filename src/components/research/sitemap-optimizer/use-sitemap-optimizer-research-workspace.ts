import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { useSitemapOptimizerApprovePlan } from "@/hooks/research/use-sitemap-optimizer-approve-plan";
import { useSitemapOptimizerRedirectCsvImport } from "@/hooks/research/use-sitemap-optimizer-redirect-csv-import";
import { useSitemapOptimizerRun } from "@/hooks/research/use-sitemap-optimizer-run";
import { buildSitemapOptimizerCollectionOptions } from "@/lib/sitemap-optimizer/collection-options";
import { getFullHistorySitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import {
  replacementContentSheetRows,
  replacementPlanBreakdown,
  replacementPlanBreakdownLine,
  replacementPlanSummaryLine,
} from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import type {
  SitemapOptimizerCollectionKey,
  SitemapOptimizerWorkspaceMode,
} from "@/lib/sitemap-optimizer/types";
import type { SitemapUrlOptimizerWorkspaceBindings } from "@/components/research/sitemap-optimizer/sitemap-url-optimizer-workspace-bindings";
import {
  readStoredSitemapOptimizerSection,
  writeStoredSitemapOptimizerSection,
} from "@/components/research/sitemap-optimizer/sitemap-optimizer-sections";
import {
  buildSitemapPlanMicroSnapshot,
  sitemapPlanHeaderProgressFromState,
} from "@/lib/sitemap-optimizer/sitemap-plan-header-progress";
import {
  buildSitemapMergePublishMicroSnapshot,
  sitemapMergePublishDetailsCanOpen,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-bulk-details-bindings";
import { sitemapPlanDetailsCanOpen } from "@/lib/sitemap-optimizer/sitemap-plan-bulk-details-bindings";
import { useSitemapOptimizerResearchActions } from "@/components/research/sitemap-optimizer/use-sitemap-optimizer-research-actions";

export function useSitemapOptimizerResearchWorkspace() {
  const { mode: workspaceMode, connectedSite: site } = useManagerSeedWorkspace();
  const { phase, progress, result, error, running, run, cancel, setResult } = useSitemapOptimizerRun();
  const rankMathImport = useSitemapOptimizerRedirectCsvImport();
  const { approving, progress: approveProgress, approve } = useSitemapOptimizerApprovePlan();
  const [workspaceSubMode, setWorkspaceSubMode] = useState<SitemapOptimizerWorkspaceMode>(
    () => readStoredSitemapOptimizerSection(),
  );
  const [urlBindings, setUrlBindings] = useState<SitemapUrlOptimizerWorkspaceBindings | null>(null);
  const handleWorkspaceSubModeChange = useCallback((mode: SitemapOptimizerWorkspaceMode) => {
    setWorkspaceSubMode(mode);
    writeStoredSitemapOptimizerSection(mode);
  }, []);

  const onUrlOptimizerWorkspaceBindings = useCallback(
    (bindings: SitemapUrlOptimizerWorkspaceBindings) => {
      setUrlBindings(bindings);
    },
    [],
  );

  const collectionOptions = useMemo(
    () => buildSitemapOptimizerCollectionOptions(site),
    [site],
  );

  const dateRange = useMemo(() => getFullHistorySitemapOptimizerGscDateRange(), []);
  const [selected, setSelected] = useState<Set<SitemapOptimizerCollectionKey>>(
    () => new Set<SitemapOptimizerCollectionKey>(["posts"]),
  );

  const selectedInventoryKey = useMemo(
    () => [...selected][0] ?? "posts",
    [selected],
  );

  const entityPrimary = selectedInventoryKey === "entity";
  const selectionInitializedForSiteRef = useRef<string | null>(null);
  const selectCollection = useCallback((key: SitemapOptimizerCollectionKey) => {
    const opt = collectionOptions.find((o) => o.key === key);
    if (opt && !opt.enabled) return;
    setSelected(new Set<SitemapOptimizerCollectionKey>([key]));
  }, [collectionOptions]);

  const siteId = site?.id;
  useEffect(() => {
    if (!siteId) {
      selectionInitializedForSiteRef.current = null;
      return;
    }
    if (selectionInitializedForSiteRef.current === siteId) return;
    selectionInitializedForSiteRef.current = siteId;

    const entityOpt = collectionOptions.find((o) => o.key === "entity");
    if (entityOpt?.enabled) {
      setSelected(new Set<SitemapOptimizerCollectionKey>(["entity"]));
      return;
    }
    setSelected(new Set<SitemapOptimizerCollectionKey>(["posts"]));
  }, [siteId, collectionOptions]);
  const replacementSheet = useMemo(
    () => (result?.contentSheet?.length ? replacementContentSheetRows(result.contentSheet) : []),
    [result?.contentSheet],
  );
  const mergeGroupCount = result?.merges.length ?? 0;
  const hasMergePlan = mergeGroupCount > 0;
  const {
    gscPagesUpload,
    setGscPagesUpload,
    gscFileName,
    setGscFileName,
    gridResultTab,
    setGridResultTab,
    publishWorkspaceActive,
    setPublishWorkspaceActive,
    redirectMapUpload,
    isRedirectMapHarness,
    isGridHarness,
    isGridFlow,
    gscAnalyzeMode,
    handleAnalyze,
    handleDownloadRedirects,
    handleExportContentSheetCsv,
    handleCopyMd,
    handleApprovePlan,
    handleGscFile,
    handleDownloadRedirectMapTemplate,
    handleRedirectCsvFile,
  } = useSitemapOptimizerResearchActions({
    site,
    workspaceMode,
    collectionOptions,
    selected,
    selectedInventoryKey,
    dateRange,
    run,
    setResult,
    cancel,
    rankMathImport,
    approve,
    result,
    replacementSheet,
    mergeGroupCount,
  });
  const busy = running || rankMathImport.running || approving;
  const activeProgress = rankMathImport.running ? rankMathImport.progress : progress;
  const inPublishWorkspace = publishWorkspaceActive && hasMergePlan;
  const urlRunning = Boolean(urlBindings?.running);
  const workspaceBusy = busy || urlRunning;
  const modeSwitchDisabled = workspaceBusy;

  const placeholderOnlyBody =
    (workspaceSubMode === "plan" && !result) ||
    (workspaceSubMode === "url_optimizer" && !urlBindings?.detailsProps?.result);

  const planHeaderProgress = useMemo(
    () =>
      sitemapPlanHeaderProgressFromState({
        rankMathImportRunning: rankMathImport.running,
        rankMathProgress: rankMathImport.running ? rankMathImport.progress : null,
        analyzeRunning: running,
        analyzeProgress: running ? progress : null,
        approving,
        approveProgress: approving ? approveProgress : null,
      }),
    [
      rankMathImport.running,
      rankMathImport.progress,
      running,
      progress,
      approving,
      approveProgress,
    ],
  );

  const planProgressSnapshot = useMemo(
    () => buildSitemapPlanMicroSnapshot(planHeaderProgress),
    [planHeaderProgress],
  );

  const planCanOpenDetails = useMemo(
    () =>
      sitemapPlanDetailsCanOpen({
        busy,
        gscFileName,
        rankMathImportSummary: rankMathImport.importSummary,
        error,
        rankMathError: rankMathImport.error,
      }),
    [busy, gscFileName, rankMathImport.importSummary, error, rankMathImport.error],
  );

  const resultSummaryLine = useMemo(() => {
    if (!result) return "";
    return replacementPlanSummaryLine({
      inventoryCount: result.rows.length,
      merges: result.merges,
      contentSheet: result.contentSheet,
      entityPrimary,
    });
  }, [result, entityPrimary]);
  const resultBreakdownLine = useMemo(() => {
    if (!result || !entityPrimary) return "";
    return replacementPlanBreakdownLine(
      replacementPlanBreakdown({
        rows: result.rows,
        contentSheet: result.contentSheet,
        merges: result.merges,
      }),
    );
  }, [result, entityPrimary]);
  const mergePublishActive = inPublishWorkspace || approving;
  const mergePublishDetailsInput = useMemo(
    () => ({
      approving,
      approveProgress: approving ? approveProgress : null,
      bulkState: null,
      workspaceBusy: approving,
      pageSubtitle: resultSummaryLine || undefined,
      entityPrimary,
    }),
    [approving, approveProgress, resultSummaryLine, entityPrimary],
  );
  const mergePublishCanOpenDetails = useMemo(
    () => sitemapMergePublishDetailsCanOpen(mergePublishDetailsInput),
    [mergePublishDetailsInput],
  );
  const mergePublishProgressSnapshot = useMemo(
    () => buildSitemapMergePublishMicroSnapshot(mergePublishDetailsInput),
    [mergePublishDetailsInput],
  );
  const gscUploadCount = result?.gscUploadRowCount ?? gscPagesUpload?.length;
  const isGridResult = result?.runMode === "grid_csv";
  const siteReady =
    workspaceMode !== "temp" &&
    Boolean(site?.username?.trim() && site?.appPassword?.trim());
  const hasResult = Boolean(result);
  const showSetupToolbar = !busy && !inPublishWorkspace && !hasResult;
  const showResultToolbar = !busy && !inPublishWorkspace && hasResult;
  const showAnalyzeAction =
    !busy && !inPublishWorkspace && (isGridHarness || siteReady);
  const showGscCsvUpload =
    showSetupToolbar &&
    (isGridHarness || gscAnalyzeMode === "csv" || !site);
  const showRedirectCsvUpload = showSetupToolbar && siteReady && !isGridHarness;
  const showToolbarOptions =
    (showSetupToolbar || showResultToolbar) && (siteReady || isGridHarness || !site);

  return {
    workspaceSubMode,
    handleWorkspaceSubModeChange,
    modeSwitchDisabled,
    workspaceBusy,
    busy,
    showToolbarOptions,
    showSetupToolbar,
    showResultToolbar,
    showAnalyzeAction,
    showGscCsvUpload,
    showRedirectCsvUpload,
    inPublishWorkspace,
    isGridHarness,
    isGridFlow,
    isRedirectMapHarness,
    hasResult,
    siteReady,
    workspaceMode,
    site,
    approving,
    approveProgress,
    rankMathImport,
    running,
    cancel,
    mergeGroupCount,
    collectionOptions,
    selected,
    selectCollection,
    gscFileName,
    gscPagesUpload,
    setGscPagesUpload,
    setGscFileName,
    setResult,
    result,
    replacementSheet,
    handleDownloadRedirectMapTemplate,
    handleGscFile,
    handleRedirectCsvFile,
    handleAnalyze,
    handleApprovePlan,
    handleDownloadRedirects,
    handleExportContentSheetCsv,
    handleCopyMd,
    planProgressSnapshot,
    planCanOpenDetails,
    mergePublishActive,
    mergePublishCanOpenDetails,
    mergePublishProgressSnapshot,
    mergePublishDetailsInput,
    planHeaderProgress,
    activeProgress,
    selectedInventoryKey,
    error,
    progress,
    urlBindings,
    onUrlOptimizerWorkspaceBindings,
    placeholderOnlyBody,
    isGridResult,
    gridResultTab,
    setGridResultTab,
    gscUploadCount,
    resultSummaryLine,
    resultBreakdownLine,
    setPublishWorkspaceActive,
  };
}

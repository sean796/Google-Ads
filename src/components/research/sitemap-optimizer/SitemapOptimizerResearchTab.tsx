import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitMerge } from "lucide-react";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { useSitemapOptimizerApprovePlan } from "@/hooks/research/use-sitemap-optimizer-approve-plan";
import { useSitemapOptimizerRankMathImport } from "@/hooks/research/use-sitemap-optimizer-rankmath-import";
import { useSitemapOptimizerRun } from "@/hooks/research/use-sitemap-optimizer-run";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA, NOTIFY_COPY_FAILED, NOTIFY_NO_REPLACEMENT_CONTENT_TO_EXPORT_RUN_ANA, NOTIFY_RUN_ANALYZE_FIRST_2, NOTIFY_SELECT_SITE_URL, NOTIFY_UPLOAD_A_GSC_GRID_CSV_FIRST, notifyAnalyzedXRedirectSFromYourCsvTemp, notifyDownloadedXRedirects, notifyLoadedXContentPlanSFromRedirectEx, notifyRankMathPlanX } from "@/lib/notify-messages";
import { buildSitemapOptimizerCollectionOptions } from "@/lib/sitemap-optimizer/collection-options";
import { getFullHistorySitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import {
  parseGscPagesCsv,
  type GscParsedPageRow,
} from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import { isRedirectGridUpload } from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import {
  buildGscRedirectMapTemplateCsv,
  isRedirectMapUpload,
} from "@/lib/sitemap-optimizer/gsc-redirect-map-template";
import { parseGridRankMathExportCsv } from "@/lib/sitemap-optimizer/parse-grid-rank-math-export-csv";
import { buildSitemapOptimizerAllRankMathRedirectCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import {
  replacementContentSheetRows,
  replacementPlanBreakdown,
  replacementPlanBreakdownLine,
  replacementPlanSummaryLine,
} from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import {
  buildSitemapOptimizerContentSheetCsv,
  buildSitemapOptimizerMarkdownSummary,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-export";
import type {
  SitemapOptimizerCollectionKey,
  SitemapOptimizerWorkspaceMode,
} from "@/lib/sitemap-optimizer/types";
import { SitemapUrlOptimizerPanel } from "@/components/research/sitemap-optimizer/SitemapUrlOptimizerPanel";
import type { SitemapUrlOptimizerWorkspaceBindings } from "@/components/research/sitemap-optimizer/sitemap-url-optimizer-workspace-bindings";
import { SitemapOptimizerContentSheetGrid } from "@/components/research/sitemap-optimizer/SitemapOptimizerContentSheetGrid";
import { SitemapOptimizerGridRankMathGrid } from "@/components/research/sitemap-optimizer/SitemapOptimizerGridRankMathGrid";
import { SitemapMergePublishWorkspace } from "@/components/research/sitemap-optimizer/SitemapMergePublishWorkspace";
import { SitemapOptimizerUnifiedHeader } from "@/components/research/sitemap-optimizer/SitemapOptimizerUnifiedHeader";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
} from "@/components/seo/seo-workspace-layout";
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
import { collectMergeSourcePosts } from "@/lib/sitemap-optimizer/trash-merge-source-posts";
import { WorkspaceEmptyRowStripes } from "@/components/shared/WorkspaceEmptyRowStripes";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SitemapOptimizerResearchTab() {
  const { mode: workspaceMode, connectedSite: site } = useManagerSeedWorkspace();
  const { phase, progress, result, error, running, run, cancel, setResult } = useSitemapOptimizerRun();
  const rankMathImport = useSitemapOptimizerRankMathImport();
  const { approving, progress: approveProgress, approve } = useSitemapOptimizerApprovePlan();
  const [gscPagesUpload, setGscPagesUpload] = useState<GscParsedPageRow[] | null>(null);
  const [gscFileName, setGscFileName] = useState<string | null>(null);
  const [gridResultTab, setGridResultTab] = useState<"redirects" | "content">("redirects");
  const [publishWorkspaceActive, setPublishWorkspaceActive] = useState(false);
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

  useEffect(() => {
    setResult(null);
    setPublishWorkspaceActive(false);
    setGscPagesUpload(null);
    setGscFileName(null);
  }, [site?.id, setResult]);

  const prevInventoryKeyRef = useRef<SitemapOptimizerCollectionKey | null>(null);
  const selectionInitializedForSiteRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevInventoryKeyRef.current === null) {
      prevInventoryKeyRef.current = selectedInventoryKey;
      return;
    }
    if (prevInventoryKeyRef.current === selectedInventoryKey) return;
    prevInventoryKeyRef.current = selectedInventoryKey;

    setResult(null);
    setPublishWorkspaceActive(false);
    setGscPagesUpload(null);
    setGscFileName(null);
    setGridResultTab("redirects");
    cancel();
    rankMathImport.cancel();
  }, [selectedInventoryKey, setResult, cancel, rankMathImport]);

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

  const redirectMapUpload =
    gscPagesUpload?.length && isRedirectMapUpload(gscPagesUpload) ? gscPagesUpload : null;
  const isRedirectMapHarness = Boolean(redirectMapUpload?.length);
  /** Grid-only harness (no WordPress site). Redirect map + site uses the WordPress pipeline. */
  const isGridHarness = Boolean(gscPagesUpload?.length) && !site;
  const isGridFlow = isGridHarness || result?.runMode === "grid_csv";
  const gscAnalyzeMode =
    gscPagesUpload?.length && !redirectMapUpload ? "csv" : "live";

  const replacementSheet = useMemo(
    () => (result?.contentSheet?.length ? replacementContentSheetRows(result.contentSheet) : []),
    [result?.contentSheet],
  );
  const mergeGroupCount = result?.merges.length ?? 0;
  const hasMergePlan = mergeGroupCount > 0;

  const handleAnalyze = useCallback(async () => {
    if (isGridHarness) {
      if (!gscPagesUpload?.length) {
        notify.error(NOTIFY_UPLOAD_A_GSC_GRID_CSV_FIRST);
        return;
      }
    } else {
      if (workspaceMode === "temp" || !site) {
        notify.error(NOTIFY_SELECT_SITE_URL);
        return;
      }
      if (!site.username?.trim() || !site.appPassword?.trim()) {
        notify.error(NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA);
        return;
      }
    }
    setPublishWorkspaceActive(false);
    const res = await run({
      site: site ?? null,
      collectionOptions,
      selectedCollections: selected,
      dateRange,
      gscPagesUpload: gscAnalyzeMode === "csv" && !redirectMapUpload ? gscPagesUpload : null,
      redirectMapUpload,
      analyzeFullInventory: true,
      gscImportMode: !isGridHarness && gscAnalyzeMode === "live",
      forceLiveInventory: gscAnalyzeMode === "live",
    });
  }, [
    workspaceMode,
    site,
    selected,
    collectionOptions,
    run,
    dateRange,
    gscPagesUpload,
    isGridHarness,
    redirectMapUpload,
    gscAnalyzeMode,
  ]);

  const handleDownloadRedirects = useCallback(() => {
    if (!result?.rows.length) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST_2);
      return;
    }
    try {
      const { csv, rowCount } = buildSitemapOptimizerAllRankMathRedirectCsv(result);
      if (rowCount === 0) {
        notify.error(
          "No redirects to export — legacy URLs already match targets. Re-analyze after changing merge plans.",
          { duration: 10000 },
        );
        return;
      }
      const prefix =
        result.runMode === "grid_csv" ? "sitemap-grid-redirects" : "sitemap-redirects";
      triggerDownload(
        `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        "text/csv;charset=utf-8",
      );
      notify.success(notifyDownloadedXRedirects(rowCount), { duration: 6000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Redirect export failed.";
      notify.error(msg, { duration: 12000 });
    }
  }, [result]);

  const handleExportContentSheetCsv = useCallback(() => {
    if (!result || !replacementSheet.length) {
      notify.error(NOTIFY_NO_REPLACEMENT_CONTENT_TO_EXPORT_RUN_ANA);
      return;
    }
    const csv = buildSitemapOptimizerContentSheetCsv(result);
    triggerDownload(
      `sitemap-content-sheet-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }, [result, replacementSheet.length]);

  const handleCopyMd = useCallback(async () => {
    if (!result) return;
    const md = buildSitemapOptimizerMarkdownSummary(result);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      notify.error(NOTIFY_COPY_FAILED);
    }
  }, [result]);

  const handleApprovePlan = useCallback(async () => {
    if (!site || !result || mergeGroupCount <= 0) return;
    setPublishWorkspaceActive(true);

    try {
      const res = await approve({
        site,
        result,
        triggerRedirectDownload: (csv, filename) => {
          triggerDownload(filename, csv, "text/csv;charset=utf-8");
        },
        triggerContentSheetDownload: (csv, filename) => {
          triggerDownload(filename, csv, "text/csv;charset=utf-8");
        },
      });

      if (!res.ok) {
        notify.error(res.error, { duration: 12000 });
        return;
      }

      const s = res.summary;
      const parts = [
        s.redirectRowCount > 0 ? "redirect CSV downloaded" : "no redirect rows",
        s.contentSheetDownloaded ? "content sheet downloaded" : "no content sheet rows",
        `${s.trashed} post(s) moved to trash`,
      ];
      if (s.trashSkipped > 0) {
        parts.push(`${s.trashSkipped} skipped (unresolved ID)`);
      }
      if (s.trashFailed > 0) {
        parts.push(`${s.trashFailed} trash error(s)`);
      }
      notify.success(parts.join(". "), { duration: 10000 });
      if (s.trashErrors.length > 0 && s.trashFailed + s.trashSkipped <= 5) {
        notify.error(s.trashErrors.slice(0, 5).join(" "), { duration: 14000 });
      }
    } finally {
      setPublishWorkspaceActive(false);
    }
  }, [site, result, mergeGroupCount, approve]);

  const handleGscFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseGscPagesCsv(text);
    if (parsed.error || !parsed.rows.length) {
      notify.error(parsed.error ?? "No page rows in GSC CSV.", { duration: 12000 });
      setGscPagesUpload(null);
      setGscFileName(null);
      return;
    }
    const redirectMap = isRedirectMapUpload(parsed.rows);
    setGscPagesUpload(parsed.rows);
    setGscFileName(file.name);
    setResult(null);
    setPublishWorkspaceActive(false);
    setGridResultTab("redirects");
    const normalizedCount = parsed.blogDestinationsNormalized ?? 0;
    notify.success(
      redirectMap
        ? normalizedCount > 0
          ? `Redirect map detected (${parsed.rows.length} rows). Normalized ${normalizedCount} destination(s) to /blog/.`
          : `Redirect map detected (${parsed.rows.length} rows)`
        : `GSC pages export detected (${parsed.rows.length} rows)`,
      { duration: 8000 },
    );
  }, [setResult]);

  const handleDownloadRedirectMapTemplate = useCallback(() => {
    triggerDownload(
      "sitemap-redirect-map-template.csv",
      buildGscRedirectMapTemplateCsv(),
      "text/csv;charset=utf-8",
    );
  }, []);

  const handleRankMathFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const gridReimport = parseGridRankMathExportCsv(text).rows.length > 0;

      if (!gridReimport) {
        const redirectCsv = parseGscPagesCsv(text);
        if (!redirectCsv.error && redirectCsv.rows.length && isRedirectGridUpload(redirectCsv.rows)) {
          if (workspaceMode === "temp" || !site) {
            notify.error(NOTIFY_SELECT_SITE_URL);
            return;
          }
          if (!site.username?.trim() || !site.appPassword?.trim()) {
            notify.error(NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA);
            return;
          }
          setPublishWorkspaceActive(false);
          setGscPagesUpload(redirectCsv.rows);
          setGscFileName(file.name);
          setGridResultTab("redirects");
          const res = await run({
            site,
            collectionOptions,
            selectedCollections: selected,
            dateRange,
            redirectMapUpload: redirectCsv.rows,
            gscPagesUpload: null,
            analyzeFullInventory: true,
            gscImportMode: gscAnalyzeMode === "live",
            forceLiveInventory: gscAnalyzeMode === "live",
          });
          if (res.ok) {
            notify.success(
              `Analyzed ${redirectCsv.rows.length} redirect(s) from your CSV (temporal merge + family_id on download).`,
              { duration: 10000 },
            );
          } else if (res.error && res.error !== "Cancelled") {
            notify.error(res.error, { duration: 12000 });
          }
          return;
        }

        if (workspaceMode === "temp" || !site) {
          notify.error(NOTIFY_SELECT_SITE_URL);
          return;
        }
        if (!site.username?.trim() || !site.appPassword?.trim()) {
          notify.error(NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA);
          return;
        }
      }
      setPublishWorkspaceActive(false);
      const res = await rankMathImport.importRankMathPlan({
        site: site ?? null,
        file,
        collectionOptions,
        selectedCollections: selected,
        dateRange,
        setResult,
      });
      if (res.ok) {
        if (res.result.runMode === "grid_csv") {
          notify.success(
            `Loaded ${res.result.contentSheet.length} content plan(s) from redirect export.`,
            { duration: 10000 },
          );
        } else {
          const sourceCount = collectMergeSourcePosts(res.result).length;
          const parts = [
            `${res.result.merges.length} destination(s)`,
            `${sourceCount} source(s) matched`,
          ];
          notify.success(notifyRankMathPlanX(parts.join(" · ")), { duration: 10000 });
        }
      } else if (res.error && res.error !== "Cancelled") {
        notify.error(res.error, { duration: 12000 });
      }
    },
    [
      workspaceMode,
      site,
      collectionOptions,
      selected,
      dateRange,
      rankMathImport,
      setResult,
      run,
      gscAnalyzeMode,
    ],
  );

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
  const showRankMathUpload = showSetupToolbar && siteReady && !isGridHarness;
  const showToolbarOptions =
    (showSetupToolbar || showResultToolbar) && (siteReady || isGridHarness || !site);

  return (
    <div className={SEO_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
      <SitemapOptimizerUnifiedHeader
        workspaceSubMode={workspaceSubMode}
        onWorkspaceSubModeChange={handleWorkspaceSubModeChange}
        modeSwitchDisabled={modeSwitchDisabled}
        workspaceBusy={workspaceBusy}
        planToolbarProps={{
          busy,
          workspaceBusy: busy,
          showToolbarOptions,
          showSetupToolbar,
          showResultToolbar,
          showAnalyzeAction,
          showGscCsvUpload,
          showRankMathUpload,
          inPublishWorkspace,
          isGridHarness,
          isGridFlow,
          isRedirectMapHarness,
          hasResult,
          siteReady,
          workspaceMode,
          siteConnected: Boolean(site),
          approving,
          rankMathImportRunning: rankMathImport.running,
          mergeGroupCount,
          collectionOptions,
          selected,
          selectCollection,
          gscFileName,
          gscUploadRowCount: gscPagesUpload?.length,
          resultRowCount: result?.rows.length ?? 0,
          resultContentSheetCount: replacementSheet.length,
          onDownloadRedirectMapTemplate: handleDownloadRedirectMapTemplate,
          onGscFile: handleGscFile,
          onRankMathFile: handleRankMathFile,
          onClearGscUpload: () => {
            setGscPagesUpload(null);
            setGscFileName(null);
            setResult(null);
          },
          onAnalyze: handleAnalyze,
          onCancel: () => {
            if (rankMathImport.running) {
              rankMathImport.cancel();
            } else if (running) {
              cancel();
            }
          },
          onBackToMergePlan: () => setPublishWorkspaceActive(false),
          onApprovePlan: () => void handleApprovePlan(),
          onDownloadRedirects: handleDownloadRedirects,
          onExportContentSheetCsv: handleExportContentSheetCsv,
          onCopyReport: handleCopyMd,
        }}
        planProgressSnapshot={planProgressSnapshot}
        planCanOpenDetails={planCanOpenDetails}
        planIsProcessing={busy}
        planBusy={busy}
        mergePublishActive={mergePublishActive}
        mergePublishCanOpenDetails={mergePublishCanOpenDetails}
        mergePublishProgressSnapshot={mergePublishProgressSnapshot}
        mergePublishIsProcessing={approving}
        mergePublishDetailsInput={mergePublishDetailsInput}
        planDetailsProps={{
          workspaceBusy: busy,
          headerProgress: planHeaderProgress,
          analyzeProgress: activeProgress,
          approveProgress: approving ? approveProgress : null,
          selectedInventory: selectedInventoryKey,
          gscFileName,
          gscUploadRowCount: gscPagesUpload?.length,
          isRedirectMapHarness,
          rankMathImportSummary: rankMathImport.importSummary,
          error,
          rankMathError: rankMathImport.error,
          siteConnected: Boolean(site),
          workspaceMode,
        }}
        urlBindings={urlBindings}
      />
      </div>

      <div
        className={cn(
          SEO_WORKSPACE_BODY_SCROLL_CLASS,
          "relative",
          placeholderOnlyBody && "overflow-y-hidden",
        )}
      >
      {workspaceSubMode === "url_optimizer" ? (
        <SitemapUrlOptimizerPanel
          urlOptimizerWorkspace
          onUrlOptimizerWorkspaceBindings={onUrlOptimizerWorkspaceBindings}
        />
      ) : result ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3 pt-0">
          {inPublishWorkspace ? (
            <SitemapMergePublishWorkspace
              approveProgress={approveProgress}
              approving={approving}
            />
          ) : (
            <>
              {isGridResult ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      pressed={gridResultTab === "redirects"}
                      type="button"
                      onClick={() => setGridResultTab("redirects")}
                    >
                      Redirects ({result.rows.length})
                    </Button>
                    <Button
                      pressed={gridResultTab === "content"}
                      type="button"
                      onClick={() => setGridResultTab("content")}
                    >
                      Content plans ({replacementSheet.length})
                    </Button>
                    <span className="text-base text-muted-foreground">
                      {gscUploadCount != null ? `${gscUploadCount} CSV rows · ` : ""}
                      {result.merges.length} destination(s)
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    {gridResultTab === "redirects" ? (
                      <SitemapOptimizerGridRankMathGrid result={result} />
                    ) : (
                      <SitemapOptimizerContentSheetGrid
                        sheet={replacementSheet}
                        runMode={result.runMode}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="shrink-0 py-2 text-base text-muted-foreground">
                    <GitMerge className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom text-primary" />
                    {gscUploadCount != null ? `${gscUploadCount} in CSV · ` : ""}
                    {resultSummaryLine}
                    {resultBreakdownLine ? (
                      <>
                        <br />
                        {resultBreakdownLine}
                      </>
                    ) : null}
                  </p>
                  <div className="min-h-0 flex-1">
                    {replacementSheet.length > 0 ? (
                      <SitemapOptimizerContentSheetGrid
                        sheet={replacementSheet}
                        runMode={result.runMode}
                        replacementsOnly
                      />
                    ) : (
                      <p className="text-base text-muted-foreground">
                        No replacement posts needed. Nothing to redirect or generate.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <WorkspaceEmptyRowStripes />
      )}
      </div>
    </div>
  );
}

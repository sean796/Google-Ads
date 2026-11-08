import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA, NOTIFY_COPY_FAILED, NOTIFY_NO_REPLACEMENT_CONTENT_TO_EXPORT_RUN_ANA, NOTIFY_RUN_ANALYZE_FIRST_2, NOTIFY_SELECT_SITE_URL, NOTIFY_UPLOAD_A_GSC_GRID_CSV_FIRST, notifyDownloadedXRedirects, notifyRedirectCsvPlanX } from "@/lib/notify-messages";
import { isRedirectGridUpload } from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import {
  buildGscRedirectMapTemplateCsv,
  isRedirectMapUpload,
} from "@/lib/sitemap-optimizer/gsc-redirect-map-template";
import { parseGscPagesCsv, type GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import { parseGridRedirectCsvExportCsv } from "@/lib/sitemap-optimizer/parse-grid-redirect-export-csv";
import { buildSitemapOptimizerAllRedirectCsvRedirectCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import {
  buildSitemapOptimizerContentSheetCsv,
  buildSitemapOptimizerMarkdownSummary,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-export";
import { collectMergeSourcePosts } from "@/lib/sitemap-optimizer/trash-merge-source-posts";
import type {
  SitemapOptimizerCollectionKey,
} from "@/lib/sitemap-optimizer/types";
import { triggerDownload } from "@/components/research/sitemap-optimizer/sitemap-optimizer-research-download";
import type { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import type { useSitemapOptimizerRun } from "@/hooks/research/use-sitemap-optimizer-run";
import type { useSitemapOptimizerRedirectCsvImport } from "@/hooks/research/use-sitemap-optimizer-redirect-csv-import";
import type { useSitemapOptimizerApprovePlan } from "@/hooks/research/use-sitemap-optimizer-approve-plan";
import type { buildSitemapOptimizerCollectionOptions } from "@/lib/sitemap-optimizer/collection-options";
import type { getFullHistorySitemapOptimizerGscDateRange } from "@/lib/sitemap-optimizer/gsc-date-range";
import type { replacementContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";

export function useSitemapOptimizerResearchActions({
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
}: {
  site: ReturnType<typeof useManagerSeedWorkspace>["connectedSite"];
  workspaceMode: ReturnType<typeof useManagerSeedWorkspace>["mode"];
  collectionOptions: ReturnType<typeof buildSitemapOptimizerCollectionOptions>;
  selected: Set<SitemapOptimizerCollectionKey>;
  selectedInventoryKey: SitemapOptimizerCollectionKey;
  dateRange: ReturnType<typeof getFullHistorySitemapOptimizerGscDateRange>;
  run: ReturnType<typeof useSitemapOptimizerRun>["run"];
  setResult: ReturnType<typeof useSitemapOptimizerRun>["setResult"];
  cancel: ReturnType<typeof useSitemapOptimizerRun>["cancel"];
  rankMathImport: ReturnType<typeof useSitemapOptimizerRedirectCsvImport>;
  approve: ReturnType<typeof useSitemapOptimizerApprovePlan>["approve"];
  result: ReturnType<typeof useSitemapOptimizerRun>["result"];
  replacementSheet: ReturnType<typeof replacementContentSheetRows>;
  mergeGroupCount: number;
}) {
  const [gscPagesUpload, setGscPagesUpload] = useState<GscParsedPageRow[] | null>(null);
  const [gscFileName, setGscFileName] = useState<string | null>(null);
  const [gridResultTab, setGridResultTab] = useState<"redirects" | "content">("redirects");
  const [publishWorkspaceActive, setPublishWorkspaceActive] = useState(false);
  useEffect(() => {
    setResult(null);
    setPublishWorkspaceActive(false);
    setGscPagesUpload(null);
    setGscFileName(null);
  }, [site?.id, setResult]);
  const prevInventoryKeyRef = useRef<SitemapOptimizerCollectionKey | null>(null);
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
  const redirectMapUpload =
    gscPagesUpload?.length && isRedirectMapUpload(gscPagesUpload) ? gscPagesUpload : null;
  const isRedirectMapHarness = Boolean(redirectMapUpload?.length);
  /** Grid-only harness (no WordPress site). Redirect map + site uses the WordPress pipeline. */
  const isGridHarness = Boolean(gscPagesUpload?.length) && !site;
  const isGridFlow = isGridHarness || result?.runMode === "grid_csv";
  const gscAnalyzeMode =
    gscPagesUpload?.length && !redirectMapUpload ? "csv" : "live";
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
      const { csv, rowCount } = buildSitemapOptimizerAllRedirectCsvRedirectCsv(result);
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

  const handleRedirectCsvFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const gridReimport = parseGridRedirectCsvExportCsv(text).rows.length > 0;

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
      const res = await rankMathImport.importRedirectCsvPlan({
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
          notify.success(notifyRedirectCsvPlanX(parts.join(" · ")), { duration: 10000 });
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

  return {
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
  };
}

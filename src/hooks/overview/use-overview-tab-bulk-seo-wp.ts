import { useCallback } from "react";
import { flushSync } from "react-dom";

import { notify, notifyHeaderError } from "@/lib/app-notifications";
import {
  NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN,
  NOTIFY_CSV_DOWNLOADED,
  NOTIFY_NO_ROWS_MATCHED_WORDPRESS_INVENTORY,
} from "@/lib/notify-messages";

import {
  overviewDateModifierTodayIso,
  resolveOverviewBindingForRow,
} from "@/lib/overview/overview-bulk-seo-payload";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

import {
  buildOverviewWordPressExportCsv,
  filterOverviewRowsWithPostBinding,
  triggerOverviewCsvDownload,
} from "@/lib/overview/overview-wordpress-export-csv";

import type { WordPressSite } from "@/components/integrations/types";

import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import {
  overviewInventoryCollectionsForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import {
  buildWpUploadEligibleRows,
  runOverviewWpUploadBatch,
} from "@/lib/overview/overview-wp-upload-batch";
import { overviewRowsInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import {
  finalizeOverviewWpUploadHarnessBatch,
  initOverviewWpUploadHarnessBatchState,
  type WpUploadHarnessSetters,
} from "@/lib/overview/overview-wp-upload-harness-run";

type Opt = ReturnType<typeof useWordPressOptimization>;

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "setRows"
  | "rowsRef"
  | "bindings"
  | "resolveBindings"
  | "prefetchOverviewInventory"
  | "setBulkSeoCsvExportBusy"
  | "bulkScopeUrlKeys"
  | "selectedUrlKeys"
  | "setBulkActionProgress"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  opt: Opt;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
};

export function useOverviewTabBulkSeoWp({
  site,
  sitemapSource,
  rows,
  setRows,
  rowsRef,
  bindings,
  resolveBindings,
  prefetchOverviewInventory,
  setBulkSeoCsvExportBusy,
  opt,
  bulkScopeUrlKeys,
  selectedUrlKeys,
  setBulkActionProgress,
  getInventoryMatchForUrl,
}: Args) {
  const inventoryCollections = overviewInventoryCollectionsForSite(site, sitemapSource);

  const handleBulkExportSeoCsv = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    if (!scopedRows.length) return;

    setBulkSeoCsvExportBusy(true);
    try {
      const inv = await prefetchOverviewInventory(site, {
        downloadCsv: false,
        collections: inventoryCollections,
      });
      if (!inv.ok) {
        notify.error(inv.error || "Could not load WordPress inventory for export.", { duration: 12000 });
        return;
      }

      const bindingMap = await resolveBindings(rows.map((r) => r.url), site, undefined, {
        inventoryOnly: true,
      });
      const merged = { ...bindings, ...bindingMap };
      const exportRows = scopedRows;
      const eligible = filterOverviewRowsWithPostBinding(exportRows, merged);
      if (!eligible.length) {
        notify.error(NOTIFY_NO_ROWS_MATCHED_WORDPRESS_INVENTORY);
        return;
      }

      const hostKey = (() => {
        try {
          return new URL(site.siteUrl).hostname.replace(/[^a-zA-Z0-9._-]+/g, "_");
        } catch {
          return "site";
        }
      })();
      const csv = buildOverviewWordPressExportCsv(exportRows, merged);
      triggerOverviewCsvDownload(
        csv,
        `neo-pulse-overview-export-${hostKey}-${new Date().toISOString().slice(0, 10)}.csv`,
      );

      notify.success(NOTIFY_CSV_DOWNLOADED, { duration: 8000 });
    } catch (err) {
      notifyHeaderError("Bulk SEO export failed", err, { duration: 12000 });
    } finally {
      setBulkSeoCsvExportBusy(false);
    }
  }, [site, rows, bulkScopeUrlKeys, bindings, resolveBindings, prefetchOverviewInventory, inventoryCollections, setBulkSeoCsvExportBusy]);

  const handleBulkUploadToWordPress = useCallback(async () => {
    console.info("[WP upload] click", {
      site: site?.siteUrl ?? null,
      hasCredentials: Boolean(site?.username && site?.appPassword),
      scoped: overviewRowsInBulkScope(rows, bulkScopeUrlKeys).length,
    });
    if (!site?.username || !site.appPassword) {
      console.info("[WP upload] aborted: missing WordPress credentials");
      return;
    }

    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    if (!scopedRows.length) {
      console.info("[WP upload] aborted: no scoped rows");
      return;
    }

    const mergedBindings = { ...bindings };
    const missingBindingUrls = scopedRows
      .filter((row) => !resolveOverviewBindingForRow(row, mergedBindings, getInventoryMatchForUrl(site, row.url))?.postId)
      .map((row) => row.url);
    if (missingBindingUrls.length) {
      const bindingMap = await resolveBindings(missingBindingUrls, site, undefined, {
        inventoryOnly: true,
      });
      Object.assign(mergedBindings, bindingMap);
    }

    const eligible = buildWpUploadEligibleRows(rows, mergedBindings, bulkScopeUrlKeys, null, {
      resolveBinding: (row) =>
        resolveOverviewBindingForRow(row, mergedBindings, getInventoryMatchForUrl(site, row.url)),
      selectedUrlKeys,
      getInventoryMatchForUrl: (url) => getInventoryMatchForUrl(site, url),
      site,
    });
    console.info("[WP upload] eligible", {
      count: eligible.length,
      scoped: scopedRows.length,
    });

    const batchKey = `${site.id}-batch`;
    const harnessSetters: WpUploadHarnessSetters = {
      siteId: site.id,
      batchKey,
      setBulkOptimizationState: opt.setBulkOptimizationState,
      setOptimizationProgress: opt.setOptimizationProgress,
    };

    const harnessRows = eligible.map((e) => e.row);

    flushSync(() => {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.contentKw;
        delete next.entityKw;
        return next;
      });
      initOverviewWpUploadHarnessBatchState({
        site,
        rows: harnessRows,
        bindings: mergedBindings,
        prepMessage: `Uploading ${eligible.length} row(s) to WordPress…`,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
      });
    });

    if (!eligible.length) {
      const noEligibleMessage =
        selectedUrlKeys.size === 0
          ? "No changed rows to upload"
          : "No selected rows with WordPress post IDs";
      console.info("[WP upload] aborted:", noEligibleMessage);
      finalizeOverviewWpUploadHarnessBatch(
        batchKey,
        site.id,
        harnessSetters,
        opt.setIsOptimizingContent,
        noEligibleMessage,
      );
      return;
    }

    const { results, stats } = await runOverviewWpUploadBatch({
      site,
      eligible,
      harnessSetters,
      batchKey,
    });

    const uploadedKeys = new Set(
      results.filter((r) => r.ok && r.url).map((r) => normalizePageUrlKey(r.url)),
    );
    if (uploadedKeys.size > 0) {
      const todayIso = overviewDateModifierTodayIso();
      const commitRow = (row: (typeof rows)[number]) => {
        if (!uploadedKeys.has(normalizePageUrlKey(row.url))) return row;
        return {
          ...row,
          title: (row.aiTitle || row.title || "").trim() || row.title,
          metaDescription: (row.aiMeta || row.metaDescription || "").trim() || row.metaDescription,
          aiTitle: "",
          aiMeta: "",
          ...(row.postContentOptimized?.trim()
            ? {
                postContent: row.postContentOptimized.trim(),
                postContentOptimized: undefined,
              }
            : {}),
          dateModifier: todayIso,
        };
      };
      if (rowsRef) {
        rowsRef.current = rowsRef.current.map(commitRow);
      }
      setRows?.((prev) => prev.map(commitRow));
    }

    console.info("[WP upload] finished", { okCount: stats.okCount });

    finalizeOverviewWpUploadHarnessBatch(
      batchKey,
      site.id,
      harnessSetters,
      opt.setIsOptimizingContent,
      `${stats.okCount} uploaded`,
    );
  }, [
    site,
    rows,
    setRows,
    rowsRef,
    bindings,
    bulkScopeUrlKeys,
    selectedUrlKeys,
    resolveBindings,
    getInventoryMatchForUrl,
    opt,
    setBulkActionProgress,
  ]);

  return { handleBulkExportSeoCsv, handleBulkUploadToWordPress };
}

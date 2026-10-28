import { useCallback } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_AI_TITLES_APPLY_TO_POSTS_ONLY_PAGES_BUCK, NOTIFY_BAD_URL, NOTIFY_FINISHED_FOCUS_KEYWORD_URL_PATHS, NOTIFY_NO_ROWS_TO_EXPORT, notifyExportedXRowSToCsv, notifyPostBodiesXOfXFilledReloadTheSit } from "@/lib/notify-messages";

import { computeOverviewAiUrlSuggestion } from "@/lib/overview/overview-ai-url-suggest";
import {
  buildOverviewRedirectRow,
  downloadOverviewRedirectCsv,
  type OverviewRedirectRow,
} from "@/lib/overview/overview-redirect-row";
import { buildOverviewRowsCsvForDownload } from "@/lib/export-overview-rows-csv";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import {
  overviewInventoryCollectionsForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { initBulkSliceWithStatus } from "@/lib/overview/overview-bulk-inline-status";
import {
  advanceBulkSliceBatchProgress,
  initBulkSliceBatchHarness,
} from "@/lib/overview/overview-batch-pipeline-progress";
import {
  overviewBulkRowIndices,
  overviewRowsInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { hasValidGscDumpFilename } from "@/lib/overview/overview-research-row";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "bindings"
  | "resolveBindings"
  | "prefetchOverviewInventory"
  | "optimizeTitle"
  | "optimizeMeta"
  | "updateRow"
  | "setBulkActionProgress"
  | "setOverviewMetaCsvExportBusy"
  | "resolvePostBodyHtmlForSentiment"
  | "gscQuickWinsFile"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
};

export function useOverviewTabAiTitleMetaUrlCsv({
  site,
  sitemapSource,
  rows,
  bindings,
  resolveBindings,
  prefetchOverviewInventory,
  optimizeTitle,
  optimizeMeta,
  updateRow,
  setBulkActionProgress,
  setOverviewMetaCsvExportBusy,
  resolvePostBodyHtmlForSentiment,
  gscQuickWinsFile,
  bulkScopeUrlKeys,
}: Args) {
  const inventoryCollections = overviewInventoryCollectionsForSite(site, sitemapSource);

  const handleAiTitleRow = useCallback(
    async (
      index: number,
      rowOverride?: OverviewRow,
      options?: { skipOptimizeTitleLoading?: boolean },
    ): Promise<{ title: string; aiTitle: string } | null> => {
      const row = rowOverride ?? rows[index];
      if (!row) return null;
      if (overviewTitleOptimizationExcluded(row, sitemapSource)) {
        return {
          title: row.title,
          aiTitle: row.aiTitle || row.title,
        };
      }
      console.log("[Auto SEO] Step: Optimizing SEO Title ->", row.url);
      updateRow(index, { status: "ai-title" });
      const inlineBody = (row.postContentOptimized || row.postContent || "").trim();
      let sentimentSource: string | undefined = inlineBody ? inlineBody.slice(0, 2000) : undefined;
      if (!sentimentSource && site) {
        try {
          const binding = bindings[row.url];
          if (binding?.postId) {
            sentimentSource = await resolvePostBodyHtmlForSentiment(row, binding);
          }
        } catch {
          // Ignore sentiment failures
        }
      }
      const result = await optimizeTitle(
        row.url,
        overviewTitlePrimarySegment(row.title || row.aiTitle || "") || row.url,
        row.focusKeyword,
        row.faq,
        sentimentSource,
        row.seoResearch?.trim() || undefined,
        {
          ...(options?.skipOptimizeTitleLoading ? { skipLoadingState: true } : {}),
          ...(sitemapSource === "sap" ? { titleMode: "sap" as const } : {}),
        },
      );
      if (!result) {
        console.warn("[Auto SEO] SEO Title failed for", row.url);
        updateRow(index, { status: "error" });
        return null;
      }
      const cleaned = overviewTitlePrimarySegment(result);
      console.log("[Auto SEO] SEO Title done ->", cleaned);
      updateRow(index, { title: cleaned, aiTitle: cleaned, status: "idle" });
      return { title: cleaned, aiTitle: cleaned };
    },
    [rows, optimizeTitle, updateRow, site, bindings, resolvePostBodyHtmlForSentiment, sitemapSource],
  );

  const handleAiTitleAll = useCallback(async () => {
    const eligible = overviewBulkRowIndices(rows, bulkScopeUrlKeys).filter(
      (i) => !overviewTitleOptimizationExcluded(rows[i]!, sitemapSource),
    );
    if (!eligible.length) {
      notify.error(NOTIFY_AI_TITLES_APPLY_TO_POSTS_ONLY_PAGES_BUCK);
      return;
    }
    const total = eligible.length;
    setBulkActionProgress((p) => ({
      ...p,
      aiTitle: initBulkSliceBatchHarness(
        initBulkSliceWithStatus("aiTitle", total, 0),
        total,
        "AI titles",
      ),
    }));
    let completed = 0;
    const bump = () => {
      completed += 1;
      setBulkActionProgress((p) => {
        const cur = p.aiTitle;
        if (!cur) return p;
        return {
          ...p,
          aiTitle: advanceBulkSliceBatchProgress(cur, completed, total),
        };
      });
    };
    try {
      await mapOverviewAiCopyWithConcurrency(eligible, (i) =>
        handleAiTitleRow(i, undefined, { skipOptimizeTitleLoading: true }).finally(bump),
      );
    } finally {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.aiTitle;
        return next;
      });
    }
  }, [rows, handleAiTitleRow, setBulkActionProgress, sitemapSource, bulkScopeUrlKeys]);

  const handleAiMetaRow = useCallback(
    async (
      index: number,
      rowOverride?: OverviewRow,
      options?: { skipOptimizeMetaLoading?: boolean },
    ): Promise<{ metaDescription: string; aiMeta: string } | null> => {
      const row = rowOverride ?? rows[index];
      if (!row) return null;
      console.log("[Auto SEO] Step: Optimizing Meta Description ->", row.url);
      updateRow(index, { status: "ai-meta" });
      const base = row.metaDescription || row.aiMeta || "";
      const inlineBody = (row.postContentOptimized || row.postContent || "").trim();
      let sentimentSource: string | undefined = inlineBody ? inlineBody.slice(0, 2000) : base;
      if (!inlineBody && site) {
        try {
          const binding = bindings[row.url];
          if (binding?.postId) {
            sentimentSource = await resolvePostBodyHtmlForSentiment(row, binding);
          }
        } catch {
          // Ignore sentiment failures.
        }
      }
      const gscFilenameForMeta = row.gscQuickWinsCsvFilename ?? gscQuickWinsFile;
      const pageUrlForGsc = row.url?.trim() ?? "";
      const briefForMeta = row.seoResearch?.trim();
      let gscQuickWinsContext: string | undefined;
      if (
        !briefForMeta &&
        hasValidGscDumpFilename(gscFilenameForMeta) &&
        pageUrlForGsc &&
        BACKEND_API_BASE
      ) {
        try {
          const ctxRes = await fetch(`${BACKEND_API_BASE}/api/gsc/quick-wins-context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: gscFilenameForMeta, pageUrl: pageUrlForGsc }),
          });
          const ctxJson = await ctxRes.json().catch(() => null);
          if (ctxRes.ok && ctxJson?.context) gscQuickWinsContext = ctxJson.context;
        } catch {
          // Meta still runs without GSC RAG
        }
      }
      const result = await optimizeMeta(
        row.url,
        base,
        row.focusKeyword,
        row.faq,
        sentimentSource,
        briefForMeta ? undefined : gscQuickWinsContext,
        briefForMeta || undefined,
        {
          ...(options?.skipOptimizeMetaLoading ? { skipLoadingState: true } : {}),
        },
      );
      if (!result) {
        console.warn("[Auto SEO] Meta Description failed for", row.url);
        updateRow(index, { status: "error" });
        return null;
      }
      console.log("[Auto SEO] Meta Description done ->", result);
      updateRow(index, { metaDescription: result, aiMeta: result, status: "idle" });
      return { metaDescription: result, aiMeta: result };
    },
    [rows, optimizeMeta, updateRow, gscQuickWinsFile, site, bindings, resolvePostBodyHtmlForSentiment],
  );

  const handleAiMetaAll = useCallback(async () => {
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    if (!indices.length) return;
    const total = indices.length;
    setBulkActionProgress((p) => ({
      ...p,
      aiMeta: initBulkSliceBatchHarness(
        initBulkSliceWithStatus("aiMeta", total, 0),
        total,
        "AI meta",
      ),
    }));
    let completed = 0;
    const bump = () => {
      completed += 1;
      setBulkActionProgress((p) => {
        const cur = p.aiMeta;
        if (!cur) return p;
        return {
          ...p,
          aiMeta: advanceBulkSliceBatchProgress(cur, completed, total),
        };
      });
    };
    try {
      await mapOverviewAiCopyWithConcurrency(indices, (i) =>
        handleAiMetaRow(i, undefined, { skipOptimizeMetaLoading: true }).finally(bump),
      );
    } finally {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.aiMeta;
        return next;
      });
    }
  }, [rows, handleAiMetaRow, setBulkActionProgress, bulkScopeUrlKeys]);

  const handleAiUrlRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      updateRow(index, { status: "ai-url" });
      const suggestion = computeOverviewAiUrlSuggestion(row);
      if (!suggestion.ok) {
        notify.error(NOTIFY_BAD_URL);
        updateRow(index, { status: "idle" });
        return;
      }
      updateRow(index, suggestion.patch);
    },
    [rows, updateRow],
  );

  const handleAiUrlAll = useCallback(async () => {
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    if (!indices.length) return;
    const total = indices.length;
    setBulkActionProgress((p) => ({
      ...p,
      aiUrl: initBulkSliceBatchHarness(
        initBulkSliceWithStatus("aiUrl", total, 0),
        total,
        "AI URL paths",
      ),
    }));
    let completed = 0;
    const redirectRows: OverviewRedirectRow[] = [];
    const bump = () => {
      completed += 1;
      setBulkActionProgress((p) => {
        const cur = p.aiUrl;
        if (!cur) return p;
        return {
          ...p,
          aiUrl: advanceBulkSliceBatchProgress(cur, completed, total),
        };
      });
    };
    try {
      await Promise.all(
        indices.map((i) => {
          const row = rows[i]!;
          return Promise.resolve()
            .then(() => {
              updateRow(i, { status: "ai-url" });
              const suggestion = computeOverviewAiUrlSuggestion(row);
              if (!suggestion.ok) {
                updateRow(i, { status: "idle" });
                return;
              }
              updateRow(i, suggestion.patch);
              if (suggestion.redirect) {
                redirectRows.push(suggestion.redirect);
              }
            })
            .finally(bump);
        }),
      );
      if (redirectRows.length > 0) {
        downloadOverviewRedirectCsv(
          redirectRows,
          `overview-url-opt-redirects-${new Date().toISOString().slice(0, 10)}.csv`,
        );
      }
      notify.success(NOTIFY_FINISHED_FOCUS_KEYWORD_URL_PATHS);
    } finally {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.aiUrl;
        return next;
      });
    }
  }, [rows, updateRow, setBulkActionProgress, bulkScopeUrlKeys]);

  const handleDownloadSeoRedirectCsv = useCallback(() => {
    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    const redirectRows = scopedRows
      .map((row) => buildOverviewRedirectRow(row))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);
    if (!redirectRows.length) {
      notify.error(
        "No redirect rows to export. Run AI URL where the path differs, or Update WP first to keep the old URL as redirect source.",
      );
      return;
    }
    downloadOverviewRedirectCsv(
      redirectRows,
      `seo-redirects-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    notify.success(`Downloaded ${redirectRows.length} redirect row(s).`);
  }, [rows, bulkScopeUrlKeys]);

  const handleExportOverviewCsv = useCallback(async () => {
    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    if (!scopedRows.length) {
      notify.error(NOTIFY_NO_ROWS_TO_EXPORT);
      return;
    }
    const credsReady = Boolean(site?.username?.trim() && site?.appPassword?.trim());
    let mergedBindings: Record<string, OverviewBinding | undefined> = bindings;

    setOverviewMetaCsvExportBusy(true);
    try {
      if (credsReady && site) {
        await prefetchOverviewInventory(site, {
          downloadCsv: false,
          collections: inventoryCollections,
        });
        const bindingMap = await resolveBindings(scopedRows.map((r) => r.url), site, undefined, {
          inventoryOnly: true,
        });
        mergedBindings = { ...bindings, ...bindingMap };
      }

      const contentForRow = new Map<string, string>();
      if (credsReady && site) {
        const concurrency = 6;
        const needBody = scopedRows.filter((r) => mergedBindings[r.url]?.postId);
        for (let i = 0; i < needBody.length; i += concurrency) {
          const batch = needBody.slice(i, i + concurrency);
          await Promise.all(
            batch.map(async (row) => {
              const b = mergedBindings[row.url];
              if (!b?.postId) return;
              const html = await resolvePostBodyHtmlForSentiment(row, b);
              const t = html?.trim();
              if (t) contentForRow.set(row.url, t);
            }),
          );
        }
      }

      const enriched: OverviewRow[] = scopedRows.map((row) => ({
        ...row,
        postContent: contentForRow.get(row.url) ?? "",
      }));

      const csv = buildOverviewRowsCsvForDownload(enriched);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `neo-pulse-meta-optimizer-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      notify.success(notifyExportedXRowSToCsv(scopedRows.length));

      if (credsReady) {
        const expected = scopedRows.filter((r) => mergedBindings[r.url]?.postId).length;
        const got = contentForRow.size;
        if (expected > 0 && got < expected) {
          notify.warning(
            `Post bodies: ${got} of ${expected} filled. Reload the sitemap after inventory loads, or check REST credentials.`,
            { duration: 11000 },
          );
        }
      }
    } catch (err) {
      notifyHeaderError("CSV export failed", err, { duration: 12000 });
    } finally {
      setOverviewMetaCsvExportBusy(false);
    }
  }, [
    bulkScopeUrlKeys,
    site,
    bindings,
    prefetchOverviewInventory,
    inventoryCollections,
    resolveBindings,
    resolvePostBodyHtmlForSentiment,
    setOverviewMetaCsvExportBusy,
  ]);

  return {
    handleAiTitleRow,
    handleAiTitleAll,
    handleAiMetaRow,
    handleAiMetaAll,
    handleAiUrlRow,
    handleAiUrlAll,
    handleDownloadSeoRedirectCsv,
    handleExportOverviewCsv,
  };
}

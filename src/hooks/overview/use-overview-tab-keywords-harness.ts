import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN,
  notifyFocusKeywordsDerivedForXRowS,
  notifyKeywordDerivationFailedForXRowS,
  notifyKeywordsFinishedXUpdatedXFailed,
} from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewBulkRowIndices, overviewRowInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import {
  isOverviewKeywordRunKind,
  keywordHarnessModeForSource,
  writeOverviewKeywordsOneAtATime,
} from "@/lib/overview/overview-keywords-harness-run";
import { initBulkSliceWithStatus } from "@/lib/overview/overview-bulk-inline-status";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import { aiseoRowFilesForUpload, buildAiseoElementJsonFile } from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";

type Opt = ReturnType<typeof useWordPressOptimization>;

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "updateRow"
  | "setBulkActionProgress"
  | "deriveFocusKeywordFromPageContext"
  | "deriveEntityKeyword"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  opt: Pick<Opt, "setIsOptimizingContent" | "setBulkOptimizationState">;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  getInventoryMatchForUrl?: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
};

function clearStaleKeywordHarness(
  opt: Pick<Opt, "setIsOptimizingContent" | "setBulkOptimizationState">,
  siteId: string,
): void {
  const batchKey = `${siteId}-batch`;
  opt.setIsOptimizingContent((prev) => {
    if (!prev[batchKey]) return prev;
    const next = { ...prev };
    delete next[batchKey];
    return next;
  });
  opt.setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current || !isOverviewKeywordRunKind(current.runKind)) return prev;
    const next = { ...prev };
    delete next[batchKey];
    return next;
  });
}

export function useOverviewTabKeywordsHarness({
  site,
  sitemapSource,
  rowsRef,
  updateRow,
  setBulkActionProgress,
  deriveFocusKeywordFromPageContext,
  deriveEntityKeyword,
  bulkScopeUrlKeys,
  opt,
  uploadAfterRowWrite,
  getInventoryMatchForUrl,
}: Args) {
  const keywordMode = keywordHarnessModeForSource(sitemapSource);
  const progressKey = keywordMode === "entity" ? "entityKw" : "contentKw";

  const deriveKeyword = useCallback(
    async (_index: number, row: OverviewRow): Promise<string | null> => {
      if (keywordMode === "entity") {
        return deriveEntityKeyword(row.url, row.title, row.metaDescription, {
          skipLoadingState: true,
        });
      }
      return deriveFocusKeywordFromPageContext(
        row.url,
        row.title,
        row.metaDescription,
        row.faq,
        undefined,
        { skipLoadingState: true },
      );
    },
    [keywordMode, deriveEntityKeyword, deriveFocusKeywordFromPageContext],
  );

  const runKeywordsForIndices = useCallback(
    async (indices: number[]) => {
      if (!site) {
        notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
        return;
      }

      const scoped = indices.filter((index) =>
        overviewRowInBulkScope(rowsRef.current[index]?.url ?? "", bulkScopeUrlKeys),
      );
      if (!scoped.length) return;
      clearStaleKeywordHarness(opt, site.id);

      const total = scoped.length;
      const batchKey = `${site.id}-batch`;
      const scopedUrls = scoped
        .map((i) => rowsRef.current[i]?.url?.trim())
        .filter((u): u is string => Boolean(u));
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls: scopedUrls,
          currentIndex: 0,
          urlStatuses: {},
          currentStep: keywordMode === "entity" ? "Entity keywords" : "AI keywords (content)",
          currentUrl: scopedUrls[0] ?? "",
          runKind: progressKey,
          urlHarnessSections: {},
          urlGeneratedFiles: {},
        },
      }));
      setBulkActionProgress((p) => ({
        ...p,
        [progressKey]: initBulkSliceWithStatus(progressKey, total, 0),
      }));

      let stats = { ok: 0, failed: 0 };
      try {
        stats = await writeOverviewKeywordsOneAtATime({
          indices: scoped,
          rowsRef,
          deriveKeyword,
          updateRow,
          onRowKeyword: async (index, updatedRow, keyword) => {
            const url = updatedRow.url.trim();
            let postHtml = "";
            if (getInventoryMatchForUrl) {
              const resolved = await resolveAiseoHarnessSourceHtml({
                row: updatedRow,
                site,
                sitemapSource,
                getInventoryMatchForUrl,
              });
              postHtml = resolved.html;
            }
            const bodyForFiles =
              postHtml.trim() ||
              updatedRow.postContentOptimized?.trim() ||
              updatedRow.postContent?.trim() ||
              "";
            const elementFile = buildAiseoElementJsonFile("focus-keyword.json", {
              url,
              focusKeyword: keyword,
              mode: keywordMode,
            });
            const rowFiles = aiseoRowFilesForUpload({
              runKind: progressKey,
              url,
              elementFiles: elementFile ? [elementFile] : [],
              postHtml: bodyForFiles || undefined,
            });
            if (uploadAfterRowWrite) {
              await uploadAfterRowWrite({
                index,
                url,
                html: bodyForFiles,
                rowFiles,
              });
            }
          },
          onRowDone: (done, rowTotal) => {
            setBulkActionProgress((p) => ({
              ...p,
              [progressKey]: initBulkSliceWithStatus(progressKey, rowTotal, done),
            }));
          },
        });
      } finally {
        setBulkActionProgress((p) => {
          const next = { ...p };
          delete next[progressKey];
          return next;
        });
      }

      if (stats.ok > 0 && stats.failed === 0) {
        notify.success(notifyFocusKeywordsDerivedForXRowS(stats.ok));
      } else if (stats.ok > 0 && stats.failed > 0) {
        notify.warning(notifyKeywordsFinishedXUpdatedXFailed(stats.ok, stats.failed));
      } else if (stats.failed > 0) {
        notify.error(notifyKeywordDerivationFailedForXRowS(stats.failed));
      }
    },
    [
      site,
      keywordMode,
      progressKey,
      rowsRef,
      bulkScopeUrlKeys,
      deriveKeyword,
      updateRow,
      setBulkActionProgress,
      opt,
      getInventoryMatchForUrl,
      sitemapSource,
      uploadAfterRowWrite,
    ],
  );

  const handleKeywordsAll = useCallback(async () => {
    const indices = overviewBulkRowIndices(rowsRef.current, bulkScopeUrlKeys);
    await runKeywordsForIndices(indices);
  }, [rowsRef, bulkScopeUrlKeys, runKeywordsForIndices]);

  const handleKeywordsRow = useCallback(
    async (index: number) => {
      await runKeywordsForIndices([index]);
    },
    [runKeywordsForIndices],
  );

  return { handleKeywordsAll, handleKeywordsRow, keywordMode };
}

import { useCallback } from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { hasValidGscDumpFilename } from "@/lib/overview/overview-research-row";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import {
  overviewBulkRowIndices,
  overviewRowInBulkScope,
} from "@/lib/overview/overview-bulk-row-scope";
import {
  finalizeOverviewAiMetaHarnessBatch,
  initOverviewAiMetaHarnessBatchState,
  runOverviewAiMetaHarnessBatch,
  type AiMetaCatalogRow,
} from "@/lib/overview/overview-ai-meta-harness-run";
import type { MetaHarnessSetters } from "@/lib/overview/overview-ai-meta-harness-mutations";

type Args = Pick<
  OverviewTabBase,
  "rows" | "rowsRef" | "opt" | "updateRow" | "optimizeMeta" | "resolvePostBodyHtmlForSentiment"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  gscQuickWinsFile: string | null;
  bindings: Record<string, OverviewBinding | undefined>;
  resolveBindings: (
    urls: string[],
    site: WordPressSite,
    extra?: undefined,
    options?: { inventoryOnly?: boolean },
  ) => Promise<Record<string, OverviewBinding | undefined>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
};

function buildMetaCatalog(rows: OverviewRow[], indices: number[]): AiMetaCatalogRow[] {
  return indices
    .map((index) => {
      const row = rows[index];
      if (!row?.url?.trim()) return null;
      return {
        index,
        url: row.url.trim(),
        metaDescription: (row.metaDescription || row.aiMeta || "").trim(),
        focusKeyword: (row.focusKeyword || "").trim(),
      };
    })
    .filter((entry): entry is AiMetaCatalogRow => entry != null);
}

export function useOverviewTabAiMetaHarness({
  site,
  sitemapSource,
  rows,
  rowsRef,
  opt,
  updateRow,
  optimizeMeta,
  resolvePostBodyHtmlForSentiment,
  gscQuickWinsFile,
  bulkScopeUrlKeys,
  bindings,
  resolveBindings,
  uploadAfterRowWrite,
  getInventoryMatchForUrl,
}: Args) {
  const makeHarnessSetters = useCallback(
    (batchKey: string): MetaHarnessSetters | null => {
      if (!site?.id) return null;
      return {
        siteId: site.id,
        batchKey,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
      };
    },
    [site?.id, opt.setBulkOptimizationState, opt.setOptimizationProgress],
  );

  const resolveSentimentSource = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!site) return undefined;
      try {
        let binding = bindings[row.url];
        if (!binding) {
          const singleBindingMap = await resolveBindings([row.url], site, undefined, {
            inventoryOnly: true,
          });
          binding = singleBindingMap[row.url];
        }
        if (binding?.postId) {
          return await resolvePostBodyHtmlForSentiment(row, binding);
        }
      } catch {
        // Ignore sentiment failures
      }
      return undefined;
    },
    [site, bindings, resolveBindings, resolvePostBodyHtmlForSentiment],
  );

  const resolveGscQuickWinsContext = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      const gscFilenameForMeta = row.gscQuickWinsCsvFilename ?? gscQuickWinsFile;
      const pageUrlForGsc = row.url?.trim() ?? "";
      if (!hasValidGscDumpFilename(gscFilenameForMeta) || !pageUrlForGsc || !BACKEND_API_BASE) {
        return undefined;
      }
      try {
        const ctxRes = await fetch(`${BACKEND_API_BASE}/api/gsc/quick-wins-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: gscFilenameForMeta, pageUrl: pageUrlForGsc }),
        });
        const ctxJson = await ctxRes.json().catch(() => null);
        if (ctxRes.ok && ctxJson?.context) return ctxJson.context as string;
      } catch {
        // Meta still runs without GSC RAG
      }
      return undefined;
    },
    [gscQuickWinsFile],
  );

  const runMetaForIndices = useCallback(
    async (indices: number[], options?: { ignoreBulkScope?: boolean }) => {
      if (!site) return;

      const scoped = options?.ignoreBulkScope
        ? indices.filter((index) => Boolean(rowsRef.current[index]?.url?.trim()))
        : indices.filter((index) =>
            overviewRowInBulkScope(rowsRef.current[index]?.url ?? "", bulkScopeUrlKeys),
          );
      if (!scoped.length) return;

      const catalog = buildMetaCatalog(rowsRef.current, scoped);
      if (!catalog.length) return;

      const batchKey = `${site.id}-batch`;
      const harnessSetters = makeHarnessSetters(batchKey);
      if (!harnessSetters) return;

      initOverviewAiMetaHarnessBatchState({
        site,
        catalog,
        setBulkOptimizationState: opt.setBulkOptimizationState,
        setOptimizationProgress: opt.setOptimizationProgress,
        setIsOptimizingContent: opt.setIsOptimizingContent,
        prepMessage: `AI meta (${catalog.length} rows)…`,
      });

      try {
        await runOverviewAiMetaHarnessBatch({
          site,
          sitemapSource,
          rowsRef,
          catalog,
          harnessSetters,
          getInventoryMatchForUrl,
          updateRow,
          uploadAfterRowWrite,
          deps: {
            optimizeMeta,
            resolveSentimentSource,
            resolveGscQuickWinsContext,
          },
        });
      } finally {
        finalizeOverviewAiMetaHarnessBatch(
          batchKey,
          site.id,
          opt.setIsOptimizingContent,
          opt.setOptimizationProgress,
        );
      }
    },
    [
      site,
      sitemapSource,
      rowsRef,
      bulkScopeUrlKeys,
      makeHarnessSetters,
      opt,
      getInventoryMatchForUrl,
      updateRow,
      uploadAfterRowWrite,
      optimizeMeta,
      resolveSentimentSource,
      resolveGscQuickWinsContext,
    ],
  );

  const handleAiMetaAll = useCallback(async () => {
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    await runMetaForIndices(indices);
  }, [rows, bulkScopeUrlKeys, runMetaForIndices]);

  const handleAiMetaRow = useCallback(
    async (index: number) => {
      await runMetaForIndices([index], { ignoreBulkScope: true });
    },
    [runMetaForIndices],
  );

  return { handleAiMetaAll, handleAiMetaRow };
}

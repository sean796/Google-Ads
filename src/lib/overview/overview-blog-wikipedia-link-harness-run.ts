import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import type {
  WikipediaLinkCatalogRow,
  WikipediaLinkHarnessSetters,
} from "@/lib/overview/overview-blog-wikipedia-link-catalog";
import { runWikipediaLinkForCatalogRow } from "@/lib/overview/overview-blog-wikipedia-link-row";
import {
  markWikiRowActive,
  markWikiRowStatus,
  setWikiHarnessMessage,
  writeWikiRowFiles,
} from "@/lib/overview/overview-blog-wikipedia-link-batch-state";

export {
  buildWikipediaLinkCatalog,
  buildWikipediaLinkStubCatalog,
  mergeWikipediaLinkCatalogHtml,
  type WikipediaLinkCatalogRow,
  type WikipediaLinkHarnessSetters,
  type WikipediaLinkRowOutcome,
  type WikipediaLinkRowPatch,
} from "@/lib/overview/overview-blog-wikipedia-link-catalog";
export { runWikipediaLinkForCatalogRow } from "@/lib/overview/overview-blog-wikipedia-link-row";
export {
  finalizeOverviewWikipediaLinkHarnessBatch,
  initOverviewWikipediaLinkHarnessBatchState,
} from "@/lib/overview/overview-blog-wikipedia-link-batch-state";

export async function runOverviewWikipediaLinkHarnessBatch(params: {
  catalog: WikipediaLinkCatalogRow[];
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource | undefined;
  apiKey: string;
  urlEntities?: Record<string, string>;
  rows: OverviewRow[];
  harnessSetters: WikipediaLinkHarnessSetters;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  cacheWrite?: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
}): Promise<{ ok: number; skipped: number; failed: number }> {
  const {
    catalog,
    site,
    sitemapSource,
    apiKey,
    urlEntities,
    rows,
    harnessSetters,
    updateRow,
    cacheWrite,
    uploadAfterRowWrite,
  } = params;
  if (!catalog.length) return { ok: 0, skipped: 0, failed: 0 };

  const wikiCache = new Map<string, { url: string; title: string; matchLabel: string } | null>();
  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageCatalog = catalog.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: catalog.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Wikipedia link",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((entry, localIndex) => ({
        entry,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ entry, globalRowNum }) => {
      const url = entry.url.trim();
      const pageTitle = entry.title || url;
      markWikiRowActive(url, globalRowNum, harnessSetters);
      setWikiHarnessMessage(
        harnessSetters,
        10 + Math.round(((globalRowNum - 1) / Math.max(catalog.length, 1)) * 85),
      );
      updateRow(entry.index, {
        status: "ai-wikipedia-link",
        blogWikiLinkSummary: `${pageTitle}: Wikipedia link…`,
      });

      try {
        const overviewRow = rows[entry.index]!;
        const outcome = await runWikipediaLinkForCatalogRow({
          entry,
          overviewRow,
          site,
          sitemapSource,
          urlEntities,
          apiKey,
          wikiCache,
        });
        if (outcome.kind === "skipped") {
          skipped += 1;
          markWikiRowStatus(url, harnessSetters, "skipped");
          updateRow(entry.index, {
            status: "idle",
            blogWikiLinkSummary: outcome.summary,
          });
          return;
        }
        updateRow(entry.index, {
          ...outcome.patch,
          status: "idle",
        });
        cacheWrite?.push(url, outcome.patch.postContentOptimized);
        writeWikiRowFiles(url, harnessSetters, outcome.patch);
        const rowFiles = aiseoRowFilesForUpload({
          runKind: "aiWikipediaLink",
          url,
          elementFiles: (() => {
            const elementFile = buildAiseoElementJsonFile("wikipedia-link.json", {
              summary: outcome.patch.blogWikiLinkSummary,
              links: outcome.patch.blogWikiLinkList,
            });
            return elementFile ? [elementFile] : [];
          })(),
          postHtml: outcome.patch.postContentOptimized,
        });
        if (uploadAfterRowWrite) {
          await uploadAfterRowWrite({
            index: entry.index,
            url,
            html: outcome.patch.postContentOptimized,
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        ok += 1;
        markWikiRowStatus(url, harnessSetters, "completed");
      } catch {
        failed += 1;
        const summary = `${pageTitle}: error`;
        markWikiRowStatus(url, harnessSetters, "error");
        updateRow(entry.index, { status: "error", blogWikiLinkSummary: summary });
      }
    },
    );
  }

  return { ok, skipped, failed };
}
